import { addDays, parseISO } from 'date-fns'
import type { DailyLog, Goal, Workout } from '@/types'
import { getActiveGoals, goalLogPeriod } from '@/lib/goals'
import { getHabitCompletionRate } from '@/lib/habitStreaks'
import { getDailyLogHabitTypes, getWeeklyLogHabitTypes, habitWeeklyLogKey } from '@/lib/habitTypes'
import { getWeeklyLog } from '@/lib/weeklyLogStore'
import { getWeeklyMetricValue } from '@/lib/metrics'
import { formatDate, getWeekDates } from '@/lib/utils'

const BASELINE_DAYS = 30

export interface OverviewMetric {
  id: string
  label: string
  value: number
  /** Pre-formatted display; falls back to value + unit. */
  displayValue?: string
  unit: string
  pctVsBaseline: number | null
  isPositive: boolean
  /** When false, lower values are better (e.g. screen time). */
  higherIsBetter?: boolean
}

function logsInRange(logs: DailyLog[], start: string, end: string): DailyLog[] {
  return logs.filter((l) => l.date >= start && l.date <= end)
}

function sumLogFieldInRange(
  logs: DailyLog[],
  start: string,
  end: string,
  field: keyof Pick<DailyLog, 'steps' | 'screen_time_minutes' | 'focus_minutes'>,
): number {
  return logsInRange(logs, start, end).reduce((s, l) => s + (l[field] ?? 0), 0)
}

function avgSleepInRange(logs: DailyLog[], dates: string[]): number {
  const inRange = logs.filter((l) => dates.includes(l.date) && l.sleep_hours != null)
  if (inRange.length === 0) return 0
  return inRange.reduce((s, l) => s + (l.sleep_hours ?? 0), 0) / inRange.length
}

function avgCustomDailyInRange(
  logs: DailyLog[],
  metricKey: string,
  dates: string[],
): number {
  const inRange = logs.filter(
    (l) => dates.includes(l.date) && l.custom_metrics?.[metricKey] != null,
  )
  if (inRange.length === 0) return 0
  return inRange.reduce((s, l) => s + (l.custom_metrics?.[metricKey] ?? 0), 0) / inRange.length
}

function sumCustomInRange(
  logs: DailyLog[],
  metricKey: string,
  start: string,
  end: string,
): number {
  return logsInRange(logs, start, end).reduce(
    (s, l) => s + (l.custom_metrics?.[metricKey] ?? 0),
    0,
  )
}

function weeklyEquivalent(total: number, days: number): number {
  if (days <= 0) return 0
  return (total / days) * 7
}

function pctChange(current: number, baseline: number): number | null {
  if (baseline <= 0) {
    if (current <= 0) return 0
    return null
  }
  return ((current - baseline) / baseline) * 100
}

function makeMetric(
  id: string,
  label: string,
  value: number,
  unit: string,
  pct: number | null,
  higherIsBetter = true,
  displayValue?: string,
): OverviewMetric {
  const isPositive =
    higherIsBetter
      ? pct == null
        ? value > 0
        : pct >= 0
      : pct == null
        ? value <= 0
        : pct <= 0

  return {
    id,
    label,
    value,
    displayValue,
    unit,
    pctVsBaseline: pct,
    isPositive,
    higherIsBetter,
  }
}

function baselineDates(start: string, end: string): string[] {
  const dates: string[] = []
  let cursor = parseISO(start)
  const endDate = parseISO(end)
  while (cursor <= endDate) {
    dates.push(formatDate(cursor))
    cursor = addDays(cursor, 1)
  }
  return dates
}

function metricHigherIsBetter(metricKey: string): boolean {
  return metricKey !== 'screen_time'
}

function goalThisWeekValue(
  goal: Goal,
  logs: DailyLog[],
  workouts: Workout[],
  weekDates: string[],
  weekKey: string,
): number {
  return getWeeklyMetricValue(goal.metric_key, logs, workouts, weekDates, weekKey)
}

function goalBaselineValue(
  goal: Goal,
  logs: DailyLog[],
  workouts: Workout[],
  baselineDayList: string[],
  baselineStart: string,
  baselineEnd: string,
): number {
  const period = goalLogPeriod(goal)

  if (goal.metric_key.startsWith('custom:')) {
    if (period === 'weekly') {
      return weeklyEquivalent(
        sumCustomInRange(logs, goal.metric_key, baselineStart, baselineEnd),
        BASELINE_DAYS,
      )
    }
    return avgCustomDailyInRange(logs, goal.metric_key, baselineDayList)
  }

  if (goal.metric_key.startsWith('workout_') || period === 'weekly') {
    return weeklyEquivalent(
      getWeeklyMetricValue(goal.metric_key, logs, workouts, baselineDayList),
      BASELINE_DAYS,
    )
  }

  switch (goal.metric_key) {
    case 'sleep':
      return avgSleepInRange(logs, baselineDayList)
    case 'steps':
      return weeklyEquivalent(
        sumLogFieldInRange(logs, baselineStart, baselineEnd, 'steps'),
        BASELINE_DAYS,
      )
    case 'screen_time':
      return weeklyEquivalent(
        sumLogFieldInRange(logs, baselineStart, baselineEnd, 'screen_time_minutes'),
        BASELINE_DAYS,
      )
    case 'focus':
      return weeklyEquivalent(
        sumLogFieldInRange(logs, baselineStart, baselineEnd, 'focus_minutes'),
        BASELINE_DAYS,
      )
    case 'weight': {
      const sorted = logs
        .filter((l) => baselineDayList.includes(l.date) && l.weight != null)
        .sort((a, b) => b.date.localeCompare(a.date))
      return sorted[0]?.weight ?? 0
    }
    default:
      return 0
  }
}

function formatGoalDisplay(goal: Goal, value: number): string | undefined {
  if (value <= 0 && goal.metric_key !== 'weight') return '0'
  if (goal.metric_key === 'sleep') return value > 0 ? value.toFixed(1) : '0'
  if (goal.metric_key === 'steps') return Math.round(value).toLocaleString()
  if (goal.metric_key === 'weight') return value > 0 ? value.toFixed(1) : '—'
  if (goal.metric_key.startsWith('workout_') || goal.metric_key === 'focus') {
    return String(Math.round(value))
  }
  return undefined
}

export function buildOverviewMetrics(
  logs: DailyLog[],
  workouts: Workout[],
  weekStartsOn: 0 | 1,
  goals: Goal[] = [],
): OverviewMetric[] {
  const weekDates = getWeekDates(new Date(), weekStartsOn)
  const weekKey = weekDates[0]
  const weekStart = weekDates[0]
  const baselineEnd = formatDate(addDays(parseISO(weekStart), -1))
  const baselineStart = formatDate(addDays(parseISO(baselineEnd), -(BASELINE_DAYS - 1)))
  const baselineDayList = baselineDates(baselineStart, baselineEnd)

  const metrics: OverviewMetric[] = []

  for (const goal of getActiveGoals(goals)) {
    const thisWeek = goalThisWeekValue(goal, logs, workouts, weekDates, weekKey)
    const baseline = goalBaselineValue(goal, logs, workouts, baselineDayList, baselineStart, baselineEnd)
    const higherIsBetter = metricHigherIsBetter(goal.metric_key)
    const unit =
      goalLogPeriod(goal) === 'weekly' && !goal.unit.includes('/')
        ? goal.unit
        : goal.metric_key === 'sleep'
          ? 'hrs/night'
          : goal.unit

    metrics.push(
      makeMetric(
        goal.id,
        goal.name,
        thisWeek,
        unit,
        pctChange(thisWeek, baseline),
        higherIsBetter,
        formatGoalDisplay(goal, thisWeek),
      ),
    )
  }

  for (const habit of getDailyLogHabitTypes()) {
    const rateThisWeek = getHabitCompletionRate(logs, habit.id, weekDates)
    const rateBaseline = getHabitCompletionRate(logs, habit.id, baselineDayList)
    metrics.push(
      makeMetric(
        `habit_${habit.id}`,
        habit.label,
        rateThisWeek,
        '%',
        pctChange(rateThisWeek, rateBaseline),
        true,
        `${Math.round(rateThisWeek)}`,
      ),
    )
  }

  const weeklyLog = getWeeklyLog(weekKey)
  for (const habit of getWeeklyLogHabitTypes()) {
    const done = weeklyLog[habitWeeklyLogKey(habit.id)] === 1
    metrics.push(
      makeMetric(
        `habit_${habit.id}`,
        habit.label,
        done ? 100 : 0,
        '%',
        null,
        true,
        done ? 'Done' : 'Not yet',
      ),
    )
  }

  return metrics
}

export function overviewDataRange(weekStartsOn: 0 | 1): { start: string; end: string } {
  const weekDates = getWeekDates(new Date(), weekStartsOn)
  const weekStart = weekDates[0]
  const baselineEnd = formatDate(addDays(parseISO(weekStart), -1))
  const baselineStart = formatDate(addDays(parseISO(baselineEnd), -(BASELINE_DAYS - 1)))
  return { start: baselineStart, end: weekDates[6] }
}
