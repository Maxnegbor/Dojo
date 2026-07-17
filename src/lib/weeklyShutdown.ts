import { addDays, parseISO } from 'date-fns'
import type { AppSettings } from '@/types'
import type { DailyLog, Goal, MetricKey, Workout, WeeklyShutdownCheckGroup } from '@/types'
import { normalizeHabits } from '@/types'
import {
  BUILTIN_METRICS,
  getActiveGoals,
  getGoalsWithoutTarget,
  goalLogPeriod,
  hasTarget,
} from '@/lib/goals'
import {
  getGoalTimeHorizon,
  isCustomTargetPeriod,
  isGoalLongerThanWeek,
} from '@/lib/goalPeriod'
import {
  calculateProgress,
  getCustomPeriodMetricValue,
  getWeeklyDailyAverage,
  getWeeklyMetricValue,
} from '@/lib/metrics'
import { getWeeklyLogHabitTypes, getDailyLogHabitTypes, habitWeeklyLogKey } from '@/lib/habitTypes'
import { formatWeightStepper } from '@/lib/settingsStore'
import {
  formatWeightGoalRange,
  getWeightGoalProgress,
  isWeightGoal,
  weightGoalMode,
} from '@/lib/weightGoal'
import { getWeeklyLog } from '@/lib/weeklyLogStore'
import { goalProgressPeriodLabel } from '@/lib/goalLabels'
import { getPreviousWeekDates } from '@/lib/weightGoal'
import { getWeekDates, generateId } from '@/lib/utils'
import { formatMetricAmount, usesTimedMetricDisplay } from '@/lib/timedMetrics'

import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-weekly-shutdown-completed'

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

export const DEFAULT_WEEKLY_SHUTDOWN_CHECKLIST: WeeklyShutdownCheckGroup[] = WEEKLY_SHUTDOWN_CHECKLIST

export function normalizeWeeklyShutdownChecklist(
  checklist: WeeklyShutdownCheckGroup[] | undefined,
): WeeklyShutdownCheckGroup[] {
  if (!checklist || !Array.isArray(checklist) || checklist.length === 0) {
    return []
  }
  return checklist
    .filter((group) => group && typeof group.label === 'string')
    .map((group) => ({
      id: group.id || generateId(),
      label: group.label.trim() || 'Section',
      items: (group.items ?? [])
        .filter((item) => item && typeof item.label === 'string' && item.label.trim())
        .map((item) => ({
          id: item.id || generateId(),
          label: item.label.trim(),
        })),
    }))
}

export function activeWeeklyShutdownChecklist(
  checklist: WeeklyShutdownCheckGroup[],
): WeeklyShutdownCheckGroup[] {
  return checklist.filter((group) => group.items.length > 0)
}

export function allWeeklyShutdownItemIds(groups: WeeklyShutdownCheckGroup[]): string[] {
  return groups.flatMap((group) => group.items.map((item) => item.id))
}

export interface WeeklyShutdownGoalSummary {
  id: string
  name: string
  metricKey: string
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
  weightMode?: 'bulk' | 'cut' | 'maintain'
  weightLabel?: string
  /** Share of goal period elapsed (for pace bar). */
  timeElapsedPercent?: number
  /** Multi-week goals: win when completion % >= elapsed time %. */
  usesPaceReview?: boolean
  /** Hide pace bar for standard weekly goals (always 100% at review). */
  showPaceBar?: boolean
}

export interface WeeklyReviewStat {
  id: string
  label: string
  value: string
  detail: string
}

export interface WeeklyHabitDayReview {
  date: string
  dayLabel: string
  done: boolean
}

export interface WeeklyHabitReviewSummary {
  id: string
  label: string
  logPeriod: 'daily' | 'weekly'
  days: WeeklyHabitDayReview[]
}

function dayLetterLabel(dateStr: string): string {
  return parseISO(dateStr).toLocaleDateString(undefined, { weekday: 'narrow' })
}

/** Daily habits: one ring per day in the week. Weekly habits: single week ring. */
export function buildWeeklyHabitReviewSummaries(
  logs: DailyLog[],
  weekDates: string[],
): WeeklyHabitReviewSummary[] {
  if (weekDates.length === 0) return []

  const logsByDate = new Map(logs.map((l) => [l.date, l]))
  const weekKey = getWeeklyShutdownWeekKey(weekDates)
  const weeklyLog = getWeeklyLog(weekKey)
  const summaries: WeeklyHabitReviewSummary[] = []

  for (const habit of getDailyLogHabitTypes()) {
    summaries.push({
      id: habit.id,
      label: habit.label,
      logPeriod: 'daily',
      days: weekDates.map((date) => ({
        date,
        dayLabel: dayLetterLabel(date),
        done: normalizeHabits(logsByDate.get(date)?.habits)[habit.id] ?? false,
      })),
    })
  }

  for (const habit of getWeeklyLogHabitTypes()) {
    const key = habitWeeklyLogKey(habit.id)
    if (!(key in weeklyLog)) continue
    summaries.push({
      id: habit.id,
      label: habit.label,
      logPeriod: 'weekly',
      days: [
        {
          date: weekKey,
          dayLabel: 'Wk',
          done: weeklyLog[key] === 1,
        },
      ],
    })
  }

  return summaries
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
    const raw = storageGetItem(STORAGE_KEY)
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
  storageSetItem(STORAGE_KEY, JSON.stringify([...new Set([...readCompletedWeeks(), weekKey])]))
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

function buildPaceReviewGoalSummary(
  goal: Goal,
  logs: DailyLog[],
  workouts: Workout[],
  lastDate: string,
  prevLastDate: string,
  weekStartsOn: 0 | 1,
  opts: { isWorkout?: boolean; weeklyTotal?: number } = {},
): WeeklyShutdownGoalSummary {
  const target = goal.target_value ?? 0
  const current = getCustomPeriodMetricValue(goal, logs, workouts, lastDate, weekStartsOn)
  const prevCurrent = getCustomPeriodMetricValue(goal, logs, workouts, prevLastDate, weekStartsOn)
  const percent = target > 0 ? (current / target) * 100 : 0
  const percentBefore = target > 0 ? (prevCurrent / target) * 100 : 0
  const timeElapsedPercent = getGoalTimeHorizon(goal, lastDate, weekStartsOn)?.elapsedPercent
  const hit = timeElapsedPercent != null ? percent >= timeElapsedPercent : percent >= 100
  const periodLabel = goalProgressPeriodLabel(goal, lastDate, weekStartsOn)
  let detail = `${periodLabel} · ${formatGoalProgressDetail(current, target, goal.unit, goal.metric_key)}`
  if (opts.isWorkout && opts.weeklyTotal != null) {
    detail += ` · ${formatNum(opts.weeklyTotal)} min this week`
  }

  return {
    id: goal.id,
    name: goal.name,
    metricKey: goal.metric_key,
    unit: opts.isWorkout ? 'min' : goal.unit,
    current,
    target,
    percent,
    percentBefore,
    hit,
    kind: goalLogPeriod(goal) === 'weekly' ? 'weekly' : 'daily',
    isWorkout: opts.isWorkout,
    detail,
    timeElapsedPercent,
    usesPaceReview: true,
    showPaceBar: true,
  }
}

function buildWorkoutGoalSummary(
  goal: Goal,
  logs: DailyLog[],
  workouts: Workout[],
  weekDates: string[],
  weekKey: string,
  prevWeekDates: string[],
  prevWeekKey: string,
  weekStartsOn: 0 | 1,
): WeeklyShutdownGoalSummary {
  const weeklyTotal = getWeeklyMetricValue(goal.metric_key, logs, workouts, weekDates, weekKey)
  const target = goal.target_value ?? 0
  const weeklyTarget = goalLogPeriod(goal) === 'weekly'
  const lastDate = weekDates[weekDates.length - 1]
  const prevLastDate = prevWeekDates[prevWeekDates.length - 1]
  const periodLabel = goalProgressPeriodLabel(goal, lastDate, weekStartsOn)
  const timeElapsedPercent = getGoalTimeHorizon(goal, lastDate, weekStartsOn)?.elapsedPercent

  if (isCustomTargetPeriod(goal) && isGoalLongerThanWeek(goal, lastDate)) {
    return buildPaceReviewGoalSummary(goal, logs, workouts, lastDate, prevLastDate, weekStartsOn, {
      isWorkout: true,
      weeklyTotal,
    })
  }

  if (weeklyTarget) {
    const percent = target > 0 ? (weeklyTotal / target) * 100 : 0
    const prevTotal = getWeeklyMetricValue(goal.metric_key, logs, workouts, prevWeekDates, prevWeekKey)
    const percentBefore = target > 0 ? (prevTotal / target) * 100 : 0
    return {
      id: goal.id,
      name: goal.name,
      metricKey: goal.metric_key,
      unit: 'min',
      current: weeklyTotal,
      target,
      percent,
      percentBefore,
      hit: percent >= 100,
      kind: 'weekly',
      isWorkout: true,
      detail: `${periodLabel} · ${formatNum(weeklyTotal)} / ${formatNum(target)} min`,
      timeElapsedPercent,
      showPaceBar: false,
    }
  }

  const avg = getWeeklyDailyAverage(goal.metric_key, logs, workouts, weekDates, lastDate)
  const prevAvg = getWeeklyDailyAverage(
    goal.metric_key,
    logs,
    workouts,
    prevWeekDates,
    prevLastDate,
  )
  const percent = target > 0 ? (avg / target) * 100 : 0
  const percentBefore = target > 0 ? (prevAvg / target) * 100 : 0

  return {
    id: goal.id,
    name: goal.name,
    metricKey: goal.metric_key,
    unit: 'min',
    current: avg,
    target,
    percent,
    percentBefore,
    hit: percent >= 100,
    kind: 'daily',
    isWorkout: true,
    detail: `${periodLabel} · ${formatNum(avg)} / ${formatNum(target)} min · ${formatNum(weeklyTotal)} min total`,
    timeElapsedPercent,
    showPaceBar: false,
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
  const prevWeekDates = getPreviousWeekDates(weekDates, weekStartsOn)
  const prevWeekKey = getWeeklyShutdownWeekKey(prevWeekDates)
  const lastDate = weekDates[weekDates.length - 1]
  const prevLastDate = prevWeekDates[prevWeekDates.length - 1] ?? lastDate
  const lastLog = logs.find((l) => l.date === lastDate)
  const prevLastLog = logForDate(logs, prevLastDate)
  const targeted = getActiveGoals(goals).filter(hasTarget)
  const workoutGoals = targeted.filter((g) => g.metric_key.startsWith('workout_'))
  const metricGoals = targeted.filter((g) => !g.metric_key.startsWith('workout_'))
  const weightGoals = metricGoals.filter(isWeightGoal)
  const nonWeightMetrics = metricGoals.filter((g) => !isWeightGoal(g))

  const weeklyGoals = nonWeightMetrics.filter(
    (g) => goalLogPeriod(g) === 'weekly' && !isCustomTargetPeriod(g),
  )
  const dailyGoals = nonWeightMetrics.filter(
    (g) => goalLogPeriod(g) === 'daily' && !isCustomTargetPeriod(g),
  )
  const customPeriodGoals = nonWeightMetrics.filter(
    (g) => isCustomTargetPeriod(g) && isGoalLongerThanWeek(g, lastDate),
  )

  const weeklySummaries: WeeklyShutdownGoalSummary[] = weeklyGoals.map((goal) => {
    const progress = calculateProgress(goal, lastLog, workouts, lastDate, weekDates, logs, weekKey)
    const prevProgress = calculateProgress(
      goal,
      prevLastLog,
      workouts,
      prevLastDate,
      prevWeekDates,
      logs,
      prevWeekKey,
    )
    const percent = progress.target && progress.target > 0 ? progress.percent : 0
    const percentBefore =
      prevProgress.target && prevProgress.target > 0 ? prevProgress.percent : 0
    return {
      id: goal.id,
      name: goal.name,
      metricKey: goal.metric_key,
      unit: goal.unit,
      current: progress.current,
      target: progress.target ?? 0,
      percent,
      percentBefore,
      hit: percent >= 100,
      kind: 'weekly',
      detail: `${goalProgressPeriodLabel(goal, lastDate, weekStartsOn)} · ${formatGoalProgressDetail(progress.current, progress.target ?? 0, goal.unit, goal.metric_key)}`,
      timeElapsedPercent: getGoalTimeHorizon(goal, lastDate, weekStartsOn)?.elapsedPercent,
      showPaceBar: false,
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
    const prevAvg = getWeeklyDailyAverage(
      goal.metric_key,
      logs,
      workouts,
      prevWeekDates,
      prevLastDate,
    )
    const target = goal.target_value ?? 0
    const percent = target > 0 ? (avg / target) * 100 : 0
    const percentBefore = target > 0 ? (prevAvg / target) * 100 : 0

    return {
      id: goal.id,
      name: goal.name,
      metricKey: goal.metric_key,
      unit: goal.unit,
      current: avg,
      target,
      percent,
      percentBefore,
      hit: percent >= 100,
      kind: 'daily',
      detail: `${goalProgressPeriodLabel(goal, lastDate, weekStartsOn)} · ${formatGoalProgressDetail(avg, target, goal.unit, goal.metric_key)}`,
      timeElapsedPercent: getGoalTimeHorizon(goal, lastDate, weekStartsOn)?.elapsedPercent,
      showPaceBar: false,
    }
  })

  const customPeriodSummaries: WeeklyShutdownGoalSummary[] = customPeriodGoals.map((goal) =>
    buildPaceReviewGoalSummary(goal, logs, workouts, lastDate, prevLastDate, weekStartsOn),
  )

  const weightSummaries: WeeklyShutdownGoalSummary[] = weightGoals.map((goal) => {
    const start = goal.goal_weight_start!
    const target = goal.goal_weight_target!
    const unit = goal.unit || weightUnit
    const progress = getWeightGoalProgress(goal, logs, weekDates, weekStartsOn)
    const mode = weightGoalMode(goal)

    return {
      id: goal.id,
      name: goal.name,
      metricKey: goal.metric_key,
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
      detail: `${goalProgressPeriodLabel(goal, lastDate, weekStartsOn)} · ${formatWeightGoalRange(start, target, unit as AppSettings['weightUnit'])} · ${progress.detail}`,
      timeElapsedPercent: getGoalTimeHorizon(goal, lastDate, weekStartsOn)?.elapsedPercent,
    }
  })

  const workoutSummaries = workoutGoals.map((goal) =>
    buildWorkoutGoalSummary(
      goal,
      logs,
      workouts,
      weekDates,
      weekKey,
      prevWeekDates,
      prevWeekKey,
      weekStartsOn,
    ),
  )

  return [
    ...weeklySummaries,
    ...weightSummaries,
    ...workoutSummaries,
    ...dailySummaries,
    ...customPeriodSummaries,
  ]
}

function formatWeeklyReviewValue(metricKey: string, value: number, unit: string): string {
  if (usesTimedMetricDisplay(unit, metricKey)) return formatMetricAmount(value, unit, metricKey)
  if (metricKey === 'steps') return Math.round(value).toLocaleString()
  if (metricKey === 'sleep') return `${formatNum(value, 1)} hrs`
  if (metricKey === 'screen_time' || metricKey === 'focus' || metricKey.startsWith('workout_')) {
    return `${Math.round(value)} ${unit === 'min/wk' ? 'min' : unit}`
  }
  if (metricKey === 'weight') return `${formatNum(value, 1)} ${unit}`
  return `${formatNum(value)} ${unit}`
}

function formatGoalProgressDetail(
  current: number,
  target: number,
  unit: string,
  metricKey?: string,
): string {
  if (usesTimedMetricDisplay(unit, metricKey)) {
    return `${formatMetricAmount(current, unit, metricKey)} / ${formatMetricAmount(target, unit, metricKey)}`
  }
  return `${formatNum(current)} / ${formatNum(target)} ${unit}`
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
        ? 'Logged weekly · no goal'
        : goal.metric_key === 'weight'
          ? 'Latest this week · no goal'
          : 'Tracked · no goal',
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
        builtin.key === 'weight' ? 'Latest this week · no goal' : 'Tracked · no goal set',
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
