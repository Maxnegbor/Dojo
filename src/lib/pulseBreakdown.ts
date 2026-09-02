import { computePulseMetricRate, getPulseDayMetricValue } from '@/lib/pulse'
import {
  formatPulseOrGroupLabel,
  listPulseMetricOptions,
  pulseMetricOptionLabel,
  resolvePulseMetricTarget,
  type PulseFormula,
  type PulseMetricOption,
} from '@/lib/pulseConfig'
import {
  formatSleepMetricDisplay,
  getSleepMetricDefinition,
  getSleepMetricValue,
  sleepMetricIdFromLibraryKey,
  type SleepMetricsConfig,
} from '@/lib/sleepMetrics'
import { formatDuration } from '@/lib/utils'
import type { DailyLog, Goal, MetricKey, Workout } from '@/types'
import { normalizeHabits } from '@/types'
import { formatHabitifyPulseDetail } from '@/lib/habitifyStore'

export interface PulseContributor {
  id: string
  label: string
  /** Raw metric progress, e.g. "3 / 5" or "7.0 / 8 hrs". */
  detail: string
  /** Optional secondary lines (e.g. OR group members). */
  subdetails?: string[]
  /** Completion rate 0–100 used by the pulse formula. */
  rate: number
  /** How many points this adds to the 0–100 pulse score. */
  scoreEarned: number
  /** Max points this slot can add to the pulse score at 100%. */
  scoreMax: number
  categoryId: string
  categoryLabel: string
  kind: 'metric' | 'or-group'
}

export interface PulseContributorCategory {
  id: string
  label: string
  rows: PulseContributor[]
  scoreEarned: number
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
  if (
    metricKey === 'focus' ||
    metricKey?.startsWith('workout_') ||
    unit === 'min' ||
    unit === 'minutes'
  ) {
    return `${formatDuration(value)} / ${formatDuration(target)}`
  }
  const fmt = (n: number) => {
    const r = Math.round(n * 10) / 10
    return Number.isInteger(r) ? String(r) : r.toFixed(1)
  }
  return `${fmt(value)} / ${fmt(target)} ${unit}`.trim()
}

function formatMetricDetail(input: {
  metricKey: MetricKey
  date: string
  log: DailyLog | undefined
  goals: Goal[]
  workouts: Workout[]
  formula: PulseFormula
  sleepMetricsConfig: SleepMetricsConfig
  unit: string
}): string {
  const { metricKey, date, log, goals, workouts, formula, sleepMetricsConfig, unit } = input

  if (metricKey.startsWith('habit_')) {
    const habitId = metricKey.slice('habit_'.length)
    const done = Boolean(normalizeHabits(log?.habits)[habitId])
    return done ? 'Done' : 'Not done'
  }

  if (metricKey.startsWith('habitify_')) {
    return formatHabitifyPulseDetail(metricKey, date)
  }

  const sleepId = sleepMetricIdFromLibraryKey(metricKey)
  if (sleepId) {
    const metric = getSleepMetricDefinition(sleepMetricsConfig, sleepId)
    if (!metric) return 'Not logged'
    const value = getSleepMetricValue(log, metric)
    const target = resolvePulseMetricTarget(metricKey, goals, formula, sleepMetricsConfig)
    if (value == null) {
      if (target == null) return 'Not logged'
      if (metric.id === 'sleep_duration' || metric.id === 'in_bed') {
        return `— / ${formatHoursPair(0, target).split(' / ')[1]}`
      }
      return `— / ${formatSleepMetricDisplay(metric, target)}`
    }
    if (
      (metric.id === 'sleep_duration' || metric.id === 'in_bed') &&
      target != null &&
      target > 0
    ) {
      return formatHoursPair(value, target)
    }
    if (target != null && target > 0) {
      return `${formatSleepMetricDisplay(metric, value)} / ${formatSleepMetricDisplay(metric, target)}`
    }
    return formatSleepMetricDisplay(metric, value)
  }

  if (metricKey === 'focus') {
    const mins = log?.focus_minutes ?? 0
    const target = resolvePulseMetricTarget(metricKey, goals, formula, sleepMetricsConfig)
    if (target == null || target <= 0) return `${formatDuration(mins)} · no target`
    return formatMetricPair(mins, target, 'min', 'focus')
  }

  // Always today (or view day) vs daily Pulse target — never week-to-date vs daily.
  const value = getPulseDayMetricValue(metricKey, date, log, workouts)
  const target = resolvePulseMetricTarget(metricKey, goals, formula, sleepMetricsConfig)
  if (target == null || target <= 0) {
    if (value <= 0) return 'Not logged'
    return `${formatMetricPair(value, value, unit, metricKey).replace(/ \/ .*$/, '')} · no target`
  }
  return formatMetricPair(value, target, unit, metricKey)
}

function categoryForKeys(
  keys: MetricKey[],
  optionsByKey: Map<string, PulseMetricOption>,
): { id: string; label: string } {
  const first = optionsByKey.get(keys[0] ?? '')
  if (first) return { id: first.categoryId, label: first.categoryLabel }
  return { id: 'ungrouped', label: 'Ungrouped' }
}

/**
 * Contributors aligned with how `computeDayPulse` builds the 0–100 score.
 */
export function buildPulseContributors(input: {
  date: string
  log: DailyLog | undefined
  goals: Goal[]
  workouts: Workout[]
  formula: PulseFormula | null
  sleepMetricsConfig: SleepMetricsConfig
}): PulseContributor[] {
  const { date, log, goals, workouts, formula, sleepMetricsConfig } = input
  if (!formula) return []

  const options = listPulseMetricOptions(goals)
  const optionsByKey = new Map(options.map((option) => [option.key as string, option]))
  const metricWeights = formula.metricWeights ?? {}

  type Draft = {
    id: string
    label: string
    detail: string
    subdetails?: string[]
    rate: number
    weight: number
    categoryId: string
    categoryLabel: string
    kind: 'metric' | 'or-group'
  }
  const drafts: Draft[] = []

  for (const [key, weight] of Object.entries(metricWeights)) {
    if (weight <= 0) continue
    if ((formula.orGroups ?? []).some((g) => g.metricKeys.includes(key as MetricKey))) continue
    const option = optionsByKey.get(key)
    const rate = computePulseMetricRate({
      metricKey: key as MetricKey,
      date,
      log,
      goals,
      workouts,
      formula,
      sleepMetricsConfig,
    })
    drafts.push({
      id: key,
      label: pulseMetricOptionLabel(key, options, goals),
      detail: formatMetricDetail({
        metricKey: key as MetricKey,
        date,
        log,
        goals,
        workouts,
        formula,
        sleepMetricsConfig,
        unit: option?.unit ?? '',
      }),
      rate,
      weight,
      categoryId: option?.categoryId ?? 'ungrouped',
      categoryLabel: option?.categoryLabel ?? 'Ungrouped',
      kind: 'metric',
    })
  }

  for (const group of formula.orGroups ?? []) {
    if (group.weight <= 0 || group.metricKeys.length === 0) continue
    const memberDetails: string[] = []
    const memberRates: number[] = []
    for (const metricKey of group.metricKeys) {
      const option = optionsByKey.get(metricKey)
      const rate = computePulseMetricRate({
        metricKey,
        date,
        log,
        goals,
        workouts,
        formula,
        sleepMetricsConfig,
      })
      memberRates.push(rate)
      const detail = formatMetricDetail({
        metricKey,
        date,
        log,
        goals,
        workouts,
        formula,
        sleepMetricsConfig,
        unit: option?.unit ?? '',
      })
      memberDetails.push(
        `${pulseMetricOptionLabel(metricKey, options, goals)} · ${detail}`,
      )
    }
    const rate = Math.max(0, ...memberRates)
    const category = categoryForKeys(group.metricKeys, optionsByKey)
    drafts.push({
      id: `or:${group.id}`,
      label: formatPulseOrGroupLabel(group, options, goals),
      detail: rate >= 100 ? 'Either/or met' : 'Hit either metric',
      subdetails: memberDetails,
      rate,
      weight: group.weight,
      categoryId: category.id,
      categoryLabel: category.label,
      kind: 'or-group',
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
      categoryId: row.categoryId,
      categoryLabel: row.categoryLabel,
      kind: row.kind,
    }
  })
}

/** Group contributors by Metrics library category for the breakdown UI. */
export function groupPulseContributorsByCategory(
  contributors: PulseContributor[],
): PulseContributorCategory[] {
  const groups: PulseContributorCategory[] = []
  const index = new Map<string, number>()
  for (const row of contributors) {
    const key = row.categoryId || 'ungrouped'
    let i = index.get(key)
    if (i == null) {
      i = groups.length
      index.set(key, i)
      groups.push({
        id: key,
        label: row.categoryLabel || 'Ungrouped',
        rows: [],
        scoreEarned: 0,
        scoreMax: 0,
      })
    }
    groups[i].rows.push(row)
    groups[i].scoreEarned = formatScorePts(groups[i].scoreEarned + row.scoreEarned)
    groups[i].scoreMax = formatScorePts(groups[i].scoreMax + row.scoreMax)
  }
  for (const group of groups) {
    group.rows.sort((a, b) => a.label.localeCompare(b.label))
  }
  return groups.sort((a, b) => a.label.localeCompare(b.label))
}
