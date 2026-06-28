/** Flip off before shipping — enables logging and browsing future dates/weeks. */
export const ALLOW_FUTURE_DATES = true

/** Allows editing daily logs on past dates (e.g. backfilling a week). */
export const ALLOW_PAST_DATES = true

/** Shows Weekly Shutdown on any day — for testing; disable before shipping. */
export const ALLOW_WEEKLY_SHUTDOWN_ANY_DAY = true

/** Keeps Weekly Shutdown button visible after completion — for testing only. */
export const WEEKLY_SHUTDOWN_TEST_MODE = true

export function isLogEditable(date: string, today: string): boolean {
  if (date < today) return ALLOW_PAST_DATES
  if (date === today) return true
  return ALLOW_FUTURE_DATES
}
