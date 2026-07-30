import { getActiveGoals, hasTarget, metricLabel } from '@/lib/goals'
import { goalTargetPeriod } from '@/lib/goalPeriod'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import type { Goal, MetricKey, Workout } from '@/types'

const STORAGE_KEY = 'personal-os-pulse-config'

export interface PulseWeights {
  habits: number
  focus: number
  sleep: number
  exercise: number
}

export type PulseCoreArea = keyof PulseWeights

export interface PulseFormula {
  weights: PulseWeights
  /** Points for custom metrics with daily goals (`custom:*`). */
  metricWeights: Record<string, number>
  /** Workout category id → minutes in one day that count as 100% for that type. */
  exerciseDailyMinutes: Record<string, number>
  /**
   * When true, included categories (weight &gt; 0) each count equally —
   * no 10-point pool. Weights are typically 0 or 1.
   */
  equalWeights?: boolean
}

export interface PulseFormulaVersion {
  effectiveFrom: string
  formula: PulseFormula
}

export interface PulseConfig {
  history: PulseFormulaVersion[]
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

function normalizeWeights(raw: Partial<PulseWeights> | undefined): PulseWeights {
  return {
    habits: clampWeight(raw?.habits ?? DEFAULT_PULSE_WEIGHTS.habits),
    focus: clampWeight(raw?.focus ?? DEFAULT_PULSE_WEIGHTS.focus),
    sleep: clampWeight(raw?.sleep ?? DEFAULT_PULSE_WEIGHTS.sleep),
    exercise: clampWeight(raw?.exercise ?? DEFAULT_PULSE_WEIGHTS.exercise),
  }
}

function normalizeMetricWeights(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.startsWith('custom:')) continue
    const n = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(n) && n > 0) out[key] = clampWeight(n)
  }
  return out
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

  return {
    weights: normalizeWeights(weightsRaw),
    metricWeights: normalizeMetricWeights(obj.metricWeights),
    exerciseDailyMinutes,
    equalWeights: obj.equalWeights === true,
  }
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
  return weightsSum(formula.weights, formula.metricWeights)
}

/** Custom metrics with a daily goal — assignable in Pulse. */
export function getPulseCustomMetricGoals(goals: Goal[]): Goal[] {
  return getActiveGoals(goals)
    .filter(
      (g) =>
        g.metric_key.startsWith('custom:') &&
        hasTarget(g) &&
        goalTargetPeriod(g) === 'daily',
    )
    .sort((a, b) => (a.name || metricLabel(a.metric_key)).localeCompare(b.name || metricLabel(b.metric_key)))
}

export function pulseCustomMetricLabel(goal: Goal): string {
  return goal.name?.trim() || metricLabel(goal.metric_key)
}

export function hasWorkoutGoalsForPulse(goals: Goal[]): boolean {
  return goals.some((g) => g.is_active && g.metric_key.startsWith('workout_') && hasTarget(g))
}

export function getWorkoutGoalCategories(goals: Goal[]): string[] {
  return goals
    .filter((g) => g.is_active && g.metric_key.startsWith('workout_') && hasTarget(g))
    .map((g) => g.metric_key.replace('workout_', ''))
}

/** Areas + custom metrics that can receive points right now. */
export function getPulseAssignableSlots(goals: Goal[]): Array<PulseCoreArea | MetricKey> {
  const slots: Array<PulseCoreArea | MetricKey> = ['habits', 'focus', 'sleep']
  if (hasWorkoutGoalsForPulse(goals)) slots.push('exercise')
  for (const goal of getPulseCustomMetricGoals(goals)) {
    slots.push(goal.metric_key)
  }
  return slots
}

export function formulaIncludedCount(formula: PulseFormula): number {
  let count = 0
  for (const value of Object.values(formula.weights)) {
    if (value > 0) count += 1
  }
  for (const value of Object.values(formula.metricWeights ?? {})) {
    if (value > 0) count += 1
  }
  return count
}

/** Mark all assignable categories as equal shares (no point pool). */
export function equalizePulseFormula(formula: PulseFormula, goals: Goal[]): PulseFormula {
  const slots = getPulseAssignableSlots(goals)
  const next = copyPulseFormula(formula)
  next.weights = { habits: 0, focus: 0, sleep: 0, exercise: 0 }
  next.metricWeights = {}
  next.equalWeights = true

  for (const slot of slots) {
    if (slot === 'habits' || slot === 'focus' || slot === 'sleep' || slot === 'exercise') {
      next.weights[slot] = 1
    } else {
      next.metricWeights[slot] = 1
    }
  }

  return next
}

/** Leave equal mode and redistribute 10 points across currently included categories. */
export function assignPointsPulseFormula(formula: PulseFormula, goals: Goal[]): PulseFormula {
  const included = getPulseAssignableSlots(goals).filter((slot) => {
    if (slot === 'habits' || slot === 'focus' || slot === 'sleep' || slot === 'exercise') {
      return formula.weights[slot] > 0
    }
    return (formula.metricWeights[slot] ?? 0) > 0
  })
  const slots = included.length > 0 ? included : getPulseAssignableSlots(goals)
  const next = copyPulseFormula(formula)
  next.weights = { habits: 0, focus: 0, sleep: 0, exercise: 0 }
  next.metricWeights = {}
  next.equalWeights = false

  if (slots.length === 0) return next

  const base = Math.floor(PULSE_POINTS_TOTAL / slots.length)
  let extra = PULSE_POINTS_TOTAL % slots.length

  for (const slot of slots) {
    const points = base + (extra > 0 ? 1 : 0)
    if (extra > 0) extra -= 1
    if (slot === 'habits' || slot === 'focus' || slot === 'sleep' || slot === 'exercise') {
      next.weights[slot] = points
    } else {
      next.metricWeights[slot] = points
    }
  }

  return next
}

/** Drop weights for custom metrics that are no longer eligible. */
export function prunePulseFormulaMetrics(formula: PulseFormula, goals: Goal[]): PulseFormula {
  const eligible = new Set(getPulseCustomMetricGoals(goals).map((g) => g.metric_key))
  const metricWeights: Record<string, number> = {}
  for (const [key, value] of Object.entries(formula.metricWeights ?? {})) {
    if (eligible.has(key as MetricKey) && value > 0) metricWeights[key] = value
  }
  return { ...formula, metricWeights }
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

  if (last?.effectiveFrom === today) {
    history[history.length - 1] = { effectiveFrom: today, formula }
  } else {
    history.push({ effectiveFrom: today, formula })
  }

  history.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  return { next: { history }, isReconfigure }
}

/**
 * Daily exercise completion for Pulse (0–100).
 *
 * Minutes are pooled across configured workout types: finishing any one type’s
 * daily target, or combining partials (e.g. 30+30 when each target is 60), can
 * reach 100%. Extra volume past 100% does not increase the rate.
 */
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
      return { valid: false, reason: 'Include at least one category.' }
    }
  } else if (formulaWeightsSum(pruned) !== PULSE_POINTS_TOTAL) {
    return { valid: false, reason: `Assign all ${PULSE_POINTS_TOTAL} points before saving.` }
  }

  const eligibleKeys = new Set(getPulseCustomMetricGoals(goals).map((g) => g.metric_key))
  for (const key of Object.keys(pruned.metricWeights)) {
    if (!eligibleKeys.has(key as MetricKey)) {
      return { valid: false, reason: 'Remove points from metrics that no longer have a daily goal.' }
    }
  }

  if (pruned.weights.exercise > 0) {
    if (!hasWorkoutGoalsForPulse(goals)) {
      return { valid: false, reason: 'Add a workout goal in Metrics to include exercise.' }
    }

    for (const category of getWorkoutGoalCategories(goals)) {
      const minutes = pruned.exerciseDailyMinutes[category]
      if (!minutes || minutes <= 0) {
        return {
          valid: false,
          reason: 'Set daily minutes for each workout type with a goal.',
        }
      }
    }
  }

  return { valid: true }
}

export function copyPulseFormula(formula: PulseFormula): PulseFormula {
  return {
    weights: { ...formula.weights },
    metricWeights: { ...formula.metricWeights },
    exerciseDailyMinutes: { ...formula.exerciseDailyMinutes },
    equalWeights: formula.equalWeights === true,
  }
}
