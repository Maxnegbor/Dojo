import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { OutcomeGoalCard } from '@/components/outcomeGoals/OutcomeGoalCard'
import { OutcomeGoalEditor } from '@/components/outcomeGoals/OutcomeGoalEditor'
import { useAuth } from '@/hooks/useData'
import { useSettings } from '@/context/SettingsContext'
import { localStore } from '@/lib/localStore'
import {
  computeOutcomeGoalProgress,
  deleteOutcomeGoal,
  getOutcomeGoals,
  OUTCOME_GOALS_CHANGED,
  runOutcomeGoalsMigration,
  upsertOutcomeGoal,
} from '@/lib/outcomeGoals'
import { isSupabaseConfigured } from '@/lib/supabase'
import { formatDate, getWeekDates } from '@/lib/utils'
import type { DailyLog, Goal, OutcomeGoal, Workout } from '@/types'

export function OutcomeGoalsPage() {
  const { userId } = useAuth()
  const { settings } = useSettings()
  const [goals, setGoals] = useState<OutcomeGoal[]>(() => getOutcomeGoals())
  const [hybridGoals, setHybridGoals] = useState<Goal[]>([])
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [editing, setEditing] = useState<OutcomeGoal | null | 'new'>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const today = formatDate(new Date())
  const weekDates = useMemo(
    () => getWeekDates(new Date(), settings.weekStartsOn),
    [settings.weekStartsOn],
  )

  const refreshGoals = useCallback(() => {
    setGoals(getOutcomeGoals())
  }, [])

  const loadData = useCallback(async () => {
    if (!userId) return
    await runOutcomeGoalsMigration(userId)
    refreshGoals()

    const end = weekDates[weekDates.length - 1]
    const startDate = new Date(`${weekDates[0]}T12:00:00`)
    startDate.setDate(startDate.getDate() - 90)
    const start = formatDate(startDate)

    if (isSupabaseConfigured) {
      const { fetchGoals, fetchDailyLogs, fetchWorkouts } = await import('@/lib/supabase')
      const [g, l, w] = await Promise.all([
        fetchGoals(userId),
        fetchDailyLogs(userId, start, end),
        fetchWorkouts(userId, start, end),
      ])
      setHybridGoals(g)
      setLogs(l)
      setWorkouts(w)
    } else {
      localStore.setUserId(userId)
      setHybridGoals(localStore.getGoals())
      setLogs(localStore.getDailyLogs(start, end))
      setWorkouts(localStore.getWorkouts(start, end))
    }
  }, [userId, weekDates, refreshGoals])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const onChange = () => refreshGoals()
    window.addEventListener(OUTCOME_GOALS_CHANGED, onChange)
    window.addEventListener('user-storage-ready', onChange)
    return () => {
      window.removeEventListener(OUTCOME_GOALS_CHANGED, onChange)
      window.removeEventListener('user-storage-ready', onChange)
    }
  }, [refreshGoals])

  const activeGoals = useMemo(
    () => goals.filter((goal) => goal.is_active),
    [goals],
  )

  const progressList = useMemo(
    () =>
      activeGoals.map((goal) =>
        computeOutcomeGoalProgress(
          goal,
          logs,
          workouts,
          hybridGoals,
          new Date(`${today}T12:00:00`),
          settings.weekStartsOn,
        ),
      ),
    [activeGoals, logs, workouts, hybridGoals, today, settings.weekStartsOn],
  )

  const handleSave = (goal: OutcomeGoal) => {
    upsertOutcomeGoal(goal)
    setEditing(null)
    refreshGoals()
  }

  const handleDelete = (id: string) => {
    deleteOutcomeGoal(id)
    setConfirmDeleteId(null)
    if (editing !== 'new' && editing?.id === id) setEditing(null)
    refreshGoals()
  }

  if (!userId) return null

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Goals</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            What you want to change. Link metrics from the{' '}
            <Link to="/metrics" className="text-[var(--accent-300)] hover:underline">
              Metrics
            </Link>{' '}
            library — outcomes for results, process for behaviors.
          </p>
        </div>
        {editing == null && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus size={14} />
            New goal
          </Button>
        )}
      </div>

      {editing != null && (
        <OutcomeGoalEditor
          initial={editing === 'new' ? null : editing}
          hybridGoals={hybridGoals}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {progressList.length === 0 && editing == null ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">No goals yet</p>
          <p className="mt-1 text-xs text-zinc-600">
            Define an outcome (e.g. bodyweight) and optional process metrics (workouts, habits).
          </p>
          <Button size="sm" className="mt-4" onClick={() => setEditing('new')}>
            <Plus size={14} />
            Create your first goal
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
          {progressList.map((progress) =>
            confirmDeleteId === progress.goal.id ? (
              <div
                key={progress.goal.id}
                className="h-full rounded-xl border border-red-900/40 bg-red-950/20 p-4"
              >
                <p className="text-sm text-zinc-200">
                  Delete <span className="font-semibold">{progress.goal.title}</span>?
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleDelete(progress.goal.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ) : (
              <OutcomeGoalCard
                key={progress.goal.id}
                progress={progress}
                onEdit={() => setEditing(progress.goal)}
                onDelete={() => setConfirmDeleteId(progress.goal.id)}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}
