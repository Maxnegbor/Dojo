import { useEffect, useMemo, useState } from 'react'
import type { GoalPeriod } from '@/types'
import { normalizeHabitRamp } from '@/lib/habitRamp'

export interface HabitRampConfig {
  enabled: boolean
  start_value: number
  target_value: number
  /** Amount the target increases each level */
  step_value: number
  /** Consecutive streak days required per level increase */
  interval_streak_days: number
  /** @deprecated Use interval_streak_days */
  interval_days?: number
  /** Current ramp level (0 = start_value only) */
  level: number
  unit: string
}

export interface HabitTypeDefinition {
  id: string
  label: string
  /** When this habit is logged: daily log vs weekly shutdown. Defaults to daily. */
  log_period?: GoalPeriod
  /** Fixed target duration when not using a ramp */
  duration_value?: number
  duration_unit?: string
  /** Optional automatically increasing target */
  ramp?: HabitRampConfig
}

import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-habit-types'
export const HABIT_TYPES_CHANGED = 'personal-os-habit-types-changed'

export const DEFAULT_HABIT_TYPES: HabitTypeDefinition[] = [
  { id: 'meditation', label: 'Meditation' },
  { id: 'skincare', label: 'Skincare' },
]

export function slugifyHabitId(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return slug || 'habit'
}

export function getHabitTypes(): HabitTypeDefinition[] {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as HabitTypeDefinition[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((t) => normalizeHabitType({
          id: slugifyHabitId(t.id || t.label),
          label: t.label?.trim() || t.id,
          log_period: t.log_period,
          duration_value: t.duration_value,
          duration_unit: t.duration_unit,
          ramp: t.ramp,
        }))
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

export function saveHabitTypes(types: HabitTypeDefinition[]) {
  storageSetItem(STORAGE_KEY, JSON.stringify(types))
  window.dispatchEvent(new Event(HABIT_TYPES_CHANGED))
}

export function reorderHabitTypes(
  habits: HabitTypeDefinition[],
  dragId: string,
  targetId: string,
): HabitTypeDefinition[] {
  const fromIndex = habits.findIndex((h) => h.id === dragId)
  const toIndex = habits.findIndex((h) => h.id === targetId)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return habits

  const next = [...habits]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export function reorderHabitTypesToIndex(
  habits: HabitTypeDefinition[],
  dragId: string,
  insertBefore: number,
): HabitTypeDefinition[] {
  const fromIndex = habits.findIndex((h) => h.id === dragId)
  if (fromIndex < 0) return habits

  const next = [...habits]
  const [moved] = next.splice(fromIndex, 1)
  let insertIndex = Math.max(0, Math.min(insertBefore, habits.length))
  if (fromIndex < insertIndex) insertIndex -= 1
  next.splice(insertIndex, 0, moved)
  return next
}

export function useHabitTypes(): HabitTypeDefinition[] {
  const [types, setTypes] = useState(() => getHabitTypes())

  useEffect(() => {
    const refresh = () => setTypes(getHabitTypes())
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) refresh()
    }
    window.addEventListener(HABIT_TYPES_CHANGED, refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(HABIT_TYPES_CHANGED, refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return types
}

export function useDailyLogHabitTypes(): HabitTypeDefinition[] {
  const types = useHabitTypes()
  return useMemo(
    () => types.filter((h) => habitLogPeriod(h) === 'daily'),
    [types],
  )
}

export function useWeeklyLogHabitTypes(): HabitTypeDefinition[] {
  const types = useHabitTypes()
  return useMemo(
    () => types.filter((h) => habitLogPeriod(h) === 'weekly'),
    [types],
  )
}

export function getHabitTypeLabel(id: string): string {
  return getHabitTypes().find((t) => t.id === id)?.label ?? id
}

function normalizeHabitType(type: HabitTypeDefinition): HabitTypeDefinition {
  const ramp = normalizeHabitRamp(type.ramp)
  const duration_value = Number(type.duration_value)
  const hasDuration = Number.isFinite(duration_value) && duration_value > 0

  return {
    id: type.id,
    label: type.label,
    log_period: type.log_period === 'weekly' ? 'weekly' : 'daily',
    ...(hasDuration
      ? {
          duration_value,
          duration_unit: type.duration_unit?.trim() || 'min',
        }
      : {}),
    ...(ramp ? { ramp } : {}),
  }
}

export function formatHabitDuration(habit: HabitTypeDefinition): string | null {
  if (habit.duration_value == null || habit.duration_value <= 0) return null
  const unit = habit.duration_unit?.trim() || 'min'
  return `${habit.duration_value} ${unit}`
}

export function habitLogPeriod(habit: HabitTypeDefinition): GoalPeriod {
  return habit.log_period === 'weekly' ? 'weekly' : 'daily'
}

export function getDailyLogHabitTypes(): HabitTypeDefinition[] {
  return getHabitTypes().filter((h) => habitLogPeriod(h) === 'daily')
}

export function getWeeklyLogHabitTypes(): HabitTypeDefinition[] {
  return getHabitTypes().filter((h) => habitLogPeriod(h) === 'weekly')
}

export function habitWeeklyLogKey(id: string): string {
  return `habit_${id}`
}
