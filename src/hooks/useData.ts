import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import type { DailyLog, Workout } from '@/types'
import { formatDate } from '@/lib/utils'

export { useAuth } from '@/context/AuthContext'

export function useDailyLog(date: string) {
  const [log, setLog] = useState<DailyLog | null>(null)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const { userId } = useAuth()

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }
    setLoading(true)

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

  useEffect(() => {
    refresh()
  }, [refresh])

  const updateLog = useCallback(
    async (updates: Partial<DailyLog>) => {
      if (!userId || !log) return

      if (isSupabaseConfigured) {
        const { updateDailyLog } = await import('@/lib/supabase')
        const updated = await updateDailyLog(log.id, updates)
        setLog(updated)
      } else {
        const updated = localStore.updateDailyLog(date, updates)
        setLog(updated)
      }
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

  return { log, workouts, loading, updateLog, addWorkout, removeWorkouts, refresh }
}

export function useStreak() {
  const [streak, setStreak] = useState(0)
  const { userId } = useAuth()

  useEffect(() => {
    if (!userId) return

    async function load() {
      if (isSupabaseConfigured && supabase) {
        const { fetchDailyLogs } = await import('@/lib/supabase')
        const end = formatDate(new Date())
        const start = formatDate(new Date(Date.now() - 365 * 86400000))
        const logs = await fetchDailyLogs(userId!, start, end)
        const { getStreakDates } = await import('@/lib/utils')
        setStreak(getStreakDates(logs.map((l) => l.date)))
      } else {
        localStore.setUserId(userId!)
        const { getStreakDates } = await import('@/lib/utils')
        setStreak(getStreakDates(localStore.getLogDates()))
      }
    }

    load()
  }, [userId])

  return streak
}
