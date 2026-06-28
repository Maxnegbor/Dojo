import { addDays, parseISO } from 'date-fns'
import type { DailyLog, Goal } from '@/types'
import type { AppSettings } from '@/types'
import { formatWeightStepper, kgToDisplay } from '@/lib/settingsStore'
import { getWeekDates } from '@/lib/utils'

export type WeightGoalMode = 'bulk' | 'cut'

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

export function weightGoalMode(goal: Goal): WeightGoalMode {
  const start = goal.goal_weight_start ?? 0
  const target = goal.goal_weight_target ?? 0
  return target > start ? 'bulk' : 'cut'
}

export function getPreviousWeekDates(
  weekDates: string[],
  weekStartsOn: 0 | 1,
): string[] {
  if (weekDates.length === 0) return []
  return getWeekDates(addDays(parseISO(weekDates[0]), -7), weekStartsOn)
}

/** Average of logged weights in the week (days without a log are skipped). */
export function getWeeklyWeightAverage(
  logs: DailyLog[],
  weekDates: string[],
): number | null {
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
  return thisWeekAvg < lastWeekAvg
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

  const lastLogged = getWeeklyWeightAverage(logs, prevWeekDates)
  const thisLogged = getWeeklyWeightAverage(logs, weekDates)

  const lastWeekAvg = lastLogged ?? start
  const thisWeekAvg = thisLogged ?? lastWeekAvg

  const percentBefore = weightToCampaignPercent(lastWeekAvg, start, target)
  const percentAfter = weightToCampaignPercent(thisWeekAvg, start, target)
  const hit = weeklyWeightHit(mode, lastWeekAvg, thisWeekAvg)

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
  return `${formatWeightStepper(startKg, unit)} → ${formatWeightStepper(targetKg, unit)} ${unit}`
}

export function displayWeightKg(kg: number, unit: AppSettings['weightUnit']): string {
  return kgToDisplay(kg, unit).toFixed(1)
}
