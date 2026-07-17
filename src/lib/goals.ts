import type { Goal, GoalPeriod, MetricKey } from '@/types'
import { getWorkoutTypes, workoutMetricKey } from '@/lib/workoutTypes'

/** Weekly totals derived from daily logs — never prompt for manual entry at shutdown. */
export function isAggregatedFromDailyLogs(metricKey: MetricKey): boolean {
  if (metricKey.startsWith('workout_')) return true
  return ['focus', 'sleep'].includes(metricKey)
}

export const BUILTIN_METRICS: {
  key: MetricKey
  label: string
  unit: string
  defaultLogPeriod: GoalPeriod
}[] = [
  { key: 'sleep', label: 'Sleep', unit: 'hrs', defaultLogPeriod: 'daily' },
  { key: 'weight', label: 'Weight', unit: 'kg', defaultLogPeriod: 'weekly' },
  { key: 'focus', label: 'Focus', unit: 'min', defaultLogPeriod: 'daily' },
]

export function goalLogPeriod(goal: Goal): GoalPeriod {
  return goal.log_period ?? goal.target_type ?? 'daily'
}

/** Track-only metrics always log daily; weekly/daily applies to targeted goals. */
export function effectiveLogPeriod(goal: Goal): GoalPeriod {
  if (!hasTarget(goal)) return 'daily'
  return goalLogPeriod(goal)
}

export function normalizeGoal(goal: Goal): Goal {
  const normalized = {
    ...goal,
    target_value: goal.target_value ?? null,
  }
  const hasGoalTarget = hasTarget(normalized)
  const target_period = hasGoalTarget
    ? (goal.target_period ?? goal.log_period ?? goal.target_type ?? 'daily')
    : 'daily'
  const log_period: GoalPeriod = hasGoalTarget
    ? goal.metric_key === 'weight'
      ? 'weekly'
      : (goal.log_period ?? goal.target_type ?? 'daily')
    : 'daily'
  return {
    ...normalized,
    unit: normalized.metric_key === 'screen_time' && normalized.unit === 'min' ? 'hrs:min' : normalized.unit,
    log_period,
    target_period: hasGoalTarget ? target_period : 'daily',
    target_type: log_period,
    show_in_daily_log: log_period === 'daily',
  }
}

export function normalizeGoals(goals: Goal[]): Goal[] {
  return goals.map(normalizeGoal)
}

export function hasTarget(goal: Goal): boolean {
  if (goal.metric_key === 'weight' && goal.goal_weight_start != null && goal.goal_weight_target != null) {
    return true
  }
  return goal.target_value != null && goal.target_value > 0
}

export function getActiveGoals(goals: Goal[]): Goal[] {
  return normalizeGoals(goals).filter((g) => g.is_active)
}

export function getDailyLogGoals(goals: Goal[]): Goal[] {
  return getActiveGoals(goals).filter((g) => effectiveLogPeriod(g) === 'daily')
}

export function getWeeklyLogGoals(goals: Goal[]): Goal[] {
  return getActiveGoals(goals).filter(
    (g) =>
      hasTarget(g) &&
      effectiveLogPeriod(g) === 'weekly' &&
      !isAggregatedFromDailyLogs(g.metric_key),
  )
}

export function getGoalsWithTarget(goals: Goal[]): Goal[] {
  return getActiveGoals(goals).filter(hasTarget)
}

export function getGoalsWithoutTarget(goals: Goal[]): Goal[] {
  return getActiveGoals(goals).filter((g) => !hasTarget(g))
}

export function metricLabel(metricKey: MetricKey): string {
  const builtin = BUILTIN_METRICS.find((m) => m.key === metricKey)
  if (builtin) return builtin.label
  if (metricKey.startsWith('workout_')) {
    const id = metricKey.replace('workout_', '')
    return getWorkoutTypes().find((t) => t.id === id)?.label ?? id
  }
  if (metricKey.startsWith('custom:')) {
    return metricKey.replace('custom:', '').replace(/_/g, ' ')
  }
  return metricKey
}

export function defaultUnitForMetric(metricKey: MetricKey): string {
  const builtin = BUILTIN_METRICS.find((m) => m.key === metricKey)
  if (builtin) return builtin.unit
  if (metricKey.startsWith('workout_')) return 'min'
  return 'units'
}

export function workoutMetricOptions() {
  return getWorkoutTypes().map((t) => ({
    key: workoutMetricKey(t.id),
    label: t.label,
    unit: 'min',
    defaultLogPeriod: 'daily' as GoalPeriod,
  }))
}

export function allMetricOptions() {
  return [...BUILTIN_METRICS, ...workoutMetricOptions()]
}
