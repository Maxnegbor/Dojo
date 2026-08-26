export const TIMED_METRIC_UNIT = 'hrs:min'

export const METRIC_UNIT_OPTIONS = [
  'numeric',
  'hrs',
  'min',
  TIMED_METRIC_UNIT,
  'kg',
  'steps',
  'pages',
  '%',
] as const

export function isTimedMetricUnit(unit: string): boolean {
  const normalized = unit.trim().toLowerCase().replace(/\s/g, '')
  return normalized === 'hrs:min' || normalized === 'h:min' || normalized === 'hr:min'
}

export function usesTimedMetricInput(unit: string, metricKey?: string): boolean {
  return isTimedMetricUnit(unit) || metricKey === 'screen_time'
}

export function usesTimedMetricDisplay(unit: string, metricKey?: string): boolean {
  return usesTimedMetricInput(unit, metricKey)
}

/** Minutes → `H:MM` for inputs and timed-metric display. */
export function minutesToHrsMinInput(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return ''
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Parse `H:MM` (or bare minutes) → total minutes. */
export function parseHrsMinToMinutes(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (trimmed.includes(':')) {
    const [hoursPart, minutesPart = '0'] = trimmed.split(':')
    const hours = parseInt(hoursPart || '0', 10)
    const minutes = minutesPart === '' ? 0 : parseInt(minutesPart, 10)
    if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || minutes < 0 || minutes >= 60) {
      return null
    }
    return hours * 60 + minutes
  }

  const asInt = parseInt(trimmed, 10)
  if (Number.isNaN(asInt) || asInt < 0) return null
  return asInt
}

/** Stored minutes → consistent hours label (e.g. `1 hrs`, `2.5 hrs`). */
export function formatMinutesAsHours(minutes: number): string {
  const hrs = Math.max(0, minutes) / 60
  const rounded = Math.round(hrs * 10) / 10
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${label} hrs`
}

function isMinuteUnit(unit: string): boolean {
  return unit === 'min' || unit === 'min/wk'
}

export function formatMetricAmount(value: number, unit: string, metricKey?: string): string {
  if (usesTimedMetricDisplay(unit, metricKey)) return minutesToHrsMinInput(value)
  if (isMinuteUnit(unit)) return formatMinutesAsHours(value)
  if (unit === 'steps') return Math.round(value).toLocaleString()
  if (unit === 'hrs' || unit === 'hrs/night') return value > 0 ? value.toFixed(1) : '0'
  if (unit === 'numeric') return Number.isInteger(value) ? String(value) : String(value)
  return `${value} ${unit}`
}

export function formatMetricAmountWithUnit(value: number, unit: string, metricKey?: string): string {
  const amount = formatMetricAmount(value, unit, metricKey)
  if (usesTimedMetricDisplay(unit, metricKey)) return amount
  if (isMinuteUnit(unit)) return amount
  if (unit === 'numeric') return amount
  if (unit === 'steps' || unit === 'hrs' || unit === 'hrs/night') return `${amount} ${unit}`
  return amount
}

export function formatGoalTargetLabel(
  value: number,
  unit: string,
  metricKey?: string,
): string {
  if (usesTimedMetricDisplay(unit, metricKey)) return formatMetricAmount(value, unit, metricKey)
  if (isMinuteUnit(unit)) return formatMinutesAsHours(value)
  if (unit === 'numeric') return formatMetricAmount(value, unit, metricKey)
  return `${value} ${unit}`
}
