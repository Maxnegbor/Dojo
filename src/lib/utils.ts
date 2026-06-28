import { clsx, type ClassValue } from 'clsx'
import { getAppSettings } from '@/lib/settingsStore'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function generateId(): string {
  return crypto.randomUUID()
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

export function getStreakDates(logDates: string[]): number {
  if (logDates.length === 0) return 0

  const sorted = [...new Set(logDates)].sort().reverse()
  const today = formatDate(new Date())
  const yesterday = formatDate(new Date(Date.now() - 86400000))

  if (sorted[0] !== today && sorted[0] !== yesterday) return 0

  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1])
    const curr = new Date(sorted[i])
    const diff = (prev.getTime() - curr.getTime()) / 86400000
    if (diff === 1) streak++
    else break
  }
  return streak
}
