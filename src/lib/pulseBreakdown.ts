import { getLogValueForGoal } from '@/lib/dailyLog'
import { getDailyLogHabitTypes, type HabitTypeDefinition } from '@/lib/habitTypes'
import { hasTarget } from '@/lib/goals'
import {
  computeExerciseRate,
  getPulseCustomMetricGoals,
  pulseCustomMetricLabel,
  type PulseFormula,
} from '@/lib/pulseConfig'
import {
  computeSleepPulseRate,
  formatSleepMetricDisplay,
  getPulseSleepMetrics,
  getSleepMetricTarget,
  getSleepMetricValue,
  type SleepMetricsConfig,
} from '@/lib/sleepMetrics'
import { formatDuration } from '@/lib/utils'
import { getWorkoutTypes } from '@/lib/workoutTypes'
import type { DailyLog, Goal, Workout } from '@/types'
import { normalizeHabits } from '@/types'

export interface PulseContributor {
  id: string
  label: string
  /** Raw metric progress, e.g. "3 / 5" or "7.0 / 8 hrs". */
  detail: string
  /** Optional secondary lines (e.g. each workout type). */
  subdetails?: string[]
  /** Completion rate 0–100 used by the pulse formula. */
  rate: number
  /** How many points this adds to the 0–100 pulse score. */
  scoreEarned: number
  /** Max points this category can add to the pulse score at 100%. */
  scoreMax: number
}

function formatScorePts(n: number): number {
  const rounded = Math.round(n * 10) / 10
  return Object.is(rounded, -0) ? 0 : rounded
}

function scoreFromRate(rate: number, weight: number, totalWeight: number): {
  earned: number
  max: number
} {
  if (totalWeight <= 0 || weight <= 0) return { earned: 0, max: 0 }
  const max = formatScorePts((weight / totalWeight) * 100)
  const earned = formatScorePts((Math.max(0, Math.min(100, rate)) / 100) * max)
  return { earned, max }
}

function formatHoursPair(valueMinutes: number, targetMinutes: number): string {
  const valueHrs = valueMinutes / 60
  const targetHrs = targetMinutes / 60
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
  return `${fmt(valueHrs)} / ${fmt(targetHrs)} hrs`
}

function formatMetricPair(
  value: number,
  target: number,
  unit: string,
  metricKey?: string,
): string {
  if (metricKey === 'focus' || unit === 'min' || unit === 'minutes') {
    return `${formatDuration(value)} / ${formatDuration(target)}`
  }
  const fmt = (n: number) => {
    const r = Math.round(n * 10) / 10
    return Number.isInteger(r) ? String(r) : r.toFixed(1)
  }
  return `${fmt(value)} / ${fmt(target)} ${unit}`.trim()
}

function formatSleepDetail(
  log: DailyLog | undefined,
  sleepMetricsConfig: SleepMetricsConfig,
  legacyHours: number | null,
): { detail: string; subdetails: string[] } {
  const pulseMetrics = getPulseSleepMetrics(sleepMetricsConfig)
  const subdetails: string[] = []

  const formatDurationTarget = (targetMinutes: number) => {
    const hrs = targetMinutes / 60
    return `${hrs.toFixed(Number.isInteger(hrs) ? 0 : 1)} hrs`
  }

  for (const metric of pulseMetrics) {
    const value = getSleepMetricValue(log, metric)
    let target = getSleepMetricTarget(sleepMetricsConfig, metric.id)
    if (
      target == null &&
      legacyHours != null &&
      legacyHours > 0 &&
      (metric.id === 'sleep_duration' || metric.id === 'in_bed')
    ) {
      target = legacyHours * 60
    }

    if (value == null) {
      if (target != null) {
        subdetails.push(
          `${metric.label} · — / ${
            metric.id === 'sleep_duration' || metric.id === 'in_bed'
              ? formatDurationTarget(target)
              : formatSleepMetricDisplay(metric, target)
          }`,
        )
      } else {
        subdetails.push(`${metric.label} · not logged`)
      }
      continue
    }

    if (
      (metric.id === 'sleep_duration' || metric.id === 'in_bed') &&
      target != null &&
      target > 0
    ) {
      subdetails.push(`${metric.label} · ${formatHoursPair(value, target)}`)
    } else if (target != null && target > 0) {
      subdetails.push(
        `${metric.label} · ${formatSleepMetricDisplay(metric, value)} / ${formatSleepMetricDisplay(metric, target)}`,
      )
    } else {
      subdetails.push(
        `${metric.label} · ${formatSleepMetricDisplay(metric, value)}${
          metric.id === 'sleep_duration' || metric.id === 'in_bed' ? ' · no target' : ''
        }`,
      )
    }
  }

  if (subdetails.length === 1) {
    return { detail: subdetails[0]!.replace(/^[^·]+ · /, ''), subdetails: [] }
  }
  if (subdetails.length > 0) {
    return { detail: `${pulseMetrics.length} metrics`, subdetails }
  }

  // No pulse sleep metrics configured — still surface the sleep goal slot.
  if (legacyHours != null && legacyHours > 0) {
    const minutes = log?.sleep_hours != null ? log.sleep_hours * 60 : null
    if (minutes == null) {
      return { detail: `— / ${formatDurationTarget(legacyHours * 60)}`, subdetails: [] }
    }
    return { detail: formatHoursPair(minutes, legacyHours * 60), subdetails: [] }
  }

  return { detail: 'Not logged', subdetails: [] }
}

function formatExerciseDetail(
  date: string,
  workouts: Workout[],
  thresholds: Record<string, number>,
  rate: number,
): { detail: string; subdetails: string[] } {
  const types = getWorkoutTypes()
  const dayWorkouts = workouts.filter((w) => w.date === date)
  const categories = Object.keys(thresholds).filter((id) => (thresholds[id] ?? 0) > 0)
  const subdetails: string[] = []

  for (const category of categories) {
    const logged = dayWorkouts
      .filter((w) => w.category === category)
      .reduce((sum, w) => sum + w.duration_minutes, 0)
    if (logged <= 0) continue
    const label =
      types.find((t) => t.id === category)?.label ?? category.replace(/_/g, ' ')
    subdetails.push(`${label} · ${Math.round(logged)} min logged`)
  }

  const detail =
    rate >= 100
      ? 'Daily exercise met'
      : rate > 0
        ? `${Math.round(rate)}% toward daily exercise`
        : categories.length > 0
          ? 'No sessions logged yet'
          : 'No workout targets'

  return { detail, subdetails }
}

/**
 * Contributors aligned with how `computeDayPulse` builds the 0–100 score:
 * weighted average of category rates → each row’s scoreEarned sums toward that score.
 */
export function buildPulseContributors(input: {
  date: string
  log: DailyLog | undefined
  goals: Goal[]
  workouts: Workout[]
  formula: PulseFormula | null
  sleepMetricsConfig: SleepMetricsConfig
  habits?: HabitTypeDefinition[]
}): PulseContributor[] {
  const { date, log, goals, workouts, formula, sleepMetricsConfig } = input
  if (!formula) return []

  const habits = input.habits ?? getDailyLogHabitTypes()
  const { weights } = formula
  const metricWeights = formula.metricWeights ?? {}

  type Draft = {
    id: string
    label: string
    detail: string
    subdetails?: string[]
    rate: number
    weight: number
  }
  const drafts: Draft[] = []

  if (weights.habits > 0 && habits.length > 0) {
    const h = normalizeHabits(log?.habits)
    const done = habits.filter((habit) => h[habit.id]).length
    drafts.push({
      id: 'habits',
      label: 'Habits',
      detail: `${done} / ${habits.length} done`,
      rate: (done / habits.length) * 100,
      weight: weights.habits,
    })
  }

  if (weights.focus > 0) {
    const focusGoal = goals.find((g) => g.metric_key === 'focus' && hasTarget(g))
    if (focusGoal) {
      const mins = log?.focus_minutes ?? 0
      const target = focusGoal.target_value ?? 1
      drafts.push({
        id: 'focus',
        label: 'Focus',
        detail: formatMetricPair(mins, target, 'min', 'focus'),
        rate: Math.min(100, (mins / target) * 100),
        weight: weights.focus,
      })
    }
  }

  if (weights.sleep > 0) {
    const sleepGoal = goals.find((g) => g.metric_key === 'sleep' && hasTarget(g))
    const legacyHours = sleepGoal?.target_value ?? null
    const pulseMetrics = getPulseSleepMetrics(sleepMetricsConfig)
    // Always show Sleep when it's weighted in Pulse — even with nothing logged.
    const rate =
      pulseMetrics.length > 0
        ? computeSleepPulseRate(log, sleepMetricsConfig, legacyHours)
        : legacyHours != null && legacyHours > 0 && log?.sleep_hours != null
          ? Math.min(100, (log.sleep_hours / legacyHours) * 100)
          : 0
    const { detail, subdetails } = formatSleepDetail(log, sleepMetricsConfig, legacyHours)
    drafts.push({
      id: 'sleep',
      label: 'Sleep',
      detail,
      subdetails: subdetails.length > 0 ? subdetails : undefined,
      rate,
      weight: weights.sleep,
    })
  }

  if (weights.exercise > 0) {
    const hasWorkoutGoal = goals.some(
      (g) => g.is_active && g.metric_key.startsWith('workout_') && hasTarget(g),
    )
    if (hasWorkoutGoal) {
      const rate = computeExerciseRate(date, workouts, formula.exerciseDailyMinutes)
      const { detail, subdetails } = formatExerciseDetail(
        date,
        workouts,
        formula.exerciseDailyMinutes,
        rate,
      )
      drafts.push({
        id: 'exercise',
        label: 'Exercise',
        detail,
        subdetails: subdetails.length > 0 ? subdetails : undefined,
        rate,
        weight: weights.exercise,
      })
    }
  }

  const customGoalsByKey = new Map(
    getPulseCustomMetricGoals(goals).map((g) => [g.metric_key as string, g]),
  )
  for (const [key, weight] of Object.entries(metricWeights)) {
    if (weight <= 0) continue
    const goal = customGoalsByKey.get(key)
    if (!goal) continue
    const target = goal.target_value ?? 0
    const value = log ? (getLogValueForGoal(log, goal) ?? 0) : 0
    drafts.push({
      id: key,
      label: pulseCustomMetricLabel(goal),
      detail:
        target > 0
          ? formatMetricPair(value, target, goal.unit || '', goal.metric_key)
          : 'No target',
      rate: target > 0 ? Math.min(100, (value / target) * 100) : 0,
      weight,
    })
  }

  const totalWeight = drafts.reduce((sum, row) => sum + row.weight, 0)
  return drafts.map((row) => {
    const { earned, max } = scoreFromRate(row.rate, row.weight, totalWeight)
    return {
      id: row.id,
      label: row.label,
      detail: row.detail,
      subdetails: row.subdetails,
      rate: row.rate,
      scoreEarned: earned,
      scoreMax: max,
    }
  })
}
