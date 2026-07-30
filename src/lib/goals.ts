import type { Goal, GoalPeriod, MetricKey } from '@/types'
import { getWorkoutTypes, workoutMetricKey } from '@/lib/workoutTypes'

export type GoalLogWhen = 'home' | 'morning' | 'shutdown'
export type GoalMorningDay = 'today' | 'yesterday'

function normalizeGoalLogWhen(value: unknown): GoalLogWhen {
  if (value === 'morning' || value === 'shutdown' || value === 'home') return value
  return 'home'
}

function normalizeGoalMorningDay(value: unknown): GoalMorningDay {
  return value === 'yesterday' ? 'yesterday' : 'today'
}

/** Surface where a daily metric is collected. Weekly metrics ignore this. */
export function goalLogWhen(goal: Goal): GoalLogWhen {
  if (effectiveLogPeriod(goal) === 'weekly') return 'home'
  return normalizeGoalLogWhen(goal.log_when)
}

export function goalMorningDay(goal: Goal): GoalMorningDay {
  return normalizeGoalMorningDay(goal.morning_day)
}

/** Metrics whose weekly totals come from daily entries — never prompt for a weekly total. */
export function isAggregatedFromDailyLogs(goal: Goal): boolean {
  const metricKey = goal.metric_key
  if (metricKey.startsWith('workout_')) {
    // Weekly-logged workouts are entered at weekly shutdown, not summed from sessions.
    return effectiveLogPeriod(goal) !== 'weekly'
  }
  return metricKey === 'focus' || metricKey === 'sleep'
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
    ? (goal.target_period ??
        (goal.metric_key.startsWith('workout_')
          ? 'weekly'
          : goal.log_period ?? goal.target_type ?? 'daily'))
    : 'daily'
  const log_period: GoalPeriod = hasGoalTarget
    ? (goal.log_period ?? goal.target_type ?? (goal.metric_key === 'weight' ? 'weekly' : 'daily'))
    : 'daily'

  const log_when =
    log_period === 'daily' &&
    goal.metric_key !== 'focus' &&
    !goal.metric_key.startsWith('workout_')
    ? normalizeGoalLogWhen(goal.log_when)
    : undefined
  const morning_day = log_when === 'morning' ? normalizeGoalMorningDay(goal.morning_day) : undefined

  const result: Goal = {
    ...normalized,
    unit: normalized.metric_key === 'screen_time' && normalized.unit === 'min' ? 'hrs:min' : normalized.unit,
    log_period,
    target_period: hasGoalTarget ? target_period : 'daily',
    target_type: log_period,
    show_in_daily_log: log_period === 'daily',
  }

  if (log_when) {
    result.log_when = log_when
    if (morning_day) result.morning_day = morning_day
    else delete result.morning_day
  } else {
    delete result.log_when
    delete result.morning_day
  }

  return result
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

/** Newest active goal for a metric key — collapses duplicate rows left by older saves. */
export function getActiveGoalByMetricKey(
  goals: Goal[],
  metricKey: string,
): Goal | undefined {
  const active = getActiveGoals(goals).filter((goal) => goal.metric_key === metricKey)
  if (active.length === 0) return undefined
  return active.reduce((best, goal) =>
    (goal.created_at ?? '') >= (best.created_at ?? '') ? goal : best,
  )
}

/** One active goal per metric_key (newest wins). */
export function dedupeActiveGoalsByMetricKey(goals: Goal[]): Goal[] {
  const byKey = new Map<string, Goal>()
  for (const goal of getActiveGoals(goals)) {
    const existing = byKey.get(goal.metric_key)
    if (!existing || (goal.created_at ?? '') >= (existing.created_at ?? '')) {
      byKey.set(goal.metric_key, goal)
    }
  }
  return [...byKey.values()]
}

/**
 * Extra active goals that share a metric_key with a newer active goal.
 * Also includes orphan workout_* goals whose type no longer exists.
 */
export function getStaleDuplicateGoals(goals: Goal[]): Goal[] {
  const knownWorkoutKeys = new Set(
    getWorkoutTypes().map((type) => workoutMetricKey(type.id)),
  )
  const keepIds = new Set(dedupeActiveGoalsByMetricKey(goals).map((goal) => goal.id))
  return getActiveGoals(goals).filter((goal) => {
    if (!keepIds.has(goal.id)) return true
    if (goal.metric_key.startsWith('workout_') && !knownWorkoutKeys.has(goal.metric_key)) {
      return true
    }
    return false
  })
}

export function getDailyLogGoals(goals: Goal[]): Goal[] {
  return getActiveGoals(goals).filter((g) => effectiveLogPeriod(g) === 'daily')
}

/** Daily metrics collected on the Home habits/metrics card (not morning/shutdown). */
export function getHomeLogGoals(goals: Goal[]): Goal[] {
  return getDailyLogGoals(goals).filter((g) => goalLogWhen(g) === 'home')
}

export function getMorningAskGoals(goals: Goal[]): Goal[] {
  return getDailyLogGoals(goals).filter((g) => goalLogWhen(g) === 'morning')
}

export function getShutdownAskGoals(goals: Goal[]): Goal[] {
  return getDailyLogGoals(goals).filter((g) => goalLogWhen(g) === 'shutdown')
}

export function getWeeklyLogGoals(goals: Goal[]): Goal[] {
  return getActiveGoals(goals).filter(
    (g) =>
      hasTarget(g) &&
      effectiveLogPeriod(g) === 'weekly' &&
      !isAggregatedFromDailyLogs(g),
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
