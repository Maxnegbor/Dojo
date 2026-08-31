import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-schedule-block-alarms'
export const SCHEDULE_BLOCK_ALARMS_CHANGED = 'personal-os-schedule-block-alarms-changed'

function readAlarms(): Record<string, boolean> {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'boolean' && value) out[key] = true
    }
    return out
  } catch {
    return {}
  }
}

export function isScheduleBlockAlarmEnabled(blockId: string): boolean {
  return readAlarms()[blockId] === true
}

export function setScheduleBlockAlarm(blockId: string, enabled: boolean): void {
  const next = readAlarms()
  if (enabled) next[blockId] = true
  else delete next[blockId]
  storageSetItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(SCHEDULE_BLOCK_ALARMS_CHANGED))
}

export function toggleScheduleBlockAlarm(blockId: string): boolean {
  const enabled = !isScheduleBlockAlarmEnabled(blockId)
  setScheduleBlockAlarm(blockId, enabled)
  return enabled
}

export function removeScheduleBlockAlarm(blockId: string): void {
  if (!isScheduleBlockAlarmEnabled(blockId)) return
  setScheduleBlockAlarm(blockId, false)
}
