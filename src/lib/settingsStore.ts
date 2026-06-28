import { DEFAULT_APP_SETTINGS, type AppSettings } from '@/types'

const SETTINGS_KEY = 'personal-os-app-settings'

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
    const raw = localStorage.getItem(SETTINGS_KEY)
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
        ...timeline,
      }
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_APP_SETTINGS }
}

const ACCENT_SET = {
  indigo: true,
  violet: true,
  emerald: true,
  rose: true,
  amber: true,
}

export function saveAppSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
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
