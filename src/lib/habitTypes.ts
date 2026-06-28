import type { GoalPeriod } from '@/types'

export interface HabitTypeDefinition {
  id: string
  label: string
  /** When this habit is logged: daily log vs weekly shutdown. Defaults to daily. */
  log_period?: GoalPeriod
}

const STORAGE_KEY = 'personal-os-habit-types'

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
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as HabitTypeDefinition[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((t) => normalizeHabitType({
          id: slugifyHabitId(t.id || t.label),
          label: t.label?.trim() || t.id,
          log_period: t.log_period,
        }))
      }
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_HABIT_TYPES]
}

export function saveHabitTypes(types: HabitTypeDefinition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(types))
}

export function getHabitTypeLabel(id: string): string {
  return getHabitTypes().find((t) => t.id === id)?.label ?? id
}

function normalizeHabitType(type: HabitTypeDefinition): HabitTypeDefinition {
  return {
    id: type.id,
    label: type.label,
    log_period: type.log_period === 'weekly' ? 'weekly' : 'daily',
  }
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
