import { useEffect, useState } from 'react'
import { Beaker, Check } from 'lucide-react'
import {
  EXPERIMENTS_CHANGED,
  armLabel,
  experimentDisplayTitle,
  experimentNeedsAdherencePrompt,
  experimentsNeedingDailyLogStep,
  getConfounderTicksForDate,
  setExperimentAdherence,
  setExperimentConfounderTick,
  todayArm,
  upsertExperiment,
} from '@/lib/experiments'
import { cn } from '@/lib/utils'
import type { Experiment, ExperimentConfounderLogSurface } from '@/types'

interface ExperimentDailyLogSectionProps {
  date: string
  surface: ExperimentConfounderLogSurface
  className?: string
}

export function ExperimentDailyLogSection({
  date,
  surface,
  className,
}: ExperimentDailyLogSectionProps) {
  const [experiments, setExperiments] = useState(() =>
    experimentsNeedingDailyLogStep(surface, date),
  )

  useEffect(() => {
    const refresh = () => setExperiments(experimentsNeedingDailyLogStep(surface, date))
    refresh()
    window.addEventListener(EXPERIMENTS_CHANGED, refresh)
    window.addEventListener('user-storage-ready', refresh)
    return () => {
      window.removeEventListener(EXPERIMENTS_CHANGED, refresh)
      window.removeEventListener('user-storage-ready', refresh)
    }
  }, [surface, date])

  if (experiments.length === 0) return null

  const refresh = () => setExperiments(experimentsNeedingDailyLogStep(surface, date))

  const setAdherence = (experiment: Experiment, followed: boolean) => {
    const next = setExperimentAdherence(experiment, date, followed)
    upsertExperiment(next)
    refresh()
  }

  const toggleConfounder = (experiment: Experiment, confounderId: string, present: boolean) => {
    const next = setExperimentConfounderTick(experiment, date, confounderId, present)
    upsertExperiment(next)
    refresh()
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
        const scheduleDay = todayArm(experiment, date)
        const needsAdherence = experimentNeedsAdherencePrompt(experiment, date)
        const showConfounders =
          experiment.confounders.length > 0 &&
          experiment.confounder_log_surfaces.includes(surface)
        const ticks = getConfounderTicksForDate(experiment, date)

        return (
          <div
            key={experiment.id}
            className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3"
          >
            <p className="text-xs font-medium text-zinc-200">
              {experimentDisplayTitle(experiment)}
            </p>
            {scheduleDay ? (
              <p className="mt-0.5 text-[10px] text-zinc-500">
                Today · Arm {scheduleDay.arm} · {armLabel(scheduleDay.arm, experiment)}
              </p>
            ) : null}

            {needsAdherence ? (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] text-zinc-400">
                  Did you complete today&apos;s experiment day?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAdherence(experiment, true)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-950/30 px-2.5 py-2 text-xs font-medium text-emerald-200 transition-colors hover:border-emerald-500/50"
                  >
                    <Check size={12} strokeWidth={3} />
                    Yes, completed
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdherence(experiment, false)}
                    className="inline-flex flex-1 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950/60 px-2.5 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
                  >
                    No / skipped
                  </button>
                </div>
              </div>
            ) : null}

            {showConfounders ? (
              <div className={cn(needsAdherence ? 'mt-4 border-t border-zinc-800/80 pt-3' : 'mt-3')}>
                <p className="text-[10px] text-zinc-600">
                  Tick confounders that applied today
                </p>
                <ul className="mt-2 space-y-1.5">
                  {experiment.confounders.map((confounder) => {
                    const on = Boolean(ticks[confounder.id])
                    return (
                      <li key={confounder.id}>
                        <button
                          type="button"
                          onClick={() => toggleConfounder(experiment, confounder.id, !on)}
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
            ) : null}
          </div>
        )
      })}
    </section>
  )
}
