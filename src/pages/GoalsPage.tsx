import { useCallback, useEffect, useState } from 'react'
import { MetricsEditor } from '@/components/goals/MetricsEditor'
import { useSettings } from '@/context/SettingsContext'
import {
  backfillPastWeekSnapshotsOnGoalEdit,
  goalTargetFieldsChanged,
} from '@/lib/goalTargetSnapshots'
import { isSupabaseConfigured } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import type { Goal } from '@/types'
import { useAuth } from '@/hooks/useData'

export function GoalsPage() {
  const { userId } = useAuth()
  const { settings } = useSettings()
  const [goals, setGoals] = useState<Goal[]>([])

  const load = useCallback(async () => {
    if (!userId) return

    if (isSupabaseConfigured) {
      const { fetchGoals } = await import('@/lib/supabase')
      setGoals(await fetchGoals(userId))
    } else {
      setGoals(localStore.getGoals())
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  const saveGoal = async (goal: Goal) => {
    const existing = goals.find((g) => g.id === goal.id)
    if (
      existing &&
      goal.metric_key.startsWith('workout_') &&
      goalTargetFieldsChanged(existing, goal)
    ) {
      backfillPastWeekSnapshotsOnGoalEdit(existing, settings.weekStartsOn)
    }

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
      userId={userId}
      onSaveGoal={saveGoal}
      onDeleteGoal={removeGoal}
    />
  )
}
