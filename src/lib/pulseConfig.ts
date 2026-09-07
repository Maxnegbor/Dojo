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
import {
  HABITIFY_CATEGORY_ID,
  getHabitifyHabitCatalog,
  habitifyMetricKey,
  isHabitifyConnected,
} from '@/lib/habitifyStore'
import {
  WHOOP_CATEGORY_ID,
  WHOOP_METRIC_GROUPS,
  WHOOP_METRICS,
  getWhoopMetric,
  isWhoopConnected,
  isWhoopPulseMetric,
} from '@/lib/whoopStore'
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
   * How included metrics share Pulse.
   * `equal` — every slot the same. `category` — each category the same, split inside.
   * `points` — 10-point pool. Legacy `equalWeights` maps to `equal`.
   */
  weightMode?: PulseWeightMode
  /**
   * When true, included slots (weight &gt; 0) each count equally —
   * no 10-point pool. Weights are typically 0 or 1.
   * @deprecated Prefer weightMode. Kept for stored formulas.
   */
  equalWeights?: boolean
  /** @deprecated Migrated into metricWeights on read. */
  weights?: PulseWeights
}

export type PulseWeightMode = 'equal' | 'category' | 'points'

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
  /** Nested group inside a category (e.g. WHOOP recovery / sleep / strain). */
  groupId?: string
  groupLabel?: string
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
    equalWeights: getPulseWeightMode(formula) === 'equal',
    weightMode: getPulseWeightMode(formula),
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
    weightMode: parsePulseWeightMode(obj.weightMode, obj.equalWeights === true),
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

export function getPulseWeightMode(formula: PulseFormula): PulseWeightMode {
  if (formula.weightMode === 'equal' || formula.weightMode === 'category' || formula.weightMode === 'points') {
    return formula.weightMode
  }
  return formula.equalWeights === true ? 'equal' : 'points'
}

function parsePulseWeightMode(raw: unknown, equalWeights: boolean): PulseWeightMode | undefined {
  if (raw === 'equal' || raw === 'category' || raw === 'points') return raw
  return equalWeights ? 'equal' : undefined
}

function applyWeightModeFlags(formula: PulseFormula, mode: PulseWeightMode): PulseFormula {
  formula.weightMode = mode
  formula.equalWeights = mode === 'equal'
  return formula
}

function optionCategory(
  option: PulseMetricOption | undefined,
): { id: string; label: string } {
  return {
    id: option?.categoryId || 'ungrouped',
    label: option?.categoryLabel || 'Ungrouped',
  }
}

function orGroupCategory(
  group: PulseOrGroup,
  optionByKey: Map<string, PulseMetricOption>,
): { id: string; label: string } {
  const cats = group.metricKeys
    .map((key) => optionByKey.get(key))
    .filter((option): option is PulseMetricOption => option != null)
    .map((option) => optionCategory(option))
  if (cats.length > 0 && cats.every((entry) => entry.id === cats[0]!.id)) return cats[0]!
  return { id: 'grouped', label: 'Grouped' }
}

export type PulseWeightSlot =
  | {
      kind: 'metric'
      key: MetricKey
      categoryId: string
      categoryLabel: string
    }
  | {
      kind: 'group'
      id: string
      categoryId: string
      categoryLabel: string
      metricKeys: MetricKey[]
    }

/** Included standalone metrics and either/or groups, in Pulse category order. */
export function listIncludedPulseSlots(formula: PulseFormula, goals: Goal[]): PulseWeightSlot[] {
  const options = listPulseMetricOptions(goals)
  const optionByKey = new Map(options.map((option) => [option.key as string, option]))
  const grouped = metricsInOrGroups(formula)
  const slots: PulseWeightSlot[] = []

  for (const option of options) {
    if (grouped.has(option.key)) continue
    if ((formula.metricWeights[option.key] ?? 0) <= 0) continue
    const category = optionCategory(option)
    slots.push({
      kind: 'metric',
      key: option.key,
      categoryId: category.id,
      categoryLabel: category.label,
    })
  }

  for (const group of formula.orGroups ?? []) {
    if (group.weight <= 0) continue
    const category = orGroupCategory(group, optionByKey)
    slots.push({
      kind: 'group',
      id: group.id,
      categoryId: category.id,
      categoryLabel: category.label,
      metricKeys: [...group.metricKeys],
    })
  }

  return slots
}

/**
 * Weights used to score Pulse. Category mode gives each category the same share,
 * split equally among its included slots.
 */
export function effectivePulseWeights(
  formula: PulseFormula,
  goals: Goal[],
): { metricWeights: Record<string, number>; orGroupWeights: Record<string, number> } {
  const mode = getPulseWeightMode(formula)
  const slots = listIncludedPulseSlots(formula, goals)
  const metricWeights: Record<string, number> = {}
  const orGroupWeights: Record<string, number> = {}

  const assign = (slot: PulseWeightSlot, weight: number) => {
    if (slot.kind === 'metric') metricWeights[slot.key] = weight
    else orGroupWeights[slot.id] = weight
  }

  if (mode === 'equal') {
    for (const slot of slots) assign(slot, 1)
    return { metricWeights, orGroupWeights }
  }

  if (mode === 'category') {
    const counts = new Map<string, number>()
    for (const slot of slots) {
      counts.set(slot.categoryId, (counts.get(slot.categoryId) ?? 0) + 1)
    }
    for (const slot of slots) {
      const n = counts.get(slot.categoryId) ?? 1
      assign(slot, n > 0 ? 1 / n : 0)
    }
    return { metricWeights, orGroupWeights }
  }

  for (const slot of slots) {
    if (slot.kind === 'metric') assign(slot, formula.metricWeights[slot.key] ?? 0)
    else {
      const group = (formula.orGroups ?? []).find((entry) => entry.id === slot.id)
      assign(slot, group?.weight ?? 0)
    }
  }
  return { metricWeights, orGroupWeights }
}

export function isPulseMetricIncluded(formula: PulseFormula, key: string): boolean {
  if ((formula.metricWeights[key] ?? 0) > 0) return true
  return (formula.orGroups ?? []).some((group) => group.weight > 0 && group.metricKeys.includes(key as MetricKey))
}

export function setPulseMetricIncluded(
  formula: PulseFormula,
  key: MetricKey,
  included: boolean,
): PulseFormula {
  const next = copyPulseFormula(formula)
  const mode = getPulseWeightMode(next)

  if (!included) {
    delete next.metricWeights[key]
    next.orGroups = next.orGroups
      .map((group) => {
        if (!group.metricKeys.includes(key)) return group
        const metricKeys = group.metricKeys.filter((entry) => entry !== key)
        if (metricKeys.length >= 2) return { ...group, metricKeys }
        if (group.weight > 0) {
          for (const leftover of metricKeys) {
            next.metricWeights[leftover] = mode === 'points' ? group.weight : 1
          }
        }
        return { ...group, metricKeys: [] }
      })
      .filter((group) => group.metricKeys.length >= 2)
    return applyWeightModeFlags(next, mode)
  }

  if (isPulseMetricIncluded(next, key)) return next
  next.metricWeights[key] = 1
  return applyWeightModeFlags(next, mode)
}

export function setPulseCategoryIncluded(
  formula: PulseFormula,
  keys: MetricKey[],
  included: boolean,
): PulseFormula {
  let next = formula
  for (const key of keys) next = setPulseMetricIncluded(next, key, included)
  return next
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
  if (metricKey.startsWith('habitify_')) return false
  if (isWhoopPulseMetric(metricKey)) return true
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
  if (metricKey.startsWith('habit_') || metricKey.startsWith('habitify_')) return 1
  const whoop = getWhoopMetric(metricKey)
  if (whoop) return whoop.defaultTarget
  return null
}

/** Included metrics that should be shown on the daily-target step. */
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
    if (!option) continue
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
    group?: { id: string; label: string },
  ) => {
    if (seen.has(key)) return
    seen.add(key)
    const resolved = resolveLibraryCategoryId(categoryId)
    const needsDailyTarget = metricNeedsPulseDailyTarget(key, hybridGoals)
    const weeklyLogged = needsDailyTarget && !isWhoopPulseMetric(key)
    options.push({
      key,
      label,
      unit,
      categoryId: resolved,
      categoryLabel: libraryCategoryLabel(resolved),
      description: weeklyLogged
        ? 'Weekly target — set a daily Pulse target next'
        : description,
      groupId: group?.id,
      groupLabel: group?.label,
      logPeriod: weeklyLogged ? 'weekly' : logPeriod,
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

  if (isHabitifyConnected()) {
    for (const habit of getHabitifyHabitCatalog()) {
      push(
        habitifyMetricKey(habit.id),
        habit.name,
        'check',
        HABITIFY_CATEGORY_ID,
        habit.type === 'bad' ? 'Habitify — counts if avoided today' : 'Habitify habit check-off',
        'daily',
      )
    }
  }

  if (isWhoopConnected()) {
    const groupLabel = (id: (typeof WHOOP_METRIC_GROUPS)[number]['id']) =>
      WHOOP_METRIC_GROUPS.find((group) => group.id === id)?.label ?? id
    for (const metric of WHOOP_METRICS) {
      push(
        metric.key,
        metric.label,
        metric.unit,
        WHOOP_CATEGORY_ID,
        metric.description,
        'daily',
        { id: metric.group, label: groupLabel(metric.group) },
      )
    }
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

  return options.sort((a, b) => {
    const byCategory = a.categoryLabel.localeCompare(b.categoryLabel)
    if (byCategory !== 0) return byCategory
    if (a.categoryId === WHOOP_CATEGORY_ID && b.categoryId === WHOOP_CATEGORY_ID) {
      const indexOf = (key: string) => {
        const index = WHOOP_METRICS.findIndex((metric) => metric.key === key)
        return index < 0 ? 999 : index
      }
      return indexOf(a.key) - indexOf(b.key)
    }
    return a.label.localeCompare(b.label)
  })
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
  applyWeightModeFlags(next, 'equal')
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
  applyWeightModeFlags(next, 'points')
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

export function equalizePulseFormulaByCategory(formula: PulseFormula, goals: Goal[]): PulseFormula {
  const next = equalizePulseFormula(formula, goals)
  return applyWeightModeFlags(next, 'category')
}

/** Split a category’s current points equally among its included slots (custom points mode). */
export function equalizeCategoryPoints(
  formula: PulseFormula,
  categoryId: string,
  goals: Goal[],
): PulseFormula {
  const next = copyPulseFormula(formula)
  applyWeightModeFlags(next, 'points')
  const slots = listIncludedPulseSlots(next, goals).filter((slot) => slot.categoryId === categoryId)
  if (slots.length === 0) return next

  let total = 0
  for (const slot of slots) {
    if (slot.kind === 'metric') total += next.metricWeights[slot.key] ?? 0
    else {
      const group = next.orGroups.find((entry) => entry.id === slot.id)
      total += group?.weight ?? 0
    }
  }
  if (total <= 0) {
    const remaining = PULSE_POINTS_TOTAL - formulaWeightsSum(next)
    if (remaining <= 0) return next
    total = remaining
  }

  const base = Math.floor(total / slots.length)
  let extra = total % slots.length
  for (const slot of slots) {
    const points = base + (extra > 0 ? 1 : 0)
    if (extra > 0) extra -= 1
    if (slot.kind === 'metric') {
      if (points > 0) next.metricWeights[slot.key] = points
      else delete next.metricWeights[slot.key]
    } else {
      next.orGroups = next.orGroups.map((group) =>
        group.id === slot.id ? { ...group, weight: points } : group,
      )
    }
  }
  return ensureDailyTargets(next, goals)
}

export function setPulseWeightMode(
  formula: PulseFormula,
  mode: PulseWeightMode,
  goals: Goal[],
): PulseFormula {
  if (mode === 'equal') return equalizePulseFormula(formula, goals)
  if (mode === 'category') return equalizePulseFormulaByCategory(formula, goals)
  if (getPulseWeightMode(formula) === 'points') {
    const next = copyPulseFormula(formula)
    return applyWeightModeFlags(next, 'points')
  }
  return assignPointsPulseFormula(formula, goals)
}

/** Seed / keep Pulse daily targets for every included metric. */
export function ensureDailyTargets(formula: PulseFormula, goals: Goal[]): PulseFormula {
  const usedKeys = new Set<string>([
    ...Object.keys(formula.metricWeights ?? {}).filter((k) => (formula.metricWeights[k] ?? 0) > 0),
    ...(formula.orGroups ?? [])
      .filter((g) => g.weight > 0)
      .flatMap((g) => g.metricKeys),
  ])
  const dailyTargets = { ...(formula.dailyTargets ?? {}) }
  const withoutTargets: PulseFormula = { ...formula, dailyTargets: {} }
  for (const key of usedKeys) {
    if ((dailyTargets[key] ?? 0) > 0) continue
    const fallback = resolvePulseMetricTarget(key as MetricKey, goals, withoutTargets)
    if (fallback != null && fallback > 0) dailyTargets[key] = fallback
  }
  return { ...formula, dailyTargets }
}

/** Drop weights for metrics that no longer exist in the library. */
export function prunePulseFormulaMetrics(formula: PulseFormula, goals: Goal[]): PulseFormula {
  const eligible = new Set(listPulseMetricOptions(goals).map((option) => option.key as string))
  const keepUnknownHabitify =
    isHabitifyConnected() && getHabitifyHabitCatalog().length === 0
  const isEligible = (key: string) =>
    eligible.has(key) || (keepUnknownHabitify && key.startsWith('habitify_'))
  const metricWeights: Record<string, number> = {}
  for (const [key, value] of Object.entries(formula.metricWeights ?? {})) {
    if (isEligible(key) && value > 0) metricWeights[key] = value
  }

  const orGroups = (formula.orGroups ?? [])
    .map((group) => ({
      ...group,
      metricKeys: group.metricKeys.filter((key) => isEligible(key)),
      weight: clampWeight(group.weight),
    }))
    .filter((group) => group.metricKeys.length >= 2)

  const grouped = new Set(orGroups.flatMap((g) => g.metricKeys))
  for (const key of grouped) delete metricWeights[key]

  const dailyTargets: Record<string, number> = {}
  for (const [key, value] of Object.entries(formula.dailyTargets ?? {})) {
    if (isEligible(key) && value > 0) dailyTargets[key] = value
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
      equalWeights: getPulseWeightMode(formula) === 'equal',
      weightMode: getPulseWeightMode(formula),
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
  if (weight <= 0) weight = getPulseWeightMode(next) === 'points' ? 0 : 1

  next.orGroups.push({
    id: crypto.randomUUID(),
    metricKeys: unique,
    weight,
  })
  return applyWeightModeFlags(ensureDailyTargets(next, goals), getPulseWeightMode(formula))
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
    if (getPulseWeightMode(next) !== 'points') {
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
  if (!options?.keepEqualMode) applyWeightModeFlags(next, 'points')
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

  if (getPulseWeightMode(pruned) === 'points') {
    if (formulaWeightsSum(pruned) !== PULSE_POINTS_TOTAL) {
      return { valid: false, reason: `Assign all ${PULSE_POINTS_TOTAL} points before saving.` }
    }
  } else if (formulaIncludedCount(pruned) <= 0) {
    return { valid: false, reason: 'Include at least one metric.' }
  }

  const optionsByKey = new Map(listPulseMetricOptions(goals).map((o) => [o.key as string, o]))
  const usedKeys = new Set<string>([
    ...Object.keys(pruned.metricWeights).filter((k) => (pruned.metricWeights[k] ?? 0) > 0),
    ...pruned.orGroups.filter((g) => g.weight > 0).flatMap((g) => g.metricKeys),
  ])
  for (const key of usedKeys) {
    const option = optionsByKey.get(key)
    const target = resolvePulseMetricTarget(key as MetricKey, goals, pruned)
    if (target == null || target <= 0) {
      return {
        valid: false,
        reason: `Set a daily Pulse target for ${option?.label ?? key}.`,
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
    equalWeights: getPulseWeightMode(formula) === 'equal',
    weightMode: getPulseWeightMode(formula),
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
      metricWeights: Object.fromEntries(slots.slice(0, 8).map((key) => [key, 1])),
      dailyTargets: {},
      orGroups: [],
      exerciseDailyMinutes: {},
      equalWeights: true,
      weightMode: 'equal',
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
  if (key.startsWith('habitify_')) {
    const id = key.slice('habitify_'.length)
    const habit = getHabitifyHabitCatalog().find((entry) => entry.id === id)
    if (habit) return habit.name
  }
  const whoop = getWhoopMetric(key)
  if (whoop) return whoop.label
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
