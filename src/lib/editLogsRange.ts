import { addDays, parseISO } from 'date-fns'
import { formatDate, getWeekDates } from '@/lib/utils'
import { getWeeklyShutdownWeekKey } from '@/lib/weeklyShutdown'

export const EDIT_LOGS_LOOKBACK_DAYS = 14

export function getEditLogsDateRange(endDate: string = formatDate(new Date())): {
  start: string
  end: string
  dates: string[]
} {
  const end = endDate
  const start = formatDate(
    addDays(parseISO(`${end}T12:00:00`), -(EDIT_LOGS_LOOKBACK_DAYS - 1)),
  )
  const dates: string[] = []
  for (let i = 0; i < EDIT_LOGS_LOOKBACK_DAYS; i++) {
    dates.push(formatDate(addDays(parseISO(`${end}T12:00:00`), -i)))
  }
  return { start, end, dates }
}

export function getWeekKeysInRange(dates: string[], weekStartsOn: 0 | 1): string[] {
  const keys = new Set<string>()
  for (const date of dates) {
    const weekDates = getWeekDates(parseISO(`${date}T12:00:00`), weekStartsOn)
    const key = getWeeklyShutdownWeekKey(weekDates)
    if (key) keys.add(key)
  }
  return [...keys].sort((a, b) => b.localeCompare(a))
}

export function formatEditLogDayLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

export function formatEditLogWeekLabel(weekKey: string): string {
  const start = new Date(`${weekKey}T12:00:00`)
  const end = addDays(start, 6)
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `Week of ${startLabel} – ${endLabel}`
}
