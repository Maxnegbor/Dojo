import { useEffect, useMemo, useState } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  armLabel,
  computeExperimentResults,
  experimentDisplayTitle,
  experimentQuestionLabel,
  formatProtocolShort,
  getConfounderTicksForDate,
  setExperimentAdherence,
  todayArm,
  upsertExperiment,
} from '@/lib/experiments'
import { metricLabel } from '@/lib/goals'
import { formatMetricAmount } from '@/lib/timedMetrics'
import { cn, formatDate } from '@/lib/utils'
import type { DailyLog, Experiment, Goal, Workout } from '@/types'

interface ExperimentDetailModalProps {
  experiment: Experiment
  logs: DailyLog[]
  workouts: Workout[]
  hybridGoals: Goal[]
  onChange: (experiment: Experiment) => void
  onDelete: () => void
  onClose: () => void
}

function formatMean(
  value: number | null,
  unit: string,
  metricKey: string,
): string {
  if (value == null) return '—'
  return formatMetricAmount(value, unit, metricKey)
}

export function ExperimentDetailModal({
  experiment,
  logs,
  workouts,
  hybridGoals,
  onChange,
  onDelete,
  onClose,
}: ExperimentDetailModalProps) {
  const today = formatDate(new Date())
  const armToday = todayArm(experiment, today)
  const primaryGoal = hybridGoals.find((g) => g.metric_key === experiment.primary_metric_key)
  const primaryUnit = primaryGoal?.unit ?? 'score'
  const primaryName =
    primaryGoal?.name || metricLabel(experiment.primary_metric_key)

  const [controlIds, setControlIds] = useState<string[]>([])
  const [titleDraft, setTitleDraft] = useState(() => experimentDisplayTitle(experiment))

  useEffect(() => {
    setTitleDraft(experimentDisplayTitle(experiment))
  }, [experiment.id, experiment.title, experiment.cause, experiment.effect])

  const saveTitle = () => {
    const nextTitle = titleDraft.trim() || experimentQuestionLabel(experiment)
    if (nextTitle === experiment.title) return
    const saved = upsertExperiment({
      ...experiment,
      title: nextTitle,
      updated_at: new Date().toISOString(),
    })
    onChange(saved)
  }

  const results = useMemo(
    () => computeExperimentResults(experiment, logs, workouts, experiment.primary_metric_key, controlIds),
    [experiment, logs, workouts, controlIds],
  )

  const adherenceMap = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const entry of experiment.adherence) map.set(entry.date, entry.followed)
    return map
  }, [experiment.adherence])

  const toggleAdherence = (date: string) => {
    const current = adherenceMap.get(date)
    const next = setExperimentAdherence(experiment, date, !(current === true))
    const saved = upsertExperiment(next)
    onChange(saved)
  }

  const markComplete = () => {
    const saved = upsertExperiment({
      ...experiment,
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    onChange(saved)
  }

  const statusLabel =
    experiment.status === 'running'
      ? 'Running'
      : experiment.status === 'completed'
        ? 'Completed'
        : 'Draft'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="experiment-detail-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800/80 px-5 py-4">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <input
                id="experiment-detail-title"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-0 py-0.5 text-base font-semibold text-zinc-100 outline-none transition-colors hover:border-zinc-700 focus:border-zinc-600 focus:bg-zinc-900/80 focus:px-2"
                aria-label="Experiment title"
              />
              <span
                className={cn(
                  'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                  experiment.status === 'running'
                    ? 'bg-[var(--accent-950)] text-[var(--accent-300)]'
                    : experiment.status === 'completed'
                      ? 'bg-emerald-950/80 text-emerald-300'
                      : 'bg-zinc-800 text-zinc-400',
                )}
              >
                {statusLabel}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {formatProtocolShort(experiment.protocol)} · {experiment.schedule.length} days ·{' '}
              {primaryName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="scrollbar-hidden min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {armToday ? (
            <section className="rounded-xl border border-[var(--accent-500)]/35 bg-[var(--accent-950)]/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-300)]">
                Today · Arm {armToday.arm}
              </p>
              <p className="mt-1 text-sm text-zinc-100">
                {armLabel(armToday.arm, experiment)}
              </p>
              <button
                type="button"
                onClick={() => toggleAdherence(today)}
                className={cn(
                  'mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                  adherenceMap.get(today)
                    ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600',
                )}
              >
                <Check size={12} strokeWidth={3} />
                {adherenceMap.get(today) ? 'Followed' : 'Mark followed'}
              </button>
            </section>
          ) : null}

          <section className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-[var(--accent-400)]">
                A · Intervention
              </p>
              <p className="mt-1 text-zinc-200">{experiment.intervention}</p>
            </div>
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">B · Control</p>
              <p className="mt-1 text-zinc-200">{experiment.control}</p>
            </div>
          </section>

          {experiment.confounders.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Control for confounders
              </h3>
              <p className="text-[11px] text-zinc-600">
                Exclude days where these were ticked from the results below.
              </p>
              <ul className="space-y-1">
                {experiment.confounders.map((item) => {
                  const on = controlIds.includes(item.id)
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setControlIds((prev) =>
                            on ? prev.filter((id) => id !== item.id) : [...prev, item.id],
                          )
                        }
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors',
                          on
                            ? 'border-amber-500/40 bg-amber-950/30 text-amber-100'
                            : 'border-zinc-800 bg-zinc-900/40 text-zinc-400',
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
                        {item.label}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Schedule
            </h3>
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {experiment.schedule.map((day) => {
                const isToday = day.date === today
                const followed = adherenceMap.get(day.date)
                const dayTicks = getConfounderTicksForDate(experiment, day.date)
                const tickLabels = experiment.confounders
                  .filter((c) => dayTicks[c.id])
                  .map((c) => c.label)
                return (
                  <li
                    key={day.date}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
                      isToday
                        ? 'border-[var(--accent-500)]/35 bg-[var(--accent-950)]/40'
                        : 'border-zinc-800/70 bg-zinc-900/40',
                    )}
                  >
                    <span className="w-16 shrink-0 tabular-nums text-zinc-400">
                      {day.date.slice(5)}
                    </span>
                    <span
                      className={cn(
                        'w-5 shrink-0 font-semibold',
                        day.arm === 'A' ? 'text-[var(--accent-300)]' : 'text-zinc-400',
                      )}
                    >
                      {day.arm}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-zinc-500">
                      {armLabel(day.arm, experiment)}
                      {tickLabels.length > 0 ? (
                        <span className="text-amber-500/80"> · {tickLabels.join(', ')}</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleAdherence(day.date)}
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                        followed
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-zinc-800 text-zinc-600',
                      )}
                      aria-label={followed ? 'Clear adherence' : 'Mark followed'}
                    >
                      <Check size={10} strokeWidth={3} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Results · {primaryName}
            </h3>
            {results.ready ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-[10px] uppercase text-[var(--accent-400)]">
                      A mean (n={results.armA.n})
                    </p>
                    <p className="font-semibold tabular-nums text-zinc-100">
                      {formatMean(results.armA.mean, primaryUnit, experiment.primary_metric_key)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-zinc-500">
                      B mean (n={results.armB.n})
                    </p>
                    <p className="font-semibold tabular-nums text-zinc-100">
                      {formatMean(results.armB.mean, primaryUnit, experiment.primary_metric_key)}
                    </p>
                  </div>
                </div>
                {results.delta != null && (
                  <p className="text-xs text-zinc-400">
                    Δ A−B ={' '}
                    <span className="tabular-nums text-zinc-200">
                      {formatMean(results.delta, primaryUnit, experiment.primary_metric_key)}
                    </span>
                  </p>
                )}
                {results.excludedDays > 0 && (
                  <p className="text-[10px] text-amber-500/80">
                    Excluded {results.excludedDays} day
                    {results.excludedDays === 1 ? '' : 's'} with controlled confounders
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                Log your primary metric on both intervention and control days to see a
                comparison.
                {results.excludedDays > 0
                  ? ` (${results.excludedDays} day${results.excludedDays === 1 ? '' : 's'} excluded)`
                  : ''}
              </p>
            )}
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-800/80 px-5 py-3">
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-2 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-red-400"
            aria-label="Delete experiment"
          >
            <Trash2 size={15} />
          </button>
          <div className="flex gap-2">
            {experiment.status === 'running' && (
              <Button type="button" variant="secondary" size="sm" onClick={markComplete}>
                Mark complete
              </Button>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
