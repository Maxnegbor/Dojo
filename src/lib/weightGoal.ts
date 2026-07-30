import { addDays, parseISO } from 'date-fns'
import type { DailyLog, Goal } from '@/types'
import type { AppSettings } from '@/types'
import { formatWeightStepper, kgToDisplay } from '@/lib/settingsStore'
import { getWeeklyLog } from '@/lib/weeklyLogStore'
import { getWeekDates } from '@/lib/utils'
import { formatGoalEndDate } from '@/lib/goalPeriod'
import { goalLogPeriod } from '@/lib/goals'

export type WeightGoalMode = 'bulk' | 'cut' | 'maintain'

const MAINTAIN_WEIGHT_EPSILON_KG = 0.01
const MAINTAIN_WEEKLY_TOLERANCE_KG = 0.2
const MAINTAIN_TARGET_TOLERANCE_KG = 0.5

export function weightGoalModeLabel(mode: WeightGoalMode): string {
  if (mode === 'bulk') return 'Bulk'
  if (mode === 'cut') return 'Cut'
  return 'Maintain'
}

export function isMaintainWeightGoal(goal: Goal): boolean {
  return weightGoalMode(goal) === 'maintain'
}

export interface WeightGoalProgress {
  lastWeekAvg: number
  thisWeekAvg: number
  percentBefore: number
  percentAfter: number
  hit: boolean
  label: string
  detail: string
}

export function isWeightGoal(goal: Goal): boolean {
  return (
    goal.metric_key === 'weight' &&
    goal.goal_weight_start != null &&
    goal.goal_weight_target != null
  )
}

/** Weekly weigh-in (shutdown) — not collected on morning / home / daily shutdown. */
export function isWeightLoggedWeekly(goal: Goal | undefined | null): boolean {
  return goal != null && isWeightGoal(goal) && goalLogPeriod(goal) === 'weekly'
}

/** Daily weigh-in — morning / home / shutdown; not weekly shutdown. */
export function isWeightLoggedDaily(goal: Goal | undefined | null): boolean {
  return goal != null && isWeightGoal(goal) && goalLogPeriod(goal) === 'daily'
}

/** The single weight campaign to show — newest active goal wins if duplicates exist. */
export function getActiveWeightGoal(goals: Goal[]): Goal | undefined {
  const active = goals.filter((goal) => goal.is_active && isWeightGoal(goal))
  if (active.length === 0) return undefined
  return active.reduce((best, goal) =>
    (goal.created_at ?? '') >= (best.created_at ?? '') ? goal : best,
  )
}

/** Other active weight campaigns that should be retired when one is kept. */
export function getDuplicateActiveWeightGoals(goals: Goal[], keepId?: string): Goal[] {
  const canonical = keepId
    ? goals.find((goal) => goal.id === keepId && isWeightGoal(goal))
    : getActiveWeightGoal(goals)
  if (!canonical) {
    return goals.filter((goal) => goal.is_active && isWeightGoal(goal))
  }
  return goals.filter(
    (goal) => goal.is_active && isWeightGoal(goal) && goal.id !== canonical.id,
  )
}

/**
 * Collapse multiple active weight campaigns to one (newest wins).
 * Returns the in-memory list plus goals that should be persisted as inactive.
 */
export function withDuplicateWeightGoalsRetired(goals: Goal[]): {
  goals: Goal[]
  toRetire: Goal[]
} {
  const toRetire = getDuplicateActiveWeightGoals(goals).map((goal) => ({
    ...goal,
    is_active: false,
  }))
  if (toRetire.length === 0) return { goals, toRetire }
  const retiredIds = new Set(toRetire.map((goal) => goal.id))
  return {
    goals: goals.map((goal) =>
      retiredIds.has(goal.id) ? { ...goal, is_active: false } : goal,
    ),
    toRetire,
  }
}

export function weightGoalMode(goal: Goal): WeightGoalMode {
  const start = goal.goal_weight_start ?? 0
  const target = goal.goal_weight_target ?? 0
  if (Math.abs(target - start) <= MAINTAIN_WEIGHT_EPSILON_KG) return 'maintain'
  return target > start ? 'bulk' : 'cut'
}

export function getPreviousWeekDates(
  weekDates: string[],
  weekStartsOn: 0 | 1,
): string[] {
  if (weekDates.length === 0) return []
  return getWeekDates(addDays(parseISO(weekDates[0]), -7), weekStartsOn)
}

/** Weight for a week — prefers the weekly shutdown log, then legacy daily entries. */
export function getWeeklyWeightAverage(
  logs: DailyLog[],
  weekDates: string[],
  weekKey?: string,
): number | null {
  const key = weekKey ?? weekDates[0]
  if (key) {
    const weekly = getWeeklyLog(key).weight
    if (weekly != null) return weekly
  }

  const weights = weekDates
    .map((date) => logs.find((l) => l.date === date)?.weight)
    .filter((w): w is number => w != null)

  if (weights.length === 0) return null
  return weights.reduce((sum, w) => sum + w, 0) / weights.length
}

export function weightToCampaignPercent(
  weightKg: number,
  startKg: number,
  targetKg: number,
): number {
  const span = targetKg - startKg
  if (span === 0) return 100
  const progress = (weightKg - startKg) / span
  return Math.min(100, Math.max(0, progress * 100))
}

export function weeklyWeightHit(
  mode: WeightGoalMode,
  lastWeekAvg: number,
  thisWeekAvg: number,
): boolean {
  if (mode === 'bulk') return thisWeekAvg > lastWeekAvg
  if (mode === 'cut') return thisWeekAvg < lastWeekAvg
  return Math.abs(thisWeekAvg - lastWeekAvg) <= MAINTAIN_WEEKLY_TOLERANCE_KG
}

function maintainProximityPercent(weightKg: number, targetKg: number): number {
  const drift = Math.abs(weightKg - targetKg)
  if (drift <= MAINTAIN_TARGET_TOLERANCE_KG) {
    return Math.round(100 - (drift / MAINTAIN_TARGET_TOLERANCE_KG) * 15)
  }
  const maxDrift = 3
  return Math.max(0, Math.round(100 - (drift / maxDrift) * 100))
}

export function formatWeightDelta(
  lastWeekAvg: number,
  thisWeekAvg: number,
  unit: AppSettings['weightUnit'],
): string {
  const delta = thisWeekAvg - lastWeekAvg
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  const display = formatWeightStepper(Math.abs(delta), unit)
  return `${sign}${display} ${unit}`
}

export function getWeightGoalProgress(
  goal: Goal,
  logs: DailyLog[],
  weekDates: string[],
  weekStartsOn: 0 | 1,
): WeightGoalProgress {
  const start = goal.goal_weight_start!
  const target = goal.goal_weight_target!
  const unit = (goal.unit === 'lb' ? 'lb' : 'kg') as AppSettings['weightUnit']
  const mode = weightGoalMode(goal)
  const prevWeekDates = getPreviousWeekDates(weekDates, weekStartsOn)
  const prevWeekKey = prevWeekDates[0]
  const weekKey = weekDates[0]

  const lastLogged = getWeeklyWeightAverage(logs, prevWeekDates, prevWeekKey)
  const thisLogged = getWeeklyWeightAverage(logs, weekDates, weekKey)

  const lastWeekAvg = lastLogged ?? start
  const thisWeekAvg = thisLogged ?? lastWeekAvg

  const percentBefore =
    mode === 'maintain'
      ? maintainProximityPercent(lastWeekAvg, target)
      : weightToCampaignPercent(lastWeekAvg, start, target)
  const percentAfter =
    mode === 'maintain'
      ? maintainProximityPercent(thisWeekAvg, target)
      : weightToCampaignPercent(thisWeekAvg, start, target)
  const hit =
    mode === 'maintain'
      ? weeklyWeightHit(mode, lastWeekAvg, thisWeekAvg) &&
        Math.abs(thisWeekAvg - target) <= MAINTAIN_TARGET_TOLERANCE_KG
      : weeklyWeightHit(mode, lastWeekAvg, thisWeekAvg)

  const detail = `${formatWeightStepper(lastWeekAvg, unit)} → ${formatWeightStepper(thisWeekAvg, unit)} ${unit} avg`
  const label = `${formatWeightDelta(lastWeekAvg, thisWeekAvg, unit)} this week`

  return {
    lastWeekAvg,
    thisWeekAvg,
    percentBefore,
    percentAfter,
    hit,
    label,
    detail,
  }
}

export function formatWeightGoalRange(
  startKg: number,
  targetKg: number,
  unit: AppSettings['weightUnit'],
): string {
  if (Math.abs(targetKg - startKg) <= MAINTAIN_WEIGHT_EPSILON_KG) {
    return `${formatWeightStepper(startKg, unit)} ${unit} target`
  }
  return `${formatWeightStepper(startKg, unit)} → ${formatWeightStepper(targetKg, unit)} ${unit}`
}

export function formatWeightGoalDateRange(goal: Goal): string | null {
  if (!goal.period_start_date || !goal.period_end_date) return null
  return `${formatGoalEndDate(goal.period_start_date)} → ${formatGoalEndDate(goal.period_end_date)}`
}

export function displayWeightKg(kg: number, unit: AppSettings['weightUnit']): string {
  return kgToDisplay(kg, unit).toFixed(1)
}
