import type { WorkoutCategory } from '@/types'

export type WorkoutLogWhen = 'home' | 'morning' | 'shutdown'
export type WorkoutMorningDay = 'today' | 'yesterday'

export interface WorkoutTypeDefinition {
  id: WorkoutCategory
  label: string
  color: string
  /** Tracking unit for logged amounts (stored in workouts.duration_minutes). */
  unit: string
  /** daily = sessions via Ask in; weekly = total at weekly shutdown. */
  log_period?: 'daily' | 'weekly'
  /** Where daily sessions are logged. Ignored when log_period is weekly. */
  log_when?: WorkoutLogWhen
  /** When log_when is morning: which calendar day the session applies to. */
  morning_day?: WorkoutMorningDay
  /**
   * Optional plan subcategories (e.g. Strength → Push / Pull / Legs).
   * Shown when planning workouts in the exercise planner and weekly template.
   */
  subtypes?: string[]
  /** Optional Metrics library grouping. */
  category_id?: string | null
}

import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { formatDuration } from '@/lib/utils'

const STORAGE_KEY = 'personal-os-workout-types'

export const WORKOUT_TYPES_CHANGED = 'personal-os-workout-types-changed'

export const WORKOUT_COLOR_PRESETS = [
  '#ef4444',
  '#3b82f6',
  '#eab308',
  '#10b981',
  '#8b5cf6',
  '#f43f5e',
  '#f97316',
  '#06b6d4',
] as const

/** Common units for workout tracking (goals + session logs). */
export const WORKOUT_UNIT_OPTIONS = [
  'min',
  'km',
  'mi',
  'cal',
  'kcal',
  'reps',
  'sets',
  'm',
] as const

export const DEFAULT_WORKOUT_UNIT = 'min'

export const DEFAULT_WORKOUT_TYPES: WorkoutTypeDefinition[] = [
  { id: 'hiit', label: 'HIIT', color: '#ef4444', unit: 'min', log_when: 'home' },
  { id: 'zone2', label: 'Zone 2', color: '#3b82f6', unit: 'min', log_when: 'home' },
  { id: 'strength', label: 'Strength', color: '#eab308', unit: 'min', log_when: 'home' },
]

export function slugifyWorkoutId(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return slug || 'workout'
}

export function normalizeWorkoutUnit(unit: unknown): string {
  if (typeof unit !== 'string') return DEFAULT_WORKOUT_UNIT
  const trimmed = unit.trim().toLowerCase()
  if (!trimmed) return DEFAULT_WORKOUT_UNIT
  if (trimmed === 'minutes' || trimmed === 'mins' || trimmed === 'min/wk') return 'min'
  if (trimmed === 'calories' || trimmed === 'calorie') return 'cal'
  if (trimmed === 'kilocalories') return 'kcal'
  if (trimmed === 'kilometers') return 'km'
  if (trimmed === 'miles') return 'mi'
  if (trimmed === 'meters' || trimmed === 'metre' || trimmed === 'metres') return 'm'
  return trimmed.slice(0, 12)
}

function normalizeWorkoutLogWhen(value: unknown): WorkoutLogWhen {
  if (value === 'morning' || value === 'shutdown' || value === 'home') return value
  return 'home'
}

function normalizeWorkoutMorningDay(value: unknown): WorkoutMorningDay {
  return value === 'yesterday' ? 'yesterday' : 'today'
}

function normalizeWorkoutSubtypes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const seen = new Set<string>()
  const next: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const label = entry.trim().slice(0, 32)
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(label)
  }
  return next.length > 0 ? next : undefined
}

function normalizeWorkoutType(
  t: Partial<WorkoutTypeDefinition> & { id?: string; label?: string },
): WorkoutTypeDefinition {
  const log_period = t.log_period === 'weekly' ? 'weekly' : 'daily'
  const log_when =
    log_period === 'weekly' ? undefined : normalizeWorkoutLogWhen(t.log_when)
  const subtypes = normalizeWorkoutSubtypes(t.subtypes)
  return {
    id: slugifyWorkoutId(t.id || t.label || 'workout'),
    label: t.label?.trim() || t.id || 'Workout',
    color: t.color || WORKOUT_COLOR_PRESETS[0],
    unit: normalizeWorkoutUnit(t.unit),
    log_period,
    ...(log_when ? { log_when } : {}),
    ...(log_when === 'morning'
      ? { morning_day: normalizeWorkoutMorningDay(t.morning_day) }
      : {}),
    ...(subtypes ? { subtypes } : {}),
    ...(t.category_id && t.category_id !== 'default' ? { category_id: t.category_id } : {}),
  }
}

export function workoutLogPeriod(type: WorkoutTypeDefinition): 'daily' | 'weekly' {
  return type.log_period === 'weekly' ? 'weekly' : 'daily'
}

export function workoutLogWhen(type: WorkoutTypeDefinition): WorkoutLogWhen {
  if (workoutLogPeriod(type) === 'weekly') return 'home'
  return normalizeWorkoutLogWhen(type.log_when)
}

export function workoutMorningDay(type: WorkoutTypeDefinition): WorkoutMorningDay {
  return normalizeWorkoutMorningDay(type.morning_day)
}

export function getHomeLogWorkoutTypes(): WorkoutTypeDefinition[] {
  return getWorkoutTypes().filter(
    (type) => workoutLogPeriod(type) === 'daily' && workoutLogWhen(type) === 'home',
  )
}

export function getMorningLogWorkoutTypes(): WorkoutTypeDefinition[] {
  return getWorkoutTypes().filter(
    (type) => workoutLogPeriod(type) === 'daily' && workoutLogWhen(type) === 'morning',
  )
}

export function getShutdownLogWorkoutTypes(): WorkoutTypeDefinition[] {
  return getWorkoutTypes().filter(
    (type) => workoutLogPeriod(type) === 'daily' && workoutLogWhen(type) === 'shutdown',
  )
}

export function getWeeklyLogWorkoutTypes(): WorkoutTypeDefinition[] {
  return getWorkoutTypes().filter((type) => workoutLogPeriod(type) === 'weekly')
}

export function getWorkoutTypes(): WorkoutTypeDefinition[] {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as WorkoutTypeDefinition[]
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return []
        return parsed.map((t) => normalizeWorkoutType(t))
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

export function saveWorkoutTypes(types: WorkoutTypeDefinition[]) {
  storageSetItem(STORAGE_KEY, JSON.stringify(types.map((t) => normalizeWorkoutType(t))))
  window.dispatchEvent(new Event(WORKOUT_TYPES_CHANGED))
}

export function getWorkoutTypeIds(): WorkoutCategory[] {
  return getWorkoutTypes().map((t) => t.id)
}

export function workoutMetricKey(id: WorkoutCategory): `workout_${string}` {
  return `workout_${id}`
}

export function getWorkoutTypeLabel(id: WorkoutCategory): string {
  return getWorkoutTypes().find((t) => t.id === id)?.label ?? id
}

export function getWorkoutTypeSubtypes(id: WorkoutCategory): string[] {
  return getWorkoutTypes().find((t) => t.id === id)?.subtypes ?? []
}

/** Display label for planner/schedule: "Strength · Push" or just "Strength". */
export function formatWorkoutPlanLabel(category: WorkoutCategory, subtype?: string | null): string {
  const label = getWorkoutTypeLabel(category)
  const sub = subtype?.trim()
  return sub ? `${label} · ${sub}` : label
}

export function getWorkoutTypeUnit(id: WorkoutCategory): string {
  return getWorkoutTypes().find((t) => t.id === id)?.unit ?? DEFAULT_WORKOUT_UNIT
}

export function isTimedWorkoutUnit(unit: string): boolean {
  const u = normalizeWorkoutUnit(unit)
  return u === 'min' || u === 'hrs' || u === 'hrs:min'
}

/** Format a logged workout amount for display. */
export function formatWorkoutAmount(value: number, unit: string): string {
  const u = normalizeWorkoutUnit(unit)
  if (!Number.isFinite(value) || value <= 0) {
    if (isTimedWorkoutUnit(u)) return '0m'
    return `0 ${u}`
  }
  if (isTimedWorkoutUnit(u)) return formatDuration(value)
  if (u === 'km' || u === 'mi' || u === 'm') {
    const rounded = Math.round(value * 10) / 10
    return Number.isInteger(rounded) ? `${rounded} ${u}` : `${rounded.toFixed(1)} ${u}`
  }
  return `${Math.round(value)} ${u}`
}

/** Goal unit label for cards (e.g. min/wk). */
export function workoutGoalUnitLabel(unit: string, logPeriod: 'daily' | 'weekly'): string {
  const u = normalizeWorkoutUnit(unit)
  if (logPeriod === 'weekly' && (u === 'min' || u === 'km' || u === 'mi' || u === 'cal' || u === 'kcal')) {
    return `${u}/wk`
  }
  return u
}
