import type { Goal, MetricKey } from '@/types'
import type { DailyLog, Workout } from '@/types'
import { goalLogPeriod, hasTarget } from '@/lib/goals'
import {
  getWeightGoalProgress,
  isWeightGoal,
} from '@/lib/weightGoal'
import { getWeeklyLog } from '@/lib/weeklyLogStore'
import { getWeekDates } from '@/lib/utils'

export interface ProgressResult {
  current: number
  target: number | null
  percent: number
  onTrack: boolean
  label: string
  hasTarget: boolean
}

export interface ProgressDelta {
  goal: Goal
  before: number
  after: number
  todayContribution: number
  target: number | null
  percentBefore: number
  percentAfter: number
  isWeekly: boolean
  unit: string
  name: string
  /** Bulk/cut week-over-week direction (weight goals only). */
  weightWeekHit?: boolean
}

export function getMetricValue(
  metricKey: MetricKey,
  log: DailyLog | undefined,
  workouts: Workout[],
  date: string,
): number {
  if (!log && !metricKey.startsWith('workout_') && !metricKey.startsWith('custom:')) return 0

  if (metricKey.startsWith('custom:')) {
    return log?.custom_metrics?.[metricKey] ?? 0
  }

  switch (metricKey) {
    case 'sleep':
      return log?.sleep_hours ?? 0
    case 'weight':
      return log?.weight ?? 0
    case 'steps':
      return log?.steps ?? 0
    case 'screen_time':
      return log?.screen_time_minutes ?? 0
    case 'focus':
      return log?.focus_minutes ?? 0
    default:
      if (metricKey.startsWith('workout_')) {
        const cat = metricKey.replace('workout_', '')
        return workouts
          .filter((w) => w.category === cat && w.date === date)
          .reduce((s, w) => s + w.duration_minutes, 0)
      }
      return 0
  }
}

export function getWeeklyWorkoutTotal(
  category: string,
  workouts: Workout[],
  weekDates: string[],
): number {
  return workouts
    .filter((w) => w.category === category && weekDates.includes(w.date))
    .reduce((s, w) => s + w.duration_minutes, 0)
}

export function getWeeklyFocusTotal(logs: DailyLog[], weekDates: string[]): number {
  return logs
    .filter((l) => weekDates.includes(l.date))
    .reduce((s, l) => s + (l.focus_minutes ?? 0), 0)
}

export function getWeeklyDailyAverage(
  metricKey: MetricKey,
  logs: DailyLog[],
  workouts: Workout[],
  weekDates: string[],
  asOfDate?: string,
): number {
  if (weekDates.length === 0) return 0

  const cutoff = asOfDate ?? weekDates[weekDates.length - 1]
  const daysInWeek = weekDates.filter((date) => date <= cutoff)
  const days = daysInWeek.length > 0 ? daysInWeek : weekDates

  const total = days.reduce((sum, date) => {
    const log = logs.find((l) => l.date === date)
    return sum + getMetricValue(metricKey, log, workouts, date)
  }, 0)

  return total / days.length
}

export function getWeeklyMetricValue(
  metricKey: MetricKey,
  logs: DailyLog[],
  workouts: Workout[],
  weekDates: string[],
  weekKey?: string,
): number {
  const manual = weekKey ? getWeeklyLog(weekKey)[metricKey] : undefined
  if (manual != null) return manual

  if (metricKey.startsWith('workout_')) {
    return getWeeklyWorkoutTotal(metricKey.replace('workout_', ''), workouts, weekDates)
  }
  if (metricKey === 'focus') {
    return getWeeklyFocusTotal(logs, weekDates)
  }
  if (metricKey.startsWith('custom:')) {
    return logs
      .filter((l) => weekDates.includes(l.date))
      .reduce((s, l) => s + (l.custom_metrics?.[metricKey] ?? 0), 0)
  }

  const weekLogs = logs.filter((l) => weekDates.includes(l.date))
  switch (metricKey) {
    case 'sleep': {
      const vals = weekLogs.map((l) => l.sleep_hours).filter((v): v is number => v != null && v > 0)
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    }
    case 'weight': {
      const sorted = weekLogs.filter((l) => l.weight != null).sort((a, b) => b.date.localeCompare(a.date))
      return sorted[0]?.weight ?? 0
    }
    case 'steps':
      return weekLogs.reduce((s, l) => s + (l.steps ?? 0), 0)
    case 'screen_time':
      return weekLogs.reduce((s, l) => s + (l.screen_time_minutes ?? 0), 0)
    default:
      return 0
  }
}

export function calculateProgress(
  goal: Goal,
  log: DailyLog | undefined,
  workouts: Workout[],
  date: string,
  weekDates: string[],
  allLogs: DailyLog[] = [],
  weekKey?: string,
  weekStartsOn?: 0 | 1,
): ProgressResult {
  const period = goalLogPeriod(goal)
  let current: number
  const target = goal.target_value

  if (isWeightGoal(goal) && weekStartsOn != null) {
    const w = getWeightGoalProgress(goal, allLogs, weekDates, weekStartsOn)
    return {
      current: w.thisWeekAvg,
      target: goal.goal_weight_target!,
      percent: w.percentAfter,
      onTrack: w.hit,
      label: w.label,
      hasTarget: true,
    }
  }

  if (period === 'weekly') {
    current = getWeeklyMetricValue(goal.metric_key, allLogs, workouts, weekDates, weekKey)
  } else if (goal.metric_key.startsWith('workout_')) {
    current = getMetricValue(goal.metric_key, log, workouts, date)
  } else {
    current = getMetricValue(goal.metric_key, log, workouts, date)
  }

  if (target == null || target <= 0) {
    return {
      current,
      target: null,
      percent: 0,
      onTrack: true,
      label: `${current} ${goal.unit}`,
      hasTarget: false,
    }
  }

  const percent = (current / target) * 100
  const onTrack =
    period === 'weekly'
      ? percent >= (weekDates.indexOf(date) + 1) * (100 / 7) * 0.7
      : current >= target * 0.8

  return {
    current,
    target,
    percent,
    onTrack,
    label: `${current} / ${target} ${goal.unit}`,
    hasTarget: true,
  }
}

export function calculateProgressDeltas(
  goals: Goal[],
  logBefore: DailyLog | undefined,
  logAfter: DailyLog,
  workoutsBefore: Workout[],
  workoutsAfter: Workout[],
  date: string,
  allLogsBefore: DailyLog[],
  allLogsAfter: DailyLog[],
  weekStartsOn: 0 | 1 = 1,
): ProgressDelta[] {
  const weekDates = getWeekDates(new Date(date + 'T12:00:00'), weekStartsOn)

  return goals.filter(hasTarget).map((goal) => {
      if (isWeightGoal(goal)) {
        const beforeW = getWeightGoalProgress(goal, allLogsBefore, weekDates, weekStartsOn)
        const afterW = getWeightGoalProgress(goal, allLogsAfter, weekDates, weekStartsOn)
        return {
          goal,
          before: beforeW.thisWeekAvg,
          after: afterW.thisWeekAvg,
          todayContribution: Math.abs(afterW.thisWeekAvg - beforeW.thisWeekAvg),
          target: goal.goal_weight_target,
          percentBefore: beforeW.percentAfter,
          percentAfter: afterW.percentAfter,
          isWeekly: true,
          unit: goal.unit,
          name: goal.name,
          weightWeekHit: afterW.hit,
        }
      }

      const beforeProg = calculateProgress(goal, logBefore, workoutsBefore, date, weekDates, allLogsBefore, undefined, weekStartsOn)
      const afterProg = calculateProgress(goal, logAfter, workoutsAfter, date, weekDates, allLogsAfter, undefined, weekStartsOn)

      let todayContribution = afterProg.current - beforeProg.current
      if (goalLogPeriod(goal) === 'daily') {
        todayContribution =
          getMetricValue(goal.metric_key, logAfter, workoutsAfter, date) -
          getMetricValue(goal.metric_key, logBefore, workoutsBefore, date)
      }

      return {
        goal,
        before: beforeProg.current,
        after: afterProg.current,
        todayContribution: Math.max(0, todayContribution),
        target: afterProg.target,
        percentBefore: beforeProg.percent,
        percentAfter: afterProg.percent,
        isWeekly: goalLogPeriod(goal) === 'weekly',
        unit: goal.unit,
        name: goal.name,
      }
    })
}

export function aggregateWeeklyWorkouts(
  workouts: Workout[],
  startDate: string,
  endDate: string,
): { date: string; [category: string]: number | string }[] {
  const result: Record<string, Record<string, number>> = {}

  for (const w of workouts) {
    if (w.date < startDate || w.date > endDate) continue
    if (!result[w.date]) result[w.date] = {}
    result[w.date][w.category] = (result[w.date][w.category] ?? 0) + w.duration_minutes
  }

  return Object.entries(result)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }))
}

export function getWeekDatesForDate(date: Date): string[] {
  return getWeekDates(date)
}
