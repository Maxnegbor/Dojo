import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import type { DailyLog, Workout } from '@/types'

export { useAuth } from '@/context/AuthContext'

export function useDailyLog(date: string) {
  const [log, setLog] = useState<DailyLog | null>(null)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const { userId } = useAuth()

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) {
      setLoading(false)
      return
    }
    if (!options?.silent) {
      setLoading(true)
    }

    if (isSupabaseConfigured && supabase) {
      const { getOrCreateDailyLog, fetchWorkouts } = await import('@/lib/supabase')
      const dailyLog = await getOrCreateDailyLog(userId, date)
      const dayWorkouts = await fetchWorkouts(userId, date, date)
      setLog(dailyLog)
      setWorkouts(dayWorkouts)
    } else {
      localStore.setUserId(userId)
      const dailyLog = localStore.getOrCreateDailyLog(date)
      const dayWorkouts = localStore.getWorkouts(date, date)
      setLog(dailyLog)
      setWorkouts(dayWorkouts)
    }

    setLoading(false)
  }, [userId, date])

  /** Re-read log/workouts from storage without toggling loading (after draft flush). */
  const syncFromStore = useCallback(() => {
    if (!userId) return
    if (isSupabaseConfigured && supabase) {
      void refresh({ silent: true })
      return
    }
    localStore.setUserId(userId)
    setLog(localStore.getOrCreateDailyLog(date))
    setWorkouts(localStore.getWorkouts(date, date))
  }, [userId, date, refresh])

  useEffect(() => {
    refresh()
  }, [refresh])

  const updateLog = useCallback(
    async (updates: Partial<DailyLog>) => {
      if (!userId || !log) {
        throw new Error('Daily log not loaded')
      }

      if (isSupabaseConfigured) {
        const { updateDailyLogForDate } = await import('@/lib/supabase')
        const updated = await updateDailyLogForDate(userId, date, updates)
        setLog(updated)
        return updated
      }

      const updated = localStore.updateDailyLog(date, updates)
      setLog(updated)
      return updated
    },
    [userId, log, date],
  )

  const addWorkout = useCallback(
    async (category: Workout['category'], duration: number, notes = '') => {
      if (!userId) return

      if (isSupabaseConfigured) {
        const { addWorkout: add } = await import('@/lib/supabase')
        const w = await add({
          user_id: userId,
          daily_log_id: log?.id ?? null,
          date,
          category,
          duration_minutes: duration,
          notes,
        })
        setWorkouts((prev) => [...prev, w])
      } else {
        const w = localStore.addWorkout({
          user_id: userId,
          daily_log_id: log?.id ?? null,
          date,
          category,
          duration_minutes: duration,
          notes,
        })
        setWorkouts((prev) => [...prev, w])
      }
    },
    [userId, log, date],
  )

  const removeWorkouts = useCallback(async () => {
    if (!userId) return

    if (isSupabaseConfigured && supabase) {
      const ids = workouts.map((w) => w.id)
      for (const id of ids) {
        await supabase.from('workouts').delete().eq('id', id)
      }
    } else {
      localStore.removeWorkoutsForDate(date)
    }
    setWorkouts([])
  }, [userId, date, workouts])

  return { log, workouts, loading, updateLog, addWorkout, removeWorkouts, refresh, syncFromStore }
}
