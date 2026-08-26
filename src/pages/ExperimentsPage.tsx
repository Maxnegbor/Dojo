import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ExperimentCard } from '@/components/experiments/ExperimentCard'
import { ExperimentDetailModal } from '@/components/experiments/ExperimentDetailModal'
import {
  ExperimentWizard,
  type NewExperimentMetricDraft,
} from '@/components/experiments/ExperimentWizard'
import { useAuth } from '@/hooks/useData'
import {
  EXPERIMENTS_CHANGED,
  deleteExperiment,
  getExperiments,
  upsertExperiment,
} from '@/lib/experiments'
import { localStore } from '@/lib/localStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { formatDate, generateId, getWeekDates } from '@/lib/utils'
import { useSettings } from '@/context/SettingsContext'
import type { DailyLog, Experiment, Goal, Workout } from '@/types'

export function ExperimentsPage() {
  const { userId } = useAuth()
  const { settings } = useSettings()
  const [experiments, setExperiments] = useState<Experiment[]>(() => getExperiments())
  const [hybridGoals, setHybridGoals] = useState<Goal[]>([])
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const weekDates = useMemo(
    () => getWeekDates(new Date(), settings.weekStartsOn),
    [settings.weekStartsOn],
  )

  const refresh = useCallback(() => {
    setExperiments(getExperiments())
  }, [])

  const loadData = useCallback(async () => {
    if (!userId) return
    refresh()

    const end = weekDates[weekDates.length - 1]
    const startDate = new Date(`${weekDates[0]}T12:00:00`)
    startDate.setDate(startDate.getDate() - 180)
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
  }, [userId, weekDates, refresh])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const onChange = () => refresh()
    window.addEventListener(EXPERIMENTS_CHANGED, onChange)
    window.addEventListener('user-storage-ready', onChange)
    return () => {
      window.removeEventListener(EXPERIMENTS_CHANGED, onChange)
      window.removeEventListener('user-storage-ready', onChange)
    }
  }, [refresh])

  const detail = useMemo(
    () => experiments.find((e) => e.id === detailId) ?? null,
    [experiments, detailId],
  )

  const persistNewMetric = async (draft: NewExperimentMetricDraft) => {
    if (!userId) return
    const existing = hybridGoals.find((g) => g.metric_key === draft.metric_key)
    if (existing) return

    const now = new Date().toISOString()
    const goal: Goal = {
      id: generateId(),
      user_id: userId,
      metric_key: draft.metric_key,
      name: draft.name,
      target_value: null,
      log_period: 'daily',
      goal_weight_start: null,
      goal_weight_target: null,
      unit: draft.unit,
      is_active: true,
      created_at: now,
    }

    if (isSupabaseConfigured) {
      const { upsertGoal } = await import('@/lib/supabase')
      await upsertGoal(goal)
    } else {
      localStore.upsertGoal(goal)
    }
    setHybridGoals((prev) => [...prev, goal])
  }

  const handleSave = async (
    experiment: Experiment,
    newMetrics?: NewExperimentMetricDraft[],
  ) => {
    if (newMetrics?.length) {
      for (const draft of newMetrics) {
        await persistNewMetric(draft)
      }
    }
    upsertExperiment(experiment)
    setWizardOpen(false)
    setDetailId(experiment.id)
    refresh()
  }

  const handleDelete = (id: string) => {
    deleteExperiment(id)
    setConfirmDeleteId(null)
    if (detailId === id) setDetailId(null)
    refresh()
  }

  if (!userId) return null

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Experiments</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Run lifestyle tests with a protocol and schedule. Outcomes use your{' '}
            <Link to="/metrics" className="text-[var(--accent-300)] hover:underline">
              Metrics
            </Link>
            .
          </p>
        </div>
        {!wizardOpen && (
          <Button size="sm" onClick={() => setWizardOpen(true)}>
            <Plus size={14} />
            New experiment
          </Button>
        )}
      </div>

      {experiments.length === 0 && !wizardOpen ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">No experiments yet</p>
          <p className="mt-1 text-xs text-zinc-600">
            Ask a question, pick a protocol, and Dojo builds the day plan.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setWizardOpen(true)}>
            <Plus size={14} />
            Start your first experiment
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
          {experiments.map((experiment) =>
            confirmDeleteId === experiment.id ? (
              <div
                key={experiment.id}
                className="h-full rounded-xl border border-red-900/40 bg-red-950/20 p-4"
              >
                <p className="text-sm text-zinc-200">Delete this experiment?</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleDelete(experiment.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ) : (
              <ExperimentCard
                key={experiment.id}
                experiment={experiment}
                onOpen={() => setDetailId(experiment.id)}
                onDelete={() => setConfirmDeleteId(experiment.id)}
              />
            ),
          )}
        </div>
      )}

      {wizardOpen && (
        <ExperimentWizard
          hybridGoals={hybridGoals}
          onSave={handleSave}
          onCancel={() => setWizardOpen(false)}
        />
      )}

      {detail && !wizardOpen ? (
        <ExperimentDetailModal
          experiment={detail}
          logs={logs}
          workouts={workouts}
          hybridGoals={hybridGoals}
          onChange={(next) => {
            setExperiments((prev) => prev.map((e) => (e.id === next.id ? next : e)))
          }}
          onDelete={() => {
            setDetailId(null)
            setConfirmDeleteId(detail.id)
          }}
          onClose={() => setDetailId(null)}
        />
      ) : null}
    </div>
  )
}
