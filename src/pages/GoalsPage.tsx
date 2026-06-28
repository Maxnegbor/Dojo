import { useCallback, useEffect, useMemo, useState } from 'react'
import { MetricsEditor } from '@/components/goals/MetricsEditor'
import { useSettings } from '@/context/SettingsContext'
import { isSupabaseConfigured } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import type { DailyLog, Goal, Workout } from '@/types'
import { getPreviousWeekDates } from '@/lib/weightGoal'
import { formatDate, getWeekDates } from '@/lib/utils'
import { useAuth, useDailyLog } from '@/hooks/useData'

export function GoalsPage() {
  const today = formatDate(new Date())
  const { log } = useDailyLog(today)
  const { userId } = useAuth()
  const { settings } = useSettings()
  const [goals, setGoals] = useState<Goal[]>([])
  const [weekLogs, setWeekLogs] = useState<DailyLog[]>([])
  const [weekWorkouts, setWeekWorkouts] = useState<Workout[]>([])

  const weekRange = useMemo(() => {
    const weekDates = getWeekDates(new Date(), settings.weekStartsOn)
    const prevWeekDates = getPreviousWeekDates(weekDates, settings.weekStartsOn)
    return {
      start: prevWeekDates[0] ?? weekDates[0],
      end: weekDates[weekDates.length - 1],
    }
  }, [settings.weekStartsOn])

  const load = useCallback(async () => {
    if (!userId) return
    const { start, end } = weekRange

    if (isSupabaseConfigured) {
      const { fetchGoals, fetchDailyLogs, fetchWorkouts } = await import('@/lib/supabase')
      const [g, logs, workouts] = await Promise.all([
        fetchGoals(userId),
        fetchDailyLogs(userId, start, end),
        fetchWorkouts(userId, start, end),
      ])
      setGoals(g)
      setWeekLogs(logs)
      setWeekWorkouts(workouts)
    } else {
      setGoals(localStore.getGoals())
      setWeekLogs(localStore.getDailyLogs(start, end))
      setWeekWorkouts(localStore.getWorkouts(start, end))
    }
  }, [userId, weekRange])

  useEffect(() => { load() }, [load])

  const saveGoal = async (goal: Goal) => {
    if (isSupabaseConfigured) {
      const { upsertGoal } = await import('@/lib/supabase')
      await upsertGoal(goal)
    } else {
      localStore.upsertGoal(goal)
    }
    setGoals((prev) => {
      const idx = prev.findIndex((g) => g.id === goal.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = goal; return next }
      return [...prev, goal]
    })
  }

  const removeGoal = async (goal: Goal) => {
    if (isSupabaseConfigured) {
      const { deleteGoal } = await import('@/lib/supabase')
      await deleteGoal(goal.id)
    } else {
      localStore.deleteGoalWithData(goal)
    }
    setGoals((prev) => prev.filter((g) => g.id !== goal.id))
  }

  if (!userId) return null

  return (
    <MetricsEditor
      goals={goals}
      log={log ?? undefined}
      weekLogs={weekLogs}
      weekWorkouts={weekWorkouts}
      date={today}
      weekStartsOn={settings.weekStartsOn}
      userId={userId}
      onSaveGoal={saveGoal}
      onDeleteGoal={removeGoal}
    />
  )
}
