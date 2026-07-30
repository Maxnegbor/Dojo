import {
  addPlannedWorkout,
  getPlannedWorkouts,
  removePlannedWorkout,
  syncPlannedWorkoutSchedule,
  updatePlannedWorkout,
} from '@/lib/exercisePlan'
import {
  getWorkoutTypeLabel,
  getWorkoutTypeUnit,
  isTimedWorkoutUnit,
} from '@/lib/workoutTypes'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import type { WorkoutCategory } from '@/types'
import { generateId, formatDate } from '@/lib/utils'
import { parseISO } from 'date-fns'

const STORAGE_KEY = 'personal-os-exercise-week-template'
export const EXERCISE_WEEK_TEMPLATE_CHANGED = 'personal-os-exercise-week-template-changed'

/** JS weekday: 0 = Sunday … 6 = Saturday. */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface ExerciseWeekSlot {
  id: string
  weekday: WeekdayIndex
  category: WorkoutCategory
  subtype: string | null
  start_time: string | null
  duration_minutes: number | null
  amount: number | null
  notes: string
}

export interface ExerciseWeekTemplate {
  enabled: boolean
  slots: ExerciseWeekSlot[]
}

const WEEKDAY_LABELS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function normalizeStartTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return null
  const [h, m] = trimmed.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function normalizePositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.round(value * 100) / 100)
}

function normalizeWeekday(value: unknown): WeekdayIndex | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 6) return null
  return value as WeekdayIndex
}

function normalizeSubtype(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, 32)
  return trimmed || null
}

function normalizeSlot(raw: Partial<ExerciseWeekSlot>): ExerciseWeekSlot | null {
  const weekday = normalizeWeekday(raw.weekday)
  if (weekday == null) return null
  if (typeof raw.category !== 'string' || !raw.category.trim()) return null
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
    weekday,
    category: raw.category.trim(),
    subtype: normalizeSubtype(raw.subtype),
    start_time: normalizeStartTime(raw.start_time),
    duration_minutes: normalizePositiveNumber(raw.duration_minutes),
    amount: normalizePositiveNumber(raw.amount),
    notes: typeof raw.notes === 'string' ? raw.notes : '',
  }
}

export function getExerciseWeekTemplate(): ExerciseWeekTemplate {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return { enabled: false, slots: [] }
    const parsed = JSON.parse(raw) as Partial<ExerciseWeekTemplate>
    const slots = (Array.isArray(parsed.slots) ? parsed.slots : [])
      .map((slot) => normalizeSlot(slot ?? {}))
      .filter((slot): slot is ExerciseWeekSlot => slot != null)
      .sort((a, b) => a.weekday - b.weekday || (a.start_time ?? '').localeCompare(b.start_time ?? ''))
    return {
      enabled: parsed.enabled === true,
      slots,
    }
  } catch {
    return { enabled: false, slots: [] }
  }
}

export function saveExerciseWeekTemplate(template: ExerciseWeekTemplate): ExerciseWeekTemplate {
  const slots = template.slots
    .map((slot) => normalizeSlot(slot))
    .filter((slot): slot is ExerciseWeekSlot => slot != null)
    .sort((a, b) => a.weekday - b.weekday || (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  const next: ExerciseWeekTemplate = {
    enabled: Boolean(template.enabled),
    slots,
  }
  storageSetItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(EXERCISE_WEEK_TEMPLATE_CHANGED))
  return next
}

export function createExerciseWeekSlot(
  patch: Partial<Omit<ExerciseWeekSlot, 'id'>> & { weekday: WeekdayIndex; category: string },
): ExerciseWeekSlot {
  return {
    id: generateId(),
    weekday: patch.weekday,
    category: patch.category,
    subtype: normalizeSubtype(patch.subtype ?? null),
    start_time: normalizeStartTime(patch.start_time ?? null),
    duration_minutes: normalizePositiveNumber(patch.duration_minutes ?? 45) ?? 45,
    amount: normalizePositiveNumber(patch.amount ?? null),
    notes: typeof patch.notes === 'string' ? patch.notes : '',
  }
}

/** Ordered weekday indices for display given weekStartsOn. */
export function orderedWeekdays(weekStartsOn: 0 | 1): WeekdayIndex[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7) as WeekdayIndex)
}

export function weekdayLabel(weekday: WeekdayIndex): string {
  return WEEKDAY_LABELS_SUN[weekday] ?? 'Day'
}

/** Planned minutes for a slot (timed amount/duration, else schedule duration). */
export function exerciseSlotPlannedMinutes(slot: ExerciseWeekSlot): number {
  const unit = getWorkoutTypeUnit(slot.category)
  if (isTimedWorkoutUnit(unit)) {
    return slot.duration_minutes ?? slot.amount ?? 0
  }
  return slot.duration_minutes ?? 0
}

export function exerciseWeekTotalsByCategory(
  slots: ExerciseWeekSlot[],
): { category: string; label: string; minutes: number; count: number }[] {
  const map = new Map<string, { minutes: number; count: number }>()
  for (const slot of slots) {
    const minutes = exerciseSlotPlannedMinutes(slot)
    const prev = map.get(slot.category) ?? { minutes: 0, count: 0 }
    map.set(slot.category, {
      minutes: prev.minutes + minutes,
      count: prev.count + 1,
    })
  }
  return [...map.entries()]
    .map(([category, value]) => ({
      category,
      label: getWorkoutTypeLabel(category),
      minutes: value.minutes,
      count: value.count,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label))
}

function dateForWeekdayInWeek(weekDates: string[], weekday: WeekdayIndex): string | null {
  for (const date of weekDates) {
    if (parseISO(`${date}T12:00:00`).getDay() === weekday) return date
  }
  return null
}

/**
 * Materialize the recurring template onto the given week dates.
 * Skips completed instances; updates incomplete template-linked plans; creates missing ones.
 */
export async function applyExerciseWeekTemplateToDates(params: {
  weekDates: string[]
  userId?: string | null
  timelineEndHour?: number
  template?: ExerciseWeekTemplate
}): Promise<boolean> {
  const template = params.template ?? getExerciseWeekTemplate()
  if (!template.enabled || template.slots.length === 0) return false

  const today = formatDate(new Date())
  const existing = getPlannedWorkouts()
  const slotIds = new Set(template.slots.map((slot) => slot.id))
  let changed = false

  // Remove incomplete future/current template instances whose slot was deleted.
  for (const item of existing) {
    if (!item.template_slot_id) continue
    if (slotIds.has(item.template_slot_id)) continue
    if (!params.weekDates.includes(item.date)) continue
    if (item.completed) continue
    if (item.date < today) continue
    await removePlannedWorkout(item.id)
    changed = true
  }

  for (const slot of template.slots) {
    const date = dateForWeekdayInWeek(params.weekDates, slot.weekday)
    if (!date) continue

    const unit = getWorkoutTypeUnit(slot.category)
    const timed = isTimedWorkoutUnit(unit)
    let duration_minutes = slot.duration_minutes
    let amount = slot.amount
    if (timed) {
      if (duration_minutes == null && amount != null) duration_minutes = Math.round(amount)
      if (amount == null && duration_minutes != null) amount = duration_minutes
    }

    const match = getPlannedWorkouts().find(
      (item) => item.template_slot_id === slot.id && item.date === date,
    )

    if (match?.completed) continue

    if (match) {
      const same =
        match.category === slot.category &&
        (match.subtype ?? null) === (slot.subtype ?? null) &&
        match.start_time === slot.start_time &&
        match.duration_minutes === duration_minutes &&
        match.amount === amount &&
        match.notes === (slot.notes ?? '')
      if (same) continue

      const patched =
        updatePlannedWorkout(match.id, {
          category: slot.category,
          subtype: slot.subtype,
          start_time: slot.start_time,
          duration_minutes,
          amount,
          notes: slot.notes,
        }) ?? match
      if (params.userId) {
        await syncPlannedWorkoutSchedule(
          patched,
          params.userId,
          params.timelineEndHour ?? 24,
        )
      }
      changed = true
      continue
    }

    // Don't backfill past days — only today onward.
    if (date < today) continue

    await addPlannedWorkout({
      date,
      category: slot.category,
      subtype: slot.subtype,
      start_time: slot.start_time,
      duration_minutes,
      amount,
      notes: slot.notes,
      template_slot_id: slot.id,
      userId: params.userId ?? undefined,
      timelineEndHour: params.timelineEndHour,
    })
    changed = true
  }

  return changed
}
