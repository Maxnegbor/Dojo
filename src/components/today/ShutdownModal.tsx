import { useCallback, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, Check, ClipboardCopy, Moon, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { CompletionWaveFill } from '@/components/ui/CompletionWaveFill'
import { DailyLogForm } from '@/components/today/DailyLogForm'
import { HourlyTimeline } from '@/components/today/HourlyTimeline'
import { useSettings } from '@/context/SettingsContext'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { useReminderDismissAnimation } from '@/hooks/useReminderDismissAnimation'
import {
  buildShutdownLogFilter,
  getConfiguredShutdownLogItems,
  hasShutdownLogFieldsConfigured,
} from '@/lib/shutdownLogConfig'
import { getWorkoutTypes } from '@/lib/workoutTypes'
import type { DailyLog, Goal, Reminder, ScheduleBlock, Workout } from '@/types'
import { cn } from '@/lib/utils'

type ShutdownStep = 'wrap-up' | 'schedule'

interface ShutdownModalProps {
  log: DailyLog
  goals: Goal[]
  workouts: Workout[]
  streakLogs: DailyLog[]
  viewDate: string
  tomorrowDate: string
  reminders: Reminder[]
  userId: string
  todayBlocks: ScheduleBlock[]
  tomorrowBlocks: ScheduleBlock[]
  onUpdateTomorrowBlock: (block: ScheduleBlock) => void | Promise<void>
  onDeleteTomorrowBlock: (id: string) => void | Promise<void>
  onCreateTomorrowBlock: (block: ScheduleBlock) => void | Promise<void>
  onPasteTodaySchedule: () => void | Promise<void>
  onClose: () => void
  onComplete: (deferredIds: string[]) => void | Promise<void>
  onCompleteReminder: (id: string) => void
}

export function ShutdownModal({
  log,
  goals,
  workouts,
  streakLogs,
  viewDate,
  tomorrowDate,
  reminders,
  userId,
  todayBlocks,
  tomorrowBlocks,
  onUpdateTomorrowBlock,
  onDeleteTomorrowBlock,
  onCreateTomorrowBlock,
  onPasteTodaySchedule,
  onClose,
  onComplete,
  onCompleteReminder,
}: ShutdownModalProps) {
  const { settings } = useSettings()
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()
  const shutdownMetricsFilter = useMemo(() => {
    if (!hasShutdownLogFieldsConfigured()) return undefined
    const items = getConfiguredShutdownLogItems(goals, sleepMetricsConfig)
    return buildShutdownLogFilter(items)
  }, [goals, sleepMetricsConfig])
  const shutdownWorkoutsConfigured =
    shutdownMetricsFilter != null && shutdownMetricsFilter.workoutCategories.size > 0
  const showWorkouts =
    settings.showWorkoutMetrics &&
    getWorkoutTypes().length > 0 &&
    (shutdownMetricsFilter == null || shutdownWorkoutsConfigured)
  const [step, setStep] = useState<ShutdownStep>('wrap-up')
  const [deferredIds, setDeferredIds] = useState<Set<string>>(() => new Set())
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set())
  const [workoutsReady, setWorkoutsReady] = useState(() => !showWorkouts)
  const [finishing, setFinishing] = useState(false)
  const [pasting, setPasting] = useState(false)

  const handleReminderDismissed = useCallback(
    (id: string) => {
      setCompletedIds((prev) => new Set(prev).add(id))
      onCompleteReminder(id)
    },
    [onCompleteReminder],
  )

  const { dismiss: dismissReminder, getPhase, onFillAnimationEnd, onExitTransitionEnd } =
    useReminderDismissAnimation({
      onDismiss: handleReminderDismissed,
    })

  const openReminders = reminders.filter(
    (r) => !r.completed && r.due_date <= viewDate && r.kind !== 'note',
  )
  const pendingReminders = openReminders.filter(
    (r) => !completedIds.has(r.id) && !deferredIds.has(r.id) && !getPhase(r.id),
  )
  const tomorrowLabel = format(parseISO(tomorrowDate), 'EEEE, MMM d')

  const remindersReady =
    pendingReminders.length === 0 ||
    pendingReminders.every((r) => deferredIds.has(r.id))

  const canContinue = remindersReady && (showWorkouts ? workoutsReady : true) && !finishing

  const handleWorkoutSelectionChange = useCallback((ready: boolean) => {
    setWorkoutsReady(ready)
  }, [])

  const toggleDefer = (id: string) => {
    setDeferredIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleContinue = () => {
    if (!canContinue) return
    setStep('schedule')
  }

  const handlePasteToday = async () => {
    setPasting(true)
    try {
      await onPasteTodaySchedule()
    } finally {
      setPasting(false)
    }
  }

  const handleDone = async () => {
    setFinishing(true)
    try {
      await onComplete([...deferredIds])
    } finally {
      setFinishing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        className={cn(
          'relative flex h-[min(92vh,820px)] flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl',
          step === 'schedule' ? 'w-full max-w-3xl' : 'w-full max-w-2xl',
        )}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X size={18} />
        </button>

        <div className="shrink-0 border-b border-zinc-800/80 px-6 py-5 pr-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-950">
              {step === 'schedule' ? (
                <CalendarDays size={20} className="text-violet-400" />
              ) : (
                <Moon size={20} className="text-violet-400" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">
                {step === 'schedule' ? 'Plan tomorrow' : 'Shutdown'}
              </h2>
              <p className="text-xs text-zinc-400">
                {step === 'schedule'
                  ? `Sketch ${tomorrowLabel} on the timeline`
                  : 'Log today, then clear or carry reminders into tomorrow.'}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-600">
            Step {step === 'wrap-up' ? 1 : 2} of 2
          </p>
        </div>

        <div
          className={cn(
            'min-h-0 flex-1 px-6 py-5',
            step === 'schedule'
              ? 'flex h-full min-h-0 flex-col overflow-hidden'
              : 'overflow-y-auto overscroll-contain scrollbar-hidden',
          )}
        >
          {step === 'wrap-up' && (
            <div className="space-y-5">
              <section>
                <h3 className="mb-3 text-sm font-semibold text-zinc-200">Daily Log</h3>
                <DailyLogForm
                  log={log}
                  goals={goals}
                  workouts={workouts}
                  streakLogs={streakLogs}
                  embedded
                  metricsFilter={shutdownMetricsFilter}
                  requireWorkoutSelection={showWorkouts}
                  onWorkoutSelectionChange={handleWorkoutSelectionChange}
                />
              </section>

              <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
                <h3 className="mb-3 text-sm font-semibold text-zinc-200">Reminders</h3>

                {openReminders.length === 0 ? (
                  <p className="py-2 text-center text-xs text-zinc-500">All clear for today</p>
                ) : (
                  <ul className="space-y-2">
                    {openReminders.map((item) => {
                      if (completedIds.has(item.id)) return null

                      const phase = getPhase(item.id)
                      const completing = phase === 'completing'
                      const exiting = phase === 'exiting'
                      const checkActive = completing || exiting
                      const deferred = deferredIds.has(item.id)

                      return (
                        <li
                          key={item.id}
                          className={cn('reminder-row', exiting && 'reminder-row-exiting')}
                          onTransitionEnd={(event) => {
                            if (exiting) onExitTransitionEnd(item.id, event.propertyName)
                          }}
                        >
                          <div className="reminder-row-inner">
                            <div
                              className={cn(
                                'reminder-row-content relative flex items-center gap-2 overflow-hidden rounded-lg px-2 py-2 transition-colors duration-200',
                                !completing &&
                                  !exiting &&
                                  (deferred ? 'bg-zinc-900/30' : 'bg-zinc-900/60'),
                              )}
                            >
                              <CompletionWaveFill
                                plain
                                phase={completing ? 'animating' : phase ? 'done' : undefined}
                                onAnimationEnd={
                                  completing ? () => onFillAnimationEnd(item.id) : undefined
                                }
                              />
                              <button
                                type="button"
                                onClick={() => dismissReminder(item.id)}
                                disabled={!!phase || deferred}
                                aria-label={`Complete ${item.title}`}
                                className={cn(
                                  'relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200',
                                  checkActive
                                    ? 'border-emerald-500 bg-emerald-500 text-zinc-950'
                                    : deferred
                                      ? 'border-zinc-700 text-transparent opacity-50'
                                      : 'border-zinc-600 text-transparent hover:border-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-400',
                                )}
                              >
                                {checkActive ? <Check size={11} strokeWidth={3} /> : <Check size={11} />}
                              </button>
                              <p
                                className={cn(
                                  'relative z-10 min-w-0 flex-1 truncate text-sm transition-colors duration-300',
                                  exiting
                                    ? 'text-emerald-300/90'
                                    : deferred
                                      ? 'text-zinc-500'
                                      : 'text-zinc-200',
                                )}
                              >
                                {item.title}
                              </p>
                              <button
                                type="button"
                                onClick={() => toggleDefer(item.id)}
                                disabled={!!phase}
                                aria-label={
                                  deferred
                                    ? `Keep ${item.title} on today`
                                    : `Move ${item.title} to tomorrow`
                                }
                                className={cn(
                                  'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors',
                                  deferred
                                    ? 'border-amber-500/60 bg-amber-500/25 text-amber-400'
                                    : 'border-zinc-700 bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-200',
                                )}
                              >
                                <ArrowRight size={14} />
                              </button>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {pendingReminders.length > 0 && (
                  <p className="mt-3 text-[10px] text-zinc-600">
                    Complete each reminder or tap the arrow to move it to {tomorrowLabel}. Continue
                    unlocks when all are handled.
                  </p>
                )}
              </section>
            </div>
          )}

          {step === 'schedule' && (
            <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-500">
                  Drag to create blocks · move and resize as needed
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handlePasteToday}
                  disabled={pasting || todayBlocks.length === 0}
                >
                  <ClipboardCopy size={14} />
                  {pasting ? 'Pasting…' : 'Paste today'}
                </Button>
              </div>
              {todayBlocks.length === 0 && (
                <p className="shrink-0 text-[10px] text-zinc-600">
                  Today has no schedule blocks — paste is unavailable until you plan today.
                </p>
              )}
              <div className="min-h-0 flex-1 overflow-hidden">
                <HourlyTimeline
                  blocks={tomorrowBlocks}
                  date={tomorrowDate}
                  userId={userId}
                  isActiveDay={false}
                  startHour={settings.timelineStartHour}
                  endHour={settings.timelineEndHour}
                  onUpdate={onUpdateTomorrowBlock}
                  onDelete={onDeleteTomorrowBlock}
                  onCreate={onCreateTomorrowBlock}
                />
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-800/80 px-6 py-4">
          {step === 'wrap-up' && (
            <>
              <p className="mb-2 min-h-[14px] text-center text-[10px] text-zinc-500">
                {!canContinue
                  ? !remindersReady
                    ? 'Handle all reminders first'
                    : showWorkouts && !workoutsReady
                      ? 'Select a workout or None'
                      : '\u00a0'
                  : '\u00a0'}
              </p>
              <Button onClick={handleContinue} className="w-full" disabled={!canContinue}>
                Continue to plan tomorrow
              </Button>
            </>
          )}

          {step === 'schedule' && (
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setStep('wrap-up')}>
                Back
              </Button>
              <Button onClick={handleDone} className="flex-[2]" disabled={finishing}>
                {finishing ? 'Wrapping up…' : 'Done for tonight'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
