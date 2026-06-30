import type { AppSettings } from '@/types'
import {
  ALLOW_FUTURE_DATES,
  ALLOW_PAST_DATES,
  ALLOW_WEEKLY_SHUTDOWN_ANY_DAY,
  WEEKLY_SHUTDOWN_TEST_MODE,
} from '@/lib/devFlags'

export function isDevModeEnabled(settings: Pick<AppSettings, 'devMode'>): boolean {
  return settings.devMode === true
}

export function isWeeklyShutdownDevAvailable(settings: Pick<AppSettings, 'devMode'>): boolean {
  return isDevModeEnabled(settings) || WEEKLY_SHUTDOWN_TEST_MODE
}

export function isWeeklyShutdownAnyDay(settings: Pick<AppSettings, 'devMode'>): boolean {
  return isDevModeEnabled(settings) || ALLOW_WEEKLY_SHUTDOWN_ANY_DAY
}

export function isFutureDatesAllowed(settings: Pick<AppSettings, 'devMode'>): boolean {
  return isDevModeEnabled(settings) || ALLOW_FUTURE_DATES
}

export function isPastDatesAllowed(settings: Pick<AppSettings, 'devMode'>): boolean {
  return isDevModeEnabled(settings) || ALLOW_PAST_DATES
}
