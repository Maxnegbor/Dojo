import {
  getTrackedMorningLogItems,
  groupMorningLogItemsByCategory,
  habitIdFromMorningLogKey,
  isWorkoutMorningLogKey,
  workoutCategoryFromMorningLogKey,
  type MorningLogItem,
} from '@/lib/morningLogConfig'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import {
  getEnabledSleepMetrics,
  type SleepMetricDefinition,
  type SleepMetricsConfig,
} from '@/lib/sleepMetrics'
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

export function getEffectiveShutdownLogSleepFieldIds(sleepConfig: SleepMetricsConfig): string[] {
  const tracked = new Set(
    getTrackedMorningLogItems([], sleepConfig)
      .filter((item) => item.kind === 'sleep' && item.sleepFieldId)
      .map((item) => item.sleepFieldId!),
  )
  return getShutdownLogSleepFieldIds().filter((id) => tracked.has(id))
}

export function saveShutdownLogGoalKeys(keys: MetricKey[]) {
  storageSetItem(GOALS_STORAGE_KEY, JSON.stringify(keys))
  window.dispatchEvent(new Event(SHUTDOWN_LOG_GOALS_CHANGED))
}

export function saveShutdownLogSleepFieldIds(ids: string[]) {
  storageSetItem(SLEEP_STORAGE_KEY, JSON.stringify(ids))
  window.dispatchEvent(new Event(SHUTDOWN_LOG_SLEEP_CHANGED))
}

export function removeSleepFieldFromShutdownLog(fieldId: string) {
  const next = getShutdownLogSleepFieldIds().filter((id) => id !== fieldId)
  if (next.length !== getShutdownLogSleepFieldIds().length) {
    saveShutdownLogSleepFieldIds(next)
  }
}

export function pruneShutdownLogAssignments(goals: Goal[], sleepConfig: SleepMetricsConfig) {
  const effectiveSleep = getEffectiveShutdownLogSleepFieldIds(sleepConfig)
  const storedSleep = getShutdownLogSleepFieldIds()
  if (
    effectiveSleep.length !== storedSleep.length ||
    effectiveSleep.some((id, index) => id !== storedSleep[index])
  ) {
    saveShutdownLogSleepFieldIds(effectiveSleep)
  }

  const validKeys = new Set(
    getTrackedMorningLogItems(goals, sleepConfig)
      .map((item) => item.metricKey)
      .filter((key): key is MetricKey => key != null),
  )
  const storedGoals = getShutdownLogGoalKeys()
  const nextGoals = storedGoals.filter((key) => validKeys.has(key))
  if (
    nextGoals.length !== storedGoals.length ||
    nextGoals.some((key, index) => key !== storedGoals[index])
  ) {
    saveShutdownLogGoalKeys(nextGoals)
  }
}

export function getConfiguredShutdownLogItems(
  goals: Goal[],
  sleepConfig: SleepMetricsConfig,
): MorningLogItem[] {
  const tracked = getTrackedMorningLogItems(goals, sleepConfig)
  const trackedById = new Map(tracked.map((item) => [item.id, item]))
  const configured: MorningLogItem[] = []
  const seen = new Set<string>()

  for (const sleepFieldId of getEffectiveShutdownLogSleepFieldIds(sleepConfig)) {
    const item = trackedById.get(`sleep:${sleepFieldId}`)
    if (item && !seen.has(item.id)) {
      configured.push(item)
      seen.add(item.id)
    }
  }

  for (const key of getShutdownLogGoalKeys()) {
    const item = trackedById.get(key)
    if (item && !seen.has(item.id)) {
      configured.push(item)
      seen.add(item.id)
    }
  }

  const weeklyWeight = isWeightLoggedWeekly(getActiveWeightGoal(goals))
  return configured.filter((item) => {
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
  const weeklyWeight = isWeightLoggedWeekly(getActiveWeightGoal(goals))
  return getTrackedMorningLogItems(goals, sleepConfig, options).filter((item) => {
    if (configuredIds.has(item.id)) return false
    if (weeklyWeight && (item.kind === 'weight' || item.metricKey === 'weight')) return false
    return true
  })
}

export function hasShutdownLogFieldsConfigured(): boolean {
  return getShutdownLogSleepFieldIds().length > 0 || getShutdownLogGoalKeys().length > 0
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

/** Sleep fields to offer at shutdown when they still have no value today. */
export function getShutdownLogSleepMetrics(sleepConfig: SleepMetricsConfig): SleepMetricDefinition[] {
  return getEnabledSleepMetrics(sleepConfig)
}

/** Daily metrics for shutdown wrap-up (Home Log set; UI hides already-logged values). */
export function getWrapUpLogItems(
  goals: Goal[],
  sleepConfig: SleepMetricsConfig,
): MorningLogItem[] {
  return getTrackedMorningLogItems(goals, sleepConfig).filter((item) => item.kind !== 'sleep')
}

export function buildWrapUpMetricsFilter(
  goals: Goal[],
  sleepConfig: SleepMetricsConfig,
): ShutdownLogFilter {
  return buildShutdownLogFilter(getWrapUpLogItems(goals, sleepConfig))
}

export function hasWrapUpLogFields(goals: Goal[], sleepConfig: SleepMetricsConfig): boolean {
  return getWrapUpLogItems(goals, sleepConfig).length > 0
}

export { groupMorningLogItemsByCategory }
