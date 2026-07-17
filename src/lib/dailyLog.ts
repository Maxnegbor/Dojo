import { addDays, format, parseISO } from 'date-fns'
import type { DailyLog, Goal } from '@/types'
import { getDailyLogGoals } from '@/lib/goals'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { formatDate } from '@/lib/utils'

const NOTES_PREFIX = 'personal-os-notes-'
const MISSED_DISMISS_PREFIX = 'personal-os-missed-dismiss-'
const MAX_MISSED_LOG_LOOKBACK_DAYS = 90

export interface MissedLogDay {
  date: string
  log: DailyLog | null
}

/** Daily log scalar goals excluding deprecated built-ins (steps, screentime). */
export function getDailyLogScalarGoals(goals: Goal[]): Goal[] {
  return getDailyLogGoals(goals).filter(
    (g) =>
      g.metric_key !== 'focus' &&
      g.metric_key !== 'sleep' &&
      g.metric_key !== 'steps' &&
      g.metric_key !== 'screen_time' &&
      !g.metric_key.startsWith('workout_'),
  )
}

export function getLogValueForGoal(log: DailyLog, goal: Goal): number | null {
  if (goal.metric_key.startsWith('custom:')) {
    return log.custom_metrics?.[goal.metric_key] ?? null
  }
  if (goal.metric_key === 'weight') {
    return log.weight ?? null
  }
  if (goal.metric_key === 'steps') {
    return log.steps ?? null
  }
  if (goal.metric_key === 'screen_time') {
    return log.screen_time_minutes ?? null
  }
  if (goal.metric_key === 'sleep') {
    return log.sleep_hours ?? null
  }
  return null
}

export function isMandatoryLogComplete(
  log: DailyLog | null | undefined,
  goals: Goal[] = [],
): boolean {
  if (!log) return false

  const required = getDailyLogScalarGoals(goals)
  if (required.length === 0) return true

  for (const goal of required) {
    if (getLogValueForGoal(log, goal) == null) return false
  }

  return true
}

export function getDailyNotes(date: string): string {
  try {
    return storageGetItem(`${NOTES_PREFIX}${date}`) ?? ''
  } catch {
    return ''
  }
}

export function setDailyNotes(date: string, text: string) {
  try {
    storageSetItem(`${NOTES_PREFIX}${date}`, text)
  } catch {
    /* ignore */
  }
}

export function isMissedLogDismissed(date: string): boolean {
  try {
    return storageGetItem(`${MISSED_DISMISS_PREFIX}${date}`) === '1'
  } catch {
    return false
  }
}

export function dismissMissedLog(date: string) {
  try {
    storageSetItem(`${MISSED_DISMISS_PREFIX}${date}`, '1')
  } catch {
    /* ignore */
  }
}

export function getYesterdayDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

/** Inclusive date strings from start through end (YYYY-MM-DD). */
export function enumerateDatesInclusive(start: string, end: string): string[] {
  if (end < start) return []
  const dates: string[] = []
  let cursor = parseISO(`${start}T12:00:00`)
  const last = parseISO(`${end}T12:00:00`)
  while (cursor <= last) {
    dates.push(format(cursor, 'yyyy-MM-dd'))
    cursor = addDays(cursor, 1)
  }
  return dates
}

export function getMissedLogScanStart(memberSinceDate?: string | null, untilDate?: string): string {
  const until = untilDate ?? getYesterdayDate()
  if (memberSinceDate && memberSinceDate <= until) return memberSinceDate
  return until
}

export function isMissedLogDay(
  date: string,
  log: DailyLog | null | undefined,
  goals: Goal[],
  memberSinceDate?: string | null,
): boolean {
  const today = formatDate(new Date())
  if (date >= today) return false
  if (memberSinceDate && date < memberSinceDate) return false
  if (isMissedLogDismissed(date)) return false
  if (getDailyLogScalarGoals(goals).length === 0) return false
  return !isMandatoryLogComplete(log, goals)
}

/** Newest first; capped lookback from member join (or yesterday only). */
export function buildMissedLogDays(
  logsByDate: Map<string, DailyLog | null>,
  goals: Goal[],
  memberSinceDate?: string | null,
): MissedLogDay[] {
  const until = getYesterdayDate()
  const scanStart = getMissedLogScanStart(memberSinceDate, until)
  const allDates = enumerateDatesInclusive(scanStart, until)
  const lookbackStart = Math.max(0, allDates.length - MAX_MISSED_LOG_LOOKBACK_DAYS)
  const dates = allDates.slice(lookbackStart)

  const missed: MissedLogDay[] = []
  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i]
    const log = logsByDate.get(date) ?? null
    if (isMissedLogDay(date, log, goals, memberSinceDate)) {
      missed.push({ date, log })
    }
  }
  return missed
}
