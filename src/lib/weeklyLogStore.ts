import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const PREFIX = 'personal-os-weekly-log-'

export function getWeeklyLog(weekKey: string): Record<string, number> {
  try {
    const raw = storageGetItem(`${PREFIX}${weekKey}`)
    if (raw) return JSON.parse(raw) as Record<string, number>
  } catch {
    /* ignore */
  }
  return {}
}

export function setWeeklyLogValue(weekKey: string, metricKey: string, value: number | null) {
  const current = getWeeklyLog(weekKey)
  if (value == null || Number.isNaN(value)) {
    delete current[metricKey]
  } else {
    current[metricKey] = value
  }
  storageSetItem(`${PREFIX}${weekKey}`, JSON.stringify(current))
}

export function setWeeklyLog(weekKey: string, values: Record<string, number | null>) {
  const current = getWeeklyLog(weekKey)
  for (const [key, value] of Object.entries(values)) {
    if (value == null || Number.isNaN(value)) delete current[key]
    else current[key] = value
  }
  storageSetItem(`${PREFIX}${weekKey}`, JSON.stringify(current))
}
