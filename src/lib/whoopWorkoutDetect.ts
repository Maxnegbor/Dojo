import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { getWhoopDay, type WhoopWorkoutSummary } from '@/lib/whoopStore'
import { getWorkoutTypes } from '@/lib/workoutTypes'
import type { Workout, WorkoutCategory } from '@/types'

const HANDLED_KEY = 'personal-os-whoop-workout-import'
const ZONE2_SHARE = 0.8
const MIN_MINUTES = 8

export const WHOOP_WORKOUT_IMPORT_CHANGED = 'personal-os-whoop-workout-import-changed'

export type WhoopDetectKind = 'zone2' | 'strength'

export interface WhoopWorkoutSuggestion {
  whoopId: string
  date: string
  category: WorkoutCategory
  kind: WhoopDetectKind
  minutes: number
  sportName: string
}

const STRENGTH_SPORTS = new Set([
  'weightlifting',
  'powerlifting',
  'bodybuilding',
  'functional_fitness',
  'functional fitness',
  'strength_training',
  'strength_trainer',
  'strength',
])

type HandledMap = Record<string, 'accepted' | 'dismissed'>

export function whoopWorkoutNote(whoopId: string): string {
  return `whoop:${whoopId}`
}

export function formatWhoopSportName(sportName: string): string {
  const cleaned = sportName.trim().replace(/[_-]+/g, ' ')
  if (!cleaned) return 'Workout'
  return cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function notifyImportChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(WHOOP_WORKOUT_IMPORT_CHANGED))
}

function readHandled(): HandledMap {
  try {
    const raw = storageGetItem(HANDLED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: HandledMap = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === 'accepted' || value === 'dismissed') out[id] = value
    }
    return out
  } catch {
    return {}
  }
}

function writeHandled(next: HandledMap) {
  const entries = Object.entries(next)
  const pruned = entries.length > 250 ? Object.fromEntries(entries.slice(-200)) : next
  storageSetItem(HANDLED_KEY, JSON.stringify(pruned))
  notifyImportChanged()
}

export function markWhoopWorkoutHandled(whoopId: string, status: 'accepted' | 'dismissed'): void {
  const next = readHandled()
  next[whoopId] = status
  writeHandled(next)
}

function isAlreadyLogged(workouts: Workout[], whoopId: string): boolean {
  const tag = whoopWorkoutNote(whoopId)
  return workouts.some((workout) => (workout.notes ?? '').includes(tag))
}

function sportKey(sportName: string): string {
  return sportName.trim().toLowerCase().replace(/\s+/g, '_')
}

function isStrengthSport(sportName: string): boolean {
  const key = sportKey(sportName)
  if (STRENGTH_SPORTS.has(key) || STRENGTH_SPORTS.has(sportName.trim().toLowerCase())) return true
  return /weightlift|powerlift|bodybuild|strength/.test(key)
}

function classifyWorkout(workout: WhoopWorkoutSummary): WhoopDetectKind | null {
  const minutes = workout.durationMinutes
  if (minutes == null || minutes < MIN_MINUTES) return null

  const zoneTotal = workout.zoneTotalMilli
  const zoneTwo = workout.zoneTwoMilli
  if (zoneTotal != null && zoneTotal > 0 && zoneTwo != null && zoneTwo / zoneTotal >= ZONE2_SHARE) {
    return 'zone2'
  }
  if (isStrengthSport(workout.sportName)) return 'strength'
  return null
}

function resolveCategory(kind: WhoopDetectKind): WorkoutCategory | null {
  const types = getWorkoutTypes()
  if (kind === 'zone2') {
    return (
      types.find((type) => type.id === 'zone2')?.id ??
      types.find((type) => /zone\s*2/.test(type.label.toLowerCase()))?.id ??
      null
    )
  }
  return (
    types.find((type) => type.id === 'strength')?.id ??
    types.find((type) => /strength/.test(type.label.toLowerCase()))?.id ??
    null
  )
}

export function listWhoopWorkoutSuggestions(
  weekDates: string[],
  workouts: Workout[],
): WhoopWorkoutSuggestion[] {
  const handled = readHandled()
  const seen = new Set<string>()
  const out: WhoopWorkoutSuggestion[] = []

  for (const date of weekDates) {
    const day = getWhoopDay(date)
    if (!day) continue
    for (const workout of day.workouts) {
      if (seen.has(workout.id) || handled[workout.id] || isAlreadyLogged(workouts, workout.id)) continue
      const kind = classifyWorkout(workout)
      if (!kind) continue
      const category = resolveCategory(kind)
      const minutes = workout.durationMinutes
      if (!category || minutes == null) continue
      seen.add(workout.id)
      out.push({
        whoopId: workout.id,
        date,
        category,
        kind,
        minutes,
        sportName: formatWhoopSportName(workout.sportName),
      })
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.sportName.localeCompare(b.sportName))
}
