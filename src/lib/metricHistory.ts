import { addDays, parseISO } from 'date-fns'
import { clearDraft } from '@/lib/dailyLogDraft'
import { getWeekKeysInRange } from '@/lib/editLogsRange'
import { goalLogPeriod } from '@/lib/goals'
import { habitLogPeriod, habitWeeklyLogKey } from '@/lib/habitTypes'
import { getMetricValue } from '@/lib/metrics'
import { notifyMorningLogChanged } from '@/lib/morningLog'
import {
  buildEditLogDaySleepUpdates,
  getEnabledSleepMetrics,
  getSleepMetricValue,
  type SleepMetricDefinition,
  type SleepMetricsConfig,
} from '@/lib/sleepMetrics'
import { displayToKg } from '@/lib/settingsStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import { getWeeklyLog, setWeeklyLogValue } from '@/lib/weeklyLogStore'
import { workoutMetricKey } from '@/lib/workoutTypes'
import { isWeightGoal } from '@/lib/weightGoal'
import { formatDate } from '@/lib/utils'
import type { DailyLog, Goal, Workout } from '@/types'
import { normalizeHabits } from '@/types'
import type { HabitTypeDefinition } from '@/lib/habitTypes'
import type { WorkoutTypeDefinition } from '@/lib/workoutTypes'

export const METRIC_HISTORY_LOOKBACK_DAYS = 30

export type MetricHistoryTarget =
  | { kind: 'habit'; habitId: string }
  | { kind: 'workout'; workoutTypeId: string }
  | { kind: 'sleep_metric'; metricId: string }
  | { kind: 'goal'; goalId: string }
  | { kind: 'weight'; goalId: string }

export type MetricHistoryPeriod = 'daily' | 'weekly'

export interface MetricHistoryContext {
  label: string
  unit: string
  period: MetricHistoryPeriod
  valueKind: 'boolean' | 'number'
  metricKey?: string
  sleepMetric?: SleepMetricDefinition
  goal?: Goal
  habit?: HabitTypeDefinition
  workoutType?: WorkoutTypeDefinition
}

export function getMetricHistoryDateRange(endDate: string = formatDate(new Date())): {
  start: string
  end: string
  dates: string[]
} {
  const end = endDate
  const start = formatDate(
    addDays(parseISO(`${end}T12:00:00`), -(METRIC_HISTORY_LOOKBACK_DAYS - 1)),
  )
  const dates: string[] = []
  for (let i = 0; i < METRIC_HISTORY_LOOKBACK_DAYS; i++) {
    dates.push(formatDate(addDays(parseISO(`${end}T12:00:00`), -i)))
  }
  return { start, end, dates }
}

export function resolveMetricHistoryContext(
  target: MetricHistoryTarget,
  goals: Goal[],
  habits: HabitTypeDefinition[],
  workoutTypes: WorkoutTypeDefinition[],
  sleepConfig: SleepMetricsConfig,
): MetricHistoryContext | null {
  switch (target.kind) {
    case 'habit': {
      const habit = habits.find((h) => h.id === target.habitId)
      if (!habit) return null
      return {
        label: habit.label,
        unit: '',
        period: habitLogPeriod(habit) === 'weekly' ? 'weekly' : 'daily',
        valueKind: 'boolean',
        habit,
      }
    }
    case 'workout': {
      const workoutType = workoutTypes.find((t) => t.id === target.workoutTypeId)
      if (!workoutType) return null
      const goal = goals.find((g) => g.metric_key === workoutMetricKey(workoutType.id))
      return {
        label: workoutType.label,
        unit: goal?.unit || workoutType.unit || 'min',
        period: goal && goalLogPeriod(goal) === 'weekly' ? 'weekly' : 'daily',
        valueKind: 'number',
        metricKey: workoutMetricKey(workoutType.id),
        goal,
        workoutType,
      }
    }
    case 'sleep_metric': {
      const sleepMetric = getEnabledSleepMetrics(sleepConfig).find((m) => m.id === target.metricId)
      if (!sleepMetric) return null
      return {
        label: sleepMetric.label,
        unit:
          sleepMetric.id === 'sleep_duration' || sleepMetric.id === 'in_bed'
            ? 'hrs:min'
            : sleepMetric.unit === 'percent'
              ? '%'
              : sleepMetric.unit === 'score10'
                ? '/10'
                : sleepMetric.unit,
        period: 'daily',
        valueKind: 'number',
        sleepMetric,
      }
    }
    case 'goal': {
      const goal = goals.find((g) => g.id === target.goalId)
      if (!goal) return null
      return {
        label: goal.name,
        unit: goal.unit,
        period: goalLogPeriod(goal) === 'weekly' ? 'weekly' : 'daily',
        valueKind: 'number',
        metricKey: goal.metric_key,
        goal,
      }
    }
    case 'weight': {
      const goal = goals.find((g) => g.id === target.goalId)
      if (!goal) return null
      return {
        label: 'Weight',
        unit: 'kg',
        period: goalLogPeriod(goal) === 'weekly' ? 'weekly' : 'daily',
        valueKind: 'number',
        metricKey: 'weight',
        goal,
      }
    }
  }
}

export function getDailyHistoryValue(
  context: MetricHistoryContext,
  log: DailyLog | undefined,
  workouts: Workout[],
  date: string,
): number | boolean | null {
  if (context.valueKind === 'boolean' && context.habit) {
    return normalizeHabits(log?.habits)[context.habit.id] ?? false
  }

  if (context.sleepMetric) {
    return getSleepMetricValue(log, context.sleepMetric)
  }

  if (context.metricKey?.startsWith('workout_')) {
    const total = getMetricValue(context.metricKey, log, workouts, date)
    return total > 0 ? total : null
  }

  if (!context.metricKey || !log) return null

  switch (context.metricKey) {
    case 'sleep':
      return log.sleep_hours
    case 'weight':
      return log.weight
    case 'focus':
      return log.focus_minutes > 0 ? log.focus_minutes : log.focus_minutes === 0 ? 0 : null
    case 'steps':
      return log.steps
    case 'screen_time':
      return log.screen_time_minutes
    default:
      if (context.metricKey.startsWith('custom:')) {
        return log.custom_metrics?.[context.metricKey] ?? null
      }
      return null
  }
}

export function getWeeklyHistoryValue(
  context: MetricHistoryContext,
  weekKey: string,
): number | boolean | null {
  const stored = getWeeklyLog(weekKey)

  if (context.valueKind === 'boolean' && context.habit) {
    return stored[habitWeeklyLogKey(context.habit.id)] === 1
  }

  if (!context.metricKey) return null
  const raw = stored[context.metricKey]
  if (raw == null) return null
  return raw
}

export function historyValueToChartNumber(
  value: number | boolean | null,
  context: MetricHistoryContext,
): number {
  if (value == null) return 0
  if (typeof value === 'boolean') return value ? 1 : 0
  if (context.sleepMetric?.id === 'sleep_duration' || context.sleepMetric?.id === 'in_bed') {
    return value / 60
  }
  if (context.metricKey === 'sleep') return value
  return value
}

async function saveWorkoutTotalForDate(
  userId: string,
  date: string,
  category: string,
  minutes: number,
  existingWorkouts: Workout[],
): Promise<void> {
  const forDay = existingWorkouts.filter((w) => w.date === date && w.category === category)

  if (isSupabaseConfigured) {
    const { getOrCreateDailyLog, addWorkout, deleteWorkout } = await import('@/lib/supabase')
    const log = await getOrCreateDailyLog(userId, date)
    for (const workout of forDay) {
      await deleteWorkout(workout.id)
    }
    if (minutes > 0) {
      await addWorkout({
        user_id: userId,
        daily_log_id: log.id,
        date,
        category,
        duration_minutes: minutes,
        notes: '',
      })
    }
    return
  }

  localStore.setUserId(userId)
  const log = localStore.getOrCreateDailyLog(date)
  for (const workout of forDay) {
    localStore.deleteWorkout(workout.id)
  }
  if (minutes > 0) {
    localStore.addWorkout({
      user_id: userId,
      daily_log_id: log.id,
      date,
      category,
      duration_minutes: minutes,
      notes: '',
    })
  }
}

export async function persistMetricHistoryEntry(options: {
  userId: string
  target: MetricHistoryTarget
  context: MetricHistoryContext
  date: string
  weekKey?: string
  value: number | boolean | null
  log: DailyLog | null
  workouts: Workout[]
  sleepConfig: SleepMetricsConfig
  weightUnit: 'kg' | 'lb'
}): Promise<void> {
  const { userId, context, date, weekKey, value, log, workouts, sleepConfig, weightUnit } = options

  if (context.period === 'weekly') {
    if (!weekKey) return

    if (context.valueKind === 'boolean' && context.habit) {
      setWeeklyLogValue(weekKey, habitWeeklyLogKey(context.habit.id), value ? 1 : 0)
      notifyMorningLogChanged()
      return
    }

    if (context.metricKey === 'weight') {
      const kg =
        typeof value === 'number' && !Number.isNaN(value)
          ? displayToKg(value, weightUnit)
          : null
      setWeeklyLogValue(weekKey, 'weight', kg)
      notifyMorningLogChanged()
      return
    }

    if (context.metricKey && context.goal && !isWeightGoal(context.goal)) {
      setWeeklyLogValue(weekKey, context.metricKey, typeof value === 'number' ? value : null)
      notifyMorningLogChanged()
      return
    }

    return
  }

  if (context.valueKind === 'boolean' && context.habit) {
    const updates = {
      habits: normalizeHabits({
        ...(log?.habits ?? {}),
        [context.habit.id]: Boolean(value),
      }),
    }
    if (isSupabaseConfigured) {
      const { updateDailyLogForDate } = await import('@/lib/supabase')
      await updateDailyLogForDate(userId, date, updates)
    } else {
      localStore.setUserId(userId)
      localStore.updateDailyLog(date, updates)
    }
    clearDraft(date)
    notifyMorningLogChanged()
    return
  }

  if (context.workoutType) {
    const minutes = typeof value === 'number' && !Number.isNaN(value) ? Math.max(0, value) : 0
    await saveWorkoutTotalForDate(userId, date, context.workoutType.id, minutes, workouts)
    clearDraft(date)
    notifyMorningLogChanged()
    return
  }

  if (context.sleepMetric) {
    const sleepMetricValues: Record<string, number | null> = {
      [context.sleepMetric.id]:
        typeof value === 'number' && Number.isFinite(value) ? value : null,
    }
    const updates = buildEditLogDaySleepUpdates(log, sleepMetricValues, [context.sleepMetric])
    if (isSupabaseConfigured) {
      const { updateDailyLogForDate } = await import('@/lib/supabase')
      await updateDailyLogForDate(userId, date, updates)
    } else {
      localStore.setUserId(userId)
      localStore.updateDailyLog(date, updates)
    }
    clearDraft(date)
    notifyMorningLogChanged()
    return
  }

  if (!context.metricKey) return

  const updates: Partial<DailyLog> = {}

  if (context.metricKey === 'weight') {
    updates.weight =
      typeof value === 'number' && !Number.isNaN(value)
        ? displayToKg(value, weightUnit)
        : null
  } else if (context.metricKey === 'sleep') {
    updates.sleep_hours = typeof value === 'number' ? value : null
  } else if (context.metricKey === 'focus') {
    updates.focus_minutes = typeof value === 'number' ? value : 0
  } else if (context.metricKey === 'steps') {
    updates.steps = typeof value === 'number' ? value : null
  } else if (context.metricKey === 'screen_time') {
    updates.screen_time_minutes = typeof value === 'number' ? value : null
  } else if (context.metricKey.startsWith('custom:')) {
    updates.custom_metrics = {
      ...(log?.custom_metrics ?? {}),
      [context.metricKey]: typeof value === 'number' ? value : null,
    }
  }

  if (isSupabaseConfigured) {
    const { updateDailyLogForDate } = await import('@/lib/supabase')
    await updateDailyLogForDate(userId, date, updates)
  } else {
    localStore.setUserId(userId)
    localStore.updateDailyLog(date, updates)
  }
  clearDraft(date)
  notifyMorningLogChanged()
}

export function getMetricHistoryWeekKeys(
  dates: string[],
  weekStartsOn: 0 | 1,
): string[] {
  return getWeekKeysInRange(dates, weekStartsOn)
}
