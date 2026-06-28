import type { DailyLog, DailyHabits } from '@/types'
import { normalizeHabits } from '@/types'
import { getDailyLogHabitTypes } from '@/lib/habitTypes'
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
): number {
  if (dates.length === 0) return 0
  const logsByDate = new Map(logs.map((l) => [l.date, l]))
  const done = dates.filter((d) =>
    habitDoneOnDate(logsByDate, habit, d),
  ).length
  return (done / dates.length) * 100
}
