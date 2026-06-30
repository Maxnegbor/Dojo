import type { DailyHabits, Workout, WorkoutCategory } from '@/types'
import { normalizeHabits } from '@/types'
import { localStore } from '@/lib/localStore'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { getWorkoutTypeIds } from '@/lib/workoutTypes'
import { formatDate } from '@/lib/utils'
import { storageGetItem, storageKeys, storageRemoveItem, storageSetItem } from '@/lib/userStorage'

const DRAFT_PREFIX = 'personal-os-log-draft-'

export type WorkoutDrafts = Partial<Record<WorkoutCategory, number | null>>

export interface DailyLogDraft {
  sleep_hours?: number | null
  weight?: number | null
  steps?: number | null
  screen_time_minutes?: number | null
  focus_minutes?: number
  /** When `additive`, `focus_minutes` are minutes to add today (not day totals). */
  focusMode?: 'additive' | 'total'
  habits?: DailyHabits
  custom_metrics?: Record<string, number | null>
  workouts?: WorkoutDrafts
  /** When `additive`, `workouts` are minutes to add today (not day totals). */
  workoutMode?: 'additive' | 'total'
  /** User explicitly chose no workout during shutdown. */
  workoutExplicitNone?: boolean
  /** @deprecated migrated to `workouts` on read */
  workout_category?: WorkoutCategory | 'none'
  /** @deprecated migrated to `workouts` on read */
  workout_duration?: number | null
}

const WORKOUT_CATEGORIES = (): WorkoutCategory[] => getWorkoutTypeIds()

function draftKey(date: string) {
  return `${DRAFT_PREFIX}${date}`
}

export function workoutsFromList(workouts: Workout[]): WorkoutDrafts {
  const result: WorkoutDrafts = {}
  for (const w of workouts) {
    result[w.category] = (result[w.category] ?? 0) + w.duration_minutes
  }
  return result
}

export function workoutsFromListForDate(workouts: Workout[], date: string): WorkoutDrafts {
  return workoutsFromList(workouts.filter((entry) => entry.date === date))
}

export function usesAdditiveTodayDraft(date: string): boolean {
  return date === formatDate(new Date())
}

/** Shutdown requires an explicit workout type or "None" before finishing. */
export function isShutdownWorkoutChoiceReady(
  draft: DailyLogDraft,
  date: string,
  workouts: Workout[],
): boolean {
  if (draft.workoutExplicitNone) return true
  if (Object.keys(draft.workouts ?? {}).length > 0) return true
  const stored = workoutsFromListForDate(workouts, date)
  return Object.keys(stored).length > 0
}

/** @deprecated use `usesAdditiveTodayDraft` */
export function usesAdditiveWorkouts(date: string): boolean {
  return usesAdditiveTodayDraft(date)
}

export function addWorkoutTotals(
  stored: WorkoutDrafts,
  additions: WorkoutDrafts,
): WorkoutDrafts {
  const result: WorkoutDrafts = { ...stored }
  for (const [category, minutes] of Object.entries(additions)) {
    if (minutes == null || minutes <= 0) continue
    result[category] = (result[category] ?? 0) + minutes
  }
  return result
}

function migrateLegacyWorkouts(draft: DailyLogDraft): WorkoutDrafts {
  if (draft.workouts) return draft.workouts
  if (draft.workout_category && draft.workout_category !== 'none') {
    return { [draft.workout_category]: draft.workout_duration ?? null }
  }
  return {}
}

function workoutsToSave(draft: DailyLogDraft): { category: WorkoutCategory; duration_minutes: number }[] {
  const map = migrateLegacyWorkouts(draft)
  return WORKOUT_CATEGORIES().flatMap((category) => {
    const duration = map[category]
    if (duration == null || duration <= 0) return []
    return [{ category, duration_minutes: duration }]
  })
}

export function getDraft(date: string): DailyLogDraft | null {
  try {
    const raw = storageGetItem(draftKey(date))
    return raw ? (JSON.parse(raw) as DailyLogDraft) : null
  } catch {
    return null
  }
}

export function setDraft(date: string, draft: DailyLogDraft) {
  try {
    storageSetItem(draftKey(date), JSON.stringify(draft))
  } catch {
    /* ignore */
  }
}

export function clearDraft(date: string) {
  try {
    storageRemoveItem(draftKey(date))
  } catch {
    /* ignore */
  }
}

export function getAllDraftDates(): string[] {
  try {
    return storageKeys(DRAFT_PREFIX)
      .map((key) => key.slice(DRAFT_PREFIX.length))
      .sort()
  } catch {
    return []
  }
}

export function draftFromLog(
  log: {
    date?: string
    sleep_hours: number | null
    weight: number | null
    steps: number | null
    screen_time_minutes: number | null
    focus_minutes: number
    habits?: DailyHabits
    custom_metrics?: Record<string, number | null>
  },
  workouts: Workout[] = [],
): DailyLogDraft {
  const storedForDay = log.date
    ? workoutsFromListForDate(workouts, log.date)
    : workoutsFromList(workouts)

  return {
    sleep_hours: log.sleep_hours,
    weight: log.weight,
    steps: log.steps,
    screen_time_minutes: log.screen_time_minutes,
    habits: normalizeHabits(log.habits),
    custom_metrics: log.custom_metrics ?? {},
    workouts: log.date && usesAdditiveTodayDraft(log.date) ? {} : storedForDay,
    focus_minutes: log.date && usesAdditiveTodayDraft(log.date) ? undefined : log.focus_minutes,
  }
}

function normalizeTodayWorkoutDraft(
  draft: DailyLogDraft | null,
  date: string | undefined,
  workouts: Workout[],
): DailyLogDraft | null {
  if (!draft || !date || !usesAdditiveTodayDraft(date) || draft.workoutMode === 'additive') {
    return draft
  }

  const stored = workoutsFromListForDate(workouts, date)
  const draftWorkouts = migrateLegacyWorkouts(draft)
  const additions: WorkoutDrafts = {}

  for (const [category, value] of Object.entries(draftWorkouts)) {
    if (value == null || value <= 0) continue
    const storedMinutes = stored[category as WorkoutCategory] ?? 0
    const addition = storedMinutes > 0 ? Math.max(0, value - storedMinutes) : value
    if (addition > 0) additions[category as WorkoutCategory] = addition
  }

  return { ...draft, workouts: additions, workoutMode: 'additive' }
}

function normalizeTodayFocusDraft(
  draft: DailyLogDraft | null,
  log: { date?: string; focus_minutes: number },
): DailyLogDraft | null {
  if (!draft || !log.date || !usesAdditiveTodayDraft(log.date) || draft.focusMode === 'additive') {
    return draft
  }

  const storedMinutes = log.focus_minutes ?? 0
  const draftMinutes = draft.focus_minutes ?? 0
  if (draftMinutes <= 0) {
    return { ...draft, focusMode: 'additive' }
  }

  const addition = storedMinutes > 0 ? Math.max(0, draftMinutes - storedMinutes) : draftMinutes
  return {
    ...draft,
    focus_minutes: addition > 0 ? addition : undefined,
    focusMode: 'additive',
  }
}

function normalizeTodayDraft(
  draft: DailyLogDraft | null,
  log: { date?: string; focus_minutes: number },
  workouts: Workout[],
): DailyLogDraft | null {
  return normalizeTodayFocusDraft(normalizeTodayWorkoutDraft(draft, log.date, workouts), log)
}

export function mergeDraftWithLog(
  log: {
    date?: string
    sleep_hours: number | null
    weight: number | null
    steps: number | null
    screen_time_minutes: number | null
    focus_minutes: number
    habits?: DailyHabits
    custom_metrics?: Record<string, number | null>
  },
  draft: DailyLogDraft | null,
  workouts: Workout[] = [],
): DailyLogDraft {
  const normalizedDraft = normalizeTodayDraft(draft, log, workouts)
  const base = draftFromLog(log, workouts)
  if (!normalizedDraft) return base

  const { focus_minutes: draftFocus, workouts: _draftWorkouts, ...restDraft } = normalizedDraft
  const draftWorkouts = migrateLegacyWorkouts(normalizedDraft)
  const hasDraftWorkouts = Object.keys(draftWorkouts).length > 0
  const hasDraftFocus = draftFocus != null && draftFocus > 0
  const additive = log.date ? usesAdditiveTodayDraft(log.date) : false

  return {
    ...base,
    ...restDraft,
    custom_metrics: { ...base.custom_metrics, ...normalizedDraft.custom_metrics },
    habits: normalizeHabits({ ...base.habits, ...normalizedDraft.habits }),
    focus_minutes: additive
      ? hasDraftFocus
        ? draftFocus
        : undefined
      : draftFocus ?? base.focus_minutes,
    workouts: additive
      ? hasDraftWorkouts
        ? draftWorkouts
        : {}
      : hasDraftWorkouts
        ? { ...base.workouts, ...draftWorkouts }
        : base.workouts,
  }
}

export async function flushDraftToStore(date: string, userId: string): Promise<boolean> {
  const draft = getDraft(date)
  if (!draft) return false

  const updates = {
    sleep_hours: draft.sleep_hours ?? null,
    weight: draft.weight ?? null,
    steps: draft.steps ?? null,
    screen_time_minutes: draft.screen_time_minutes ?? null,
    habits: normalizeHabits(draft.habits),
    custom_metrics: draft.custom_metrics ?? {},
  }

  const savedWorkouts = workoutsToSave(draft)
  const additiveToday = usesAdditiveTodayDraft(date)

  if (isSupabaseConfigured) {
    const { getOrCreateDailyLog, updateDailyLog, addWorkout } = await import('@/lib/supabase')
    const log = await getOrCreateDailyLog(userId, date)
    const existingFocus = log.focus_minutes ?? 0
    const draftFocus = draft.focus_minutes ?? 0
    const nextFocus = additiveToday ? existingFocus + draftFocus : draft.focus_minutes ?? existingFocus

    await updateDailyLog(log.id, { ...updates, focus_minutes: nextFocus })

    if (!additiveToday && supabase) {
      const { data: existing } = await supabase
        .from('workouts')
        .select('id')
        .eq('user_id', userId)
        .eq('date', date)

      for (const row of existing ?? []) {
        await supabase.from('workouts').delete().eq('id', row.id)
      }
    }

    for (const workout of savedWorkouts) {
      await addWorkout({
        user_id: userId,
        daily_log_id: log.id,
        date,
        category: workout.category,
        duration_minutes: workout.duration_minutes,
        notes: '',
      })
    }
  } else {
    const existing = localStore.getOrCreateDailyLog(date)
    const draftFocus = draft.focus_minutes ?? 0
    const nextFocus = additiveToday
      ? (existing.focus_minutes ?? 0) + draftFocus
      : draft.focus_minutes ?? existing.focus_minutes
    localStore.updateDailyLog(date, { ...updates, focus_minutes: nextFocus })
    if (!additiveToday) {
      localStore.removeWorkoutsForDate(date)
    }

    const log = localStore.getOrCreateDailyLog(date)
    for (const workout of savedWorkouts) {
      localStore.addWorkout({
        user_id: userId,
        daily_log_id: log.id,
        date,
        category: workout.category,
        duration_minutes: workout.duration_minutes,
        notes: '',
      })
    }
  }

  clearDraft(date)
  return true
}

/** Flush drafts for any date before today (e.g. after midnight or on next app open). */
export async function flushDueDrafts(userId: string): Promise<string[]> {
  const today = formatDate(new Date())
  const flushed: string[] = []

  for (const date of getAllDraftDates()) {
    if (date < today) {
      const didFlush = await flushDraftToStore(date, userId)
      if (didFlush) flushed.push(date)
    }
  }

  return flushed
}

export function msUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime() - now.getTime()
}
