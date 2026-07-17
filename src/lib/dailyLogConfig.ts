export type DailyLogBuiltinMetric = 'sleep' | 'weight'

export const BUILTIN_DAILY_LOG_METRICS: {
  id: DailyLogBuiltinMetric
  label: string
}[] = [
  { id: 'sleep', label: 'Sleep' },
  { id: 'weight', label: 'Weight' },
]

import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-daily-log-hidden-metrics'

function readHidden(): DailyLogBuiltinMetric[] {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as string[]
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is DailyLogBuiltinMetric =>
          BUILTIN_DAILY_LOG_METRICS.some((m) => m.id === id),
        )
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

export function getHiddenDailyLogMetrics(): DailyLogBuiltinMetric[] {
  return readHidden()
}

export function isDailyLogMetricVisible(metric: DailyLogBuiltinMetric): boolean {
  return !readHidden().includes(metric)
}

export function hideDailyLogMetric(metric: DailyLogBuiltinMetric) {
  const hidden = readHidden()
  if (!hidden.includes(metric)) {
    storageSetItem(STORAGE_KEY, JSON.stringify([...hidden, metric]))
  }
}

export function showDailyLogMetric(metric: DailyLogBuiltinMetric) {
  storageSetItem(
    STORAGE_KEY,
    JSON.stringify(readHidden().filter((id) => id !== metric)),
  )
}

export function setDailyLogMetricVisible(metric: DailyLogBuiltinMetric, visible: boolean) {
  if (visible) showDailyLogMetric(metric)
  else hideDailyLogMetric(metric)
}
