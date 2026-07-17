import { hasTarget } from '@/lib/goals'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import type { Goal, Workout } from '@/types'

const STORAGE_KEY = 'personal-os-pulse-config'

export interface PulseWeights {
  habits: number
  focus: number
  sleep: number
  exercise: number
}

export interface PulseFormula {
  weights: PulseWeights
  /** Workout category id → minutes in one day that count as 100% for that type. */
  exerciseDailyMinutes: Record<string, number>
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
    exerciseDailyMinutes,
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

export function weightsSum(weights: PulseWeights): number {
  return weights.habits + weights.focus + weights.sleep + weights.exercise
}

export function hasWorkoutGoalsForPulse(goals: Goal[]): boolean {
  return goals.some((g) => g.is_active && g.metric_key.startsWith('workout_') && hasTarget(g))
}

export function getWorkoutGoalCategories(goals: Goal[]): string[] {
  return goals
    .filter((g) => g.is_active && g.metric_key.startsWith('workout_') && hasTarget(g))
    .map((g) => g.metric_key.replace('workout_', ''))
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

export function computeExerciseRate(
  date: string,
  workouts: Workout[],
  exerciseDailyMinutes: Record<string, number>,
): number {
  const dayWorkouts = workouts.filter((w) => w.date === date)
  let sum = 0

  for (const workout of dayWorkouts) {
    const threshold = exerciseDailyMinutes[workout.category]
    if (!threshold || threshold <= 0) continue
    sum += Math.min(100, (workout.duration_minutes / threshold) * 100)
  }

  return Math.min(100, sum)
}

export function isValidPulseFormula(
  formula: PulseFormula,
  goals: Goal[],
): { valid: boolean; reason?: string } {
  if (weightsSum(formula.weights) !== PULSE_POINTS_TOTAL) {
    return { valid: false, reason: `Assign all ${PULSE_POINTS_TOTAL} points before saving.` }
  }

  if (formula.weights.exercise <= 0) return { valid: true }

  if (!hasWorkoutGoalsForPulse(goals)) {
    return { valid: false, reason: 'Add a workout goal in Metrics to include exercise.' }
  }

  for (const category of getWorkoutGoalCategories(goals)) {
    const minutes = formula.exerciseDailyMinutes[category]
    if (!minutes || minutes <= 0) {
      return {
        valid: false,
        reason: 'Set daily minutes for each workout type with a goal.',
      }
    }
  }

  return { valid: true }
}

export function copyPulseFormula(formula: PulseFormula): PulseFormula {
  return {
    weights: { ...formula.weights },
    exerciseDailyMinutes: { ...formula.exerciseDailyMinutes },
  }
}
