import {
  getTrackedMorningLogItems,
  groupMorningLogItemsByCategory,
  habitIdFromMorningLogKey,
  isWorkoutMorningLogKey,
  workoutCategoryFromMorningLogKey,
  type MorningLogItem,
} from '@/lib/morningLogConfig'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import type { SleepMetricsConfig } from '@/lib/sleepMetrics'
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

  for (const sleepFieldId of getShutdownLogSleepFieldIds()) {
    const item = trackedById.get(`sleep:${sleepFieldId}`)
    if (item) configured.push(item)
  }

  for (const key of getShutdownLogGoalKeys()) {
    const item = trackedById.get(key)
    if (item) configured.push(item)
  }

  return configured
}

export function getAddableShutdownLogItems(
  goals: Goal[],
  sleepConfig: SleepMetricsConfig,
  options?: { showWorkouts?: boolean },
): MorningLogItem[] {
  const configuredIds = new Set(
    getConfiguredShutdownLogItems(goals, sleepConfig).map((item) => item.id),
  )
  return getTrackedMorningLogItems(goals, sleepConfig, options).filter(
    (item) => !configuredIds.has(item.id),
  )
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

export { groupMorningLogItemsByCategory }
