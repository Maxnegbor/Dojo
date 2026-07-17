import type { WorkoutCategory } from '@/types'

export interface WorkoutTypeDefinition {
  id: WorkoutCategory
  label: string
  color: string
}

import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-workout-types'

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

export const DEFAULT_WORKOUT_TYPES: WorkoutTypeDefinition[] = [
  { id: 'hiit', label: 'HIIT', color: '#ef4444' },
  { id: 'zone2', label: 'Zone 2', color: '#3b82f6' },
  { id: 'strength', label: 'Strength', color: '#eab308' },
]

export function slugifyWorkoutId(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return slug || 'workout'
}

export function getWorkoutTypes(): WorkoutTypeDefinition[] {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as WorkoutTypeDefinition[]
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return []
        return parsed.map((t) => ({
          id: slugifyWorkoutId(t.id || t.label),
          label: t.label?.trim() || t.id,
          color: t.color || WORKOUT_COLOR_PRESETS[0],
        }))
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

export function saveWorkoutTypes(types: WorkoutTypeDefinition[]) {
  storageSetItem(STORAGE_KEY, JSON.stringify(types))
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
