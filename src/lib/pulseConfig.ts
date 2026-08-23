import { defaultUnitForMetric, getActiveGoals, hasTarget, metricLabel, normalizeGoal } from '@/lib/goals'
import { goalTargetPeriod } from '@/lib/goalPeriod'
import { getDailyLogHabitTypes, getWeeklyLogHabitTypes } from '@/lib/habitTypes'
import {
  KIND_CATEGORY_LABELS,
  getMetricLibraryCategories,
  resolveLibraryCategoryId,
} from '@/lib/metricLibrary'
import { getEnabledMetricsSections } from '@/lib/metricsSections'
import { getFocusSettings } from '@/lib/focusStore'
import { getActiveOutcomeGoals } from '@/lib/outcomeGoals'
import {
  getEnabledSleepMetrics,
  getPulseSleepMetrics,
  getSleepMetricTarget,
  getSleepMetricsConfig,
  sleepLibraryMetricKey,
  sleepMetricDisplayUnit,
  sleepMetricIdFromLibraryKey,
  type SleepMetricsConfig,
} from '@/lib/sleepMetrics'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { getDailyLogWorkoutTypes, getWeeklyLogWorkoutTypes, getWorkoutTypes, workoutMetricKey } from '@/lib/workoutTypes'
import { getActiveWeightGoal, isWeightLoggedWeekly } from '@/lib/weightGoal'
import type { Goal, MetricKey, Workout } from '@/types'

const STORAGE_KEY = 'personal-os-pulse-config'

/** @deprecated Legacy category buckets — migrated into metricWeights. */
export interface PulseWeights {
  habits: number
  focus: number
  sleep: number
  exercise: number
}

/** @deprecated */
export type PulseCoreArea = keyof PulseWeights

export interface PulseOrGroup {
  id: string
  /** Metric keys — hitting any one counts as the group rate (max of members). */
  metricKeys: MetricKey[]
  /** Points for the whole group (not per metric). */
  weight: number
  /** Optional label; defaults to “A or B”. */
  label?: string
}

export interface PulseFormula {
  /**
   * Points per standalone metric key (habit_*, focus, sleep:*, workout_*, …).
   * Metrics inside an either/or group should not appear here.
   */
  metricWeights: Record<string, number>
  /**
   * Pulse-only daily targets (esp. for weekly-logged metrics).
   * Keys are metric keys. For workouts, also accepts legacy category ids via exerciseDailyMinutes.
   */
  dailyTargets: Record<string, number>
  /** Either/or groups — one weight; success = best member rate. */
  orGroups: PulseOrGroup[]
  /**
   * @deprecated Prefer dailyTargets[`workout_${category}`]. Kept for migration.
   */
  exerciseDailyMinutes: Record<string, number>
  /**
   * When true, included slots (weight &gt; 0) each count equally —
   * no 10-point pool. Weights are typically 0 or 1.
   */
  equalWeights?: boolean
  /** @deprecated Migrated into metricWeights on read. */
  weights?: PulseWeights
}

export interface PulseFormulaVersion {
  effectiveFrom: string
  formula: PulseFormula
}

export interface PulseConfig {
  history: PulseFormulaVersion[]
}

export interface PulseMetricOption {
  key: MetricKey
  label: string
  unit: string
  categoryId: string
  categoryLabel: string
  description: string
  /** How the metric is normally logged. */
  logPeriod: 'daily' | 'weekly'
  /** Needs an explicit Pulse daily target (weekly-logged quantity metrics). */
  needsDailyTarget: boolean
}

export const PULSE_POINTS_TOTAL = 10

export const DEFAULT_PULSE_WEIGHTS: PulseWeights = {
  habits: 4,
  focus: 3,
  sleep: 3,
  exercise: 0,
}

export const EMPTY_PULSE_CONFIG: PulseConfig = { history: [] }

function clampWeight(n: number): number {
  return Math.max(0, Math.min(PULSE_POINTS_TOTAL, Math.round(n)))
}

function normalizeLegacyWeights(raw: Partial<PulseWeights> | undefined): PulseWeights {
  return {
    habits: clampWeight(raw?.habits ?? 0),
    focus: clampWeight(raw?.focus ?? 0),
    sleep: clampWeight(raw?.sleep ?? 0),
    exercise: clampWeight(raw?.exercise ?? 0),
  }
}

function normalizeMetricWeights(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || typeof key !== 'string') continue
    const n = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(n) && n > 0) out[key] = clampWeight(n)
  }
  return out
}

function libraryCategoryLabel(categoryId: string): string {
  const resolved = resolveLibraryCategoryId(categoryId)
  const fromLibrary = getMetricLibraryCategories().find((c) => c.id === resolved)
  if (fromLibrary) return fromLibrary.label
  return KIND_CATEGORY_LABELS[resolved] ?? resolved
}

function splitPointsAcross(keys: string[], total: number): Record<string, number> {
  const out: Record<string, number> = {}
  if (keys.length === 0 || total <= 0) return out
  const base = Math.floor(total / keys.length)
  let extra = total % keys.length
  for (const key of keys) {
    const points = base + (extra > 0 ? 1 : 0)
    if (extra > 0) extra -= 1
    if (points > 0) out[key] = points
  }
  return out
}

function normalizeDailyTargets(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || typeof key !== 'string') continue
    const n = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(n) && n > 0) out[key] = Math.round(n * 100) / 100
  }
  return out
}

function normalizeOrGroups(raw: unknown): PulseOrGroup[] {
  if (!Array.isArray(raw)) return []
  const groups: PulseOrGroup[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    const keysRaw = Array.isArray(obj.metricKeys) ? obj.metricKeys : []
    const metricKeys = keysRaw.filter((k): k is MetricKey => typeof k === 'string' && k.length > 0)
    if (metricKeys.length < 2) continue
    const weight =
      typeof obj.weight === 'number'
        ? clampWeight(obj.weight)
        : typeof obj.weight === 'string'
          ? clampWeight(Number(obj.weight))
          : 0
    if (weight <= 0 && obj.weight !== 1) {
      // keep groups with weight 0 only if equal-mode style weight is set later; drop empty
    }
    groups.push({
      id: typeof obj.id === 'string' && obj.id ? obj.id : crypto.randomUUID(),
      metricKeys: [...new Set(metricKeys)],
      weight: weight > 0 ? weight : 0,
      label: typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim() : undefined,
    })
  }
  return groups.filter((g) => g.metricKeys.length >= 2)
}

/** Expand legacy category weights into per-metric weights (once). */
export function migrateLegacyPulseFormula(formula: PulseFormula): PulseFormula {
  const legacy = normalizeLegacyWeights(formula.weights)
  const hasLegacy =
    legacy.habits > 0 || legacy.focus > 0 || legacy.sleep > 0 || legacy.exercise > 0

  const metricWeights = { ...(formula.metricWeights ?? {}) }
  const dailyTargets = { ...(formula.dailyTargets ?? {}) }
  const orGroups = [...(formula.orGroups ?? [])]

  // Migrate exerciseDailyMinutes → dailyTargets
  for (const [category, minutes] of Object.entries(formula.exerciseDailyMinutes ?? {})) {
    if (!minutes || minutes <= 0) continue
    const key = category.startsWith('workout_') ? category : workoutMetricKey(category)
    if ((dailyTargets[key] ?? 0) <= 0) dailyTargets[key] = minutes
  }

  if (hasLegacy) {
    if (legacy.habits > 0) {
      const habitKeys = getDailyLogHabitTypes().map((h) => `habit_${h.id}`)
      const already = habitKeys.some((key) => (metricWeights[key] ?? 0) > 0)
      if (!already) {
        Object.assign(metricWeights, splitPointsAcross(habitKeys, legacy.habits))
      }
    }

    if (legacy.focus > 0 && (metricWeights.focus ?? 0) <= 0) {
      metricWeights.focus = legacy.focus
    }

    if (legacy.sleep > 0) {
      const sleepKeys = getPulseSleepMetrics(getSleepMetricsConfig()).map((m) =>
        sleepLibraryMetricKey(m.id),
      )
      const already = sleepKeys.some((key) => (metricWeights[key] ?? 0) > 0)
      if (!already && sleepKeys.length > 0) {
        Object.assign(metricWeights, splitPointsAcross(sleepKeys, legacy.sleep))
      } else if (!already && (metricWeights.sleep ?? 0) <= 0) {
        metricWeights.sleep = legacy.sleep
      }
    }

    if (legacy.exercise > 0) {
      const workoutKeys = getDailyLogWorkoutTypes().map((t) => workoutMetricKey(t.id))
      const already = workoutKeys.some((key) => (metricWeights[key] ?? 0) > 0)
      if (!already && workoutKeys.length > 0) {
        Object.assign(metricWeights, splitPointsAcross(workoutKeys, legacy.exercise))
      }
    }
  }

  // Metrics in OR groups should not also hold standalone weights
  const grouped = new Set(orGroups.flatMap((g) => g.metricKeys))
  for (const key of grouped) {
    delete metricWeights[key]
  }

  return {
    metricWeights: normalizeMetricWeights(metricWeights),
    dailyTargets: normalizeDailyTargets(dailyTargets),
    orGroups: orGroups.map((g) => ({
      ...g,
      weight: clampWeight(g.weight),
      metricKeys: g.metricKeys.filter((k) => !k.startsWith('')),
    })),
    exerciseDailyMinutes: { ...(formula.exerciseDailyMinutes ?? {}) },
    equalWeights: formula.equalWeights === true,
  }
}

function normalizeFormula(raw: unknown): PulseFormula {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const weightsRaw =
    obj.weights && typeof obj.weights === 'object'
      ? (obj.weights as Partial<PulseWeights>)
      : undefined
  const minutesRaw =
    obj.exerciseDailyMinutes && typeof obj.exerciseDailyMinutes === 'object'
      ? (obj.exerciseDailyMinutes as Record<string, unknown>)
      : {}

  const exerciseDailyMinutes: Record<string, number> = {}
  for (const [key, value] of Object.entries(minutesRaw)) {
    const n = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(n) && n > 0) exerciseDailyMinutes[key] = Math.round(n)
  }

  const base: PulseFormula = {
    metricWeights: normalizeMetricWeights(obj.metricWeights),
    dailyTargets: normalizeDailyTargets(obj.dailyTargets),
    orGroups: normalizeOrGroups(obj.orGroups),
    exerciseDailyMinutes,
    equalWeights: obj.equalWeights === true,
    weights: weightsRaw ? normalizeLegacyWeights(weightsRaw) : undefined,
  }

  return migrateLegacyPulseFormula(base)
}

export function normalizePulseConfig(raw: unknown): PulseConfig {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PULSE_CONFIG }
  const historyRaw = (raw as PulseConfig).history
  if (!Array.isArray(historyRaw)) return { ...EMPTY_PULSE_CONFIG }

  const history = historyRaw
    .filter(
      (v) =>
        v &&
        typeof v === 'object' &&
        typeof v.effectiveFrom === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(v.effectiveFrom),
    )
    .map((v) => ({
      effectiveFrom: v.effectiveFrom,
      formula: normalizeFormula(v.formula),
    }))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))

  return { history }
}

export function getPulseConfig(): PulseConfig {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (raw) return normalizePulseConfig(JSON.parse(raw))
  } catch {
    /* ignore */
  }
  return { ...EMPTY_PULSE_CONFIG }
}

export function savePulseConfig(config: PulseConfig) {
  storageSetItem(STORAGE_KEY, JSON.stringify(normalizePulseConfig(config)))
}

export function isPulseConfigured(config: PulseConfig): boolean {
  return config.history.length > 0
}

export function metricWeightsSum(metricWeights: Record<string, number> | undefined): number {
  if (!metricWeights) return 0
  return Object.values(metricWeights).reduce((sum, n) => sum + (n ?? 0), 0)
}

/** @deprecated Prefer formulaWeightsSum / metricWeightsSum. */
export function weightsSum(
  weights: PulseWeights,
  metricWeights?: Record<string, number>,
): number {
  return (
    weights.habits +
    weights.focus +
    weights.sleep +
    weights.exercise +
    metricWeightsSum(metricWeights)
  )
}

export function formulaWeightsSum(formula: PulseFormula): number {
  const groups = (formula.orGroups ?? []).reduce((sum, group) => sum + (group.weight > 0 ? group.weight : 0), 0)
  return metricWeightsSum(formula.metricWeights) + groups
}

export function formulaIncludedCount(formula: PulseFormula): number {
  let count = 0
  for (const value of Object.values(formula.metricWeights ?? {})) {
    if (value > 0) count += 1
  }
  for (const group of formula.orGroups ?? []) {
    if (group.weight > 0) count += 1
  }
  return count
}

export function metricsInOrGroups(formula: PulseFormula): Set<string> {
  return new Set((formula.orGroups ?? []).flatMap((group) => group.metricKeys))
}

export function formatPulseOrGroupLabel(
  group: PulseOrGroup,
  options: PulseMetricOption[],
  hybridGoals: Goal[] = [],
): string {
  if (group.label?.trim()) return group.label.trim()
  const names = group.metricKeys.map((key) => pulseMetricOptionLabel(key, options, hybridGoals))
  if (names.length === 0) return 'Either/or'
  if (names.length === 2) return `${names[0]} or ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`
}

function normalizeWorkoutMatchToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Weekly quantity target from outcome links / hybrid goals (not Pulse daily override). */
export function resolveWeeklyQuantityTarget(
  metricKey: MetricKey,
  hybridGoals: Goal[],
): number | null {
  const isWorkout = metricKey.startsWith('workout_')
  const workoutTypeId = isWorkout ? metricKey.slice('workout_'.length) : null
  const workoutType = workoutTypeId
    ? getWorkoutTypes().find((type) => type.id === workoutTypeId)
    : null
  const workoutLabelToken = workoutType
    ? normalizeWorkoutMatchToken(workoutType.label)
    : workoutTypeId
      ? normalizeWorkoutMatchToken(workoutTypeId)
      : null

  for (const goal of getActiveOutcomeGoals()) {
    const weekly = goal.links.find(
      (link) => link.metric_key === metricKey && link.period === 'weekly',
    )
    if (weekly && weekly.target_value > 0) return weekly.target_value

    // Workout volume targets are treated as weekly even when link.period / recurrence
    // were left on daily or a custom cadence (common for Exercise outcome goals).
    if (isWorkout) {
      const exact = goal.links.find(
        (entry) =>
          entry.metric_key === metricKey &&
          entry.target_value > 0 &&
          entry.period !== 'by_deadline',
      )
      if (exact) return exact.target_value

      if (workoutLabelToken) {
        const byLabel = goal.links.find((entry) => {
          if (!entry.metric_key.startsWith('workout_') || entry.target_value <= 0) return false
          if (entry.period === 'by_deadline') return false
          const linkTypeId = entry.metric_key.slice('workout_'.length)
          if (normalizeWorkoutMatchToken(linkTypeId) === normalizeWorkoutMatchToken(workoutTypeId!)) {
            return true
          }
          const linkType = getWorkoutTypes().find((type) => type.id === linkTypeId)
          const linkLabel = linkType?.label || metricLabel(entry.metric_key)
          return normalizeWorkoutMatchToken(linkLabel) === workoutLabelToken
        })
        if (byLabel) return byLabel.target_value
      }
    }
  }

  const hybridRaw = hybridGoals.find((g) => g.is_active && g.metric_key === metricKey)
  if (hybridRaw && hasTarget(hybridRaw) && (hybridRaw.target_value ?? 0) > 0) {
    const hybrid = normalizeGoal(hybridRaw)
    if (goalTargetPeriod(hybrid) === 'weekly' || isWorkout) return hybrid.target_value
  }

  // Last resort: hybrid workout goal matched by label (renamed types / slug drift).
  if (isWorkout && workoutLabelToken) {
    for (const goal of hybridGoals) {
      if (!goal.is_active || !goal.metric_key.startsWith('workout_') || !hasTarget(goal)) continue
      const target = goal.target_value ?? 0
      if (target <= 0) continue
      const typeId = goal.metric_key.slice('workout_'.length)
      const type = getWorkoutTypes().find((entry) => entry.id === typeId)
      const label = type?.label || goal.name || typeId
      if (normalizeWorkoutMatchToken(label) === workoutLabelToken) return target
    }
  }

  return null
}

/**
 * True when Pulse needs an explicit daily target.
 * Workouts are usually daily logs with weekly volume targets — those need a daily Pulse bar.
 */
export function metricNeedsPulseDailyTarget(
  metricKey: MetricKey,
  hybridGoals: Goal[],
): boolean {
  if (metricKey.startsWith('habit_')) return false
  if (sleepMetricIdFromLibraryKey(metricKey)) return false

  if (resolveWeeklyQuantityTarget(metricKey, hybridGoals) != null) return true

  if (metricKey.startsWith('workout_')) {
    const id = metricKey.replace('workout_', '')
    if (getWeeklyLogWorkoutTypes().some((type) => type.id === id)) return true

    // Any outcome / hybrid weekly volume goal for this workout
    for (const goal of getActiveOutcomeGoals()) {
      const link = goal.links.find((entry) => entry.metric_key === metricKey)
      if (!link || link.target_value <= 0) continue
      if (link.period === 'weekly') return true
      if (goal.recurrence === 'weekly' && link.period !== 'by_deadline') return true
    }
    const hybridRaw = hybridGoals.find((g) => g.is_active && g.metric_key === metricKey)
    if (hybridRaw && hasTarget(hybridRaw)) {
      return goalTargetPeriod(normalizeGoal(hybridRaw)) === 'weekly'
    }
    // Default: workouts need a daily Pulse target whenever included
    return true
  }

  if (metricKey === 'focus') {
    const focusGoal = hybridGoals.find((g) => g.is_active && g.metric_key === 'focus')
    if (focusGoal && hasTarget(focusGoal) && goalTargetPeriod(normalizeGoal(focusGoal)) === 'weekly') {
      return true
    }
    return focusGoal?.log_period === 'weekly' || getFocusSettings().focusGoalPeriod === 'weekly'
  }

  if (metricKey === 'weight') {
    const weightGoal = getActiveWeightGoal(hybridGoals)
    return weightGoal != null && isWeightLoggedWeekly(weightGoal)
  }

  const hybridRaw = hybridGoals.find((g) => g.is_active && g.metric_key === metricKey)
  if (!hybridRaw) return false
  const hybrid = normalizeGoal(hybridRaw)
  if (hasTarget(hybrid) && goalTargetPeriod(hybrid) === 'weekly') return true
  return hybrid.log_period === 'weekly'
}

export function defaultPulseDailyTarget(
  metricKey: MetricKey,
  hybridGoals: Goal[],
): number | null {
  const weekly = resolveWeeklyQuantityTarget(metricKey, hybridGoals)
  if (weekly != null && weekly > 0) {
    return Math.round((weekly / 7) * 100) / 100
  }
  if (metricKey.startsWith('workout_')) return 30
  if (metricKey === 'focus') return 60
  return null
}

/** Included metric keys that still need a daily Pulse target step. */
export function getIncludedMetricsNeedingDailyTarget(
  formula: PulseFormula,
  goals: Goal[],
): PulseMetricOption[] {
  const optionsByKey = new Map(listPulseMetricOptions(goals).map((o) => [o.key as string, o]))
  const used = new Set<string>([
    ...Object.keys(formula.metricWeights ?? {}).filter((k) => (formula.metricWeights[k] ?? 0) > 0),
    ...(formula.orGroups ?? []).filter((g) => g.weight > 0).flatMap((g) => g.metricKeys),
  ])
  const out: PulseMetricOption[] = []
  for (const key of used) {
    const option = optionsByKey.get(key)
    if (!option?.needsDailyTarget) continue
    out.push(option)
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

function isFocusAvailable(hybridGoals: Goal[]): boolean {
  if (hybridGoals.some((g) => g.is_active && g.metric_key === 'focus')) return true
  if (getFocusSettings().focusGoalEnabled) return true
  return getEnabledMetricsSections().includes('focus')
}

/** Metrics the user can include in Pulse (daily + weekly library items). */
export function listPulseMetricOptions(hybridGoals: Goal[]): PulseMetricOption[] {
  const options: PulseMetricOption[] = []
  const seen = new Set<string>()

  const push = (
    key: MetricKey,
    label: string,
    unit: string,
    categoryId: string | null | undefined,
    description: string,
    logPeriod: 'daily' | 'weekly',
  ) => {
    if (seen.has(key)) return
    seen.add(key)
    const resolved = resolveLibraryCategoryId(categoryId)
    const needsDailyTarget = metricNeedsPulseDailyTarget(key, hybridGoals)
    options.push({
      key,
      label,
      unit,
      categoryId: resolved,
      categoryLabel: libraryCategoryLabel(resolved),
      description: needsDailyTarget
        ? 'Weekly target — set a daily Pulse target next'
        : description,
      logPeriod: needsDailyTarget ? 'weekly' : logPeriod,
      needsDailyTarget,
    })
  }

  for (const habit of getDailyLogHabitTypes()) {
    push(
      `habit_${habit.id}` as MetricKey,
      habit.label,
      habit.duration_unit || 'days',
      habit.category_id,
      'Daily habit check-off',
      'daily',
    )
  }

  for (const habit of getWeeklyLogHabitTypes()) {
    push(
      `habit_${habit.id}` as MetricKey,
      habit.label,
      habit.duration_unit || 'days',
      habit.category_id,
      'Weekly habit — counts if done today for Pulse',
      'weekly',
    )
  }

  const sleepConfig = getSleepMetricsConfig()
  for (const metric of getPulseSleepMetrics(sleepConfig)) {
    push(
      sleepLibraryMetricKey(metric.id),
      metric.label,
      sleepMetricDisplayUnit(metric),
      sleepConfig.categories?.[metric.id],
      'Sleep metric vs your target',
      'daily',
    )
  }

  if (isFocusAvailable(hybridGoals)) {
    const focusGoal = hybridGoals.find((g) => g.is_active && g.metric_key === 'focus')
    push(
      'focus',
      focusGoal?.name || 'Focus',
      focusGoal?.unit || 'min',
      focusGoal?.category_id ?? 'focus',
      'Focus minutes vs your goal',
      focusGoal?.log_period === 'weekly' ? 'weekly' : 'daily',
    )
  }

  for (const type of getDailyLogWorkoutTypes()) {
    push(
      workoutMetricKey(type.id),
      type.label,
      type.unit || 'min',
      type.category_id,
      'Workout minutes logged today',
      'daily',
    )
  }

  for (const type of getWeeklyLogWorkoutTypes()) {
    push(
      workoutMetricKey(type.id),
      type.label,
      type.unit || 'min',
      type.category_id,
      'Workout minutes logged today',
      'weekly',
    )
  }

  const weightGoal = getActiveWeightGoal(hybridGoals)
  if (weightGoal) {
    push(
      'weight',
      weightGoal.name || 'Weight',
      weightGoal.unit || 'kg',
      weightGoal.category_id,
      'Weigh-in vs your goal',
      isWeightLoggedWeekly(weightGoal) ? 'weekly' : 'daily',
    )
  }

  for (const goal of getActiveGoals(hybridGoals)) {
    if (
      goal.metric_key === 'focus' ||
      goal.metric_key === 'sleep' ||
      goal.metric_key === 'weight' ||
      goal.metric_key.startsWith('workout_') ||
      goal.metric_key.startsWith('habit_') ||
      sleepMetricIdFromLibraryKey(goal.metric_key)
    ) {
      continue
    }
    push(
      goal.metric_key,
      goal.name || metricLabel(goal.metric_key),
      goal.unit || defaultUnitForMetric(goal.metric_key),
      goal.category_id,
      hasTarget(goal) ? 'Daily metric vs your goal' : 'Daily metric',
      goal.log_period === 'weekly' ? 'weekly' : 'daily',
    )
  }

  return options.sort(
    (a, b) =>
      a.categoryLabel.localeCompare(b.categoryLabel) || a.label.localeCompare(b.label),
  )
}

/** @deprecated Use listPulseMetricOptions. */
export function getPulseCustomMetricGoals(goals: Goal[]): Goal[] {
  return getActiveGoals(goals)
    .filter((g) => g.metric_key.startsWith('custom:') && hasTarget(g))
    .sort((a, b) =>
      (a.name || metricLabel(a.metric_key)).localeCompare(b.name || metricLabel(b.metric_key)),
    )
}

/** @deprecated */
export function pulseCustomMetricLabel(goal: Goal): string {
  return goal.name?.trim() || metricLabel(goal.metric_key)
}

/** @deprecated */
export function hasWorkoutGoalsForPulse(goals: Goal[]): boolean {
  return goals.some((g) => g.is_active && g.metric_key.startsWith('workout_') && hasTarget(g))
}

/** @deprecated */
export function getWorkoutGoalCategories(goals: Goal[]): string[] {
  return goals
    .filter((g) => g.is_active && g.metric_key.startsWith('workout_') && hasTarget(g))
    .map((g) => g.metric_key.replace('workout_', ''))
}

/** @deprecated */
export function getPulseAssignableSlots(goals: Goal[]): MetricKey[] {
  return listPulseMetricOptions(goals).map((option) => option.key)
}

export function equalizePulseFormula(formula: PulseFormula, goals: Goal[]): PulseFormula {
  const options = listPulseMetricOptions(goals)
  const grouped = metricsInOrGroups(formula)
  const includedMetrics = options
    .map((option) => option.key)
    .filter((key) => !grouped.has(key) && (formula.metricWeights[key] ?? 0) > 0)
  const includedGroups = (formula.orGroups ?? []).filter((group) => group.weight > 0)

  const next = copyPulseFormula(formula)
  next.equalWeights = true
  next.metricWeights = {}
  next.orGroups = (formula.orGroups ?? []).map((group) => ({ ...group, weight: 0 }))

  const hasAny = includedMetrics.length > 0 || includedGroups.length > 0
  if (!hasAny) {
    for (const option of options) {
      if (!grouped.has(option.key)) next.metricWeights[option.key] = 1
    }
    next.orGroups = (formula.orGroups ?? []).map((group) => ({ ...group, weight: 1 }))
    return ensureDailyTargets(next, goals)
  }

  for (const key of includedMetrics) next.metricWeights[key] = 1
  next.orGroups = (formula.orGroups ?? []).map((group) => ({
    ...group,
    weight: includedGroups.some((g) => g.id === group.id) ? 1 : 0,
  }))
  return ensureDailyTargets(next, goals)
}

export function assignPointsPulseFormula(formula: PulseFormula, goals: Goal[]): PulseFormula {
  const options = listPulseMetricOptions(goals)
  const grouped = metricsInOrGroups(formula)
  type Slot =
    | { kind: 'metric'; key: MetricKey }
    | { kind: 'group'; id: string }

  const included: Slot[] = []
  for (const option of options) {
    if (grouped.has(option.key)) continue
    if ((formula.metricWeights[option.key] ?? 0) > 0) {
      included.push({ kind: 'metric', key: option.key })
    }
  }
  for (const group of formula.orGroups ?? []) {
    if (group.weight > 0) included.push({ kind: 'group', id: group.id })
  }

  const slots: Slot[] =
    included.length > 0
      ? included
      : [
          ...options
            .filter((option) => !grouped.has(option.key))
            .map((option) => ({ kind: 'metric' as const, key: option.key })),
          ...(formula.orGroups ?? []).map((group) => ({ kind: 'group' as const, id: group.id })),
        ]

  const next = copyPulseFormula(formula)
  next.metricWeights = {}
  next.orGroups = (formula.orGroups ?? []).map((group) => ({ ...group, weight: 0 }))
  next.equalWeights = false
  if (slots.length === 0) return next

  const base = Math.floor(PULSE_POINTS_TOTAL / slots.length)
  let extra = PULSE_POINTS_TOTAL % slots.length
  for (const slot of slots) {
    const points = base + (extra > 0 ? 1 : 0)
    if (extra > 0) extra -= 1
    if (slot.kind === 'metric') next.metricWeights[slot.key] = points
    else {
      next.orGroups = next.orGroups.map((group) =>
        group.id === slot.id ? { ...group, weight: points } : group,
      )
    }
  }
  return ensureDailyTargets(next, goals)
}

/** Seed / keep Pulse daily targets for weekly metrics that are included. */
export function ensureDailyTargets(formula: PulseFormula, goals: Goal[]): PulseFormula {
  const optionsByKey = new Map(listPulseMetricOptions(goals).map((o) => [o.key as string, o]))
  const usedKeys = new Set<string>([
    ...Object.keys(formula.metricWeights ?? {}).filter((k) => (formula.metricWeights[k] ?? 0) > 0),
    ...(formula.orGroups ?? [])
      .filter((g) => g.weight > 0)
      .flatMap((g) => g.metricKeys),
  ])
  const dailyTargets = { ...(formula.dailyTargets ?? {}) }
  for (const key of usedKeys) {
    const option = optionsByKey.get(key)
    if (!option?.needsDailyTarget) continue
    if ((dailyTargets[key] ?? 0) > 0) continue
    const fallback = defaultPulseDailyTarget(key as MetricKey, goals)
    if (fallback != null && fallback > 0) dailyTargets[key] = fallback
  }
  return { ...formula, dailyTargets }
}

/** Drop weights for metrics that no longer exist in the library. */
export function prunePulseFormulaMetrics(formula: PulseFormula, goals: Goal[]): PulseFormula {
  const eligible = new Set(listPulseMetricOptions(goals).map((option) => option.key as string))
  const metricWeights: Record<string, number> = {}
  for (const [key, value] of Object.entries(formula.metricWeights ?? {})) {
    if (eligible.has(key) && value > 0) metricWeights[key] = value
  }

  const orGroups = (formula.orGroups ?? [])
    .map((group) => ({
      ...group,
      metricKeys: group.metricKeys.filter((key) => eligible.has(key)),
      weight: clampWeight(group.weight),
    }))
    .filter((group) => group.metricKeys.length >= 2)

  const grouped = new Set(orGroups.flatMap((g) => g.metricKeys))
  for (const key of grouped) delete metricWeights[key]

  const dailyTargets: Record<string, number> = {}
  for (const [key, value] of Object.entries(formula.dailyTargets ?? {})) {
    if (eligible.has(key) && value > 0) dailyTargets[key] = value
  }

  const exerciseDailyMinutes: Record<string, number> = {}
  for (const [key, value] of Object.entries(formula.exerciseDailyMinutes ?? {})) {
    const metricKey = key.startsWith('workout_') ? key : workoutMetricKey(key)
    if (eligible.has(metricKey) && value > 0) exerciseDailyMinutes[key] = value
  }

  return ensureDailyTargets(
    {
      metricWeights,
      dailyTargets,
      orGroups,
      exerciseDailyMinutes,
      equalWeights: formula.equalWeights === true,
    },
    goals,
  )
}

export function createPulseOrGroup(
  formula: PulseFormula,
  metricKeys: MetricKey[],
  goals: Goal[],
): PulseFormula {
  const unique = [...new Set(metricKeys)]
  if (unique.length < 2) return formula
  const next = copyPulseFormula(formula)
  // Remove keys from existing groups
  next.orGroups = next.orGroups
    .map((group) => ({
      ...group,
      metricKeys: group.metricKeys.filter((key) => !unique.includes(key)),
    }))
    .filter((group) => group.metricKeys.length >= 2)

  let weight = 0
  for (const key of unique) {
    weight += next.metricWeights[key] ?? 0
    delete next.metricWeights[key]
  }
  if (weight <= 0) weight = next.equalWeights ? 1 : 0

  next.orGroups.push({
    id: crypto.randomUUID(),
    metricKeys: unique,
    weight,
  })
  next.equalWeights = formula.equalWeights === true
  return ensureDailyTargets(next, goals)
}

export function dissolvePulseOrGroup(
  formula: PulseFormula,
  groupId: string,
  goals: Goal[],
): PulseFormula {
  const next = copyPulseFormula(formula)
  const group = next.orGroups.find((g) => g.id === groupId)
  if (!group) return formula
  next.orGroups = next.orGroups.filter((g) => g.id !== groupId)
  if (group.weight > 0) {
    if (next.equalWeights) {
      for (const key of group.metricKeys) next.metricWeights[key] = 1
    } else {
      Object.assign(
        next.metricWeights,
        splitPointsAcross(group.metricKeys, group.weight),
      )
    }
  }
  return ensureDailyTargets(next, goals)
}

export function setPulseOrGroupWeight(
  formula: PulseFormula,
  groupId: string,
  weight: number,
  options?: { keepEqualMode?: boolean },
): PulseFormula {
  const next = copyPulseFormula(formula)
  next.orGroups = next.orGroups.map((group) =>
    group.id === groupId ? { ...group, weight: clampWeight(weight) } : group,
  )
  if (!options?.keepEqualMode) next.equalWeights = false
  return next
}

export function getPulseFormulaForDate(config: PulseConfig, date: string): PulseFormula | null {
  if (config.history.length === 0) return null

  let active: PulseFormula | null = null
  for (const version of config.history) {
    if (version.effectiveFrom <= date) active = version.formula
    else break
  }
  return active
}

export function getCurrentPulseFormula(config: PulseConfig, today: string): PulseFormula | null {
  return getPulseFormulaForDate(config, today)
}

export function applyPulseFormula(
  config: PulseConfig,
  today: string,
  formula: PulseFormula,
): { next: PulseConfig; isReconfigure: boolean } {
  const isReconfigure = isPulseConfigured(config)
  const history = [...config.history]
  const last = history[history.length - 1]
  const stored = copyPulseFormula(formula)

  if (last?.effectiveFrom === today) {
    history[history.length - 1] = { effectiveFrom: today, formula: stored }
  } else {
    history.push({ effectiveFrom: today, formula: stored })
  }

  history.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  return { next: { history }, isReconfigure }
}

/**
 * Resolve a daily target for a Pulse metric.
 * Prefers Pulse dailyTargets, then outcome/hybrid targets, sleep config, weekly÷7 fallback.
 */
export function resolvePulseMetricTarget(
  metricKey: MetricKey,
  hybridGoals: Goal[],
  formula?: PulseFormula | null,
  sleepConfig?: SleepMetricsConfig,
): number | null {
  const fromPulse = formula?.dailyTargets?.[metricKey]
  if (fromPulse != null && fromPulse > 0) return fromPulse

  if (metricKey.startsWith('workout_')) {
    const category = metricKey.replace('workout_', '')
    const legacy =
      formula?.exerciseDailyMinutes?.[category] ?? formula?.exerciseDailyMinutes?.[metricKey]
    if (legacy != null && legacy > 0) return legacy
  }

  for (const goal of getActiveOutcomeGoals()) {
    const daily = goal.links.find((link) => link.metric_key === metricKey && link.period === 'daily')
    if (daily && daily.target_value > 0) return daily.target_value
  }

  const hybridRaw = hybridGoals.find((g) => g.is_active && g.metric_key === metricKey && hasTarget(g))
  if (hybridRaw?.target_value != null && hybridRaw.target_value > 0) {
    const hybrid = normalizeGoal(hybridRaw)
    // Weekly volume targets are not daily Pulse bars — use dailyTargets or ÷7 below.
    if (goalTargetPeriod(hybrid) !== 'weekly' && hybrid.log_period !== 'weekly') {
      return hybrid.target_value
    }
  }

  const sleepId = sleepMetricIdFromLibraryKey(metricKey)
  if (sleepId) {
    const config = sleepConfig ?? getSleepMetricsConfig()
    const target = getSleepMetricTarget(config, sleepId)
    if (target != null && target > 0) return target
  }

  if (metricKey === 'focus') {
    const focus = getFocusSettings()
    if (focus.focusGoalPeriod !== 'weekly' && focus.focusGoalAmount > 0) {
      return focus.focusGoalUnit === 'hours'
        ? focus.focusGoalAmount * 60
        : focus.focusGoalAmount
    }
  }

  // Weekly metrics: default to weekly target ÷ 7
  const weeklyDefault = defaultPulseDailyTarget(metricKey, hybridGoals)
  if (weeklyDefault != null && weeklyDefault > 0) return weeklyDefault

  return null
}

export function computeExerciseRate(
  date: string,
  workouts: Workout[],
  exerciseDailyMinutes: Record<string, number>,
): number {
  const dayWorkouts = workouts.filter((w) => w.date === date)
  const loggedByCategory = new Map<string, number>()
  for (const workout of dayWorkouts) {
    loggedByCategory.set(
      workout.category,
      (loggedByCategory.get(workout.category) ?? 0) + workout.duration_minutes,
    )
  }

  let sum = 0
  for (const [category, threshold] of Object.entries(exerciseDailyMinutes)) {
    if (!threshold || threshold <= 0) continue
    const logged = loggedByCategory.get(category) ?? 0
    if (logged <= 0) continue
    sum += Math.min(100, (logged / threshold) * 100)
  }

  return Math.min(100, sum)
}

export function isValidPulseFormula(
  formula: PulseFormula,
  goals: Goal[],
): { valid: boolean; reason?: string } {
  const pruned = prunePulseFormulaMetrics(formula, goals)

  if (pruned.equalWeights) {
    if (formulaIncludedCount(pruned) <= 0) {
      return { valid: false, reason: 'Include at least one metric.' }
    }
  } else if (formulaWeightsSum(pruned) !== PULSE_POINTS_TOTAL) {
    return { valid: false, reason: `Assign all ${PULSE_POINTS_TOTAL} points before saving.` }
  }

  const optionsByKey = new Map(listPulseMetricOptions(goals).map((o) => [o.key as string, o]))
  const usedKeys = new Set<string>([
    ...Object.keys(pruned.metricWeights).filter((k) => (pruned.metricWeights[k] ?? 0) > 0),
    ...pruned.orGroups.filter((g) => g.weight > 0).flatMap((g) => g.metricKeys),
  ])
  for (const key of usedKeys) {
    const option = optionsByKey.get(key)
    if (!option?.needsDailyTarget) continue
    const target = resolvePulseMetricTarget(key as MetricKey, goals, pruned)
    if (target == null || target <= 0) {
      return {
        valid: false,
        reason: `Set a daily Pulse target for ${option.label}.`,
      }
    }
  }

  return { valid: true }
}

export function copyPulseFormula(formula: PulseFormula): PulseFormula {
  return {
    metricWeights: { ...formula.metricWeights },
    dailyTargets: { ...(formula.dailyTargets ?? {}) },
    orGroups: (formula.orGroups ?? []).map((group) => ({
      ...group,
      metricKeys: [...group.metricKeys],
    })),
    exerciseDailyMinutes: { ...formula.exerciseDailyMinutes },
    equalWeights: formula.equalWeights === true,
  }
}

export function createDefaultPulseFormula(goals: Goal[]): PulseFormula {
  const options = listPulseMetricOptions(goals)
  const preferredKeys: MetricKey[] = []

  for (const habit of getDailyLogHabitTypes()) {
    preferredKeys.push(`habit_${habit.id}` as MetricKey)
  }
  if (options.some((option) => option.key === 'focus')) preferredKeys.push('focus')
  for (const metric of getPulseSleepMetrics(getSleepMetricsConfig())) {
    preferredKeys.push(sleepLibraryMetricKey(metric.id))
  }

  const slots =
    preferredKeys.length > 0
      ? preferredKeys.filter((key) => options.some((option) => option.key === key))
      : options.map((option) => option.key)

  return ensureDailyTargets(
    {
      metricWeights: splitPointsAcross(slots.slice(0, 8), PULSE_POINTS_TOTAL),
      dailyTargets: {},
      orGroups: [],
      exerciseDailyMinutes: {},
      equalWeights: false,
    },
    goals,
  )
}

export function pulseMetricOptionLabel(
  key: string,
  options: PulseMetricOption[],
  hybridGoals: Goal[] = [],
): string {
  const fromOptions = options.find((option) => option.key === key)
  if (fromOptions) return fromOptions.label
  if (key.startsWith('habit_')) {
    const habit = getDailyLogHabitTypes().find((h) => `habit_${h.id}` === key)
    if (habit) return habit.label
  }
  if (key.startsWith('workout_')) {
    const type = getWorkoutTypes().find((t) => workoutMetricKey(t.id) === key)
    if (type) return type.label
  }
  const sleepId = sleepMetricIdFromLibraryKey(key)
  if (sleepId) {
    const metric = getEnabledSleepMetrics(getSleepMetricsConfig()).find((m) => m.id === sleepId)
    if (metric) return metric.label
  }
  const hybrid = hybridGoals.find((g) => g.metric_key === key)
  return hybrid?.name || metricLabel(key as MetricKey)
}
