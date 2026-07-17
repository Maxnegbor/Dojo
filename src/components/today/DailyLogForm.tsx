import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ChevronDown, Moon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { GoalMetricInput } from '@/components/ui/GoalMetricInput'
import { HabitLogRow } from '@/components/today/HabitLogRow'
import type { DailyLog, Goal, Workout, WorkoutCategory } from '@/types'
import { getDailyLogGoals } from '@/lib/goals'
import { getDailyLogHabitTypes, getHabitTypes, saveHabitTypes, useDailyLogHabitTypes, useWeeklyLogHabitTypes } from '@/lib/habitTypes'
import { WeeklyHabitsLogSection } from '@/components/today/WeeklyHabitsLogSection'
import { getHabitTargetLabel, applyRampLevelSync } from '@/lib/habitRamp'
import { getWorkoutTypes } from '@/lib/workoutTypes'
import { getHabitStreak } from '@/lib/habitStreaks'
import {
  draftFromLog,
  flushDraftToStore,
  getDraft,
  isShutdownWorkoutChoiceReady,
  mergeDraftWithLog,
  setDraft,
  usesAdditiveTodayDraft,
  type DailyLogDraft,
  type WorkoutDrafts,
} from '@/lib/dailyLogDraft'
import { isLogEditable } from '@/lib/devFlags'
import { getAppSettings } from '@/lib/settingsStore'
import { playHabitCheckSound, warmAudioContext } from '@/lib/timerSound'
import { useHabitCompleteAnimation } from '@/hooks/useHabitCompleteAnimation'
import { useSettings } from '@/context/SettingsContext'
import type { ShutdownLogFilter } from '@/lib/shutdownLogConfig'
import { cn, formatDate } from '@/lib/utils'

interface DailyLogFormProps {
  log: DailyLog
  goals: Goal[]
  workouts: Workout[]
  streakLogs?: DailyLog[]
  embedded?: boolean
  /** Sidebar habits-only mode — log habits throughout the day. */
  habitsOnly?: boolean
  /** Require explicit workout / none selection (shutdown flow). */
  requireWorkoutSelection?: boolean
  /** When set, only show metrics configured for shutdown logging. */
  metricsFilter?: ShutdownLogFilter
  onWorkoutSelectionChange?: (ready: boolean) => void
  userId?: string
  onSaved?: () => void
}

const DONE_LIST_IDLE_MS = 5000

export function DailyLogForm({
  log,
  goals,
  workouts,
  streakLogs = [],
  embedded = false,
  habitsOnly = false,
  requireWorkoutSelection = false,
  metricsFilter,
  onWorkoutSelectionChange,
  userId,
  onSaved,
}: DailyLogFormProps) {
  const { settings } = useSettings()
  const today = formatDate(new Date())
  const isEditableDay = isLogEditable(log.date, today, settings)
  const isPastDay = log.date < today
  const needsManualSave = isPastDay && isEditableDay && !habitsOnly

  const dailyGoals = useMemo(() => getDailyLogGoals(goals), [goals])
  const dailyHabits = useDailyLogHabitTypes()
  const weeklyHabits = useWeeklyLogHabitTypes()
  const workoutTypes = useMemo(() => getWorkoutTypes(), [])
  const filteredDailyHabits = useMemo(() => {
    if (!metricsFilter) return dailyHabits
    return dailyHabits.filter((habit) => metricsFilter.habitIds.has(habit.id))
  }, [dailyHabits, metricsFilter])
  const filteredWorkoutTypes = useMemo(() => {
    if (!metricsFilter) return workoutTypes
    return workoutTypes.filter((type) => metricsFilter.workoutCategories.has(type.id))
  }, [workoutTypes, metricsFilter])
  const filteredScalarGoals = useMemo(() => {
    const base = dailyGoals.filter(
      (goal) =>
        goal.metric_key !== 'focus' &&
        !goal.metric_key.startsWith('workout_'),
    )
    if (!metricsFilter) {
      return base.filter(
        (goal) =>
          goal.metric_key !== 'sleep' &&
          goal.metric_key !== 'steps' &&
          goal.metric_key !== 'screen_time',
      )
    }
    return base.filter((goal) => metricsFilter.goalKeys.has(goal.metric_key))
  }, [dailyGoals, metricsFilter])
  const showWorkouts =
    embedded &&
    settings.showWorkoutMetrics &&
    !habitsOnly &&
    (!metricsFilter || filteredWorkoutTypes.length > 0)
  const showWeeklyHabits = weeklyHabits.length > 0 && !metricsFilter
  const hasDailyLogItems = habitsOnly
    ? dailyHabits.length > 0 || weeklyHabits.length > 0
    : metricsFilter
      ? filteredDailyHabits.length > 0 ||
        filteredScalarGoals.length > 0 ||
        (showWorkouts && filteredWorkoutTypes.length > 0)
      : dailyGoals.some(
          (g) =>
            g.metric_key !== 'focus' &&
            g.metric_key !== 'sleep' &&
            g.metric_key !== 'steps' &&
            g.metric_key !== 'screen_time' &&
            !g.metric_key.startsWith('workout_'),
        ) ||
        dailyHabits.length > 0 ||
        (showWorkouts && workoutTypes.length > 0)

  const buildDraft = useCallback((): DailyLogDraft => {
    if (!isEditableDay) {
      return draftFromLog(log, workouts)
    }
    return mergeDraftWithLog(log, getDraft(log.date), workouts)
  }, [log, workouts, isEditableDay])

  const [draft, setDraftState] = useState<DailyLogDraft>(buildDraft)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [showCompletedHabits, setShowCompletedHabits] = useState(false)
  const doneIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showCompletedHabitsRef = useRef(showCompletedHabits)
  const userOpenedDoneListRef = useRef(false)
  const prevCompletedCountRef = useRef(0)
  const flushHabitsIfNeeded = useCallback(() => {
    if (habitsOnly && userId && isEditableDay && log.date === today) {
      void flushDraftToStore(log.date, userId).then(() => onSaved?.())
    }
  }, [habitsOnly, userId, isEditableDay, log.date, today, onSaved])

  const { getPhase, isAnimating, startComplete, clearPhase, resetAll } = useHabitCompleteAnimation({
    onExitComplete: flushHabitsIfNeeded,
  })

  const cancelDoneListClose = useCallback(() => {
    if (doneIdleTimerRef.current) {
      window.clearTimeout(doneIdleTimerRef.current)
      doneIdleTimerRef.current = null
    }
  }, [])

  const scheduleDoneListClose = useCallback(() => {
    cancelDoneListClose()
    doneIdleTimerRef.current = window.setTimeout(() => {
      if (showCompletedHabitsRef.current) {
        userOpenedDoneListRef.current = false
        setShowCompletedHabits(false)
      }
      doneIdleTimerRef.current = null
    }, DONE_LIST_IDLE_MS)
  }, [cancelDoneListClose])

  showCompletedHabitsRef.current = showCompletedHabits

  const toggleDoneList = () => {
    setShowCompletedHabits((open) => {
      const next = !open
      userOpenedDoneListRef.current = next
      if (open) cancelDoneListClose()
      return next
    })
  }

  const habitStreaks = useMemo(() => {
    return filteredDailyHabits.reduce(
      (acc, habit) => {
        acc[habit.id] = getHabitStreak(streakLogs, habit.id, log.date, draft.habits)
        return acc
      },
      {} as Record<string, number>,
    )
  }, [filteredDailyHabits, streakLogs, log.date, draft.habits])

  useEffect(() => {
    resetAll()
    cancelDoneListClose()
    userOpenedDoneListRef.current = false
    prevCompletedCountRef.current = 0
    setShowCompletedHabits(false)
  }, [log.date, resetAll, cancelDoneListClose])

  useEffect(() => {
    if (showCompletedHabits) {
      scheduleDoneListClose()
    } else {
      cancelDoneListClose()
    }
  }, [showCompletedHabits, scheduleDoneListClose, cancelDoneListClose])

  useEffect(() => cancelDoneListClose, [cancelDoneListClose])

  useEffect(() => {
    setDraftState(buildDraft())
  }, [buildDraft])

  useEffect(() => {
    warmAudioContext()
  }, [])

  useEffect(() => {
    if (!requireWorkoutSelection || !onWorkoutSelectionChange) return
    if (!showWorkouts) {
      onWorkoutSelectionChange(true)
      return
    }
    onWorkoutSelectionChange(isShutdownWorkoutChoiceReady(draft, log.date, workouts))
  }, [
    draft,
    requireWorkoutSelection,
    onWorkoutSelectionChange,
    showWorkouts,
    log.date,
    workouts,
  ])

  const updateDraft = useCallback(
    (patch: Partial<DailyLogDraft>) => {
      setDraftState((prev) => {
        const next: DailyLogDraft = {
          ...prev,
          ...patch,
          ...(usesAdditiveTodayDraft(log.date) && patch.workouts != null
            ? { workoutMode: 'additive' as const }
            : {}),
        }
        if (isEditableDay) setDraft(log.date, next)
        return next
      })
    },
    [log.date, isEditableDay],
  )

  const savePastDay = async () => {
    if (!userId || !needsManualSave) return
    setSaving(true)
    try {
      await flushDraftToStore(log.date, userId)
      setSavedFlash(true)
      onSaved?.()
      window.setTimeout(() => setSavedFlash(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const workoutDrafts: WorkoutDrafts = draft.workouts ?? {}
  const workoutNoneSelected = draft.workoutExplicitNone === true

  const selectWorkoutNone = () => {
    updateDraft({ workouts: {}, workoutExplicitNone: true })
  }

  const toggleWorkout = (category: WorkoutCategory) => {
    const next = { ...workoutDrafts }
    if (category in next) delete next[category]
    else next[category] = null
    updateDraft({ workouts: next, workoutExplicitNone: false })
  }

  const setWorkoutDuration = (category: WorkoutCategory, raw: string) => {
    updateDraft({
      workouts: {
        ...workoutDrafts,
        [category]: raw ? parseInt(raw, 10) : null,
      },
      workoutExplicitNone: false,
    })
  }

  const toggleHabit = (habitId: string) => {
    const current = draft.habits?.[habitId] ?? false
    const next = !current
    if (next) {
      playHabitCheckSound()
      startComplete(habitId)
    } else {
      clearPhase(habitId)
    }
    const nextHabits = {
      ...(draft.habits ?? {}),
      [habitId]: next,
    }
    updateDraft({ habits: nextHabits })

    const streakByHabit = getDailyLogHabitTypes().reduce<Record<string, number>>((acc, habit) => {
      acc[habit.id] = getHabitStreak(streakLogs, habit.id, log.date, nextHabits)
      return acc
    }, {})
    const { habits: synced, changed } = applyRampLevelSync(getHabitTypes(), streakByHabit)
    if (changed) saveHabitTypes(synced)
  }

  const { pendingHabits, completedHabits } = useMemo(() => {
    const pending: typeof filteredDailyHabits = []
    const completed: typeof filteredDailyHabits = []
    for (const habit of filteredDailyHabits) {
      const isDone = !!draft.habits?.[habit.id]
      const animating = isAnimating(habit.id)
      if (isDone && !animating) completed.push(habit)
      else pending.push(habit)
    }
    return { pendingHabits: pending, completedHabits: completed }
  }, [filteredDailyHabits, draft.habits, isAnimating])

  useLayoutEffect(() => {
    if (completedHabits.length > prevCompletedCountRef.current && !userOpenedDoneListRef.current) {
      setShowCompletedHabits(false)
    }
    prevCompletedCountRef.current = completedHabits.length
  }, [completedHabits.length])

  const renderHabitRow = (habit: (typeof filteredDailyHabits)[number]) => (
    <HabitLogRow
      habit={habit}
      done={!!draft.habits?.[habit.id]}
      phase={getPhase(habit.id)}
      targetLabel={getHabitTargetLabel(habit)}
      streak={habitStreaks[habit.id] ?? 0}
      disabled={!isEditableDay}
      onToggle={() => toggleHabit(habit.id)}
    />
  )

  const renderGoalInput = (goal: Goal) => {
    const key = goal.metric_key

    if (key === 'sleep') {
      return (
        <GoalMetricInput
          key={goal.id}
          label={goal.name}
          unit={goal.unit}
          step="0.5"
          value={draft.sleep_hours}
          disabled={!isEditableDay}
          onChange={(value) => updateDraft({ sleep_hours: value })}
        />
      )
    }

    if (key === 'weight') {
      return (
        <GoalMetricInput
          key={goal.id}
          label={goal.name}
          unit={goal.unit}
          disabled={!isEditableDay}
          value={draft.weight}
          onChange={(value) => updateDraft({ weight: value })}
        />
      )
    }

    if (key === 'steps') {
      return (
        <GoalMetricInput
          key={goal.id}
          label={goal.name}
          unit={goal.unit}
          disabled={!isEditableDay}
          value={draft.steps}
          onChange={(value) => updateDraft({ steps: value })}
        />
      )
    }

    if (key === 'screen_time') {
      return (
        <GoalMetricInput
          key={goal.id}
          label={goal.name}
          unit={goal.unit}
          disabled={!isEditableDay}
          value={draft.screen_time_minutes}
          onChange={(value) => updateDraft({ screen_time_minutes: value })}
        />
      )
    }

    if (key.startsWith('custom:')) {
      return (
        <GoalMetricInput
          key={goal.id}
          label={goal.name}
          unit={goal.unit}
          disabled={!isEditableDay}
          value={draft.custom_metrics?.[key] ?? null}
          onChange={(value) =>
            updateDraft({
              custom_metrics: {
                ...(draft.custom_metrics ?? {}),
                [key]: value,
              },
            })
          }
        />
      )
    }

    return null
  }

  const emptyLogHint = metricsFilter
    ? 'No shutdown log fields configured yet. Add metrics in Settings → Routines → Daily shutdown.'
    : 'Nothing to log today yet. Add metrics on the Metrics page to start tracking.'

  const formBody = (
    <div className="space-y-4">
      {!hasDailyLogItems ? (
        <p className="py-6 text-center text-sm text-zinc-500">{emptyLogHint}</p>
      ) : (
        <>
          {filteredDailyHabits.length > 0 && (
            <div>
              {showWeeklyHabits && (
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Daily habits
                </p>
              )}
              {filteredDailyHabits.length > 0 && !showWeeklyHabits && (
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Habits
                </p>
              )}
              {embedded ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {filteredDailyHabits.map((habit) => (
                    <div key={habit.id}>{renderHabitRow(habit)}</div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    {pendingHabits.map((habit) => {
                      const exiting = getPhase(habit.id) === 'exiting'
                      return (
                        <div
                          key={habit.id}
                          className={cn('reminder-row', exiting && 'reminder-row-exiting')}
                        >
                          <div className="reminder-row-inner">{renderHabitRow(habit)}</div>
                        </div>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={toggleDoneList}
                    className="mt-2 flex w-full items-center gap-1.5 rounded-lg px-1 py-1.5 text-left text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-300"
                    aria-expanded={showCompletedHabits}
                  >
                    <ChevronDown
                      size={14}
                      className={cn(
                        'shrink-0 transition-transform duration-200',
                        showCompletedHabits && 'rotate-180',
                      )}
                    />
                    <span>{completedHabits.length} done</span>
                  </button>
                  {showCompletedHabits && completedHabits.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {completedHabits.map((habit) => (
                        <div key={habit.id}>{renderHabitRow(habit)}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {showWeeklyHabits && (
            <WeeklyHabitsLogSection
              date={log.date}
              weekStartsOn={settings.weekStartsOn}
              disabled={!isEditableDay}
              compact={embedded}
            />
          )}

          {filteredScalarGoals.length > 0 && !habitsOnly && (
            <div className="grid grid-cols-2 gap-3">
              {filteredScalarGoals.map(renderGoalInput)}
            </div>
          )}

          {showWorkouts && filteredWorkoutTypes.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Workouts
              </p>
              <div className="flex items-start gap-1">
                {filteredWorkoutTypes.map((type) => {
                  const selected = type.id in workoutDrafts
                  return (
                    <button
                      key={type.id}
                      type="button"
                      disabled={!isEditableDay}
                      onClick={() => toggleWorkout(type.id)}
                      className={cn(
                        'flex min-w-0 flex-1 flex-col self-start overflow-hidden rounded-md transition-[background-color,color] duration-150',
                        !selected &&
                          'bg-zinc-800 text-zinc-400 hover:text-zinc-100 [background-color:rgb(39_39_42)] hover:[background-color:color-mix(in_srgb,var(--workout-color)_28%,rgb(39_39_42))]',
                        selected && 'text-white',
                        !isEditableDay && 'cursor-not-allowed opacity-60',
                      )}
                      style={
                        selected
                          ? { backgroundColor: type.color, color: '#fff' }
                          : ({ '--workout-color': type.color } as CSSProperties)
                      }
                    >
                      <span className="px-1.5 py-1.5 text-[10px] font-medium">{type.label}</span>
                      {selected && (
                        <div
                          className="mx-1 mb-1.5 flex flex-col gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-0.5 rounded bg-black/25 px-1.5 py-1">
                            <input
                              type="number"
                              min={1}
                              inputMode="numeric"
                              placeholder="Add"
                              disabled={!isEditableDay}
                              value={workoutDrafts[type.id] ?? ''}
                              onChange={(e) => setWorkoutDuration(type.id, e.target.value)}
                              className={cn(
                                'min-w-0 flex-1 bg-transparent text-center text-xs font-medium text-white',
                                'placeholder:text-white/40 focus:outline-none',
                                '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                              )}
                            />
                            <span className="shrink-0 text-[10px] text-white/60">min</span>
                          </div>
                        </div>
                      )}
                    </button>
                  )
                })}
                <button
                  type="button"
                  disabled={!isEditableDay}
                  onClick={selectWorkoutNone}
                  className={cn(
                    'flex min-w-0 flex-1 flex-col self-start overflow-hidden rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-colors duration-150',
                    workoutNoneSelected
                      ? 'bg-zinc-500 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
                    !isEditableDay && 'cursor-not-allowed opacity-60',
                  )}
                >
                  None
                </button>
              </div>
              {requireWorkoutSelection &&
                !isShutdownWorkoutChoiceReady(draft, log.date, workouts) && (
                  <p className="mt-1.5 text-[10px] text-zinc-500">
                    Select a workout type or None to continue.
                  </p>
                )}
            </div>
          )}
        </>
      )}
    </div>
  )

  if (embedded) {
    return formBody
  }

  return (
    <Card
      title={habitsOnly ? 'Habits' : 'Daily Log'}
      action={
        habitsOnly ? null : needsManualSave ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={savePastDay}
            disabled={saving}
            className={savedFlash ? 'border-emerald-500/50 text-emerald-400' : undefined}
          >
            {savedFlash ? 'Saved' : saving ? 'Saving…' : 'Save'}
          </Button>
        ) : isEditableDay && hasDailyLogItems ? (
          <span className="flex items-center gap-1 text-[10px] text-zinc-500">
            <Moon size={10} /> Shutdown saves when ready
          </span>
        ) : null
      }
    >
      {formBody}
    </Card>
  )
}

export function getDailyLogDraftForDate(
  log: DailyLog,
  workouts: Workout[],
): DailyLogDraft {
  const today = formatDate(new Date())
  const settings = getAppSettings()
  const base = mergeDraftWithLog(log, getDraft(log.date), workouts)
  if (log.date < today && isLogEditable(log.date, today, settings)) {
    return base
  }
  if (log.date >= today && isLogEditable(log.date, today, settings)) {
    return base
  }
  return draftFromLog(log, workouts)
}
