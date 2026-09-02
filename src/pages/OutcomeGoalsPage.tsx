import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { OutcomeGoalCard } from '@/components/outcomeGoals/OutcomeGoalCard'
import { OutcomeGoalDetailModal } from '@/components/outcomeGoals/OutcomeGoalDetailModal'
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
  const { userId, storageReady } = useAuth()
  const { settings } = useSettings()
  const [goals, setGoals] = useState<OutcomeGoal[]>([])
  const [goalsReady, setGoalsReady] = useState(false)
  const [hybridGoals, setHybridGoals] = useState<Goal[]>([])
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [editing, setEditing] = useState<OutcomeGoal | null | 'new'>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const today = formatDate(new Date())
  const weekDates = useMemo(
    () => getWeekDates(new Date(), settings.weekStartsOn),
    [settings.weekStartsOn],
  )

  const refreshGoals = useCallback(() => {
    if (!storageReady) return
    const next = getOutcomeGoals()
    setGoals(next)
    setGoalsReady(true)
  }, [storageReady])

  const loadData = useCallback(async () => {
    if (!userId || !storageReady) return
    await runOutcomeGoalsMigration(userId)
    refreshGoals()

    const end = weekDates[weekDates.length - 1]
    const startDate = new Date(`${weekDates[0]}T12:00:00`)
    startDate.setDate(startDate.getDate() - 120)
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
  }, [userId, storageReady, weekDates, refreshGoals])

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

  useEffect(() => {
    if (editing == null && detailId == null && confirmDeleteId == null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setEditing(null)
      setDetailId(null)
      setConfirmDeleteId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, detailId, confirmDeleteId])

  const activeGoals = useMemo(
    () =>
      goals
        .filter((goal) => goal.is_active)
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
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

  const detailProgress = useMemo(
    () => progressList.find((entry) => entry.goal.id === detailId) ?? null,
    [progressList, detailId],
  )

  const pendingDelete = useMemo(
    () => activeGoals.find((goal) => goal.id === confirmDeleteId) ?? null,
    [activeGoals, confirmDeleteId],
  )

  const handleSave = (goal: OutcomeGoal) => {
    const saved = upsertOutcomeGoal(goal)
    setEditing(null)
    setDetailId(saved.id)
    refreshGoals()
  }

  const handleDelete = (id: string) => {
    deleteOutcomeGoal(id)
    setConfirmDeleteId(null)
    if (detailId === id) setDetailId(null)
    if (editing !== 'new' && editing?.id === id) setEditing(null)
    refreshGoals()
  }

  if (!userId) return null

  if (!goalsReady) {
    return <div className="flex flex-1 items-center justify-center text-zinc-500">Loading…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Goals</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            What you want. Link metrics from the{' '}
            <Link to="/metrics" className="text-[var(--accent-300)] hover:underline">
              Metrics
            </Link>{' '}
            library to measure it.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus size={14} />
          New goal
        </Button>
      </div>

      {progressList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">No goals yet</p>
          <p className="mt-1 text-xs text-zinc-600">
            Name a goal and connect the metric you want to hit.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setEditing('new')}>
            <Plus size={14} />
            Create your first goal
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
          {progressList.map((progress) => (
            <OutcomeGoalCard
              key={progress.goal.id}
              progress={progress}
              onOpen={() => setDetailId(progress.goal.id)}
              onDelete={() => setConfirmDeleteId(progress.goal.id)}
            />
          ))}
        </div>
      )}

      {editing != null ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setEditing(null)}
        >
          <div
            role="dialog"
            aria-label={editing === 'new' ? 'New goal' : 'Edit goal'}
            className="scrollbar-hidden max-h-[90vh] w-full max-w-lg overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <OutcomeGoalEditor
              initial={editing === 'new' ? null : editing}
              hybridGoals={hybridGoals}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            role="dialog"
            aria-labelledby="delete-goal-title"
            className="w-full max-w-sm rounded-2xl border border-red-900/40 bg-zinc-950 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="delete-goal-title" className="text-sm font-semibold text-zinc-100">
              Delete {pendingDelete.title}?
            </h3>
            <p className="mt-1.5 text-xs text-zinc-500">
              This removes the goal. Your metric logs stay.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => handleDelete(pendingDelete.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {detailProgress && editing == null && confirmDeleteId == null ? (
        <OutcomeGoalDetailModal
          progress={detailProgress}
          logs={logs}
          workouts={workouts}
          hybridGoals={hybridGoals}
          weekStartsOn={settings.weekStartsOn}
          onEdit={() => {
            setEditing(detailProgress.goal)
            setDetailId(null)
          }}
          onClose={() => setDetailId(null)}
        />
      ) : null}
    </div>
  )
}
