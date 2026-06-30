import type { DailyLog } from '@/types'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const NOTES_PREFIX = 'personal-os-notes-'
const MISSED_DISMISS_PREFIX = 'personal-os-missed-dismiss-'

export function isMandatoryLogComplete(log: DailyLog | null | undefined): boolean {
  if (!log) return false
  return log.steps != null && log.screen_time_minutes != null
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
