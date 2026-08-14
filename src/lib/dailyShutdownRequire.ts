import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import type { AppSettings } from '@/types'
import { parseTimeToMinutes } from '@/lib/utils'

export const SHUTDOWN_CHANGED = 'personal-os-shutdown-changed'
/** Ask Today (or any listener) to open the shutdown modal. */
export const SHUTDOWN_OPEN_REQUESTED = 'personal-os-shutdown-open-requested'
/** Shutdown modal closed without completing (re-show require gate if still pending). */
export const SHUTDOWN_FLOW_CLOSED = 'personal-os-shutdown-flow-closed'

const SHUTDOWN_SUBMITTED_PREFIX = 'personal-os-shutdown-submitted-'

export type ShutdownRequireAt = 'schedule_end' | 'custom'

export function isShutdownSubmitted(date: string): boolean {
  try {
    return storageGetItem(`${SHUTDOWN_SUBMITTED_PREFIX}${date}`) === '1'
  } catch {
    return false
  }
}

export function markShutdownSubmitted(date: string): void {
  storageSetItem(`${SHUTDOWN_SUBMITTED_PREFIX}${date}`, '1')
  window.dispatchEvent(new Event(SHUTDOWN_CHANGED))
  // Keep in sync with MISSED_LOG_CHANGED in dailyLog.ts (avoid circular import).
  window.dispatchEvent(new Event('personal-os-missed-log-changed'))
}

export function requestOpenShutdown(): void {
  window.dispatchEvent(new Event(SHUTDOWN_OPEN_REQUESTED))
}

export function notifyShutdownFlowClosed(): void {
  window.dispatchEvent(new Event(SHUTDOWN_FLOW_CLOSED))
}

export function normalizeShutdownCustomTime(value: unknown): string {
  if (typeof value !== 'string') return '21:00'
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return '21:00'
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return '21:00'
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function normalizeShutdownRequireAt(value: unknown): ShutdownRequireAt {
  return value === 'custom' ? 'custom' : 'schedule_end'
}

/** Minutes since midnight when required shutdown begins. */
export function getShutdownRequireMinutes(settings: AppSettings): number {
  if (settings.shutdownRequireAt === 'custom') {
    return parseTimeToMinutes(normalizeShutdownCustomTime(settings.shutdownCustomTime))
  }
  return Math.max(0, Math.min(24, settings.timelineEndHour)) * 60
}

export function isPastShutdownRequireTime(
  settings: AppSettings,
  now: Date = new Date(),
): boolean {
  if (!settings.requireShutdown) return false
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return nowMinutes >= getShutdownRequireMinutes(settings)
}

export function formatShutdownRequireTimeLabel(
  settings: AppSettings,
  timeFormat: AppSettings['timeFormat'],
): string {
  if (settings.shutdownRequireAt === 'custom') {
    const time = normalizeShutdownCustomTime(settings.shutdownCustomTime)
    if (timeFormat === '24h') return time
    const [h, m] = time.split(':').map(Number)
    const h12 = h % 12 || 12
    const meridiem = h < 12 ? 'AM' : 'PM'
    return `${h12}:${String(m).padStart(2, '0')} ${meridiem}`
  }

  const hour = settings.timelineEndHour
  if (hour === 24) {
    return timeFormat === '24h' ? '24:00' : '12:00 AM'
  }
  if (timeFormat === '24h') {
    return `${String(hour).padStart(2, '0')}:00`
  }
  const h12 = hour % 12 || 12
  const meridiem = hour < 12 ? 'AM' : 'PM'
  return `${h12}:00 ${meridiem}`
}
