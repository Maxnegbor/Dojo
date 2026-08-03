import {
  addDays,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfYear,
  format,
  isSameMonth,
  isSameYear,
  parseISO,
  startOfMonth,
  startOfYear,
  subMonths,
  subYears,
} from 'date-fns'
import type { DailyLog, Workout } from '@/types'
import { getHabitCompletionRate, getHabitStreak } from '@/lib/habitStreaks'
import { getDailyLogHabitTypes } from '@/lib/habitTypes'
import { resolveFocusLabelMeta } from '@/lib/focusLabels'
import { getFocusSessionsInRange } from '@/lib/focusSessions'
import { getWorkoutTypes } from '@/lib/workoutTypes'
import { formatDate, getWeekDates } from '@/lib/utils'

export type OverviewPeriod = 'week' | 'month' | 'year'

export interface PeriodRange {
  start: string
  end: string
  dates: string[]
  label: string
}

export interface FocusPeriodStats {
  total: number
  dailyAverage: number
  bestDay: { date: string; minutes: number } | null
  pctVsPrevious: number | null
  dailyAveragePctVsPrevious: number | null
  activeDays: number
  /** Time broken down by focus label (sessions with a label). */
  labelStats: FocusLabelPeriodStat[]
}

export interface FocusLabelPeriodStat {
  id: string
  label: string
  color: string
  minutes: number
  previousMinutes: number
}

export interface HabitPeriodStat {
  id: string
  label: string
  rate: number
  completed: number
  totalDays: number
  streak: number
}

export interface HabitPeriodSummary {
  avgRate: number
  totalCompletions: number
  possibleCompletions: number
  perfectDays: number
  periodDays: number
  bestStreak: { label: string; days: number } | null
}

export interface WorkoutPeriodStat {
  id: string
  label: string
  color: string
  minutes: number
  previousMinutes: number
}

export interface MonthlyFocusBucket {
  month: string
  label: string
  minutes: number
}

export interface OverviewPeriodStats {
  focus: FocusPeriodStats
  habits: HabitPeriodStat[]
  habitSummary: HabitPeriodSummary | null
  sleepAvg: number | null
  sleepDays: number
  stepsTotal: number
  workoutStats: WorkoutPeriodStat[]
  workoutTotalMinutes: number
  workoutPreviousTotalMinutes: number
  workoutWeeksInPeriod: number
  workoutPreviousWeeksInPeriod: number
  workoutWeeklyAvgMinutes: number
  workoutPreviousWeeklyAvgMinutes: number
  activeDays: number
  loggingRate: number
  monthlyFocus?: MonthlyFocusBucket[]
  weightStart: number | null
  weightEnd: number | null
  bestHabitStreak: { label: string; days: number } | null
}

function datesBetween(start: string, end: string): string[] {
  const dates: string[] = []
  let cursor = parseISO(start)
  const endDate = parseISO(end)
  while (cursor <= endDate) {
    dates.push(formatDate(cursor))
    cursor = addDays(cursor, 1)
  }
  return dates
}

function logsInRange(logs: DailyLog[], start: string, end: string): DailyLog[] {
  return logs.filter((l) => l.date >= start && l.date <= end)
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) {
    if (current <= 0) return 0
    return null
  }
  return ((current - previous) / previous) * 100
}

export function overviewLoadRange(weekStartsOn: 0 | 1, asOf = new Date()): { start: string; end: string } {
  const today = formatDate(new Date())
  const yearStart = formatDate(startOfYear(asOf))
  const prevYearStart = formatDate(startOfYear(subYears(asOf, 1)))
  const weekDates = getWeekDates(asOf, weekStartsOn)
  const baselineStart = formatDate(addDays(parseISO(weekDates[0]), -91))
  const prevMonthStart = formatDate(startOfMonth(subMonths(asOf, 1)))
  const candidates = [prevYearStart, yearStart, baselineStart, prevMonthStart]
  const start = candidates.reduce((earliest, d) => (d < earliest ? d : earliest))
  return { start, end: today }
}

/** Reference date for overview navigation (0 = current period). */
export function overviewAsOfDate(
  period: OverviewPeriod,
  offset: number,
  _weekStartsOn: 0 | 1,
): Date {
  const now = new Date()
  if (offset === 0) return now
  if (period === 'week') return addDays(now, offset * 7)
  if (period === 'month') return subMonths(now, -offset)
  return addYears(now, offset)
}

export function isCurrentOverviewPeriod(
  period: OverviewPeriod,
  asOf: Date,
  weekStartsOn: 0 | 1,
): boolean {
  const today = formatDate(new Date())
  const range = getPeriodRange(period, weekStartsOn, asOf)
  return today >= range.start && today <= range.end
}

export function formatOverviewNavLabel(
  period: OverviewPeriod,
  range: PeriodRange,
  isCurrent: boolean,
): string {
  if (isCurrent) {
    if (period === 'week') return 'This week'
    if (period === 'month') return 'This month'
    return 'This year'
  }
  if (period === 'week') {
    const start = parseISO(range.start)
    const end = parseISO(range.end)
    const sameYear = start.getFullYear() === end.getFullYear()
    if (sameYear) {
      return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
    }
    return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`
  }
  if (period === 'month') return format(parseISO(range.start), 'MMMM yyyy')
  return format(parseISO(range.start), 'yyyy')
}

export function formatWorkoutPeriodComparison(
  current: number,
  previous: number,
  previousLabel: string,
): { text: string; positive: boolean | null } | null {
  if (current <= 0) return null
  return formatPeriodComparison(pctChange(current, previous), previousLabel, true)
}

export function getPeriodRange(
  period: OverviewPeriod,
  weekStartsOn: 0 | 1,
  asOf = new Date(),
): PeriodRange {
  const today = formatDate(new Date())

  if (period === 'week') {
    const dates = getWeekDates(asOf, weekStartsOn)
    const start = dates[0]
    const weekEnd = dates[dates.length - 1]
    const end = weekEnd > today ? today : weekEnd
    const visibleDates = dates.filter((d) => d <= today)
    const isCurrent = dates.includes(today)
    return {
      start,
      end,
      dates: visibleDates.length > 0 ? visibleDates : dates,
      label: isCurrent ? 'This week' : `${formatShortDate(start)} – ${formatShortDate(weekEnd)}`,
    }
  }

  if (period === 'month') {
    const start = formatDate(startOfMonth(asOf))
    const monthEnd = formatDate(endOfMonth(asOf))
    const end = monthEnd > today ? today : monthEnd
    const isCurrent = isSameMonth(asOf, new Date())
    return {
      start,
      end,
      dates: datesBetween(start, end),
      label: isCurrent ? 'This month' : format(asOf, 'MMMM yyyy'),
    }
  }

  const start = formatDate(startOfYear(asOf))
  const yearEnd = formatDate(endOfYear(asOf))
  const end = yearEnd > today ? today : yearEnd
  const isCurrent = isSameYear(asOf, new Date())
  return {
    start,
    end,
    dates: datesBetween(start, end),
    label: isCurrent ? 'This year' : format(asOf, 'yyyy'),
  }
}

export function getPreviousPeriodRange(
  period: OverviewPeriod,
  weekStartsOn: 0 | 1,
  asOf = new Date(),
): PeriodRange | null {
  if (period === 'week') {
    const weekDates = getWeekDates(asOf, weekStartsOn)
    const prevWeekStart = addDays(parseISO(weekDates[0]), -7)
    const dates = getWeekDates(prevWeekStart, weekStartsOn)
    return {
      start: dates[0],
      end: dates[dates.length - 1],
      dates,
      label: 'Last week',
    }
  }

  if (period === 'month') {
    const prev = subMonths(asOf, 1)
    const start = formatDate(startOfMonth(prev))
    const end = formatDate(endOfMonth(prev))
    return {
      start,
      end,
      dates: datesBetween(start, end),
      label: format(prev, 'MMMM yyyy'),
    }
  }

  const prev = subYears(asOf, 1)
  const start = formatDate(startOfYear(prev))
  const end = formatDate(endOfYear(prev))
  return {
    start,
    end,
    dates: datesBetween(start, end),
    label: format(prev, 'yyyy'),
  }
}

function computeFocusLabelStats(
  range: PeriodRange,
  prevRange?: PeriodRange | null,
): FocusLabelPeriodStat[] {
  const current = getFocusSessionsInRange(range.start, range.end)
  const previous =
    prevRange != null ? getFocusSessionsInRange(prevRange.start, prevRange.end) : []

  const currentById = new Map<string, number>()
  for (const session of current) {
    if (!session.label_id) continue
    currentById.set(session.label_id, (currentById.get(session.label_id) ?? 0) + session.minutes)
  }

  const previousById = new Map<string, number>()
  for (const session of previous) {
    if (!session.label_id) continue
    previousById.set(session.label_id, (previousById.get(session.label_id) ?? 0) + session.minutes)
  }

  // Include deleted labels that still have sessions in this period.
  const ids = new Set([...currentById.keys()])
  return [...ids]
    .map((id) => {
      const meta = resolveFocusLabelMeta(id)
      return {
        id,
        label: meta.label,
        color: meta.color,
        minutes: currentById.get(id) ?? 0,
        previousMinutes: previousById.get(id) ?? 0,
      }
    })
    .filter((entry) => entry.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
}

function computeFocusStats(
  logs: DailyLog[],
  range: PeriodRange,
  prevRange?: PeriodRange | null,
): FocusPeriodStats {
  const inRange = logsInRange(logs, range.start, range.end)
  const total = inRange.reduce((s, l) => s + (l.focus_minutes ?? 0), 0)
  const activeDays = inRange.filter((l) => (l.focus_minutes ?? 0) > 0).length
  const daysElapsed = Math.max(1, range.dates.length)
  const dailyAverage = total / daysElapsed

  let bestDay: FocusPeriodStats['bestDay'] = null
  for (const log of inRange) {
    const minutes = log.focus_minutes ?? 0
    if (minutes > 0 && (!bestDay || minutes > bestDay.minutes)) {
      bestDay = { date: log.date, minutes }
    }
  }

  let pctVsPrevious: number | null = null
  let dailyAveragePctVsPrevious: number | null = null
  if (prevRange) {
    // Compare the same number of elapsed days so a partial current week/month
    // isn't measured against a finished previous period.
    const elapsedDays = Math.max(1, range.dates.length)
    const comparablePrevDates = prevRange.dates.slice(0, elapsedDays)
    const prevDateSet = new Set(comparablePrevDates)
    const prevTotal = logs
      .filter((log) => prevDateSet.has(log.date))
      .reduce((sum, log) => sum + (log.focus_minutes ?? 0), 0)
    pctVsPrevious = pctChange(total, prevTotal)
    const prevDailyAverage = prevTotal / comparablePrevDates.length
    dailyAveragePctVsPrevious = pctChange(dailyAverage, prevDailyAverage)
  }

  return {
    total,
    dailyAverage,
    bestDay,
    pctVsPrevious,
    dailyAveragePctVsPrevious,
    activeDays,
    labelStats: computeFocusLabelStats(range, prevRange),
  }
}

function computeHabitStats(logs: DailyLog[], dates: string[]): HabitPeriodStat[] {
  const asOfDate = dates[dates.length - 1] ?? formatDate(new Date())
  const logsByDate = new Map(logs.map((l) => [l.date, l]))

  return getDailyLogHabitTypes()
    .map((habit) => {
      const rate = getHabitCompletionRate(logs, habit.id, dates)
      const completed = dates.filter((date) => logsByDate.get(date)?.habits?.[habit.id]).length
      return {
        id: habit.id,
        label: habit.label,
        rate,
        completed,
        totalDays: dates.length,
        streak: getHabitStreak(logs, habit.id, asOfDate),
      }
    })
    .sort((a, b) => b.rate - a.rate)
}

function computeHabitSummary(logs: DailyLog[], dates: string[], habits: HabitPeriodStat[]): HabitPeriodSummary | null {
  const habitTypes = getDailyLogHabitTypes()
  if (habitTypes.length === 0 || dates.length === 0) return null

  const logsByDate = new Map(logs.map((l) => [l.date, l]))
  let perfectDays = 0
  for (const date of dates) {
    if (habitTypes.every((habit) => logsByDate.get(date)?.habits?.[habit.id])) {
      perfectDays++
    }
  }

  const avgRate = habits.reduce((sum, habit) => sum + habit.rate, 0) / habits.length
  const totalCompletions = habits.reduce((sum, habit) => sum + habit.completed, 0)
  const possibleCompletions = habits.length * dates.length
  const bestStreak = habits.reduce(
    (best, habit) =>
      !best || habit.streak > best.days ? { label: habit.label, days: habit.streak } : best,
    null as { label: string; days: number } | null,
  )

  return {
    avgRate,
    totalCompletions,
    possibleCompletions,
    perfectDays,
    periodDays: dates.length,
    bestStreak: bestStreak && bestStreak.days > 0 ? bestStreak : null,
  }
}

function countWeeksInRange(dates: string[], weekStartsOn: 0 | 1): number {
  if (dates.length === 0) return 1
  const weekStarts = new Set<string>()
  for (const date of dates) {
    weekStarts.add(getWeekDates(parseISO(`${date}T12:00:00`), weekStartsOn)[0])
  }
  return Math.max(1, weekStarts.size)
}

function getWorkoutTrackingStartDate(workouts: Workout[]): string | null {
  if (workouts.length === 0) return null
  return workouts.reduce((earliest, workout) => {
    return workout.date < earliest ? workout.date : earliest
  }, workouts[0].date)
}

function countWeeksWithWorkoutTracking(
  dates: string[],
  weekStartsOn: 0 | 1,
  trackingStart: string | null,
): number {
  if (dates.length === 0) return 1
  const trackedDates =
    trackingStart != null ? dates.filter((date) => date >= trackingStart) : dates
  return countWeeksInRange(trackedDates, weekStartsOn)
}

function computeWorkoutStats(
  workouts: Workout[],
  start: string,
  end: string,
  previousStart?: string,
  previousEnd?: string,
): {
  stats: WorkoutPeriodStat[]
  totalMinutes: number
  previousTotalMinutes: number
} {
  const inRange = workouts.filter((w) => w.date >= start && w.date <= end)
  const prevInRange =
    previousStart && previousEnd
      ? workouts.filter((w) => w.date >= previousStart && w.date <= previousEnd)
      : []
  const types = getWorkoutTypes()
  const stats = types
    .map((type) => ({
      id: type.id,
      label: type.label,
      color: type.color,
      minutes: inRange
        .filter((w) => w.category === type.id)
        .reduce((s, w) => s + w.duration_minutes, 0),
      previousMinutes: prevInRange
        .filter((w) => w.category === type.id)
        .reduce((s, w) => s + w.duration_minutes, 0),
    }))
    .filter((s) => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)

  const totalMinutes = inRange.reduce((s, w) => s + w.duration_minutes, 0)
  const previousTotalMinutes = prevInRange.reduce((s, w) => s + w.duration_minutes, 0)
  return { stats, totalMinutes, previousTotalMinutes }
}

function computeSleepAvg(logs: DailyLog[], dates: string[]): { avg: number | null; days: number } {
  const withSleep = logs.filter((l) => dates.includes(l.date) && l.sleep_hours != null)
  if (withSleep.length === 0) return { avg: null, days: 0 }
  const avg = withSleep.reduce((s, l) => s + (l.sleep_hours ?? 0), 0) / withSleep.length
  return { avg, days: withSleep.length }
}

function computeMonthlyFocusBuckets(logs: DailyLog[], year: number): MonthlyFocusBucket[] {
  const buckets: MonthlyFocusBucket[] = []
  for (let month = 0; month < 12; month++) {
    const monthStart = formatDate(new Date(year, month, 1))
    const monthEnd = formatDate(endOfMonth(new Date(year, month, 1)))
    const minutes = logsInRange(logs, monthStart, monthEnd).reduce(
      (s, l) => s + (l.focus_minutes ?? 0),
      0,
    )
    buckets.push({
      month: monthStart.slice(0, 7),
      label: format(new Date(year, month, 1), 'MMM'),
      minutes,
    })
  }
  return buckets
}

function computeBestHabitStreak(logs: DailyLog[], dates: string[]): { label: string; days: number } | null {
  const habits = getDailyLogHabitTypes()
  if (habits.length === 0 || dates.length === 0) return null

  const logsByDate = new Map(logs.map((l) => [l.date, l]))
  let best: { label: string; days: number } | null = null

  for (const habit of habits) {
    let current = 0
    let max = 0
    for (const date of dates) {
      const done = logsByDate.get(date)?.habits?.[habit.id] ?? false
      if (done) {
        current++
        max = Math.max(max, current)
      } else {
        current = 0
      }
    }
    if (!best || max > best.days) {
      best = { label: habit.label, days: max }
    }
  }

  return best && best.days > 0 ? best : null
}

function computeWeightEndpoints(logs: DailyLog[], start: string, end: string): {
  weightStart: number | null
  weightEnd: number | null
} {
  const inRange = logsInRange(logs, start, end)
    .filter((l) => l.weight != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (inRange.length === 0) return { weightStart: null, weightEnd: null }
  return {
    weightStart: inRange[0].weight,
    weightEnd: inRange[inRange.length - 1].weight,
  }
}

export function computeOverviewPeriodStats(
  period: OverviewPeriod,
  logs: DailyLog[],
  workouts: Workout[],
  weekStartsOn: 0 | 1,
  asOf = new Date(),
): { range: PeriodRange; previous: PeriodRange | null; stats: OverviewPeriodStats } {
  const range = getPeriodRange(period, weekStartsOn, asOf)
  const previous = getPreviousPeriodRange(period, weekStartsOn, asOf)
  const inRange = logsInRange(logs, range.start, range.end)

  const activeDays = inRange.filter(
    (l) =>
      (l.focus_minutes ?? 0) > 0 ||
      l.sleep_hours != null ||
      l.weight != null ||
      (l.steps ?? 0) > 0 ||
      Object.values(l.habits ?? {}).some(Boolean),
  ).length

  const loggingRate = range.dates.length > 0 ? (activeDays / range.dates.length) * 100 : 0
  const { avg: sleepAvg, days: sleepDays } = computeSleepAvg(logs, range.dates)
  const stepsTotal = inRange.reduce((s, l) => s + (l.steps ?? 0), 0)
  const { stats: workoutStats, totalMinutes: workoutTotalMinutes, previousTotalMinutes: workoutPreviousTotalMinutes } =
    computeWorkoutStats(
      workouts,
      range.start,
      range.end,
      previous?.start,
      previous?.end,
    )
  const workoutTrackingStart = getWorkoutTrackingStartDate(workouts)
  const workoutWeeksInPeriod = countWeeksWithWorkoutTracking(
    range.dates,
    weekStartsOn,
    workoutTrackingStart,
  )
  const workoutPreviousWeeksInPeriod = previous
    ? countWeeksWithWorkoutTracking(previous.dates, weekStartsOn, workoutTrackingStart)
    : 1
  const workoutWeeklyAvgMinutes = workoutTotalMinutes / workoutWeeksInPeriod
  const workoutPreviousWeeklyAvgMinutes =
    workoutPreviousTotalMinutes / workoutPreviousWeeksInPeriod
  const { weightStart, weightEnd } = computeWeightEndpoints(logs, range.start, range.end)

  const habits = computeHabitStats(logs, range.dates)

  const stats: OverviewPeriodStats = {
    focus: computeFocusStats(logs, range, previous),
    habits,
    habitSummary: computeHabitSummary(logs, range.dates, habits),
    sleepAvg,
    sleepDays,
    stepsTotal,
    workoutStats,
    workoutTotalMinutes,
    workoutPreviousTotalMinutes,
    workoutWeeksInPeriod,
    workoutPreviousWeeksInPeriod,
    workoutWeeklyAvgMinutes,
    workoutPreviousWeeklyAvgMinutes,
    activeDays,
    loggingRate,
    weightStart,
    weightEnd,
    bestHabitStreak: period === 'year' ? computeBestHabitStreak(logs, range.dates) : null,
  }

  if (period === 'year') {
    stats.monthlyFocus = computeMonthlyFocusBuckets(logs, asOf.getFullYear())
  }

  return { range, previous, stats }
}

export function formatPeriodComparison(
  pct: number | null,
  previousLabel: string,
  hasCurrent: boolean,
): { text: string; positive: boolean | null } {
  if (!hasCurrent) {
    return { text: 'No data yet', positive: null }
  }
  if (pct == null) {
    return { text: `Up from ${previousLabel.toLowerCase()}`, positive: true }
  }
  if (pct === 0) {
    return { text: `Same as ${previousLabel.toLowerCase()}`, positive: null }
  }
  const rounded = Math.abs(Math.round(pct))
  const positive = pct >= 0
  return {
    text: `${rounded}% ${positive ? 'more' : 'less'} than ${previousLabel.toLowerCase()}`,
    positive,
  }
}

export function formatShortDate(date: string): string {
  return format(parseISO(date), 'MMM d')
}

export function daysInPeriod(range: PeriodRange): number {
  return differenceInCalendarDays(parseISO(range.end), parseISO(range.start)) + 1
}
