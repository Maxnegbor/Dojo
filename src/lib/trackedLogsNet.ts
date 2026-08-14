/**
 * Single coherent view of which metrics are collected where.
 * Morning / home / shutdown / weekly should not double-ask the same field.
 */
import {
  getConfiguredMorningLogItems,
  getEffectiveMorningLogSleepFieldIds,
} from '@/lib/morningLogConfig'
import {
  getConfiguredShutdownLogItems,
  getEffectiveShutdownLogSleepFieldIds,
} from '@/lib/shutdownLogConfig'
import {
  getDailyLogGoals,
  getWeeklyLogGoals,
} from '@/lib/goals'
import {
  getDailyLogHabitTypes,
  getWeeklyLogHabitTypes,
} from '@/lib/habitTypes'
import {
  getEnabledSleepMetrics,
  getSleepMetricsConfig,
  type SleepMetricDefinition,
  type SleepMetricsConfig,
} from '@/lib/sleepMetrics'
import type { ShutdownLogFilter } from '@/lib/shutdownLogConfig'
import { getDailyLogWorkoutTypes } from '@/lib/workoutTypes'
import { getActiveWeightGoal, isWeightGoal, isWeightLoggedWeekly } from '@/lib/weightGoal'
import type { Goal, MetricKey } from '@/types'

function sleepConfigOrDefault(config?: SleepMetricsConfig): SleepMetricsConfig {
  return config ?? getSleepMetricsConfig()
}

/** Weight is collected in the morning log (daily_log.weight), not weekly shutdown. */
export function isWeightCollectedInMorning(
  goals: Goal[],
  sleepConfig?: SleepMetricsConfig,
): boolean {
  const weightGoal = getActiveWeightGoal(goals)
  if (isWeightLoggedWeekly(weightGoal)) return false
  return getConfiguredMorningLogItems(goals, sleepConfigOrDefault(sleepConfig)).some(
    (item) => item.kind === 'weight' || item.metricKey === 'weight',
  )
}

/**
 * Weekly shutdown prompts — same as getWeeklyLogGoals, but skips weight when
 * it is logged daily (morning / home / shutdown) instead.
 */
export function getWeeklyShutdownLogGoals(
  goals: Goal[],
  sleepConfig?: SleepMetricsConfig,
): Goal[] {
  const weekly = getWeeklyLogGoals(goals)
  if (!isWeightCollectedInMorning(goals, sleepConfig)) return weekly
  return weekly.filter((goal) => !isWeightGoal(goal) && goal.metric_key !== 'weight')
}

/** Sleep fields assigned to morning or shutdown (not the full metrics catalog). */
export function getTrackedDailySleepMetrics(
  sleepConfig?: SleepMetricsConfig,
): SleepMetricDefinition[] {
  const config = sleepConfigOrDefault(sleepConfig)
  const ids = new Set([
    ...getEffectiveMorningLogSleepFieldIds(config),
    ...getEffectiveShutdownLogSleepFieldIds(config),
  ])
  if (ids.size === 0) return []

  const byId = new Map(getEnabledSleepMetrics(config).map((metric) => [metric.id, metric]))
  return [...ids]
    .map((id) => byId.get(id))
    .filter((metric): metric is SleepMetricDefinition => metric != null)
}

/**
 * Daily goals that are actually prompted somewhere (home / morning / shutdown keys).
 * Includes morning-tracked weight. Hides the sleep hours goal when sleep_duration is tracked.
 */
export function getTrackedDailyEditGoals(
  goals: Goal[],
  sleepConfig?: SleepMetricsConfig,
): Goal[] {
  const config = sleepConfigOrDefault(sleepConfig)

  const keys = new Set<MetricKey>()
  for (const goal of getDailyLogGoals(goals)) {
    keys.add(goal.metric_key)
  }
  for (const item of getConfiguredMorningLogItems(goals, config)) {
    if (item.metricKey) keys.add(item.metricKey)
  }

  const tracksSleepDuration = getTrackedDailySleepMetrics(config).some(
    (metric) => metric.id === 'sleep_duration',
  )

  const byKey = new Map(
    getDailyLogGoals(goals)
      .filter((goal) => keys.has(goal.metric_key))
      .map((goal) => [goal.metric_key, goal]),
  )

  // Daily weight may be collected on morning/home/shutdown even when not in getDailyLogGoals filters.
  if (isWeightCollectedInMorning(goals, config)) {
    const weightGoal =
      getActiveWeightGoal(goals) ??
      goals.find((goal) => goal.is_active && goal.metric_key === 'weight')
    if (weightGoal) byKey.set('weight', weightGoal)
  }

  return [...byKey.values()].filter((goal) => {
    if (goal.metric_key === 'focus') return false
    if (goal.metric_key === 'steps' || goal.metric_key === 'screen_time') return false
    if (goal.metric_key.startsWith('workout_')) return false
    if (tracksSleepDuration && goal.metric_key === 'sleep') return false
    return true
  })
}

/** Habits collected on any daily surface (morning / home / shutdown). */
export function getTrackedDailyEditHabits() {
  return getDailyLogHabitTypes()
}

/** Weekly edit/shutdown fields — excludes morning-collected weight. */
export function getTrackedWeeklyEditGoals(
  goals: Goal[],
  sleepConfig?: SleepMetricsConfig,
): Goal[] {
  return getWeeklyShutdownLogGoals(goals, sleepConfig)
}

export function getTrackedWeeklyEditHabits() {
  return getWeeklyLogHabitTypes()
}

/** Ids claimed by the morning log surface (for exclusive assignment). */
export function getMorningClaimedItemIds(
  goals: Goal[],
  sleepConfig?: SleepMetricsConfig,
): Set<string> {
  return new Set(
    getConfiguredMorningLogItems(goals, sleepConfigOrDefault(sleepConfig)).map((item) => item.id),
  )
}

/** Ids claimed by the shutdown log surface. */
export function getShutdownClaimedItemIds(
  goals: Goal[],
  sleepConfig?: SleepMetricsConfig,
): Set<string> {
  return new Set(
    getConfiguredShutdownLogItems(goals, sleepConfigOrDefault(sleepConfig)).map((item) => item.id),
  )
}

/** Sleep metrics added to the library (daily). */
export function getHomeLogSleepMetrics(sleepConfig?: SleepMetricsConfig): SleepMetricDefinition[] {
  return getEnabledSleepMetrics(sleepConfigOrDefault(sleepConfig))
}

/** All daily library items for the Home Log modal. */
export function getHomeLogDailyFilter(
  goals: Goal[],
  sleepConfig?: SleepMetricsConfig,
): ShutdownLogFilter {
  return {
    habitIds: new Set(getDailyLogHabitTypes().map((habit) => habit.id)),
    goalKeys: new Set(getTrackedDailyEditGoals(goals, sleepConfig).map((goal) => goal.metric_key)),
    workoutCategories: new Set(getDailyLogWorkoutTypes().map((type) => type.id)),
  }
}

export function hasHomeLogDailyItems(
  goals: Goal[],
  sleepConfig?: SleepMetricsConfig,
): boolean {
  const filter = getHomeLogDailyFilter(goals, sleepConfig)
  return (
    filter.habitIds.size > 0 ||
    filter.goalKeys.size > 0 ||
    filter.workoutCategories.size > 0 ||
    getHomeLogSleepMetrics(sleepConfig).length > 0
  )
}

export function hasWeeklyLogItems(goals: Goal[], sleepConfig?: SleepMetricsConfig): boolean {
  return (
    getTrackedWeeklyEditHabits().length > 0 ||
    getTrackedWeeklyEditGoals(goals, sleepConfig).length > 0
  )
}
