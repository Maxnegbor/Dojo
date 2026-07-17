import { clsx, type ClassValue } from 'clsx'
import { getAppSettings } from '@/lib/settingsStore'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/** Parse YYYY-MM-DD as local noon to avoid timezone day-shift bugs. */
export function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`)
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr)
  d.setDate(d.getDate() + days)
  return formatDate(d)
}

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** True when local time is at or past the schedule end hour (e.g. endHour 23 → from 11:00 PM). */
export function isPastScheduleEndHour(endHour: number, now: Date = new Date()): boolean {
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return nowMinutes >= endHour * 60
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total % 60
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function generateId(): string {
  return crypto.randomUUID()
}

/** Extract a user-facing message from thrown values (incl. Supabase PostgrestError). */
export function formatUnknownError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    if (typeof record.message === 'string' && record.message.trim()) {
      const details = typeof record.details === 'string' ? record.details.trim() : ''
      return details ? `${record.message.trim()} (${details})` : record.message.trim()
    }
  }
  if (typeof error === 'string' && error.trim()) return error.trim()
  return fallback
}

export function getWeekdayLabels(weekStartsOn: 0 | 1 = getAppSettings().weekStartsOn): string[] {
  const labels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
  return weekStartsOn === 0 ? labels : [...labels.slice(1), labels[0]]
}

export function getMonthStartPad(month: Date, weekStartsOn: 0 | 1 = getAppSettings().weekStartsOn): number {
  const day = new Date(month.getFullYear(), month.getMonth(), 1).getDay()
  return weekStartsOn === 0 ? day : (day + 6) % 7
}

export function getWeekDates(date: Date, weekStartsOn: 0 | 1 = getAppSettings().weekStartsOn): string[] {
  const day = date.getDay()
  const offset = weekStartsOn === 0 ? day : (day + 6) % 7
  const weekStart = new Date(date)
  weekStart.setDate(date.getDate() - offset)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return formatDate(d)
  })
}

