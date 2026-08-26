import { useEffect, useMemo, useState } from 'react'
import { Beaker } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { ExperimentDetailModal } from '@/components/experiments/ExperimentDetailModal'
import {
  EXPERIMENTS_CHANGED,
  armLabel,
  deleteExperiment,
  experimentDisplayTitle,
  getExperiments,
} from '@/lib/experiments'
import { cn, formatDate } from '@/lib/utils'
import type { DailyLog, Experiment, Goal, Workout } from '@/types'

interface ExperimentHomeCardProps {
  date: string
  logs: DailyLog[]
  workouts: Workout[]
  hybridGoals: Goal[]
  className?: string
}

function scheduleProgress(experiment: Experiment, date: string) {
  const { schedule } = experiment
  if (schedule.length === 0) {
    return {
      dayIndex: 0,
      total: 0,
      arm: null as { date: string; arm: 'A' | 'B' } | null,
      pct: 0,
    }
  }
  const arm = schedule.find((d) => d.date === date) ?? null
  const idx = schedule.findIndex((d) => d.date === date)
  const dayIndex = idx >= 0 ? idx + 1 : date < schedule[0]!.date ? 0 : schedule.length
  const pct = Math.min(100, Math.max(0, (dayIndex / schedule.length) * 100))
  return { dayIndex, total: schedule.length, arm, pct }
}

export function ExperimentHomeCard({
  date,
  logs,
  workouts,
  hybridGoals,
  className,
}: ExperimentHomeCardProps) {
  const [experiments, setExperiments] = useState<Experiment[]>(() =>
    getExperiments().filter((e) => e.status === 'running'),
  )
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    const refresh = () =>
      setExperiments(getExperiments().filter((e) => e.status === 'running'))
    refresh()
    window.addEventListener(EXPERIMENTS_CHANGED, refresh)
    window.addEventListener('user-storage-ready', refresh)
    return () => {
      window.removeEventListener(EXPERIMENTS_CHANGED, refresh)
      window.removeEventListener('user-storage-ready', refresh)
    }
  }, [])

  const detail = useMemo(
    () => experiments.find((e) => e.id === detailId) ?? null,
    [experiments, detailId],
  )

  if (experiments.length === 0) return null

  const today = formatDate(new Date())

  return (
    <>
      <Card
        className={cn('w-full', className)}
        title={
          <span className="flex items-center gap-1.5">
            <Beaker size={14} className="text-[var(--accent-400)]" />
            Experiments
          </span>
        }
      >
        <ul className="space-y-1.5">
          {experiments.map((experiment) => {
            const { dayIndex, total, arm, pct } = scheduleProgress(experiment, date)
            const onToday = Boolean(arm)
            const isViewingToday = date === today

            return (
              <li key={experiment.id}>
                <button
                  type="button"
                  onClick={() => setDetailId(experiment.id)}
                  className={cn(
                    'relative w-full overflow-hidden rounded-lg border px-2.5 py-2 text-left transition-colors',
                    onToday
                      ? 'border-[var(--accent-500)]/50 hover:border-[var(--accent-500)]/70'
                      : 'border-zinc-800/80 hover:border-zinc-700',
                  )}
                  style={{ backgroundColor: 'rgb(24 24 27)' }}
                >
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-300 ease-out"
                    style={{
                      width: `${pct}%`,
                      backgroundColor:
                        'color-mix(in srgb, var(--accent-500) 40%, rgb(24 24 27))',
                    }}
                    aria-hidden
                  />
                  <div className="relative z-[1] flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                        onToday ? 'bg-[var(--accent-500)]' : 'bg-zinc-600',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-100">
                        {experimentDisplayTitle(experiment)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-zinc-400">
                        {total > 0 ? (
                          <>
                            Day {Math.min(dayIndex, total)} of {total}
                            {arm ? (
                              <>
                                {' · '}
                                <span className="text-zinc-300">
                                  {isViewingToday ? 'Today' : date.slice(5)}: {arm.arm}{' '}
                                  ({armLabel(arm.arm, experiment)})
                                </span>
                              </>
                            ) : dayIndex === 0 ? (
                              <span> · starts {experiment.start_date.slice(5)}</span>
                            ) : (
                              <span> · ended</span>
                            )}
                          </>
                        ) : (
                          'No schedule yet'
                        )}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </Card>

      {detail ? (
        <ExperimentDetailModal
          experiment={detail}
          logs={logs}
          workouts={workouts}
          hybridGoals={hybridGoals}
          onChange={(next) => {
            setExperiments((prev) => {
              if (next.status !== 'running') {
                return prev.filter((e) => e.id !== next.id)
              }
              return prev.map((e) => (e.id === next.id ? next : e))
            })
          }}
          onDelete={() => {
            deleteExperiment(detail.id)
            setDetailId(null)
            setExperiments((prev) => prev.filter((e) => e.id !== detail.id))
          }}
          onClose={() => setDetailId(null)}
        />
      ) : null}
    </>
  )
}
