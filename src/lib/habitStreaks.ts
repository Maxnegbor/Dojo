import type { DailyLog, DailyHabits } from '@/types'
import { normalizeHabits } from '@/types'
import { getDailyLogHabitTypes } from '@/lib/habitTypes'
import { addDays, parseISO } from 'date-fns'
import { formatDate } from '@/lib/utils'

function habitDoneOnDate(
  logsByDate: Map<string, DailyLog>,
  habit: string,
  date: string,
  todayHabits?: DailyHabits,
  asOfDate?: string,
): boolean {
  if (date === asOfDate && todayHabits) {
    return todayHabits[habit] ?? false
  }
  return normalizeHabits(logsByDate.get(date)?.habits)[habit] ?? false
}

/** Consecutive days with this habit done, ending on the latest completed day (includes today if checked). */
export function getHabitStreak(
  logs: DailyLog[],
  habit: string,
  asOfDate: string,
  todayHabits?: DailyHabits,
): number {
  const logsByDate = new Map(logs.map((l) => [l.date, l]))
  const todayDone = habitDoneOnDate(logsByDate, habit, asOfDate, todayHabits, asOfDate)

  let streak = 0
  const cursor = new Date(asOfDate + 'T12:00:00')
  if (!todayDone) {
    cursor.setDate(cursor.getDate() - 1)
  }

  for (let i = 0; i < 4000; i++) {
    const dateStr = formatDate(cursor)
    if (!habitDoneOnDate(logsByDate, habit, dateStr, todayHabits, asOfDate)) break
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}

export function getHabitStreaksForDate(
  logs: DailyLog[],
  asOfDate: string,
  todayHabits?: DailyHabits,
): Record<string, number> {
  return getDailyLogHabitTypes().reduce(
    (acc, type) => {
      acc[type.id] = getHabitStreak(logs, type.id, asOfDate, todayHabits)
      return acc
    },
    {} as Record<string, number>,
  )
}

/** Completion rate (0–100) for a habit over a date range. */
export function getHabitCompletionRate(
  logs: DailyLog[],
  habit: string,
  dates: string[],
  options?: { asOfDate?: string; todayHabits?: DailyHabits },
): number {
  if (dates.length === 0) return 0
  const logsByDate = new Map(logs.map((l) => [l.date, l]))
  const { asOfDate, todayHabits } = options ?? {}
  const done = dates.filter((d) =>
    habitDoneOnDate(logsByDate, habit, d, todayHabits, asOfDate),
  ).length
  return (done / dates.length) * 100
}

/** Habit completion % over the last N days ending on `asOfDate`. */
export function getRecentHabitConsistency(
  logs: DailyLog[],
  habitId: string,
  asOfDate: string,
  days: number,
  todayHabits?: DailyHabits,
): number {
  const dates = Array.from({ length: days }, (_, index) =>
    formatDate(addDays(parseISO(asOfDate), -index)),
  )
  return getHabitCompletionRate(logs, habitId, dates, { asOfDate, todayHabits })
}

/** Habit completion % over the last 7 days ending on `asOfDate`. */
export function getLast7DayHabitConsistency(
  logs: DailyLog[],
  habitId: string,
  asOfDate: string,
  todayHabits?: DailyHabits,
): number {
  return getRecentHabitConsistency(logs, habitId, asOfDate, 7, todayHabits)
}

/** Habit completion % over the last 30 days ending on `asOfDate`. */
export function getLast30DayHabitConsistency(
  logs: DailyLog[],
  habitId: string,
  asOfDate: string,
  todayHabits?: DailyHabits,
): number {
  return getRecentHabitConsistency(logs, habitId, asOfDate, 30, todayHabits)
}

/** Red through 75%; green only from 75% to 100%. */
export function getConsistencyHeatColor(percent: number): string {
  const clamped = Math.min(100, Math.max(0, percent))
  if (clamped <= 75) return 'hsl(0, 72%, 52%)'
  const t = (clamped - 75) / 25
  return `hsl(${t * 120}, 72%, 52%)`
}
