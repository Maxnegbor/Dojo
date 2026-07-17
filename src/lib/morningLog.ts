import type { DailyLog, MorningLog } from '@/types'
import { localStore } from '@/lib/localStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'

/** Minutes since midnight for HH:mm. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Map bedtime onto the sleep-night timeline (evening → after-midnight). */
function bedtimeToNightMinutes(bedtime: string): number {
  const m = timeToMinutes(bedtime)
  // 00:00–11:59 is after midnight on the same night as prior evening beds.
  if (m < 12 * 60) return m + 24 * 60
  return m
}

/** Bedtime logged at or after midnight (00:00–11:59), same calendar day as wake. */
export function isAfterMidnightBedtime(bedtime: string): boolean {
  return timeToMinutes(bedtime) < 12 * 60
}

/** Minutes between two HH:mm times (handles overnight). */
export function minutesBetweenTimes(start: string, end: string): number {
  const startMin = timeToMinutes(start)
  let endMin = timeToMinutes(end)
  if (endMin <= startMin) endMin += 24 * 60
  return endMin - startMin
}

/** In-bed duration from bedtime to wake (morning log). */
export function minutesInBed(bedtime: string, wakeTime: string): number {
  const bedMin = timeToMinutes(bedtime)
  const wakeMin = timeToMinutes(wakeTime)

  if (isAfterMidnightBedtime(bedtime)) {
    if (wakeMin > bedMin) return wakeMin - bedMin
    return wakeMin + 24 * 60 - bedMin
  }

  if (wakeMin <= bedMin) return wakeMin + 24 * 60 - bedMin
  return wakeMin - bedMin
}

export function computeMorningLogFields(input: {
  bedtime: string
  wake_time: string
  sleep_minutes: number
  alertness: number
}): MorningLog {
  const in_bed_minutes = minutesInBed(input.bedtime, input.wake_time)
  return {
    bedtime: input.bedtime,
    wake_time: input.wake_time,
    alertness: input.alertness,
    in_bed_minutes,
    sleep_minutes: input.sleep_minutes,
  }
}

export function getMorningLog(log: DailyLog | undefined): MorningLog | null {
  if (!log?.morning_log?.bedtime) return null
  return log.morning_log
}

export const MORNING_LOG_CHANGED = 'personal-os-morning-log-changed'

const MORNING_LOG_SUBMITTED_PREFIX = 'personal-os-morning-log-submitted-'

export function isMorningLogSubmitted(date: string): boolean {
  try {
    return storageGetItem(`${MORNING_LOG_SUBMITTED_PREFIX}${date}`) === '1'
  } catch {
    return false
  }
}

export function markMorningLogSubmitted(date: string) {
  storageSetItem(`${MORNING_LOG_SUBMITTED_PREFIX}${date}`, '1')
  notifyMorningLogChanged()
}

export function notifyMorningLogChanged() {
  window.dispatchEvent(new CustomEvent(MORNING_LOG_CHANGED))
}

const MORNING_LOG_DURATION_MIGRATION = 'personal-os-morning-log-sleep-duration-v1'

/** One-time: clear legacy morning logs that used fell-asleep clock time. */
export async function migrateMorningLogToSleepDuration(userId: string): Promise<void> {
  const migrationKey = `${MORNING_LOG_DURATION_MIGRATION}-${userId}`
  if (storageGetItem(migrationKey)) return

  // Mark complete before async work so a save during migration is not wiped on retry.
  storageSetItem(migrationKey, JSON.stringify(true))

  localStore.setUserId(userId)
  localStore.clearAllMorningLogs()

  if (isSupabaseConfigured) {
    const { clearAllMorningLogs } = await import('@/lib/supabase')
    await clearAllMorningLogs(userId)
  }

  notifyMorningLogChanged()
}

export function formatMorningMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h <= 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function averageTime(times: string[]): string {
  if (times.length === 0) return '—'
  const total = times.reduce(
    (s, t) => s + parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3), 10),
    0,
  )
  const avg = Math.round(total / times.length)
  const h = Math.floor(avg / 60) % 24
  const m = avg % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Average bedtime on the sleep-night clock (e.g. 22:00 + 02:00 → 00:00). */
export function averageBedtime(times: string[]): string {
  if (times.length === 0) return '—'
  const avg = Math.round(
    times.reduce((s, t) => s + bedtimeToNightMinutes(t), 0) / times.length,
  )
  const minutesInDay = 24 * 60
  const normalized = ((avg % minutesInDay) + minutesInDay) % minutesInDay
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatTime12h(time: string, use24h: boolean): string {
  const [h, m] = time.split(':').map(Number)
  if (use24h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}
