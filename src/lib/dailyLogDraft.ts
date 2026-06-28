import type { DailyHabits, Workout, WorkoutCategory } from '@/types'
import { normalizeHabits } from '@/types'
import { localStore } from '@/lib/localStore'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { getWorkoutTypeIds } from '@/lib/workoutTypes'
import { formatDate } from '@/lib/utils'

const DRAFT_PREFIX = 'personal-os-log-draft-'

export type WorkoutDrafts = Partial<Record<WorkoutCategory, number | null>>

export interface DailyLogDraft {
  sleep_hours?: number | null
  weight?: number | null
  steps?: number | null
  screen_time_minutes?: number | null
  focus_minutes?: number
  habits?: DailyHabits
  custom_metrics?: Record<string, number | null>
  workouts?: WorkoutDrafts
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
    const raw = localStorage.getItem(draftKey(date))
    return raw ? (JSON.parse(raw) as DailyLogDraft) : null
  } catch {
    return null
  }
}

export function setDraft(date: string, draft: DailyLogDraft) {
  try {
    localStorage.setItem(draftKey(date), JSON.stringify(draft))
  } catch {
    /* ignore */
  }
}

export function clearDraft(date: string) {
  try {
    localStorage.removeItem(draftKey(date))
  } catch {
    /* ignore */
  }
}

export function getAllDraftDates(): string[] {
  const dates: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(DRAFT_PREFIX)) {
        dates.push(key.slice(DRAFT_PREFIX.length))
      }
    }
  } catch {
    /* ignore */
  }
  return dates.sort()
}

export function draftFromLog(
  log: {
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
  return {
    sleep_hours: log.sleep_hours,
    weight: log.weight,
    steps: log.steps,
    screen_time_minutes: log.screen_time_minutes,
    focus_minutes: log.focus_minutes,
    habits: normalizeHabits(log.habits),
    custom_metrics: log.custom_metrics ?? {},
    workouts: workoutsFromList(workouts),
  }
}

export function mergeDraftWithLog(
  log: {
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
  const base = draftFromLog(log, workouts)
  if (!draft) return base

  const draftWorkouts = migrateLegacyWorkouts(draft)
  const hasDraftWorkouts = Object.keys(draftWorkouts).length > 0

  return {
    ...base,
    ...draft,
    custom_metrics: { ...base.custom_metrics, ...draft.custom_metrics },
    habits: normalizeHabits({ ...base.habits, ...draft.habits }),
    workouts: hasDraftWorkouts ? { ...base.workouts, ...draftWorkouts } : base.workouts,
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

  if (isSupabaseConfigured) {
    const { getOrCreateDailyLog, updateDailyLog, addWorkout } = await import('@/lib/supabase')
    const log = await getOrCreateDailyLog(userId, date)
    const existingFocus = log.focus_minutes ?? 0

    await updateDailyLog(log.id, { ...updates, focus_minutes: existingFocus })

    if (supabase) {
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
    localStore.updateDailyLog(date, { ...updates, focus_minutes: existing.focus_minutes })
    localStore.removeWorkoutsForDate(date)

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
