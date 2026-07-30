import {
  getConfiguredMorningLogItems,
  getTrackedMorningLogItems,
  groupMorningLogItemsByCategory,
  habitIdFromMorningLogKey,
  habitMorningLogKey,
  isHabitMorningLogKey,
  isWorkoutMorningLogKey,
  workoutCategoryFromMorningLogKey,
  type MorningLogItem,
} from '@/lib/morningLogConfig'
import { getShutdownLogHabitTypes, getHomeLogHabitTypes } from '@/lib/habitTypes'
import { getHomeLogGoals, getShutdownAskGoals } from '@/lib/goals'
import { getHomeLogWorkoutTypes, getShutdownLogWorkoutTypes, workoutMetricKey } from '@/lib/workoutTypes'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import type { SleepMetricsConfig } from '@/lib/sleepMetrics'
import { getActiveWeightGoal, isWeightLoggedWeekly } from '@/lib/weightGoal'
import type { Goal, MetricKey } from '@/types'

const GOALS_STORAGE_KEY = 'personal-os-shutdown-log-goals'
const SLEEP_STORAGE_KEY = 'personal-os-shutdown-log-sleep'

export const SHUTDOWN_LOG_GOALS_CHANGED = 'personal-os-shutdown-log-goals-changed'
export const SHUTDOWN_LOG_SLEEP_CHANGED = 'personal-os-shutdown-log-sleep-changed'

export interface ShutdownLogFilter {
  habitIds: Set<string>
  goalKeys: Set<MetricKey>
  workoutCategories: Set<string>
}

function readMetricKeyList(storageKey: string): MetricKey[] {
  try {
    const raw = storageGetItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((key): key is MetricKey => typeof key === 'string' && key.length > 0)
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

function readStringList(storageKey: string): string[] {
  try {
    const raw = storageGetItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

export function getShutdownLogGoalKeys(): MetricKey[] {
  return readMetricKeyList(GOALS_STORAGE_KEY)
}

export function getShutdownLogSleepFieldIds(): string[] {
  return readStringList(SLEEP_STORAGE_KEY)
}

export function saveShutdownLogGoalKeys(keys: MetricKey[]) {
  storageSetItem(GOALS_STORAGE_KEY, JSON.stringify(keys))
  window.dispatchEvent(new Event(SHUTDOWN_LOG_GOALS_CHANGED))
}

export function saveShutdownLogSleepFieldIds(ids: string[]) {
  storageSetItem(SLEEP_STORAGE_KEY, JSON.stringify(ids))
  window.dispatchEvent(new Event(SHUTDOWN_LOG_SLEEP_CHANGED))
}

export function getConfiguredShutdownLogItems(
  goals: Goal[],
  sleepConfig: SleepMetricsConfig,
): MorningLogItem[] {
  const tracked = getTrackedMorningLogItems(goals, sleepConfig)
  const trackedById = new Map(tracked.map((item) => [item.id, item]))
  const configured: MorningLogItem[] = []
  const seen = new Set<string>()

  for (const sleepFieldId of getShutdownLogSleepFieldIds()) {
    const item = trackedById.get(`sleep:${sleepFieldId}`)
    if (item && !seen.has(item.id)) {
      configured.push(item)
      seen.add(item.id)
    }
  }

  for (const habit of getShutdownLogHabitTypes()) {
    const id = habitMorningLogKey(habit.id)
    // Shutdown habits are not in morning tracked list — build a lightweight item.
    if (!seen.has(id)) {
      configured.push({
        id,
        kind: 'habit',
        label: habit.label,
        unit: '',
        badge: 'Habit',
        metricKey: id,
        supportsYesterday: false,
      })
      seen.add(id)
    }
  }

  // Metrics with log_when=shutdown always appear.
  for (const goal of getShutdownAskGoals(goals)) {
    const item = trackedById.get(goal.metric_key)
    if (item && !seen.has(item.id)) {
      configured.push(item)
      seen.add(item.id)
    }
  }

  for (const workout of getShutdownLogWorkoutTypes()) {
    const key = workoutMetricKey(workout.id)
    const item = trackedById.get(key)
    if (item && !seen.has(item.id)) {
      configured.push(item)
      seen.add(item.id)
    } else if (!seen.has(key)) {
      configured.push({
        id: key,
        kind: 'workout',
        label: workout.label,
        unit: workout.unit || 'min',
        badge: 'Workout',
        metricKey: key,
        supportsYesterday: false,
      })
      seen.add(key)
    }
  }

  for (const key of getShutdownLogGoalKeys()) {
    if (isHabitMorningLogKey(key)) continue
    const item = trackedById.get(key)
    if (item && !seen.has(item.id)) {
      configured.push(item)
      seen.add(item.id)
    }
  }

  // Exclusive with morning: never re-ask morning fields.
  // Weekly weight is shutdown-week only — not daily shutdown.
  const morningIds = new Set(getConfiguredMorningLogItems(goals, sleepConfig).map((item) => item.id))
  const weeklyWeight = isWeightLoggedWeekly(getActiveWeightGoal(goals))
  return configured.filter((item) => {
    if (morningIds.has(item.id)) return false
    if (weeklyWeight && (item.kind === 'weight' || item.metricKey === 'weight')) return false
    return true
  })
}

export function getAddableShutdownLogItems(
  goals: Goal[],
  sleepConfig: SleepMetricsConfig,
  options?: { showWorkouts?: boolean },
): MorningLogItem[] {
  const configuredIds = new Set(
    getConfiguredShutdownLogItems(goals, sleepConfig).map((item) => item.id),
  )
  const morningIds = new Set(getConfiguredMorningLogItems(goals, sleepConfig).map((item) => item.id))
  const weeklyWeight = isWeightLoggedWeekly(getActiveWeightGoal(goals))
  return getTrackedMorningLogItems(goals, sleepConfig, options).filter((item) => {
    if (configuredIds.has(item.id) || morningIds.has(item.id)) return false
    if (weeklyWeight && (item.kind === 'weight' || item.metricKey === 'weight')) return false
    return true
  })
}

export function hasShutdownLogFieldsConfigured(goals: Goal[] = []): boolean {
  return (
    getShutdownLogSleepFieldIds().length > 0 ||
    getShutdownLogGoalKeys().length > 0 ||
    getShutdownLogHabitTypes().length > 0 ||
    getShutdownAskGoals(goals).length > 0 ||
    getShutdownLogWorkoutTypes().length > 0
  )
}

export function buildShutdownLogFilter(items: MorningLogItem[]): ShutdownLogFilter {
  const habitIds = new Set<string>()
  const goalKeys = new Set<MetricKey>()
  const workoutCategories = new Set<string>()

  for (const item of items) {
    if (item.kind === 'habit' && item.metricKey) {
      habitIds.add(habitIdFromMorningLogKey(item.metricKey))
    } else if (item.kind === 'workout' && item.metricKey && isWorkoutMorningLogKey(item.metricKey)) {
      workoutCategories.add(workoutCategoryFromMorningLogKey(item.metricKey))
    } else if (item.metricKey) {
      goalKeys.add(item.metricKey)
    }
  }

  return { habitIds, goalKeys, workoutCategories }
}

/** All daily metrics that can be logged (morning, home, shutdown surfaces). */
export function getWrapUpLogItems(
  goals: Goal[],
  sleepConfig: SleepMetricsConfig,
): MorningLogItem[] {
  const byId = new Map<string, MorningLogItem>()
  const add = (item: MorningLogItem) => {
    if (!byId.has(item.id)) byId.set(item.id, item)
  }

  for (const item of getConfiguredMorningLogItems(goals, sleepConfig)) add(item)
  for (const item of getConfiguredShutdownLogItems(goals, sleepConfig)) add(item)

  for (const habit of getHomeLogHabitTypes()) {
    const key = habitMorningLogKey(habit.id)
    add({
      id: key,
      kind: 'habit',
      label: habit.label,
      unit: '',
      badge: 'Habit',
      metricKey: key,
      supportsYesterday: false,
    })
  }

  for (const goal of getHomeLogGoals(goals)) {
    if (goal.metric_key === 'focus' || goal.metric_key.startsWith('workout_')) continue
    add({
      id: goal.metric_key,
      kind: goal.metric_key === 'weight' ? 'weight' : 'goal',
      label: goal.name,
      unit: goal.unit,
      badge: 'Goal',
      metricKey: goal.metric_key,
      goal,
      supportsYesterday: false,
    })
  }

  for (const workout of getHomeLogWorkoutTypes()) {
    const key = workoutMetricKey(workout.id)
    add({
      id: key,
      kind: 'workout',
      label: workout.label,
      unit: workout.unit || 'min',
      badge: 'Workout',
      metricKey: key,
      supportsYesterday: false,
    })
  }

  return [...byId.values()].filter((item) => item.kind !== 'sleep')
}

export function buildWrapUpMetricsFilter(
  goals: Goal[],
  sleepConfig: SleepMetricsConfig,
): ShutdownLogFilter | undefined {
  const items = getWrapUpLogItems(goals, sleepConfig)
  if (items.length === 0) return undefined
  return buildShutdownLogFilter(items)
}

export function hasWrapUpLogFields(goals: Goal[], sleepConfig: SleepMetricsConfig): boolean {
  return getWrapUpLogItems(goals, sleepConfig).length > 0
}

export { groupMorningLogItemsByCategory }
