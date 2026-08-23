import { isSupabaseConfigured } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import type { Workout, WorkoutCategory } from '@/types'

/** Sum of logged minutes for a workout type on a given date. */
export function totalMinutesForDay(
  workouts: Workout[],
  date: string,
  category: WorkoutCategory,
): number {
  return workouts
    .filter((w) => w.date === date && w.category === category)
    .reduce((sum, w) => sum + (w.duration_minutes || 0), 0)
}

/**
 * Replace a day's logged volume for one workout type with a single total.
 * Collapses multiple sessions into one row when needed.
 * Returns the full workouts list after applying the change.
 */
export async function setWorkoutDayTotal(params: {
  userId: string
  date: string
  category: WorkoutCategory
  minutes: number
  existing: Workout[]
}): Promise<Workout[]> {
  const { userId, date, category, minutes, existing } = params
  const forDay = existing.filter((w) => w.date === date && w.category === category)
  const others = existing.filter((w) => !(w.date === date && w.category === category))
  const next = Math.max(0, Math.round(minutes))

  if (isSupabaseConfigured) {
    const { addWorkout, updateWorkout, deleteWorkout } = await import('@/lib/supabase')
    if (next <= 0) {
      for (const workout of forDay) await deleteWorkout(workout.id)
      return others
    }
    if (forDay.length === 0) {
      const created = await addWorkout({
        user_id: userId,
        daily_log_id: null,
        date,
        category,
        duration_minutes: next,
        notes: '',
      })
      return [...others, created]
    }
    await updateWorkout(forDay[0]!.id, { duration_minutes: next })
    for (const workout of forDay.slice(1)) await deleteWorkout(workout.id)
    return [...others, { ...forDay[0]!, duration_minutes: next }]
  }

  if (next <= 0) {
    for (const workout of forDay) localStore.deleteWorkout(workout.id)
    return others
  }
  if (forDay.length === 0) {
    const created = localStore.addWorkout({
      user_id: userId,
      daily_log_id: null,
      date,
      category,
      duration_minutes: next,
      notes: '',
    })
    return [...others, created]
  }
  localStore.updateWorkout(forDay[0]!.id, { duration_minutes: next })
  for (const workout of forDay.slice(1)) localStore.deleteWorkout(workout.id)
  return [...others, { ...forDay[0]!, duration_minutes: next }]
}
