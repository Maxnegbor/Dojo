import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, History, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GoalMetricInput } from '@/components/ui/GoalMetricInput'
import { MetricInput } from '@/components/ui/MetricInput'
import type { DailyLog, Goal, Workout } from '@/types'
import { normalizeHabits } from '@/types'
import { getDailyLogGoals } from '@/lib/goals'
import {
  getDailyLogHabitTypes,
  getWeeklyLogHabitTypes,
  habitWeeklyLogKey,
} from '@/lib/habitTypes'
import { clearDraft } from '@/lib/dailyLogDraft'
import {
  EDIT_LOGS_LOOKBACK_DAYS,
  formatEditLogDayLabel,
  formatEditLogWeekLabel,
  getEditLogsDateRange,
  getWeekKeysInRange,
} from '@/lib/editLogsRange'
import {
  buildEditLogDaySleepUpdates,
  formatSleepMetricUnit,
  getEnabledSleepMetrics,
  getSleepMetricValue,
  getSleepMetricsConfig,
  type SleepMetricDefinition,
} from '@/lib/sleepMetrics'
import { isSupabaseConfigured } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import { getWeeklyLog, setWeeklyLogValue } from '@/lib/weeklyLogStore'
import { getWorkoutTypes } from '@/lib/workoutTypes'
import { isWeightGoal } from '@/lib/weightGoal'
import { displayToKg, kgToDisplay } from '@/lib/settingsStore'
import { useSettings } from '@/context/SettingsContext'
import { cn } from '@/lib/utils'

interface EditLogsModalProps {
  goals: Goal[]
  userId: string
  onClose: () => void
}

function MetricFieldRow({
  label,
  children,
  onDelete,
  hasValue,
}: {
  label: string
  children: ReactNode
  onDelete?: () => void
  hasValue?: boolean
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={!hasValue}
          className={cn(
            'mb-0.5 shrink-0 rounded-lg p-2 transition-colors',
            hasValue
              ? 'text-zinc-500 hover:bg-red-950/40 hover:text-red-400'
              : 'cursor-not-allowed text-zinc-700',
          )}
          aria-label={`Clear ${label}`}
          title={hasValue ? `Clear ${label}` : 'No value to clear'}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  )
}

function EditLogsDaySection({
  date,
  log,
  dayWorkouts,
  goals,
  sleepMetrics,
  showFocus,
  showWorkouts,
  dailyHabits,
  expanded,
  onToggle,
  onSaved,
  userId,
}: {
  date: string
  log: DailyLog | null
  dayWorkouts: Workout[]
  goals: Goal[]
  sleepMetrics: SleepMetricDefinition[]
  showFocus: boolean
  showWorkouts: boolean
  dailyHabits: ReturnType<typeof getDailyLogHabitTypes>
  expanded: boolean
  onToggle: () => void
  onSaved: () => void
  userId: string
}) {
  const dailyGoals = useMemo(() => getDailyLogGoals(goals), [goals])
  const scalarGoals = dailyGoals.filter(
    (g) =>
      g.metric_key !== 'focus' &&
      g.metric_key !== 'steps' &&
      g.metric_key !== 'screen_time' &&
      !g.metric_key.startsWith('workout_'),
  )

  const [sleepHours, setSleepHours] = useState<number | null>(log?.sleep_hours ?? null)
  const [customMetrics, setCustomMetrics] = useState<Record<string, number | null>>(
    () => ({ ...(log?.custom_metrics ?? {}) }),
  )
  const [focusMinutes, setFocusMinutes] = useState<number | null>(log?.focus_minutes ?? null)
  const [habits, setHabits] = useState(() => normalizeHabits(log?.habits))
  const [sleepMetricValues, setSleepMetricValues] = useState<Record<string, number | null>>(() => {
    const initial: Record<string, number | null> = {}
    for (const metric of sleepMetrics) {
      initial[metric.id] = getSleepMetricValue(log ?? undefined, metric)
    }
    return initial
  })
  const [workoutDurations, setWorkoutDurations] = useState<Record<string, number>>(() =>
    Object.fromEntries(dayWorkouts.map((w) => [w.id, w.duration_minutes])),
  )
  const [deletedWorkoutIds, setDeletedWorkoutIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSleepHours(log?.sleep_hours ?? null)
    setCustomMetrics({ ...(log?.custom_metrics ?? {}) })
    setFocusMinutes(log?.focus_minutes ?? null)
    setHabits(normalizeHabits(log?.habits))
    const nextSleep: Record<string, number | null> = {}
    for (const metric of sleepMetrics) {
      nextSleep[metric.id] = getSleepMetricValue(log ?? undefined, metric)
    }
    setSleepMetricValues(nextSleep)
    setWorkoutDurations(Object.fromEntries(dayWorkouts.map((w) => [w.id, w.duration_minutes])))
    setDeletedWorkoutIds(new Set())
  }, [date, log, dayWorkouts, sleepMetrics])

  const visibleWorkouts = dayWorkouts.filter((w) => !deletedWorkoutIds.has(w.id))

  const sleepGoal = scalarGoals.find((g) => g.metric_key === 'sleep')
  const customGoals = scalarGoals.filter((g) => g.metric_key.startsWith('custom:'))

  const persistDay = async (overrides?: {
    sleepHours?: number | null
    customMetrics?: Record<string, number | null>
    focusMinutes?: number | null
    habits?: ReturnType<typeof normalizeHabits>
    sleepMetricValues?: Record<string, number | null>
    deletedWorkoutIds?: Set<string>
    workoutDurations?: Record<string, number>
  }) => {
    setSaving(true)
    try {
      const nextSleepHours = overrides?.sleepHours !== undefined ? overrides.sleepHours : sleepHours
      const nextCustomMetrics = overrides?.customMetrics ?? customMetrics
      const nextFocusMinutes =
        overrides?.focusMinutes !== undefined ? overrides.focusMinutes : focusMinutes
      const nextHabits = overrides?.habits ?? habits
      const nextSleepMetricValues = overrides?.sleepMetricValues ?? sleepMetricValues
      const nextDeletedWorkoutIds = overrides?.deletedWorkoutIds ?? deletedWorkoutIds
      const nextWorkoutDurations = overrides?.workoutDurations ?? workoutDurations
      const nextVisibleWorkouts = dayWorkouts.filter((w) => !nextDeletedWorkoutIds.has(w.id))

      const sleepFieldUpdates = buildEditLogDaySleepUpdates(log, nextSleepMetricValues, sleepMetrics)
      const tracksSleepDuration = sleepMetrics.some((metric) => metric.id === 'sleep_duration')
      const updates: Partial<DailyLog> = {
        ...sleepFieldUpdates,
        sleep_hours: tracksSleepDuration
          ? sleepFieldUpdates.sleep_hours
          : sleepGoal
            ? nextSleepHours
            : sleepFieldUpdates.sleep_hours,
        focus_minutes: nextFocusMinutes ?? 0,
        habits: normalizeHabits(nextHabits),
        custom_metrics: { ...nextCustomMetrics },
      }

      if (isSupabaseConfigured) {
        const { updateDailyLogForDate, deleteWorkout, updateWorkout } = await import(
          '@/lib/supabase'
        )
        await updateDailyLogForDate(userId, date, updates)
        for (const workoutId of nextDeletedWorkoutIds) {
          await deleteWorkout(workoutId)
        }
        for (const workout of nextVisibleWorkouts) {
          const nextDuration = nextWorkoutDurations[workout.id]
          if (nextDuration != null && nextDuration !== workout.duration_minutes) {
            await updateWorkout(workout.id, { duration_minutes: nextDuration })
          }
        }
      } else {
        localStore.updateDailyLog(date, updates)
        for (const workoutId of nextDeletedWorkoutIds) {
          localStore.deleteWorkout(workoutId)
        }
        for (const workout of nextVisibleWorkouts) {
          const nextDuration = nextWorkoutDurations[workout.id]
          if (nextDuration != null && nextDuration !== workout.duration_minutes) {
            localStore.updateWorkout(workout.id, { duration_minutes: nextDuration })
          }
        }
      }

      clearDraft(date)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const saveDay = () => {
    const tracksSleepDuration = sleepMetrics.some((metric) => metric.id === 'sleep_duration')
    const durationCleared =
      tracksSleepDuration && (sleepMetricValues.sleep_duration ?? null) == null
    void persistDay(
      durationCleared ? { sleepHours: null, sleepMetricValues } : undefined,
    )
  }

  const hasLoggedData =
    scalarGoals.some((g) => {
      if (g.metric_key === 'sleep') return sleepHours != null
      if (g.metric_key.startsWith('custom:')) return customMetrics[g.metric_key] != null
      return false
    }) ||
    (showFocus && (focusMinutes ?? 0) > 0) ||
    dailyHabits.some((h) => habits[h.id]) ||
    visibleWorkouts.length > 0 ||
    sleepMetrics.some((m) => sleepMetricValues[m.id] != null)

  const clearSleepMetric = (metricId: string) => {
    const nextSleepMetricValues = { ...sleepMetricValues, [metricId]: null }
    const nextSleepHours = metricId === 'sleep_duration' ? null : sleepHours
    setSleepMetricValues(nextSleepMetricValues)
    if (metricId === 'sleep_duration') setSleepHours(null)
    void persistDay({
      sleepMetricValues: nextSleepMetricValues,
      sleepHours: nextSleepHours,
    })
  }

  const clearSleepGoal = () => {
    setSleepHours(null)
    void persistDay({ sleepHours: null })
  }

  const clearCustomMetric = (metricKey: string) => {
    const nextCustomMetrics = { ...customMetrics, [metricKey]: null }
    setCustomMetrics(nextCustomMetrics)
    void persistDay({ customMetrics: nextCustomMetrics })
  }

  const clearFocus = () => {
    setFocusMinutes(0)
    void persistDay({ focusMinutes: 0 })
  }

  const clearHabit = (habitId: string) => {
    const nextHabits = { ...habits, [habitId]: false }
    setHabits(nextHabits)
    void persistDay({ habits: nextHabits })
  }

  const deleteWorkout = (workoutId: string) => {
    const nextDeletedWorkoutIds = new Set([...deletedWorkoutIds, workoutId])
    setDeletedWorkoutIds(nextDeletedWorkoutIds)
    void persistDay({ deletedWorkoutIds: nextDeletedWorkoutIds })
  }

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <span className="text-sm font-medium text-zinc-200">{formatEditLogDayLabel(date)}</span>
          {!expanded && hasLoggedData && (
            <p className="mt-0.5 truncate text-[11px] text-zinc-500">Has logged data</p>
          )}
        </div>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-zinc-500 transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-zinc-800/80 px-4 pb-4 pt-4">
          {(sleepGoal || customGoals.length > 0 || showFocus || sleepMetrics.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {sleepGoal && (
                <MetricFieldRow
                  label={sleepGoal.name}
                  hasValue={sleepHours != null}
                  onDelete={clearSleepGoal}
                >
                  <GoalMetricInput
                    label={sleepGoal.name}
                    unit={sleepGoal.unit}
                    step="0.5"
                    value={sleepHours}
                    onChange={setSleepHours}
                  />
                </MetricFieldRow>
              )}

              {customGoals.map((goal) => (
                <MetricFieldRow
                  key={goal.id}
                  label={goal.name}
                  hasValue={customMetrics[goal.metric_key] != null}
                  onDelete={() => clearCustomMetric(goal.metric_key)}
                >
                  <GoalMetricInput
                    label={goal.name}
                    unit={goal.unit}
                    metricKey={goal.metric_key}
                    value={customMetrics[goal.metric_key] ?? null}
                    onChange={(value) =>
                      setCustomMetrics((prev) => ({ ...prev, [goal.metric_key]: value }))
                    }
                  />
                </MetricFieldRow>
              ))}

              {showFocus && (
                <MetricFieldRow
                  label="Focus"
                  hasValue={(focusMinutes ?? 0) > 0}
                  onDelete={clearFocus}
                >
                  <GoalMetricInput
                    label="Focus"
                    unit="min"
                    value={focusMinutes}
                    onChange={setFocusMinutes}
                  />
                </MetricFieldRow>
              )}

              {sleepMetrics.map((metric) => (
                <MetricFieldRow
                  key={metric.id}
                  label={metric.label}
                  hasValue={sleepMetricValues[metric.id] != null}
                  onDelete={() => clearSleepMetric(metric.id)}
                >
                  <GoalMetricInput
                    label={metric.label}
                    unit={
                      metric.id === 'sleep_duration' || metric.id === 'in_bed'
                        ? 'hrs:min'
                        : formatSleepMetricUnit(metric.unit)
                    }
                    metricKey={metric.id}
                    value={sleepMetricValues[metric.id] ?? null}
                    onChange={(value) =>
                      setSleepMetricValues((prev) => ({ ...prev, [metric.id]: value }))
                    }
                  />
                </MetricFieldRow>
              ))}
            </div>
          )}

          {dailyHabits.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Habits
              </p>
              <div className="space-y-1.5">
                {dailyHabits.map((habit) => {
                  const done = habits[habit.id] ?? false
                  return (
                    <div
                      key={habit.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setHabits((prev) => ({ ...prev, [habit.id]: !done }))
                        }
                        className={cn(
                          'min-w-0 flex-1 text-left text-sm transition-colors',
                          done ? 'text-emerald-300' : 'text-zinc-300',
                        )}
                      >
                        {habit.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => clearHabit(habit.id)}
                        disabled={!done}
                        className={cn(
                          'rounded-lg p-1.5 transition-colors',
                          done
                            ? 'text-zinc-500 hover:bg-red-950/40 hover:text-red-400'
                            : 'cursor-not-allowed text-zinc-700',
                        )}
                        aria-label={`Clear ${habit.label}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {showWorkouts && visibleWorkouts.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Workouts
              </p>
              <div className="space-y-2">
                {visibleWorkouts.map((workout) => {
                  const type = getWorkoutTypes().find((t) => t.id === workout.category)
                  return (
                    <div key={workout.id} className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <MetricInput
                          label={type?.label ?? workout.category}
                          unit="min"
                          value={workoutDurations[workout.id] ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value
                            const parsed = raw ? parseInt(raw, 10) : 0
                            setWorkoutDurations((prev) => ({
                              ...prev,
                              [workout.id]: Number.isNaN(parsed) ? 0 : parsed,
                            }))
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteWorkout(workout.id)}
                        className="mb-0.5 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-red-950/40 hover:text-red-400"
                        aria-label={`Delete ${type?.label ?? workout.category} workout`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!sleepGoal &&
            customGoals.length === 0 &&
            !showFocus &&
            sleepMetrics.length === 0 &&
            dailyHabits.length === 0 &&
            (!showWorkouts || visibleWorkouts.length === 0) && (
              <p className="text-sm text-zinc-500">No metrics configured for daily logging.</p>
            )}

          <Button size="sm" className="w-full" onClick={saveDay} disabled={saving}>
            {saving ? 'Saving…' : 'Save day'}
          </Button>
        </div>
      )}
    </div>
  )
}

function EditLogsWeekSection({
  weekKey,
  goals,
  weeklyHabits,
  weightUnit,
  expanded,
  onToggle,
}: {
  weekKey: string
  goals: Goal[]
  weeklyHabits: ReturnType<typeof getWeeklyLogHabitTypes>
  weightUnit: 'kg' | 'lb'
  expanded: boolean
  onToggle: () => void
}) {
  const weightGoal = goals.find(isWeightGoal)
  const stored = getWeeklyLog(weekKey)
  const storedWeightKg = stored.weight ?? null

  const [weightDisplay, setWeightDisplay] = useState<number | null>(() =>
    storedWeightKg != null ? kgToDisplay(storedWeightKg, weightUnit) : null,
  )
  const [habitDone, setHabitDone] = useState<Record<string, boolean>>(() => {
    const next: Record<string, boolean> = {}
    for (const habit of weeklyHabits) {
      next[habit.id] = stored[habitWeeklyLogKey(habit.id)] === 1
    }
    return next
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fresh = getWeeklyLog(weekKey)
    setWeightDisplay(fresh.weight != null ? kgToDisplay(fresh.weight, weightUnit) : null)
    const next: Record<string, boolean> = {}
    for (const habit of weeklyHabits) {
      next[habit.id] = fresh[habitWeeklyLogKey(habit.id)] === 1
    }
    setHabitDone(next)
  }, [weekKey, weeklyHabits, weightUnit])

  if (!weightGoal && weeklyHabits.length === 0) return null

  const saveWeek = async () => {
    setSaving(true)
    try {
      if (weightGoal) {
        const kg =
          weightDisplay != null && !Number.isNaN(weightDisplay)
            ? displayToKg(weightDisplay, weightUnit)
            : null
        setWeeklyLogValue(weekKey, 'weight', kg)
      }
      for (const habit of weeklyHabits) {
        const key = habitWeeklyLogKey(habit.id)
        setWeeklyLogValue(weekKey, key, habitDone[habit.id] ? 1 : 0)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <span className="text-sm font-medium text-zinc-200">{formatEditLogWeekLabel(weekKey)}</span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-zinc-500 transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-zinc-800/80 px-4 pb-4 pt-4">
          {weightGoal && (
            <MetricFieldRow
              label="Weight"
              hasValue={weightDisplay != null}
              onDelete={() => {
                setWeightDisplay(null)
                setWeeklyLogValue(weekKey, 'weight', null)
              }}
            >
              <GoalMetricInput
                label="Weight"
                unit={weightUnit}
                step="0.1"
                value={weightDisplay}
                onChange={setWeightDisplay}
              />
            </MetricFieldRow>
          )}

          {weeklyHabits.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Weekly habits
              </p>
              <div className="space-y-1.5">
                {weeklyHabits.map((habit) => {
                  const done = habitDone[habit.id] ?? false
                  return (
                    <div
                      key={habit.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setHabitDone((prev) => ({ ...prev, [habit.id]: !done }))
                        }
                        className={cn(
                          'min-w-0 flex-1 text-left text-sm transition-colors',
                          done ? 'text-emerald-300' : 'text-zinc-300',
                        )}
                      >
                        {habit.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHabitDone((prev) => ({ ...prev, [habit.id]: false }))
                          setWeeklyLogValue(weekKey, habitWeeklyLogKey(habit.id), 0)
                        }}
                        disabled={!done}
                        className={cn(
                          'rounded-lg p-1.5 transition-colors',
                          done
                            ? 'text-zinc-500 hover:bg-red-950/40 hover:text-red-400'
                            : 'cursor-not-allowed text-zinc-700',
                        )}
                        aria-label={`Clear ${habit.label}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <Button size="sm" className="w-full" onClick={saveWeek} disabled={saving}>
            {saving ? 'Saving…' : 'Save week'}
          </Button>
        </div>
      )}
    </div>
  )
}

export function EditLogsModal({ goals, userId, onClose }: EditLogsModalProps) {
  const { settings } = useSettings()
  const { dates } = useMemo(() => getEditLogsDateRange(), [])
  const weekKeys = useMemo(
    () => getWeekKeysInRange(dates, settings.weekStartsOn),
    [dates, settings.weekStartsOn],
  )

  const [logs, setLogs] = useState<DailyLog[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDate, setExpandedDate] = useState<string | null>(dates[0] ?? null)
  const [expandedWeek, setExpandedWeek] = useState<string | null>(weekKeys[0] ?? null)

  const sleepMetrics = useMemo(() => getEnabledSleepMetrics(getSleepMetricsConfig()), [])
  const dailyHabits = useMemo(() => getDailyLogHabitTypes(), [])
  const weeklyHabits = useMemo(() => getWeeklyLogHabitTypes(), [])
  const showFocus = goals.some((g) => g.metric_key === 'focus' && g.is_active)
  const showWorkouts = settings.showWorkoutMetrics && getWorkoutTypes().length > 0
  const hasWeightGoal = goals.some(isWeightGoal)
  const showWeeklySection = hasWeightGoal || weeklyHabits.length > 0

  const loadData = useCallback(async () => {
    setLoading(true)
    const { start, end } = getEditLogsDateRange()
    try {
      if (isSupabaseConfigured) {
        const { fetchDailyLogs, fetchWorkouts } = await import('@/lib/supabase')
        const [nextLogs, nextWorkouts] = await Promise.all([
          fetchDailyLogs(userId, start, end),
          fetchWorkouts(userId, start, end),
        ])
        setLogs(nextLogs)
        setWorkouts(nextWorkouts)
      } else {
        setLogs(localStore.getDailyLogs(start, end))
        setWorkouts(localStore.getWorkouts(start, end))
      }
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const logsByDate = useMemo(() => new Map(logs.map((l) => [l.date, l])), [logs])
  const workoutsByDate = useMemo(() => {
    const map = new Map<string, Workout[]>()
    for (const workout of workouts) {
      const list = map.get(workout.date) ?? []
      list.push(workout)
      map.set(workout.date, list)
    }
    return map
  }, [workouts])

  const handleDaySaved = () => {
    void loadData()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="edit-logs-title"
        className="flex max-h-[min(92vh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700 sm:h-11 sm:w-11">
              <History size={20} />
            </div>
            <div>
              <h2 id="edit-logs-title" className="text-lg font-semibold text-zinc-100">
                Edit logs
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Review and change metric logs from the past {EDIT_LOGS_LOOKBACK_DAYS} days.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-zinc-500">Loading logs…</p>
          ) : (
            <>
              {showWeeklySection && (
                <section>
                  <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Weekly logs
                  </h3>
                  <div className="space-y-2">
                    {weekKeys.map((weekKey) => (
                      <EditLogsWeekSection
                        key={weekKey}
                        weekKey={weekKey}
                        goals={goals}
                        weeklyHabits={weeklyHabits}
                        weightUnit={settings.weightUnit}
                        expanded={expandedWeek === weekKey}
                        onToggle={() =>
                          setExpandedWeek((current) => (current === weekKey ? null : weekKey))
                        }
                      />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Daily logs
                </h3>
                <div className="space-y-2">
                  {dates.map((date) => (
                    <EditLogsDaySection
                      key={date}
                      date={date}
                      log={logsByDate.get(date) ?? null}
                      dayWorkouts={workoutsByDate.get(date) ?? []}
                      goals={goals}
                      sleepMetrics={sleepMetrics}
                      showFocus={showFocus}
                      showWorkouts={showWorkouts}
                      dailyHabits={dailyHabits}
                      expanded={expandedDate === date}
                      onToggle={() =>
                        setExpandedDate((current) => (current === date ? null : date))
                      }
                      onSaved={handleDaySaved}
                      userId={userId}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-zinc-800/80 px-5 py-4 sm:px-6">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
