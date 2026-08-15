import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import {
  normalizeScheduleBlock,
  persistScheduleBlock,
  removeScheduleBlock,
} from '@/lib/scheduleBlock'
import {
  formatWorkoutPlanLabel,
  getWorkoutTypeUnit,
  isTimedWorkoutUnit,
} from '@/lib/workoutTypes'
import { getWorkoutSchedulePreset } from '@/lib/scheduleColors'
import { type ScheduleBlock, type WorkoutCategory } from '@/types'
import { generateId, minutesToTime, parseTimeToMinutes } from '@/lib/utils'

const STORAGE_KEY = 'personal-os-exercise-plan'
export const EXERCISE_PLAN_CHANGED = 'personal-os-exercise-plan-changed'

/** Default schedule block length when planning a non-timed workout (e.g. sets). */
export const DEFAULT_PLAN_SCHEDULE_MINUTES = 45

/** Minimum duration (minutes) for a planned workout to appear on the schedule. */
export const MIN_PLAN_SCHEDULE_MINUTES = 20

export interface PlannedWorkout {
  id: string
  date: string
  category: WorkoutCategory
  /** Optional subtitle from the workout type (e.g. Push / Pull / Legs). */
  subtype: string | null
  /** Planned start time HH:MM, or null if unset. */
  start_time: string | null
  /** Schedule block duration in minutes (also the log amount for timed units). */
  duration_minutes: number | null
  /**
   * Volume to log when checked off, in the workout type's unit.
   * For timed units this mirrors duration_minutes; for sets/reps/etc it is the count.
   */
  amount: number | null
  /** Linked schedule block when synced to the timeline. */
  schedule_block_id: string | null
  /** When true, volume was logged to workouts. */
  completed: boolean
  /** Workout row created by checking this plan off. */
  logged_workout_id: string | null
  /** Recurring weekly template slot this instance was created from. */
  template_slot_id: string | null
  notes: string
  created_at: string
}

function normalizeSubtype(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, 32)
  return trimmed || null
}

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

function snapMinutes(minutes: number, step = 30) {
  return Math.round(minutes / step) * step
}

function readAll(): PlannedWorkout[] {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PlannedWorkout[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item.id === 'string' && typeof item.date === 'string')
      .map((item) => {
        const duration_minutes = normalizePositiveNumber(item.duration_minutes)
        const amount =
          normalizePositiveNumber(item.amount) ??
          (duration_minutes != null ? duration_minutes : null)
        return {
          id: item.id,
          date: item.date,
          category: item.category,
          subtype: normalizeSubtype(item.subtype),
          start_time: normalizeStartTime(item.start_time),
          duration_minutes,
          amount,
          schedule_block_id:
            typeof item.schedule_block_id === 'string' && item.schedule_block_id
              ? item.schedule_block_id
              : null,
          completed: Boolean(item.completed),
          logged_workout_id:
            typeof item.logged_workout_id === 'string' && item.logged_workout_id
              ? item.logged_workout_id
              : null,
          template_slot_id:
            typeof item.template_slot_id === 'string' && item.template_slot_id
              ? item.template_slot_id
              : null,
          notes: typeof item.notes === 'string' ? item.notes : '',
          created_at: item.created_at || new Date().toISOString(),
        }
      })
  } catch {
    return []
  }
}

function writeAll(items: PlannedWorkout[]) {
  storageSetItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(EXERCISE_PLAN_CHANGED))
}

/** Amount that should be written to workouts when this plan is checked off. */
export function getPlannedWorkoutLogAmount(item: PlannedWorkout): number | null {
  const unit = getWorkoutTypeUnit(item.category)
  if (isTimedWorkoutUnit(unit)) {
    return item.duration_minutes != null && item.duration_minutes > 0
      ? item.duration_minutes
      : item.amount != null && item.amount > 0
        ? item.amount
        : null
  }
  return item.amount != null && item.amount > 0 ? item.amount : null
}

export function plannedWorkoutCanComplete(item: PlannedWorkout): boolean {
  return getPlannedWorkoutLogAmount(item) != null
}

export function getPlannedWorkouts(): PlannedWorkout[] {
  return readAll()
}

export function getPlannedWorkoutsForDate(date: string): PlannedWorkout[] {
  return readAll()
    .filter((item) => item.date === date)
    .sort((a, b) => {
      const aTime = a.start_time ?? '99:99'
      const bTime = b.start_time ?? '99:99'
      return aTime.localeCompare(bTime) || a.created_at.localeCompare(b.created_at)
    })
}

export function getPlannedWorkoutsForDates(dates: string[]): PlannedWorkout[] {
  const set = new Set(dates)
  return readAll()
    .filter((item) => set.has(item.date))
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date)
      if (byDate !== 0) return byDate
      const aTime = a.start_time ?? '99:99'
      const bTime = b.start_time ?? '99:99'
      return aTime.localeCompare(bTime) || a.created_at.localeCompare(b.created_at)
    })
}

export function plannedWorkoutCanSync(item: PlannedWorkout): boolean {
  return Boolean(
    item.start_time &&
      item.duration_minutes != null &&
      item.duration_minutes >= MIN_PLAN_SCHEDULE_MINUTES,
  )
}

/** Duration used when dropping a plan onto the schedule. */
export function resolvePlanScheduleDuration(item: PlannedWorkout): number {
  const raw = item.duration_minutes
  if (raw != null && Number.isFinite(raw) && raw > 0) {
    return Math.max(MIN_PLAN_SCHEDULE_MINUTES, Math.round(raw))
  }
  return DEFAULT_PLAN_SCHEDULE_MINUTES
}

/** Incomplete plans that still need a schedule block (or deletion). */
export function getUnplacedPlannedWorkoutsForDate(date: string): PlannedWorkout[] {
  return getPlannedWorkoutsForDate(date).filter(
    (item) => !item.completed && !item.schedule_block_id,
  )
}

export const PLANNED_WORKOUT_DRAG_MIME = 'application/x-dojo-planned-workout'

let activePlanDrag: { id: string; durationMinutes: number } | null = null

export function beginPlannedWorkoutDrag(item: PlannedWorkout) {
  activePlanDrag = {
    id: item.id,
    durationMinutes: resolvePlanScheduleDuration(item),
  }
}

export function getActivePlannedWorkoutDrag(): {
  id: string
  durationMinutes: number
} | null {
  return activePlanDrag
}

export function endPlannedWorkoutDrag() {
  activePlanDrag = null
}

/** Place (or move) a planned workout onto the timeline at the given start minute. */
export async function placePlannedWorkoutOnSchedule(params: {
  planId: string
  startMinutes: number
  userId: string
  timelineEndHour?: number
  /** Timeline day — updates the plan date when dropping across days. */
  date?: string
}): Promise<PlannedWorkout | null> {
  const existing = readAll().find((item) => item.id === params.planId)
  if (!existing) return null

  const timelineEndHour = params.timelineEndHour ?? 24
  const duration = resolvePlanScheduleDuration(existing)
  const endCap = timelineEndHour * 60
  const maxStart = Math.max(0, endCap - duration)
  const startMin = Math.max(0, Math.min(maxStart, snapMinutes(params.startMinutes)))
  const start_time = minutesToTime(startMin)

  const unit = getWorkoutTypeUnit(existing.category)
  const timed = isTimedWorkoutUnit(unit)
  const patched =
    updatePlannedWorkout(existing.id, {
      date: params.date ?? existing.date,
      start_time,
      duration_minutes: duration,
      amount: timed ? duration : existing.amount,
    }) ?? existing

  return syncPlannedWorkoutSchedule(patched, params.userId, timelineEndHour)
}

export function buildScheduleTimesForPlan(
  item: PlannedWorkout,
  timelineEndHour = 24,
): { start_time: string; end_time: string } | null {
  if (!plannedWorkoutCanSync(item) || !item.start_time || item.duration_minutes == null) {
    return null
  }

  const startMin = snapMinutes(parseTimeToMinutes(item.start_time))
  const duration = Math.max(MIN_PLAN_SCHEDULE_MINUTES, item.duration_minutes)
  const endCap = Math.max(startMin + duration, timelineEndHour * 60)
  const endMin = Math.min(startMin + duration, endCap)
  return {
    start_time: minutesToTime(startMin),
    end_time: minutesToTime(endMin),
  }
}

function scheduleTitleForPlan(item: PlannedWorkout): string {
  const label = formatWorkoutPlanLabel(item.category, item.subtype)
  const note = item.notes.trim()
  return note ? `${label} · ${note}` : label
}

function scheduleBlockFromPlan(
  item: PlannedWorkout,
  userId: string,
  times: { start_time: string; end_time: string },
  existingId?: string | null,
): ScheduleBlock {
  const workout = getWorkoutSchedulePreset()
  return normalizeScheduleBlock({
    id: existingId || item.schedule_block_id || generateId(),
    user_id: userId,
    date: item.date,
    start_time: times.start_time,
    end_time: times.end_time,
    activity_type: workout.id,
    color: workout.hex,
    title: scheduleTitleForPlan(item),
    created_at: item.created_at,
  })
}

/** Create or update the schedule block for a planned workout when time + duration are set. */
export async function syncPlannedWorkoutSchedule(
  item: PlannedWorkout,
  userId: string,
  timelineEndHour = 24,
): Promise<PlannedWorkout> {
  const times = buildScheduleTimesForPlan(item, timelineEndHour)
  if (!times) {
    if (item.schedule_block_id) {
      await removeScheduleBlock(item.schedule_block_id)
      return updatePlannedWorkout(item.id, { schedule_block_id: null }) ?? item
    }
    return item
  }

  const block = scheduleBlockFromPlan(item, userId, times, item.schedule_block_id)
  const saved = await persistScheduleBlock(block)
  if (item.schedule_block_id === saved.id) return item
  return updatePlannedWorkout(item.id, { schedule_block_id: saved.id }) ?? {
    ...item,
    schedule_block_id: saved.id,
  }
}

export async function addPlannedWorkout(params: {
  date: string
  category: WorkoutCategory
  subtype?: string | null
  start_time?: string | null
  duration_minutes?: number | null
  amount?: number | null
  notes?: string
  template_slot_id?: string | null
  userId?: string
  timelineEndHour?: number
}): Promise<PlannedWorkout> {
  const unit = getWorkoutTypeUnit(params.category)
  const timed = isTimedWorkoutUnit(unit)

  let duration_minutes =
    params.duration_minutes != null && Number.isFinite(params.duration_minutes)
      ? Math.max(0, Math.round(params.duration_minutes))
      : null
  let amount =
    params.amount != null && Number.isFinite(params.amount)
      ? Math.max(0, Math.round(params.amount * 100) / 100)
      : null

  if (timed) {
    if (duration_minutes == null && amount != null) duration_minutes = Math.round(amount)
    if (amount == null && duration_minutes != null) amount = duration_minutes
  } else if (
    duration_minutes == null &&
    normalizeStartTime(params.start_time ?? null) &&
    amount != null &&
    amount > 0
  ) {
    duration_minutes = DEFAULT_PLAN_SCHEDULE_MINUTES
  }

  const item: PlannedWorkout = {
    id: generateId(),
    date: params.date,
    category: params.category,
    subtype: normalizeSubtype(params.subtype ?? null),
    start_time: normalizeStartTime(params.start_time ?? null),
    duration_minutes,
    amount,
    schedule_block_id: null,
    completed: false,
    logged_workout_id: null,
    template_slot_id:
      typeof params.template_slot_id === 'string' && params.template_slot_id
        ? params.template_slot_id
        : null,
    notes: params.notes?.trim() ?? '',
    created_at: new Date().toISOString(),
  }
  writeAll([...readAll(), item])

  if (params.userId && plannedWorkoutCanSync(item)) {
    return syncPlannedWorkoutSchedule(item, params.userId, params.timelineEndHour ?? 24)
  }
  return item
}

export function updatePlannedWorkout(
  id: string,
  patch: Partial<
    Pick<
      PlannedWorkout,
      | 'category'
      | 'subtype'
      | 'duration_minutes'
      | 'amount'
      | 'notes'
      | 'date'
      | 'start_time'
      | 'schedule_block_id'
      | 'completed'
      | 'logged_workout_id'
      | 'template_slot_id'
    >
  >,
): PlannedWorkout | null {
  const items = readAll()
  const index = items.findIndex((item) => item.id === id)
  if (index < 0) return null
  const next = { ...items[index], ...patch }
  if (patch.subtype !== undefined) {
    next.subtype = normalizeSubtype(patch.subtype)
  }
  if (patch.start_time !== undefined) {
    next.start_time = normalizeStartTime(patch.start_time)
  }
  if (patch.duration_minutes !== undefined) {
    next.duration_minutes = normalizePositiveNumber(patch.duration_minutes)
  }
  if (patch.amount !== undefined) {
    next.amount = normalizePositiveNumber(patch.amount)
  }
  if (patch.notes !== undefined) next.notes = patch.notes.trim()
  if (patch.schedule_block_id !== undefined) {
    next.schedule_block_id = patch.schedule_block_id
  }
  if (patch.completed !== undefined) next.completed = patch.completed
  if (patch.logged_workout_id !== undefined) {
    next.logged_workout_id = patch.logged_workout_id
  }
  items[index] = next
  writeAll(items)
  return next
}

export function markPlannedWorkoutCompleted(
  id: string,
  loggedWorkoutId: string,
): PlannedWorkout | null {
  return updatePlannedWorkout(id, {
    completed: true,
    logged_workout_id: loggedWorkoutId,
  })
}

export function markPlannedWorkoutIncomplete(id: string): PlannedWorkout | null {
  return updatePlannedWorkout(id, {
    completed: false,
    logged_workout_id: null,
  })
}

export async function removePlannedWorkout(id: string) {
  const item = readAll().find((entry) => entry.id === id)
  if (item?.schedule_block_id) {
    await removeScheduleBlock(item.schedule_block_id)
  }
  writeAll(readAll().filter((entry) => entry.id !== id))
}

export function clearPlannedWorkoutsForDate(date: string) {
  writeAll(readAll().filter((item) => item.date !== date))
}

/**
 * Color a schedule block as a workout type.
 * Does not create or update Exercise plan rows (plan → schedule is one-way only).
 */
export async function applyWorkoutTypeToScheduleBlock(params: {
  block: ScheduleBlock
  category: WorkoutCategory
}): Promise<ScheduleBlock> {
  const title = formatWorkoutPlanLabel(params.category)
  const workout = getWorkoutSchedulePreset()
  const nextBlock = normalizeScheduleBlock({
    ...params.block,
    activity_type: workout.id,
    color: workout.hex,
    title,
  })
  return persistScheduleBlock(nextBlock)
}

/** @deprecated Use applyWorkoutTypeToScheduleBlock — schedule no longer writes to the exercise plan. */
export async function attachScheduleBlockToExercisePlan(params: {
  block: ScheduleBlock
  category: WorkoutCategory
}): Promise<ScheduleBlock> {
  return applyWorkoutTypeToScheduleBlock(params)
}

/** If a schedule block was deleted, drop the link on any matching planned workout. */
export function unlinkPlannedWorkoutByScheduleBlockId(scheduleBlockId: string) {
  const items = readAll()
  let changed = false
  const next = items.map((item) => {
    if (item.schedule_block_id !== scheduleBlockId) return item
    changed = true
    return { ...item, schedule_block_id: null }
  })
  if (changed) writeAll(next)
}
