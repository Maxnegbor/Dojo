import { useEffect, useState } from 'react'
import { Beaker, Check } from 'lucide-react'
import {
  EXPERIMENTS_CHANGED,
  experimentDisplayTitle,
  experimentsNeedingConfounderLog,
  getConfounderTicksForDate,
  setExperimentConfounderTick,
  upsertExperiment,
} from '@/lib/experiments'
import { cn } from '@/lib/utils'
import type { Experiment, ExperimentConfounderLogSurface } from '@/types'

interface ExperimentConfoundersSectionProps {
  date: string
  surface: ExperimentConfounderLogSurface
  /** Compact embed for log modals. */
  className?: string
}

export function ExperimentConfoundersSection({
  date,
  surface,
  className,
}: ExperimentConfoundersSectionProps) {
  const [experiments, setExperiments] = useState(() =>
    experimentsNeedingConfounderLog(surface, date),
  )

  useEffect(() => {
    const refresh = () => setExperiments(experimentsNeedingConfounderLog(surface, date))
    refresh()
    window.addEventListener(EXPERIMENTS_CHANGED, refresh)
    window.addEventListener('user-storage-ready', refresh)
    return () => {
      window.removeEventListener(EXPERIMENTS_CHANGED, refresh)
      window.removeEventListener('user-storage-ready', refresh)
    }
  }, [surface, date])

  if (experiments.length === 0) return null

  const toggle = (experiment: Experiment, confounderId: string, present: boolean) => {
    const next = setExperimentConfounderTick(experiment, date, confounderId, present)
    upsertExperiment(next)
    setExperiments(experimentsNeedingConfounderLog(surface, date))
  }

  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Beaker size={14} className="text-[var(--accent-400)]" />
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Experiments
        </p>
      </div>
      {experiments.map((experiment) => {
        const ticks = getConfounderTicksForDate(experiment, date)
        return (
          <div
            key={experiment.id}
            className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3"
          >
            <p className="text-xs font-medium text-zinc-200">
              {experimentDisplayTitle(experiment)}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              Tick confounders that applied today
            </p>
            <ul className="mt-2 space-y-1.5">
              {experiment.confounders.map((confounder) => {
                const on = Boolean(ticks[confounder.id])
                return (
                  <li key={confounder.id}>
                    <button
                      type="button"
                      onClick={() => toggle(experiment, confounder.id, !on)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors',
                        on
                          ? 'border-amber-500/40 bg-amber-950/30 text-amber-100'
                          : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded',
                          on ? 'bg-amber-500/30 text-amber-300' : 'bg-zinc-800 text-zinc-600',
                        )}
                      >
                        <Check size={10} strokeWidth={3} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{confounder.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
