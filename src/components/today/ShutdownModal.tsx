import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardCopy,
  ListChecks,
  Moon,
  PenLine,
  Repeat,
  X,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { CompletionWaveFill } from '@/components/ui/CompletionWaveFill'
import { DailyLogForm } from '@/components/today/DailyLogForm'
import { ExercisePlanCard } from '@/components/today/ExercisePlanCard'
import { HourlyTimeline } from '@/components/today/HourlyTimeline'
import { NotesAndReminders } from '@/components/today/NotesAndReminders'
import { ScheduleTemplateMenu } from '@/components/today/ScheduleTemplateMenu'
import { TypedReminderConfirm } from '@/components/today/TypedReminderConfirm'
import { useSettings } from '@/context/SettingsContext'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { useReminderDismissAnimation } from '@/hooks/useReminderDismissAnimation'
import { activeDailyChecklist } from '@/lib/dailyChecklist'
import {
  getDailyShutdownStepPreset,
  normalizeDailyShutdownSteps,
} from '@/lib/dailyShutdownSteps'
import { getDraft, mergeDraftWithLog } from '@/lib/dailyLogDraft'
import { getHomeLogHabitTypes } from '@/lib/habitTypes'
import { buildWrapUpMetricsFilter } from '@/lib/shutdownLogConfig'
import {
  getTypedReminderText,
  isTypedReminderRequired,
  typedReminderMatches,
} from '@/lib/typedReminder'
import { normalizeHabits } from '@/types'
import type { DailyLog, DailyShutdownStepId, Goal, Reminder, ScheduleBlock, Workout } from '@/types'
import type { ScheduleTemplate } from '@/lib/scheduleTemplates'
import { cn } from '@/lib/utils'

type ShutdownFlowStep = DailyShutdownStepId | 'typed-reminder'

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
  onApplyScheduleTemplate?: (template: ScheduleTemplate) => void | Promise<void>
  onClose: () => void
  onComplete: (deferredIds: string[]) => void | Promise<void>
  onCompleteReminder: (id: string) => void
  onAddReminder: (item: Reminder) => void
  onUpdateReminder: (item: Reminder) => void
  onRemoveReminder: (id: string) => void
  onTomorrowScheduleChange?: () => void
  /** Called after habit toggles flush so Home can refresh. */
  onHabitsSaved?: () => void
  /** When true, hide dismiss — used by require-shutdown gate. */
  required?: boolean
}

function countPendingHomeHabits(log: DailyLog, workouts: Workout[]): number {
  const merged = mergeDraftWithLog(log, getDraft(log.date), workouts)
  const habits = normalizeHabits(merged.habits)
  return getHomeLogHabitTypes().filter((habit) => !habits[habit.id]).length
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
  onApplyScheduleTemplate,
  onClose,
  onComplete,
  onCompleteReminder,
  onAddReminder,
  onUpdateReminder,
  onRemoveReminder,
  onTomorrowScheduleChange,
  onHabitsSaved,
  required = false,
}: ShutdownModalProps) {
  const { settings } = useSettings()
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()
  const wrapUpMetricsFilter = useMemo(
    () => buildWrapUpMetricsFilter(goals, sleepMetricsConfig),
    [goals, sleepMetricsConfig],
  )

  const configuredSteps = useMemo(
    () => normalizeDailyShutdownSteps(settings.dailyShutdownSteps),
    [settings.dailyShutdownSteps],
  )

  const checklistGroups = useMemo(
    () => activeDailyChecklist(settings.dailyShutdownChecklist),
    [settings.dailyShutdownChecklist],
  )

  const requireTypedReminder = isTypedReminderRequired(settings, 'shutdown')
  const typedReminderText = getTypedReminderText(settings, 'shutdown')

  const visibleSteps = useMemo((): ShutdownFlowStep[] => {
    const next: ShutdownFlowStep[] = configuredSteps.filter((id) => {
      if (id === 'habits') return countPendingHomeHabits(log, workouts) > 0
      if (id === 'checklist') return checklistGroups.length > 0
      return true
    })
    const base = next.length > 0 ? next : (['wrap-up'] as ShutdownFlowStep[])
    if (requireTypedReminder) return [...base, 'typed-reminder']
    return base
  }, [checklistGroups.length, configuredSteps, log, requireTypedReminder, workouts])

  const [step, setStep] = useState<ShutdownFlowStep>(() => visibleSteps[0] ?? 'wrap-up')
  const [deferredIds, setDeferredIds] = useState<Set<string>>(() => new Set())
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set())
  const [checklistChecked, setChecklistChecked] = useState<Set<string>>(() => new Set())
  const [typedReminderValue, setTypedReminderValue] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [applyingTemplate, setApplyingTemplate] = useState(false)

  useEffect(() => {
    if (!visibleSteps.includes(step)) {
      setStep(visibleSteps[0] ?? 'wrap-up')
    }
  }, [step, visibleSteps])

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

  const canLeaveWrapUp = remindersReady && !finishing
  const typedReminderReady =
    step !== 'typed-reminder' || typedReminderMatches(typedReminderText, typedReminderValue)
  const stepIndex = Math.max(1, visibleSteps.indexOf(step) + 1)
  const stepCount = visibleSteps.length
  const stepPos = visibleSteps.indexOf(step)
  const isFirstStep = stepPos <= 0
  const isLastStep = stepPos === visibleSteps.length - 1
  const stepPreset = step === 'typed-reminder' ? null : getDailyShutdownStepPreset(step)

  const toggleDefer = (id: string) => {
    setDeferredIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleChecklistItem = (id: string) => {
    setChecklistChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const goBack = () => {
    if (stepPos <= 0) return
    setStep(visibleSteps[stepPos - 1]!)
  }

  const handlePasteToday = async () => {
    setPasting(true)
    try {
      await onPasteTodaySchedule()
    } finally {
      setPasting(false)
    }
  }

  const handleApplyTemplate = async (template: ScheduleTemplate) => {
    if (!onApplyScheduleTemplate) return
    setApplyingTemplate(true)
    try {
      await onApplyScheduleTemplate(template)
    } finally {
      setApplyingTemplate(false)
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

  const goNext = async () => {
    if (step === 'wrap-up' && !canLeaveWrapUp) return
    if (step === 'typed-reminder' && !typedReminderReady) return
    if (isLastStep) {
      await handleDone()
      return
    }
    setStep(visibleSteps[stepPos + 1]!)
  }

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm',
        step === 'schedule' ? 'p-2 sm:p-3' : 'p-4',
      )}
    >
      <div
        className={cn(
          'relative flex w-full flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl',
          step === 'schedule'
            ? 'h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] max-w-[min(100%,88rem)] sm:h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-1.5rem)]'
            : 'h-[min(92vh,820px)] max-w-2xl',
        )}
      >
        {!required && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <X size={18} />
          </button>
        )}

        <div className={cn('shrink-0 border-b border-zinc-800/80 px-6 py-5', !required && 'pr-12')}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-950">
              {step === 'schedule' ? (
                <CalendarDays size={20} className="text-violet-400" />
              ) : step === 'habits' ? (
                <Repeat size={20} className="text-violet-400" />
              ) : step === 'checklist' ? (
                <ListChecks size={20} className="text-violet-400" />
              ) : step === 'typed-reminder' ? (
                <PenLine size={20} className="text-violet-400" />
              ) : (
                <Moon size={20} className="text-violet-400" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">
                {step === 'typed-reminder' ? 'Reminder' : (stepPreset?.label ?? 'Shutdown')}
              </h2>
              <p className="text-xs text-zinc-400">
                {step === 'schedule'
                  ? `Sketch ${tomorrowLabel} — schedule, workouts, and reminders`
                  : step === 'habits'
                    ? 'Complete what’s left, or leave habits unfinished and continue.'
                    : step === 'checklist'
                      ? 'Tick anything you still want to close out tonight.'
                      : step === 'typed-reminder'
                        ? 'Type your reminder to finish'
                        : 'Log today, then clear or carry reminders into tomorrow.'}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-600">
            Step {stepIndex} of {stepCount}
          </p>
        </div>

        <div
          className={cn(
            'min-h-0 flex-1 px-6 py-5',
            step === 'schedule'
              ? 'flex flex-col overflow-hidden'
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
                  metricsFilter={wrapUpMetricsFilter}
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
                                    ? 'border-[var(--accent-500)] bg-[var(--accent-500)] text-black'
                                    : deferred
                                      ? 'border-zinc-700 text-transparent opacity-50'
                                      : 'border-zinc-600 text-transparent hover:border-[var(--accent-500)] hover:bg-[var(--accent-500)]/20 hover:text-[var(--accent-400)]',
                                )}
                              >
                                {checkActive ? (
                                  <Check size={11} strokeWidth={3} />
                                ) : (
                                  <Check size={11} />
                                )}
                              </button>
                              <p
                                className={cn(
                                  'relative z-10 min-w-0 flex-1 truncate text-sm transition-colors duration-300',
                                  exiting
                                    ? 'text-[var(--accent-200)]'
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
                                    ? 'border-[var(--accent-500)]/60 bg-[var(--accent-500)]/25 text-[var(--accent-400)]'
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

          {step === 'habits' && (
            <section>
              <DailyLogForm
                log={log}
                goals={goals}
                workouts={workouts}
                streakLogs={streakLogs}
                userId={userId}
                habitsOnly
                hideWeeklyHabits
                incompleteHabitsOnly
                embedded
                onSaved={onHabitsSaved}
              />
            </section>
          )}

          {step === 'schedule' && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-500">
                  Drag to create blocks · move and resize as needed
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <ScheduleTemplateMenu
                    label="Template"
                    applying={applyingTemplate}
                    disabled={pasting}
                    onApply={handleApplyTemplate}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handlePasteToday}
                    disabled={pasting || applyingTemplate || todayBlocks.length === 0}
                  >
                    <ClipboardCopy size={14} />
                    {pasting ? 'Pasting…' : 'Paste today'}
                  </Button>
                </div>
              </div>
              {todayBlocks.length === 0 && (
                <p className="shrink-0 text-[10px] text-zinc-600">
                  Today has no schedule blocks — paste is unavailable until you plan today.
                </p>
              )}
              <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch">
                <div
                  data-schedule-height-host
                  className="min-h-0 min-w-0 flex-1 overflow-hidden"
                >
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

                <div className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain scrollbar-hidden lg:w-[300px] xl:w-[320px]">
                  <ExercisePlanCard
                    viewDate={tomorrowDate}
                    userId={userId}
                    singleDate
                    onScheduleChange={onTomorrowScheduleChange}
                  />
                  <NotesAndReminders
                    items={reminders}
                    viewDate={tomorrowDate}
                    userId={userId}
                    exactDueDate
                    onAdd={onAddReminder}
                    onUpdate={onUpdateReminder}
                    onRemove={onRemoveReminder}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 'checklist' && (
            <div className="space-y-4">
              {checklistGroups.map((group) => (
                <div key={group.id}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {group.label}
                  </p>
                  <ul className="space-y-2">
                    {group.items.map((item) => {
                      const done = checklistChecked.has(item.id)
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => toggleChecklistItem(item.id)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                              done
                                ? 'border-[var(--accent-500)]/40 bg-[var(--accent-950)]/60'
                                : 'border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-700',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                                done
                                  ? 'border-[var(--accent-500)] bg-[var(--accent-500)] text-black'
                                  : 'border-zinc-600',
                              )}
                            >
                              {done && <Check size={12} strokeWidth={3} />}
                            </span>
                            <span className="text-sm text-zinc-200">{item.label}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {step === 'typed-reminder' && (
            <TypedReminderConfirm
              text={typedReminderText}
              value={typedReminderValue}
              onChange={setTypedReminderValue}
            />
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-800/80 px-6 py-4">
          {step === 'wrap-up' && !canLeaveWrapUp && (
            <p className="mb-2 text-center text-[10px] text-zinc-500">Handle all reminders first</p>
          )}
          {step === 'typed-reminder' && !typedReminderReady && (
            <p className="mb-2 text-center text-[10px] text-zinc-500">
              Type the reminder exactly to finish
            </p>
          )}
          <div className="flex gap-2">
            {!isFirstStep && (
              <Button variant="secondary" className="flex-1" onClick={goBack} disabled={finishing}>
                Back
              </Button>
            )}
            <Button
              onClick={() => void goNext()}
              className={isFirstStep ? 'w-full' : 'flex-[2]'}
              disabled={
                finishing ||
                (step === 'wrap-up' && !canLeaveWrapUp) ||
                (step === 'typed-reminder' && !typedReminderReady)
              }
            >
              {finishing
                ? 'Wrapping up…'
                : isLastStep
                  ? 'Done for tonight'
                  : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
