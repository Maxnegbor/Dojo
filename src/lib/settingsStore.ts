import { DEFAULT_APP_SETTINGS, type AppSettings } from '@/types'
import { normalizeWeeklyShutdownChecklist } from '@/lib/weeklyShutdown'
import { normalizeDailyChecklist } from '@/lib/dailyChecklist'
import { normalizeDailyShutdownSteps } from '@/lib/dailyShutdownSteps'
import {
  normalizeShutdownCustomTime,
  normalizeShutdownRequireAt,
} from '@/lib/dailyShutdownRequire'

import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const SETTINGS_KEY = 'personal-os-app-settings'

function normalizeTypedReminderText(primary: unknown, legacyFallback?: unknown): string {
  if (typeof primary === 'string') return primary
  if (typeof legacyFallback === 'string') return legacyFallback
  return ''
}

export function normalizeTimelineRange(
  start: number,
  end: number,
): Pick<AppSettings, 'timelineStartHour' | 'timelineEndHour'> {
  let timelineStartHour = Math.max(0, Math.min(23, Math.round(start)))
  let timelineEndHour = Math.max(1, Math.min(24, Math.round(end)))

  if (timelineEndHour <= timelineStartHour) {
    timelineEndHour = Math.min(24, timelineStartHour + 1)
  }
  if (timelineEndHour <= timelineStartHour) {
    timelineStartHour = Math.max(0, timelineEndHour - 1)
  }

  return { timelineStartHour, timelineEndHour }
}

export function getAppSettings(): AppSettings {
  try {
    const raw = storageGetItem(SETTINGS_KEY)
    if (raw) {
      const parsed = { ...DEFAULT_APP_SETTINGS, ...JSON.parse(raw) } as AppSettings
      const timeline = normalizeTimelineRange(
        parsed.timelineStartHour ?? DEFAULT_APP_SETTINGS.timelineStartHour,
        parsed.timelineEndHour ?? DEFAULT_APP_SETTINGS.timelineEndHour,
      )
      return {
        ...parsed,
        weekStartsOn: parsed.weekStartsOn === 0 ? 0 : 1,
        timeFormat: parsed.timeFormat === '24h' ? '24h' : '12h',
        weightUnit: parsed.weightUnit === 'lb' ? 'lb' : 'kg',
        accentColor: parsed.accentColor in ACCENT_SET ? parsed.accentColor : 'amber',
        showWorkoutMetrics: parsed.showWorkoutMetrics === true,
        showHomeWorkoutPlanner: parsed.showHomeWorkoutPlanner !== false,
        exerciseWeekPlanIncludeTime: parsed.exerciseWeekPlanIncludeTime === true,
        showHomePulse: parsed.showHomePulse !== false,
        hideCompletedHabitsInToggle: parsed.hideCompletedHabitsInToggle !== false,
        showFocusPage: parsed.showFocusPage !== false,
        showFocusSchedule: parsed.showFocusSchedule === true,
        showPulsePage: parsed.showPulsePage !== false,
        weeklyShutdownChecklist: normalizeWeeklyShutdownChecklist(parsed.weeklyShutdownChecklist),
        morningLogChecklist: normalizeDailyChecklist(parsed.morningLogChecklist),
        requireMorningLog: parsed.requireMorningLog === true,
        dailyShutdownChecklist: normalizeDailyChecklist(parsed.dailyShutdownChecklist),
        dailyShutdownSteps: normalizeDailyShutdownSteps(parsed.dailyShutdownSteps),
        requireShutdown: parsed.requireShutdown === true,
        shutdownRequireAt: normalizeShutdownRequireAt(parsed.shutdownRequireAt),
        shutdownCustomTime: normalizeShutdownCustomTime(parsed.shutdownCustomTime),
        requireTypedReminderMorning: parsed.requireTypedReminderMorning === true,
        requireTypedReminderShutdown: parsed.requireTypedReminderShutdown === true,
        typedReminderMorningText: normalizeTypedReminderText(
          parsed.typedReminderMorningText,
          // Migrate legacy shared text into morning if dedicated field missing.
          (parsed as { typedReminderText?: unknown }).typedReminderText,
        ),
        typedReminderShutdownText: normalizeTypedReminderText(
          parsed.typedReminderShutdownText,
          (parsed as { typedReminderText?: unknown }).typedReminderText,
        ),
        devMode: parsed.devMode === true,
        ...timeline,
      }
    }
  } catch {
    /* ignore */
  }
  return getDefaultAppSettings()
}

export function getDefaultAppSettings(): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    weeklyShutdownChecklist: [],
  }
}

const ACCENT_SET = {
  indigo: true,
  violet: true,
  emerald: true,
  rose: true,
  amber: true,
}

export function saveAppSettings(settings: AppSettings) {
  storageSetItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function kgToDisplay(kg: number, unit: AppSettings['weightUnit']): number {
  return unit === 'lb' ? kg * 2.20462 : kg
}

export const WEIGHT_STEP_KG = 0.1

export function adjustWeightKg(kg: number, deltaKg: number): number {
  return Math.round((kg + deltaKg) * 10) / 10
}

export function formatWeightStepper(
  kg: number | null | undefined,
  unit: AppSettings['weightUnit'],
): string {
  if (kg == null) return '—'
  return kgToDisplay(kg, unit).toFixed(1)
}

export function displayToKg(value: number, unit: AppSettings['weightUnit']): number {
  return unit === 'lb' ? value / 2.20462 : value
}

export function formatWeightValue(
  kg: number | null | undefined,
  unit: AppSettings['weightUnit'],
): string {
  if (kg == null) return ''
  const display = kgToDisplay(kg, unit)
  return unit === 'lb' ? display.toFixed(1) : String(display)
}

export function parseWeightInput(
  raw: string,
  unit: AppSettings['weightUnit'],
): number | null {
  if (!raw.trim()) return null
  const value = parseFloat(raw)
  if (Number.isNaN(value)) return null
  return displayToKg(value, unit)
}
