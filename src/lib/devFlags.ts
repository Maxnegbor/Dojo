import { isFutureDatesAllowed, isPastDatesAllowed } from '@/lib/devMode'
import type { AppSettings } from '@/types'

/** Flip off before shipping — enables logging and browsing future dates/weeks. */
export const ALLOW_FUTURE_DATES = false

/** Allows editing daily logs on past dates (e.g. backfilling a week). */
export const ALLOW_PAST_DATES = false

/** Shows Weekly Shutdown on any day — for testing; disable before shipping. */
export const ALLOW_WEEKLY_SHUTDOWN_ANY_DAY = false

/** Keeps Weekly Shutdown button visible after completion — for testing only. */
export const WEEKLY_SHUTDOWN_TEST_MODE = false

export function isLogEditable(
  date: string,
  today: string,
  settings?: Pick<AppSettings, 'devMode'>,
): boolean {
  if (date < today) return settings ? isPastDatesAllowed(settings) : ALLOW_PAST_DATES
  if (date === today) return true
  return settings ? isFutureDatesAllowed(settings) : ALLOW_FUTURE_DATES
}
