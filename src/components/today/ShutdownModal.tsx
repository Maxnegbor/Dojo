import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  ListChecks,
  ListTodo,
  Moon,
  PenLine,
  Repeat,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DailyLogForm } from '@/components/today/DailyLogForm'
import { SleepMetricField } from '@/components/today/SleepMetricField'
import { ExercisePlanCard } from '@/components/today/ExercisePlanCard'
import { HourlyTimeline } from '@/components/today/HourlyTimeline'
import { ScheduleTemplateMenu } from '@/components/today/ScheduleTemplateMenu'
import { TypedReminderConfirm } from '@/components/today/TypedReminderConfirm'
import { TodoistTasksPanel } from '@/components/today/TodoistTasksPanel'
import { HabitifyHabitsPanel } from '@/components/today/HabitifyHabitsPanel'
import { useSettings } from '@/context/SettingsContext'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { activeDailyChecklist } from '@/lib/dailyChecklist'
import {
  getDailyShutdownStepPreset,
  normalizeDailyShutdownSteps,
} from '@/lib/dailyShutdownSteps'
import {
  buildWrapUpMetricsFilter,
  getShutdownLogSleepMetrics,
  hasWrapUpLogFields,
} from '@/lib/shutdownLogConfig'
import {
  buildEditLogDaySleepUpdates,
  getSleepMetricValue,
} from '@/lib/sleepMetrics'
import {
  EXERCISE_PLAN_CHANGED,
  getUnplacedPlannedWorkoutsForDate,
  placePlannedWorkoutOnSchedule,
} from '@/lib/exercisePlan'
import { isSupabaseConfigured } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import {
  getTypedReminderText,
  isTypedReminderRequired,
  typedReminderMatches,
} from '@/lib/typedReminder'
import { isTodoistConnected } from '@/lib/todoistStore'
import { isHabitifyConnected } from '@/lib/habitifyStore'
import { experimentsNeedingDailyLogStep } from '@/lib/experiments'
import { ExperimentConfoundersSection } from '@/components/experiments/ExperimentConfoundersSection'
import type { DailyLog, DailyShutdownStepId, Goal, ScheduleBlock, Workout, WorkoutCategory } from '@/types'
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
  userId: string
  todayBlocks: ScheduleBlock[]
  tomorrowBlocks: ScheduleBlock[]
  onUpdateTomorrowBlock: (block: ScheduleBlock) => void | Promise<void>
  onDeleteTomorrowBlock: (id: string) => void | Promise<void>
  onCreateTomorrowBlock: (block: ScheduleBlock) => void | Promise<void>
  onAssignTomorrowExercise?: (block: ScheduleBlock, category: WorkoutCategory) => void | Promise<void>
  onPasteTodaySchedule: () => void | Promise<void>
  onApplyScheduleTemplate?: (template: ScheduleTemplate) => void | Promise<void>
  onClose: () => void
  onComplete: () => void | Promise<void>
  onTomorrowScheduleChange?: () => void
  /** Called after habit toggles flush so Home can refresh. */
  onHabitsSaved?: () => void
  /** When true, hide dismiss — used by require-shutdown gate. */
  required?: boolean
}

export function ShutdownModal({
  log,
  goals,
  workouts,
  streakLogs,
  viewDate,
  tomorrowDate,
  userId,
  todayBlocks: _todayBlocks,
  tomorrowBlocks,
  onUpdateTomorrowBlock,
  onDeleteTomorrowBlock,
  onCreateTomorrowBlock,
  onAssignTomorrowExercise,
  onPasteTodaySchedule: _onPasteTodaySchedule,
  onApplyScheduleTemplate,
  onClose,
  onComplete,
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
  const allShutdownSleep = useMemo(
    () => getShutdownLogSleepMetrics(sleepMetricsConfig),
    [sleepMetricsConfig],
  )
  const hasWrapUpForm = useMemo(
    () => hasWrapUpLogFields(goals, sleepMetricsConfig),
    [goals, sleepMetricsConfig],
  )
  const [missingSleepIds] = useState(() =>
    getShutdownLogSleepMetrics(sleepMetricsConfig)
      .filter((metric) => getSleepMetricValue(log, metric) == null)
      .map((metric) => metric.id),
  )
  const shutdownSleepMetrics = useMemo(
    () => allShutdownSleep.filter((metric) => missingSleepIds.includes(metric.id)),
    [allShutdownSleep, missingSleepIds],
  )
  const [sleepValues, setSleepValues] = useState<Record<string, number | null>>(() => {
    const values: Record<string, number | null> = {}
    for (const metric of getShutdownLogSleepMetrics(sleepMetricsConfig)) {
      values[metric.id] = getSleepMetricValue(log, metric)
    }
    return values
  })

  const persistSleep = useCallback(
    async (values: Record<string, number | null>) => {
      if (shutdownSleepMetrics.length === 0) return
      const updates = buildEditLogDaySleepUpdates(log, values, shutdownSleepMetrics)
      if (isSupabaseConfigured) {
        const { updateDailyLogForDate } = await import('@/lib/supabase')
        await updateDailyLogForDate(userId, viewDate, updates)
      } else {
        localStore.updateDailyLog(viewDate, updates)
      }
      onHabitsSaved?.()
    },
    [log, onHabitsSaved, shutdownSleepMetrics, userId, viewDate],
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
    const needsExperiments =
      settings.showExperimentsPage && experimentsNeedingDailyLogStep('shutdown', viewDate).length > 0
    const next: ShutdownFlowStep[] = configuredSteps.filter((id) => {
      if (id === 'habits') return false
      if (id === 'checklist') return checklistGroups.length > 0
      if (id === 'todoist') return isTodoistConnected()
      if (id === 'habitify') return isHabitifyConnected()
      if (id === 'experiments') return needsExperiments
      return true
    })
    // Saved flows from before this step still get Habitify when connected.
    if (isHabitifyConnected() && !next.includes('habitify')) {
      const wrapIdx = next.indexOf('wrap-up')
      if (wrapIdx >= 0) next.splice(wrapIdx + 1, 0, 'habitify')
      else next.unshift('habitify')
    }
    // Older saved step lists may omit experiments — still show when running.
    if (needsExperiments && !next.includes('experiments')) {
      const scheduleIdx = next.indexOf('schedule')
      if (scheduleIdx >= 0) next.splice(scheduleIdx + 1, 0, 'experiments')
      else next.push('experiments')
    }
    const base = next.length > 0 ? next : (['wrap-up'] as ShutdownFlowStep[])
    if (requireTypedReminder) return [...base, 'typed-reminder']
    return base
  }, [checklistGroups.length, configuredSteps, requireTypedReminder, settings.showExperimentsPage, viewDate])

  const [step, setStep] = useState<ShutdownFlowStep>(() => visibleSteps[0] ?? 'wrap-up')
  const [checklistChecked, setChecklistChecked] = useState<Set<string>>(() => new Set())
  const [typedReminderValue, setTypedReminderValue] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [applyingTemplate, setApplyingTemplate] = useState(false)

  useEffect(() => {
    if (!visibleSteps.includes(step)) {
      setStep(visibleSteps[0] ?? 'wrap-up')
    }
  }, [step, visibleSteps])

  const typedReminderReady =
    step !== 'typed-reminder' || typedReminderMatches(typedReminderText, typedReminderValue)

  const [unplacedPlanCount, setUnplacedPlanCount] = useState(
    () => getUnplacedPlannedWorkoutsForDate(tomorrowDate).length,
  )

  useEffect(() => {
    const sync = () =>
      setUnplacedPlanCount(getUnplacedPlannedWorkoutsForDate(tomorrowDate).length)
    sync()
    window.addEventListener(EXERCISE_PLAN_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(EXERCISE_PLAN_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [tomorrowDate])

  const schedulePlansReady = step !== 'schedule' || unplacedPlanCount === 0

  const dropPlannedWorkoutOnTomorrow = async (planId: string, startMinutes: number) => {
    await placePlannedWorkoutOnSchedule({
      planId,
      startMinutes,
      userId,
      timelineEndHour: settings.timelineEndHour,
      date: tomorrowDate,
    })
    onTomorrowScheduleChange?.()
  }
  const stepIndex = Math.max(1, visibleSteps.indexOf(step) + 1)
  const stepCount = visibleSteps.length
  const stepPos = visibleSteps.indexOf(step)
  const isFirstStep = stepPos <= 0
  const isLastStep = stepPos === visibleSteps.length - 1
  const stepPreset = step === 'typed-reminder' ? null : getDailyShutdownStepPreset(step)

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
      await onComplete()
    } finally {
      setFinishing(false)
    }
  }

  const goNext = async () => {
    if (step === 'typed-reminder' && !typedReminderReady) return
    if (step === 'schedule' && !schedulePlansReady) return
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
        step === 'schedule' ? 'p-2 sm:p-3' : 'p-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
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
            className={cn(
              'absolute right-4 z-10 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300',
              step === 'schedule' ? 'top-2' : 'top-4',
            )}
          >
            <X size={18} />
          </button>
        )}

        {step === 'schedule' ? (
          <div
            className={cn(
              'flex shrink-0 items-center gap-3 border-b border-zinc-800/80 px-4 py-2',
              !required && 'pr-12',
            )}
          >
            <h2 className="shrink-0 text-sm font-semibold text-zinc-100">
              {stepPreset?.label ?? 'Plan tomorrow'}
            </h2>
            {!schedulePlansReady && (
              <p className="min-w-0 truncate text-[10px] text-zinc-500">
                Place or delete {unplacedPlanCount} exercise plan
                {unplacedPlanCount === 1 ? '' : 's'} before continuing
              </p>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {!isFirstStep && (
                <Button variant="secondary" size="sm" onClick={goBack} disabled={finishing}>
                  Back
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => void goNext()}
                disabled={finishing || !schedulePlansReady}
                title={
                  schedulePlansReady
                    ? undefined
                    : `Place or delete ${unplacedPlanCount} exercise plan${unplacedPlanCount === 1 ? '' : 's'} before continuing`
                }
              >
                {finishing ? 'Wrapping up…' : isLastStep ? 'Done for tonight' : 'Continue'}
              </Button>
            </div>
          </div>
        ) : (
          <div className={cn('shrink-0 border-b border-zinc-800/80 px-6 py-5', !required && 'pr-12')}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-950">
                {step === 'habitify' ? (
                  <Repeat size={20} className="text-violet-400" />
                ) : step === 'todoist' ? (
                  <ListTodo size={20} className="text-violet-400" />
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
                  {step === 'habitify'
                    ? 'Tick off today’s habits before you close out.'
                    : step === 'todoist'
                      ? 'Tick off tasks or add anything you still need to do.'
                      : step === 'checklist'
                        ? 'Tick anything you still want to close out tonight.'
                        : step === 'typed-reminder'
                          ? 'Type your reminder to finish'
                          : 'Log anything still missing today.'}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-600">
              Step {stepIndex} of {stepCount}
            </p>
          </div>
        )}

        <div
          className={cn(
            'min-h-0 flex-1',
            step === 'schedule'
              ? 'flex flex-col overflow-hidden px-3 py-2 sm:px-4'
              : 'overflow-y-auto overscroll-contain px-6 py-5 scrollbar-hidden',
          )}
        >
          {step === 'wrap-up' && (
            <div className="space-y-5">
              <section>
                <h3 className="mb-3 text-sm font-semibold text-zinc-200">Daily Log</h3>
                {shutdownSleepMetrics.length > 0 && (
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    {shutdownSleepMetrics.map((metric) => (
                      <SleepMetricField
                        key={metric.id}
                        metric={metric}
                        value={sleepValues[metric.id] ?? null}
                        onChange={(value) => {
                          setSleepValues((prev) => {
                            const next = { ...prev, [metric.id]: value }
                            void persistSleep(next)
                            return next
                          })
                        }}
                      />
                    ))}
                  </div>
                )}
                {hasWrapUpForm ? (
                  <DailyLogForm
                    log={log}
                    goals={goals}
                    workouts={workouts}
                    streakLogs={streakLogs}
                    userId={userId}
                    embedded
                    hideWeeklyHabits
                    unloggedMetricsOnly
                    metricsFilter={wrapUpMetricsFilter}
                    onSaved={onHabitsSaved}
                  />
                ) : shutdownSleepMetrics.length === 0 ? (
                  <p className="py-6 text-center text-sm text-zinc-500">
                    All caught up for today.
                  </p>
                ) : null}
              </section>
            </div>
          )}

          {step === 'habitify' && (
            <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
              <HabitifyHabitsPanel viewDate={viewDate} compact />
            </section>
          )}

          {step === 'todoist' && (
            <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
              <TodoistTasksPanel viewDate={viewDate} compact />
            </section>
          )}

          {step === 'schedule' && (
            <div className="flex min-h-0 flex-1 items-stretch justify-center gap-4">
              <div
                data-schedule-height-host
                className="home-canvas flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden max-w-[36rem]"
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
                  onAssignExercise={onAssignTomorrowExercise}
                  onDropPlannedWorkout={dropPlannedWorkoutOnTomorrow}
                  headerActions={
                    <ScheduleTemplateMenu
                      iconOnly
                      applying={applyingTemplate}
                      onApply={handleApplyTemplate}
                    />
                  }
                />
              </div>

              <div className="flex h-full min-h-0 w-full shrink-0 flex-col overflow-y-auto overscroll-contain pt-4 pr-4 scrollbar-hidden lg:w-[300px] xl:w-[320px]">
                <ExercisePlanCard
                  viewDate={tomorrowDate}
                  userId={userId}
                  singleDate
                  onScheduleChange={onTomorrowScheduleChange}
                />
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

          {step === 'experiments' && (
            <ExperimentConfoundersSection date={viewDate} surface="shutdown" />
          )}

          {step === 'typed-reminder' && (
            <TypedReminderConfirm
              text={typedReminderText}
              value={typedReminderValue}
              onChange={setTypedReminderValue}
            />
          )}
        </div>

        {step !== 'schedule' && (
        <div className="shrink-0 border-t border-zinc-800/80 px-6 py-4">
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
              disabled={finishing || (step === 'typed-reminder' && !typedReminderReady)}
            >
              {finishing
                ? 'Wrapping up…'
                : isLastStep
                  ? 'Done for tonight'
                  : 'Continue'}
            </Button>
          </div>
        </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
