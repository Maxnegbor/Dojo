import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-schedule-block-alarms'
export const SCHEDULE_BLOCK_ALARMS_CHANGED = 'personal-os-schedule-block-alarms-changed'

export type ScheduleBlockAlarmLead = 0 | 15 | 30 | 60

export interface ScheduleBlockAlarmConfig {
  enabled: boolean
  leadMinutes: ScheduleBlockAlarmLead
}

function normalizeLead(raw: unknown): ScheduleBlockAlarmLead {
  if (raw === 15 || raw === 30 || raw === 60) return raw
  return 0
}

function readAlarms(): Record<string, ScheduleBlockAlarmConfig> {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}

    const out: Record<string, ScheduleBlockAlarmConfig> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (value === true) {
        out[key] = { enabled: true, leadMinutes: 0 }
        continue
      }
      if (!value || typeof value !== 'object') continue
      const obj = value as Record<string, unknown>
      out[key] = {
        enabled: obj.enabled !== false,
        leadMinutes: normalizeLead(obj.leadMinutes),
      }
    }
    return out
  } catch {
    return {}
  }
}

function writeAlarms(alarms: Record<string, ScheduleBlockAlarmConfig>): void {
  storageSetItem(STORAGE_KEY, JSON.stringify(alarms))
  window.dispatchEvent(new Event(SCHEDULE_BLOCK_ALARMS_CHANGED))
}

export function getScheduleBlockAlarm(blockId: string): ScheduleBlockAlarmConfig | null {
  const config = readAlarms()[blockId]
  return config?.enabled ? config : null
}

export function isScheduleBlockAlarmEnabled(blockId: string): boolean {
  return getScheduleBlockAlarm(blockId) != null
}

export function getScheduleBlockAlarmLead(blockId: string): ScheduleBlockAlarmLead {
  return readAlarms()[blockId]?.leadMinutes ?? 0
}

export function setScheduleBlockAlarm(blockId: string, config: ScheduleBlockAlarmConfig | null): void {
  const next = readAlarms()
  if (!config) {
    delete next[blockId]
  } else {
    next[blockId] = {
      enabled: config.enabled,
      leadMinutes: normalizeLead(config.leadMinutes),
    }
  }
  writeAlarms(next)
}

export function setScheduleBlockAlarmLead(blockId: string, leadMinutes: ScheduleBlockAlarmLead): void {
  setScheduleBlockAlarm(blockId, { enabled: true, leadMinutes })
}

export function toggleScheduleBlockAlarm(blockId: string): boolean {
  const next = readAlarms()
  const existing = next[blockId]
  if (existing?.enabled) {
    next[blockId] = { enabled: false, leadMinutes: existing.leadMinutes }
    writeAlarms(next)
    return false
  }
  next[blockId] = {
    enabled: true,
    leadMinutes: existing?.leadMinutes ?? 0,
  }
  writeAlarms(next)
  return true
}

export function removeScheduleBlockAlarm(blockId: string): void {
  if (!isScheduleBlockAlarmEnabled(blockId)) return
  setScheduleBlockAlarm(blockId, null)
}

export function formatScheduleBlockAlarmLead(leadMinutes: ScheduleBlockAlarmLead): string {
  if (leadMinutes === 0) return 'At block start'
  if (leadMinutes === 60) return '1 hour before'
  return `${leadMinutes} min before`
}

/** Minutes-from-midnight when this block's alarm should fire. */
export function scheduleBlockAlarmAtMinutes(
  startTime: string,
  leadMinutes: ScheduleBlockAlarmLead,
): number {
  const [h = 0, m = 0] = startTime.split(':').map(Number)
  return h * 60 + m - leadMinutes
}
