import { useEffect, useState } from 'react'
import { Beaker } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import {
  EXPERIMENTS_CHANGED,
  armLabel,
  experimentDisplayTitle,
  getExperiments,
} from '@/lib/experiments'
import { cn, formatDate } from '@/lib/utils'
import type { Experiment } from '@/types'

interface ExperimentHomeCardProps {
  date: string
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

export function ExperimentHomeCard({ date, className }: ExperimentHomeCardProps) {
  const navigate = useNavigate()
  const [experiments, setExperiments] = useState<Experiment[]>(() =>
    getExperiments().filter((e) => e.status === 'running'),
  )

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

  if (experiments.length === 0) return null

  const today = formatDate(new Date())

  return (
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
                  onClick={() => navigate('/experiments')}
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
  )
}
