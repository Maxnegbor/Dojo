import type { Goal, MetricKey } from '@/types'
import type { DailyLog, Workout } from '@/types'
import { hasTarget, goalLogPeriod } from '@/lib/goals'
import {
  getCustomPeriodRange,
  goalTargetPeriod,
  isCustomTargetPeriod,
} from '@/lib/goalPeriod'
import { getWeeklyShutdownWeekKey } from '@/lib/weeklyShutdown'
import {
  getWeightGoalProgress,
  isWeightGoal,
} from '@/lib/weightGoal'
import { getWeeklyLog } from '@/lib/weeklyLogStore'
import { getWeekDates } from '@/lib/utils'
import { formatMetricAmount, usesTimedMetricDisplay } from '@/lib/timedMetrics'
import {
  getSleepMetricDefinition,
  getSleepMetricValue,
  getSleepMetricsConfig,
  sleepMetricIdFromLibraryKey,
} from '@/lib/sleepMetrics'

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
  /** Daily-logged goals tracked by week-to-date average in shutdown. */
  usesWeekAverage?: boolean
  /** Today's logged value (for daily-average goals like sleep). */
  todayValue?: number
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

  const sleepId = sleepMetricIdFromLibraryKey(metricKey)
  if (sleepId) {
    const metric = getSleepMetricDefinition(getSleepMetricsConfig(), sleepId)
    if (!metric) return 0
    return getSleepMetricValue(log, metric) ?? 0
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
        const day = date.slice(0, 10)
        return workouts
          .filter((w) => {
            const wDay = (w.date ?? '').slice(0, 10)
            return wDay === day && (w.category === cat || w.category === metricKey)
          })
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

/** Week-to-date average for daily-logged metrics (only days with a logged value). */
export function getWeekToDateDailyAverage(
  metricKey: MetricKey,
  logs: DailyLog[],
  workouts: Workout[],
  weekDates: string[],
  asOfDate: string,
): number {
  const days = weekDates.filter((date) => date <= asOfDate)
  const values = days
    .map((date) => {
      const log = logs.find((entry) => entry.date === date)
      return getMetricValue(metricKey, log, workouts, date)
    })
    .filter((value) => value > 0)

  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function isDailyLoggedAverageMetric(goal: Goal): boolean {
  if (isWeightGoal(goal)) return false
  if (isCustomTargetPeriod(goal)) return false
  if (goalTargetPeriod(goal) !== 'daily') return false
  if (goalLogPeriod(goal) !== 'daily') return false
  return true
}

function withLogForDate(logs: DailyLog[], log: DailyLog | undefined, date: string): DailyLog[] {
  if (!log || log.date !== date) return logs
  return [...logs.filter((entry) => entry.date !== date), log]
}

/** Weekly workout goal progress for a single calendar week (overview grid). */
export function getWorkoutGoalWeekProgress(
  goal: Goal,
  logs: DailyLog[],
  workouts: Workout[],
  weekDates: string[],
  weekKey: string,
): { current: number; percent: number; target: number | null } {
  const weeklyTotal = getWeeklyMetricValue(goal.metric_key, logs, workouts, weekDates, weekKey)
  const target = goal.target_value

  if (target == null || target <= 0) {
    return { current: weeklyTotal, percent: 0, target: null }
  }

  return {
    current: weeklyTotal,
    percent: (weeklyTotal / target) * 100,
    target,
  }
}

export function getWeeklyMetricValue(
  metricKey: MetricKey,
  logs: DailyLog[],
  workouts: Workout[],
  weekDates: string[],
  weekKey?: string,
): number {
  if (metricKey.startsWith('workout_')) {
    const fromSessions = getWeeklyWorkoutTotal(
      metricKey.replace('workout_', ''),
      workouts,
      weekDates,
    )
    if (fromSessions > 0) return fromSessions
    const manual = weekKey ? getWeeklyLog(weekKey)[metricKey] : undefined
    return manual ?? 0
  }

  const manual = weekKey ? getWeeklyLog(weekKey)[metricKey] : undefined
  if (manual != null) return manual
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

function getMetricValueInRange(
  metricKey: MetricKey,
  logs: DailyLog[],
  workouts: Workout[],
  startDate: string,
  endDate: string,
): number {
  const dates = logs
    .map((l) => l.date)
    .filter((d) => d >= startDate && d <= endDate)
    .sort()

  if (metricKey.startsWith('workout_')) {
    const cat = metricKey.replace('workout_', '')
    return workouts
      .filter((w) => w.category === cat && w.date >= startDate && w.date <= endDate)
      .reduce((s, w) => s + w.duration_minutes, 0)
  }

  if (metricKey.startsWith('custom:')) {
    return logs
      .filter((l) => l.date >= startDate && l.date <= endDate)
      .reduce((s, l) => s + (l.custom_metrics?.[metricKey] ?? 0), 0)
  }

  if (metricKey === 'focus') {
    return logs
      .filter((l) => l.date >= startDate && l.date <= endDate)
      .reduce((s, l) => s + (l.focus_minutes ?? 0), 0)
  }

  if (metricKey === 'steps' || metricKey === 'screen_time') {
    return dates.reduce((sum, date) => {
      const log = logs.find((l) => l.date === date)
      if (metricKey === 'steps') return sum + (log?.steps ?? 0)
      return sum + (log?.screen_time_minutes ?? 0)
    }, 0)
  }

  if (metricKey === 'sleep') {
    const vals = logs
      .filter((l) => l.date >= startDate && l.date <= endDate)
      .map((l) => l.sleep_hours)
      .filter((v): v is number => v != null && v > 0)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }

  return dates.reduce((sum, date) => {
    const log = logs.find((l) => l.date === date)
    return sum + getMetricValue(metricKey, log, workouts, date)
  }, 0)
}

function sumWeeklyLogsInRange(
  metricKey: string,
  start: string,
  end: string,
  weekStartsOn: 0 | 1,
): number {
  let total = 0
  const seen = new Set<string>()
  let cursor = new Date(start + 'T12:00:00')
  const endDate = new Date(end + 'T12:00:00')

  while (cursor <= endDate) {
    const weekDates = getWeekDates(cursor, weekStartsOn)
    const weekKey = getWeeklyShutdownWeekKey(weekDates)
    if (!seen.has(weekKey)) {
      seen.add(weekKey)
      const manual = getWeeklyLog(weekKey)[metricKey]
      if (manual != null) total += manual
    }
    cursor.setDate(cursor.getDate() + 7)
  }

  return total
}

export function getCustomPeriodMetricValue(
  goal: Goal,
  logs: DailyLog[],
  workouts: Workout[],
  asOfDate: string,
  weekStartsOn: 0 | 1 = 1,
): number {
  const range = getCustomPeriodRange(goal, asOfDate)
  if (!range) return 0

  if (goalLogPeriod(goal) === 'weekly' && goal.metric_key.startsWith('custom:')) {
    return sumWeeklyLogsInRange(goal.metric_key, range.start, range.end, weekStartsOn)
  }

  return getMetricValueInRange(goal.metric_key, logs, workouts, range.start, range.end)
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
  const targetPeriod = goalTargetPeriod(goal)
  const logPeriod = goalLogPeriod(goal)
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

  if (
    goal.metric_key.startsWith('workout_') &&
    weekKey != null &&
    weekDates.length > 0
  ) {
    current = getWeeklyMetricValue(goal.metric_key, allLogs, workouts, weekDates, weekKey)
  } else if (isCustomTargetPeriod(goal)) {
    current = getCustomPeriodMetricValue(
      goal,
      allLogs,
      workouts,
      date,
      weekStartsOn ?? 1,
    )
  } else if (targetPeriod === 'weekly') {
    current = getWeeklyMetricValue(goal.metric_key, allLogs, workouts, weekDates, weekKey)
  } else if (logPeriod === 'weekly') {
    const weekTotal = getWeeklyMetricValue(goal.metric_key, allLogs, workouts, weekDates, weekKey)
    const dayIndex = Math.max(1, weekDates.indexOf(date) + 1)
    current = weekTotal / dayIndex
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
      label: usesTimedMetricDisplay(goal.unit, goal.metric_key)
        ? formatMetricAmount(current, goal.unit, goal.metric_key)
        : `${current} ${goal.unit}`,
      hasTarget: false,
    }
  }

  const percent = (current / target) * 100
  let onTrack: boolean
  if (isCustomTargetPeriod(goal)) {
    const range = getCustomPeriodRange(goal, date)
    const pace = range && range.totalDays > 0
      ? (range.elapsedDays / range.totalDays) * 100 * 0.7
      : 70
    onTrack = percent >= pace
  } else if (targetPeriod === 'weekly') {
    onTrack = percent >= (weekDates.indexOf(date) + 1) * (100 / 7) * 0.7
  } else {
    onTrack = current >= target * 0.8
  }

  return {
    current,
    target,
    percent,
    onTrack,
    label: usesTimedMetricDisplay(goal.unit, goal.metric_key)
      ? `${formatMetricAmount(current, goal.unit, goal.metric_key)} / ${formatMetricAmount(target, goal.unit, goal.metric_key)}`
      : `${current} / ${target} ${goal.unit}`,
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

      if (isDailyLoggedAverageMetric(goal)) {
        const logsBefore = withLogForDate(allLogsBefore, logBefore, date)
        const logsAfter = withLogForDate(allLogsAfter, logAfter, date)
        const avgBefore = getWeekToDateDailyAverage(
          goal.metric_key,
          logsBefore,
          workoutsBefore,
          weekDates,
          date,
        )
        const avgAfter = getWeekToDateDailyAverage(
          goal.metric_key,
          logsAfter,
          workoutsAfter,
          weekDates,
          date,
        )
        const target = goal.target_value
        const percentBefore = target != null && target > 0 ? (avgBefore / target) * 100 : 0
        const percentAfter = target != null && target > 0 ? (avgAfter / target) * 100 : 0

        return {
          goal,
          before: avgBefore,
          after: avgAfter,
          todayContribution: avgAfter - avgBefore,
          target,
          percentBefore,
          percentAfter,
          isWeekly: false,
          usesWeekAverage: true,
          todayValue: getMetricValue(goal.metric_key, logAfter, workoutsAfter, date),
          unit: goal.unit,
          name: goal.name,
        }
      }

      const beforeProg = calculateProgress(goal, logBefore, workoutsBefore, date, weekDates, allLogsBefore, undefined, weekStartsOn)
      const afterProg = calculateProgress(goal, logAfter, workoutsAfter, date, weekDates, allLogsAfter, undefined, weekStartsOn)

      let todayContribution = afterProg.current - beforeProg.current
      if (goalTargetPeriod(goal) === 'daily') {
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
        isWeekly: goalTargetPeriod(goal) !== 'daily',
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
