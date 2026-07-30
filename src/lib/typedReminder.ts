import type { AppSettings } from '@/types'

export type TypedReminderSurface = 'morning' | 'shutdown'

export function getTypedReminderText(
  settings: AppSettings,
  surface: TypedReminderSurface,
): string {
  const raw =
    surface === 'morning'
      ? settings.typedReminderMorningText
      : settings.typedReminderShutdownText
  return raw.trim()
}

export function isTypedReminderRequired(
  settings: AppSettings,
  surface: TypedReminderSurface,
): boolean {
  if (!getTypedReminderText(settings, surface)) return false
  if (surface === 'morning') return settings.requireTypedReminderMorning
  return settings.requireTypedReminderShutdown
}

/** Exact match after trimming ends; casing and inner spacing must match. */
export function typedReminderMatches(expected: string, typed: string): boolean {
  return expected.trim() === typed.trim()
}
