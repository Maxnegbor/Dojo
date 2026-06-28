import { addDays, parseISO } from 'date-fns'
import type { AppSettings } from '@/types'
import type { DailyLog, Goal, MetricKey, Workout } from '@/types'
import {
  BUILTIN_METRICS,
  getActiveGoals,
  getGoalsWithoutTarget,
  goalLogPeriod,
  hasTarget,
} from '@/lib/goals'
import { calculateProgress, getWeeklyDailyAverage, getWeeklyMetricValue } from '@/lib/metrics'
import { getWeeklyLogHabitTypes, habitWeeklyLogKey } from '@/lib/habitTypes'
import { formatWeightStepper } from '@/lib/settingsStore'
import {
  formatWeightGoalRange,
  getWeightGoalProgress,
  isWeightGoal,
  weightGoalMode,
} from '@/lib/weightGoal'
import { getWeeklyLog } from '@/lib/weeklyLogStore'
import { getWeekDates } from '@/lib/utils'

const STORAGE_KEY = 'personal-os-weekly-shutdown-completed'

export interface WeeklyShutdownCheckItem {
  id: string
  label: string
}

export interface WeeklyShutdownCheckGroup {
  id: string
  label: string
  items: WeeklyShutdownCheckItem[]
}

export const WEEKLY_SHUTDOWN_CHECKLIST: WeeklyShutdownCheckGroup[] = [
  {
    id: 'macrofactor',
    label: 'Macrofactor',
    items: [
      { id: 'meals', label: 'Check if all meals logged' },
      { id: 'surplus', label: 'Check surplus' },
      { id: 'checkin', label: 'Check-in' },
    ],
  },
  {
    id: 'macrofactor_workouts',
    label: 'Macrofactor Workouts',
    items: [{ id: 'progression', label: 'Check main exercise progression' }],
  },
]

export interface WeeklyShutdownGoalSummary {
  id: string
  name: string
  unit: string
  current: number
  target: number
  percent: number
  percentBefore?: number
  hit: boolean
  kind: 'weekly' | 'daily'
  detail: string
  isWorkout?: boolean
  isWeight?: boolean
  weightMode?: 'bulk' | 'cut'
  weightLabel?: string
}

export interface WeeklyReviewStat {
  id: string
  label: string
  value: string
  detail: string
}

export function isWeeklyShutdownDay(date: Date): boolean {
  return date.getDay() === 0
}

export function getWeeklyShutdownWeekDates(today: Date, weekStartsOn: 0 | 1): string[] {
  if (!isWeeklyShutdownDay(today)) return []
  if (weekStartsOn === 1) return getWeekDates(today, weekStartsOn)
  return getWeekDates(addDays(today, -1), weekStartsOn)
}

export function getWeeklyReviewWeekDates(today: Date, weekStartsOn: 0 | 1): string[] {
  const shutdownWeek = getWeeklyShutdownWeekDates(today, weekStartsOn)
  if (shutdownWeek.length > 0) return shutdownWeek
  return getWeekDates(today, weekStartsOn)
}

export function getWeeklyShutdownWeekKey(weekDates: string[]): string {
  return weekDates[0] ?? ''
}

function readCompletedWeeks(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as string[]
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    /* ignore */
  }
  return []
}

export function isWeeklyShutdownCompleted(weekKey: string): boolean {
  if (!weekKey) return false
  return readCompletedWeeks().includes(weekKey)
}

export function markWeeklyShutdownCompleted(weekKey: string) {
  if (!weekKey) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set([...readCompletedWeeks(), weekKey])]))
}

function formatNum(n: number, decimals = 1): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(decimals)
}

function dayInWeek(weekDates: string[], weekday: number): string | undefined {
  return weekDates.find((d) => parseISO(d).getDay() === weekday)
}


function logForDate(logs: DailyLog[], date: string): DailyLog | undefined {
  return logs.find((l) => l.date === date)
}

function buildWorkoutGoalSummary(
  goal: Goal,
  logs: DailyLog[],
  workouts: Workout[],
  weekDates: string[],
  weekKey: string,
): WeeklyShutdownGoalSummary {
  const weeklyTotal = getWeeklyMetricValue(goal.metric_key, logs, workouts, weekDates, weekKey)
  const target = goal.target_value ?? 0
  const weeklyTarget = goalLogPeriod(goal) === 'weekly'

  if (weeklyTarget) {
    const percent = target > 0 ? (weeklyTotal / target) * 100 : 0
    return {
      id: goal.id,
      name: goal.name,
      unit: 'min',
      current: weeklyTotal,
      target,
      percent,
      hit: percent >= 100,
      kind: 'weekly',
      isWorkout: true,
      detail: `${formatNum(weeklyTotal)} / ${formatNum(target)} min this week`,
    }
  }

  const avg = getWeeklyDailyAverage(goal.metric_key, logs, workouts, weekDates, weekDates[weekDates.length - 1])
  const percent = target > 0 ? (avg / target) * 100 : 0

  return {
    id: goal.id,
    name: goal.name,
    unit: 'min',
    current: avg,
    target,
    percent,
    hit: percent >= 100,
    kind: 'daily',
    isWorkout: true,
    detail: `Week avg: ${formatNum(avg)} / ${formatNum(target)} min · ${formatNum(weeklyTotal)} min total`,
  }
}

/** Goals with targets — animated progress cards. */
export function buildWeeklyShutdownSummaries(
  goals: Goal[],
  logs: DailyLog[],
  workouts: Workout[],
  weekDates: string[],
  weightUnit: AppSettings['weightUnit'] = 'kg',
  weekStartsOn: 0 | 1 = 1,
): WeeklyShutdownGoalSummary[] {
  if (weekDates.length === 0) return []

  const weekKey = getWeeklyShutdownWeekKey(weekDates)
  const lastDate = weekDates[weekDates.length - 1]
  const lastLog = logs.find((l) => l.date === lastDate)
  const targeted = getActiveGoals(goals).filter(hasTarget)
  const workoutGoals = targeted.filter((g) => g.metric_key.startsWith('workout_'))
  const metricGoals = targeted.filter((g) => !g.metric_key.startsWith('workout_'))
  const weightGoals = metricGoals.filter(isWeightGoal)
  const nonWeightMetrics = metricGoals.filter((g) => !isWeightGoal(g))

  const weeklyGoals = nonWeightMetrics.filter((g) => goalLogPeriod(g) === 'weekly')
  const dailyGoals = nonWeightMetrics.filter((g) => goalLogPeriod(g) === 'daily')

  const weeklySummaries: WeeklyShutdownGoalSummary[] = weeklyGoals.map((goal) => {
    const progress = calculateProgress(goal, lastLog, workouts, lastDate, weekDates, logs, weekKey)
    const percent = progress.target && progress.target > 0 ? progress.percent : 0
    return {
      id: goal.id,
      name: goal.name,
      unit: goal.unit,
      current: progress.current,
      target: progress.target ?? 0,
      percent,
      hit: percent >= 100,
      kind: 'weekly',
      detail: `${formatNum(progress.current)} / ${formatNum(progress.target ?? 0)} ${goal.unit} this week`,
    }
  })

  const dailySummaries: WeeklyShutdownGoalSummary[] = dailyGoals.map((goal) => {
    const avg = getWeeklyDailyAverage(
      goal.metric_key,
      logs,
      workouts,
      weekDates,
      lastDate,
    )
    const target = goal.target_value ?? 0
    const percent = target > 0 ? (avg / target) * 100 : 0

    return {
      id: goal.id,
      name: goal.name,
      unit: goal.unit,
      current: avg,
      target,
      percent,
      hit: percent >= 100,
      kind: 'daily',
      detail: `Week avg: ${formatNum(avg)} / ${formatNum(target)} ${goal.unit}`,
    }
  })

  const weightSummaries: WeeklyShutdownGoalSummary[] = weightGoals.map((goal) => {
    const start = goal.goal_weight_start!
    const target = goal.goal_weight_target!
    const unit = goal.unit || weightUnit
    const progress = getWeightGoalProgress(goal, logs, weekDates, weekStartsOn)
    const mode = weightGoalMode(goal)

    return {
      id: goal.id,
      name: goal.name,
      unit,
      current: progress.thisWeekAvg,
      target,
      percent: progress.percentAfter,
      percentBefore: progress.percentBefore,
      hit: progress.hit,
      kind: 'weekly',
      isWeight: true,
      weightMode: mode,
      weightLabel: progress.label,
      detail: `${progress.detail} · ${formatWeightGoalRange(start, target, unit as AppSettings['weightUnit'])} ${mode}`,
    }
  })

  const workoutSummaries = workoutGoals.map((goal) =>
    buildWorkoutGoalSummary(goal, logs, workouts, weekDates, weekKey),
  )

  return [...weeklySummaries, ...weightSummaries, ...workoutSummaries, ...dailySummaries]
}

function formatWeeklyReviewValue(metricKey: string, value: number, unit: string): string {
  if (metricKey === 'steps') return Math.round(value).toLocaleString()
  if (metricKey === 'sleep') return `${formatNum(value, 1)} hrs`
  if (metricKey === 'screen_time' || metricKey === 'focus' || metricKey.startsWith('workout_')) {
    return `${Math.round(value)} ${unit === 'min/wk' ? 'min' : unit}`
  }
  if (metricKey === 'weight') return `${formatNum(value, 1)} ${unit}`
  return `${formatNum(value)} ${unit}`
}

function reviewStatValue(
  metricKey: string,
  logs: DailyLog[],
  workouts: Workout[],
  weekDates: string[],
  weekKey: string,
  weeklyLogged: boolean,
): number {
  if (weeklyLogged) {
    return getWeeklyMetricValue(metricKey as MetricKey, logs, workouts, weekDates, weekKey)
  }
  if (metricKey === 'weight') {
    return getWeeklyMetricValue('weight', logs, workouts, weekDates, weekKey)
  }
  return getWeeklyDailyAverage(metricKey as MetricKey, logs, workouts, weekDates)
}

/** Track-only goals + auto-tracked metrics without goals — shown at end of review. */
export function buildWeeklyUntargetedStats(
  goals: Goal[],
  logs: DailyLog[],
  workouts: Workout[],
  weekDates: string[],
  weightUnit: AppSettings['weightUnit'] = 'kg',
): WeeklyReviewStat[] {
  if (weekDates.length === 0) return []

  const weekKey = getWeeklyShutdownWeekKey(weekDates)
  const active = getActiveGoals(goals)
  const stats: WeeklyReviewStat[] = []

  for (const goal of getGoalsWithoutTarget(active)) {
    const weeklyLogged = goalLogPeriod(goal) === 'weekly'
    const value = reviewStatValue(
      goal.metric_key,
      logs,
      workouts,
      weekDates,
      weekKey,
      weeklyLogged,
    )
    if (value <= 0 && goal.metric_key !== 'weight') continue
    stats.push({
      id: goal.id,
      label: goal.name,
      value: formatWeeklyReviewValue(goal.metric_key, value, goal.unit),
      detail: weeklyLogged
        ? 'Logged weekly · no target'
        : goal.metric_key === 'weight'
          ? 'Latest this week · no target'
          : 'Week avg · no target',
    })
  }

  const coveredKeys = new Set(active.map((g) => g.metric_key))

  for (const builtin of BUILTIN_METRICS) {
    if (coveredKeys.has(builtin.key)) continue
    const value = reviewStatValue(
      builtin.key,
      logs,
      workouts,
      weekDates,
      weekKey,
      false,
    )
    if (value <= 0) continue
    stats.push({
      id: `__${builtin.key}__`,
      label: builtin.label,
      value: formatWeeklyReviewValue(builtin.key, value, builtin.unit),
      detail:
        builtin.key === 'weight' ? 'Latest this week' : 'Week avg · no goal set',
    })
  }

  if (!coveredKeys.has('weight')) {
    const mondayDate = dayInWeek(weekDates, 1) ?? weekDates[0]
    const sundayDate = dayInWeek(weekDates, 0) ?? weekDates[weekDates.length - 1]
    const monWeight = logForDate(logs, mondayDate)?.weight ?? null
    const sunWeight = logForDate(logs, sundayDate)?.weight ?? null
    if (monWeight != null && sunWeight != null) {
      const deltaKg = sunWeight - monWeight
      const deltaDisplay = formatWeightStepper(Math.abs(deltaKg), weightUnit)
      const sign = deltaKg < 0 ? '−' : deltaKg > 0 ? '+' : ''
      stats.push({
        id: '__weight__',
        label: 'Weight',
        value: deltaKg === 0 ? 'No change' : `${sign}${deltaDisplay} ${weightUnit}`,
        detail: `Mon ${formatWeightStepper(monWeight, weightUnit)} → Sun ${formatWeightStepper(sunWeight, weightUnit)} ${weightUnit}`,
      })
    }
  }

  const weeklyLog = getWeeklyLog(weekKey)
  for (const habit of getWeeklyLogHabitTypes()) {
    const key = habitWeeklyLogKey(habit.id)
    if (!(key in weeklyLog)) continue
    const done = weeklyLog[key] === 1
    stats.push({
      id: `__habit_${habit.id}__`,
      label: habit.label,
      value: done ? 'Done' : 'Not done',
      detail: 'Logged at weekly review',
    })
  }

  return stats
}

export function weekDateRangeLabel(weekDates: string[]): string {
  if (weekDates.length === 0) return ''
  const start = parseISO(weekDates[0])
  const end = parseISO(weekDates[weekDates.length - 1])
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: start.getFullYear() !== end.getFullYear() ? 'numeric' : undefined,
  })
  return `${startLabel} – ${endLabel}`
}
