import { useCallback, useEffect, useMemo, useState } from 'react'
import { OverviewMetricCard } from '@/components/dashboard/OverviewMetricCard'
import { useSettings } from '@/context/SettingsContext'
import { useAuth } from '@/hooks/useData'
import { localStore } from '@/lib/localStore'
import { buildOverviewMetrics, overviewDataRange } from '@/lib/overviewStats'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { DailyLog, Goal, Workout } from '@/types'

export function OverviewPage() {
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const { userId } = useAuth()
  const { settings } = useSettings()

  const load = useCallback(async () => {
    if (!userId) return
    const { start, end } = overviewDataRange(settings.weekStartsOn)

    if (isSupabaseConfigured) {
      const { fetchDailyLogs, fetchWorkouts, fetchGoals } = await import('@/lib/supabase')
      const [l, w, g] = await Promise.all([
        fetchDailyLogs(userId, start, end),
        fetchWorkouts(userId, start, end),
        fetchGoals(userId),
      ])
      setLogs(l)
      setWorkouts(w)
      setGoals(g)
    } else {
      setLogs(localStore.getDailyLogs(start, end))
      setWorkouts(localStore.getWorkouts(start, end))
      setGoals(localStore.getGoals())
    }
  }, [userId, settings.weekStartsOn])

  useEffect(() => {
    load()
  }, [load])

  const metrics = useMemo(
    () => buildOverviewMetrics(logs, workouts, settings.weekStartsOn, goals),
    [logs, workouts, settings.weekStartsOn, goals],
  )

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header>
        <h2 className="text-2xl font-bold text-zinc-100">Overview</h2>
      </header>

      {metrics.length === 0 ? (
        <p className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-500">
          Add goals to see your overview metrics here.
        </p>
      ) : (
        <div className="space-y-3">
          {metrics.map((metric) => (
            <OverviewMetricCard key={metric.id} metric={metric} />
          ))}
        </div>
      )}
    </div>
  )
}
