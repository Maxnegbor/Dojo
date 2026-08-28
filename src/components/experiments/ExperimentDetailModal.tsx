import { useEffect, useMemo, useState } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ExperimentScheduleOverview } from '@/components/experiments/ExperimentScheduleOverview'
import {
  armLabel,
  computeExperimentResults,
  cycleExperimentAdherence,
  deleteExperimentConfounder,
  experimentDisplayTitle,
  experimentQuestionLabel,
  formatProtocolShort,
  metricAssociatesPriorDay,
  setExperimentConfounderTick,
  todayArm,
  updateExperimentConfounder,
  upsertExperiment,
} from '@/lib/experiments'
import { metricLabel } from '@/lib/goals'
import { formatMetricAmount } from '@/lib/timedMetrics'
import { cn, formatDate } from '@/lib/utils'
import type { DailyLog, Experiment, Goal, MetricKey, Workout } from '@/types'

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

  const primaryUsesPriorDay = metricAssociatesPriorDay(experiment, experiment.primary_metric_key)

  const togglePrimaryPriorDay = () => {
    const key = experiment.primary_metric_key
    const next = primaryUsesPriorDay
      ? experiment.metric_associate_prior_day.filter((k) => k !== key)
      : [...experiment.metric_associate_prior_day, key]
    const saved = upsertExperiment({
      ...experiment,
      metric_associate_prior_day: next,
      updated_at: new Date().toISOString(),
    })
    onChange(saved)
  }

  const toggleSecondaryPriorDay = (key: MetricKey) => {
    const usesPriorDay = metricAssociatesPriorDay(experiment, key)
    const next = usesPriorDay
      ? experiment.metric_associate_prior_day.filter((k) => k !== key)
      : [...experiment.metric_associate_prior_day, key]
    const saved = upsertExperiment({
      ...experiment,
      metric_associate_prior_day: next,
      updated_at: new Date().toISOString(),
    })
    onChange(saved)
  }

  const cycleAdherence = (date: string) => {
    const saved = upsertExperiment(cycleExperimentAdherence(experiment, date))
    onChange(saved)
  }

  const saveConfounderLabel = (confounderId: string, label: string) => {
    const saved = upsertExperiment(updateExperimentConfounder(experiment, confounderId, label))
    onChange(saved)
  }

  const removeConfounder = (confounderId: string) => {
    const saved = upsertExperiment(deleteExperimentConfounder(experiment, confounderId))
    setControlIds((prev) => prev.filter((id) => id !== confounderId))
    onChange(saved)
  }

  const toggleConfounderTick = (date: string, confounderId: string, present: boolean) => {
    const saved = upsertExperiment(
      setExperimentConfounderTick(experiment, date, confounderId, present),
    )
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

  const reopenExperiment = () => {
    const saved = upsertExperiment({
      ...experiment,
      status: 'running',
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
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800/80 px-6 py-4">
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

        <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex min-h-[32rem] flex-1 flex-col gap-6 px-6 py-5 lg:min-h-0 lg:flex-row lg:items-stretch lg:overflow-hidden">
            <div className="scrollbar-hidden min-h-0 min-w-0 space-y-5 overflow-y-auto lg:w-[38%] lg:shrink-0 lg:pr-2">
              {armToday ? (
                <section className="rounded-xl border border-[var(--accent-500)]/35 bg-[var(--accent-950)]/30 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-300)]">
                    Today · Arm {armToday.arm}
                  </p>
                  <p className="mt-1 text-sm text-zinc-100">
                    {armLabel(armToday.arm, experiment)}
                  </p>
                </section>
              ) : null}

              <section className="grid grid-cols-2 gap-3 text-xs">
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
                Confounders
              </h3>
              <p className="text-[11px] text-zinc-600">
                Edit names, delete, or toggle to exclude ticked days from results.
              </p>
              <ul className="space-y-1.5">
                {experiment.confounders.map((item) => {
                  const excludeFromResults = controlIds.includes(item.id)
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 p-1.5"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setControlIds((prev) =>
                            excludeFromResults
                              ? prev.filter((id) => id !== item.id)
                              : [...prev, item.id],
                          )
                        }
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
                          excludeFromResults
                            ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30'
                            : 'bg-zinc-800 text-zinc-600 hover:text-zinc-400',
                        )}
                        title={
                          excludeFromResults
                            ? 'Excluding from results'
                            : 'Exclude from results when ticked'
                        }
                        aria-label={
                          excludeFromResults
                            ? 'Stop excluding from results'
                            : 'Exclude from results when ticked'
                        }
                      >
                        <Check size={12} strokeWidth={3} />
                      </button>
                      <input
                        defaultValue={item.label}
                        key={`${item.id}:${item.label}`}
                        onBlur={(e) => {
                          const next = e.target.value.trim()
                          if (next && next !== item.label) saveConfounderLabel(item.id, next)
                          else e.target.value = item.label
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-zinc-200 outline-none transition-colors hover:border-zinc-700 focus:border-zinc-600 focus:bg-zinc-950"
                        aria-label="Confounder name"
                      />
                      <button
                        type="button"
                        onClick={() => removeConfounder(item.id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-red-400"
                        aria-label={`Delete ${item.label}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {experiment.secondary_metric_keys.length > 0 && (
            <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Secondary outcome timing
              </h3>
              <ul className="space-y-2">
                {experiment.secondary_metric_keys.map((key) => {
                  const name =
                    hybridGoals.find((g) => g.metric_key === key)?.name || metricLabel(key)
                  return (
                    <li key={key}>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
                        <input
                          type="checkbox"
                          checked={metricAssociatesPriorDay(experiment, key)}
                          onChange={() => toggleSecondaryPriorDay(key)}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-600 bg-zinc-900 accent-[var(--accent-500)]"
                        />
                        <span className="min-w-0 text-[11px] leading-snug text-zinc-500">
                          Credit <span className="text-zinc-300">{name}</span> to the prior
                          day&apos;s arm
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
            </div>

            <ExperimentScheduleOverview
              experiment={experiment}
              today={today}
              onToggleAdherence={cycleAdherence}
              onToggleConfounder={toggleConfounderTick}
              className="flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-hidden"
              listClassName="min-h-[24rem] flex-1 overflow-y-auto lg:min-h-0"
            />
          </div>

          <section className="shrink-0 border-t border-zinc-800/80 px-6 py-5">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Results · {primaryName}
              </h3>
              <label className="mb-4 flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={primaryUsesPriorDay}
                  onChange={togglePrimaryPriorDay}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-600 bg-zinc-900 accent-[var(--accent-500)]"
                />
                <span className="min-w-0 text-[11px] leading-snug text-zinc-500">
                  Credit logged values to the <span className="text-zinc-300">prior day&apos;s</span>{' '}
                  arm (for morning-after metrics like sleep, RHR, or recovery).
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[var(--accent-500)]/25 bg-[var(--accent-950)]/25 px-3 py-2.5">
                  <p className="text-[10px] uppercase text-[var(--accent-400)]">
                    A mean (n={results.armA.n})
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
                    {formatMean(results.armA.mean, primaryUnit, experiment.primary_metric_key)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-500">{experiment.intervention}</p>
                </div>
                <div className="rounded-lg border border-zinc-700/80 bg-zinc-950/40 px-3 py-2.5">
                  <p className="text-[10px] uppercase text-zinc-500">
                    B mean (n={results.armB.n})
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
                    {formatMean(results.armB.mean, primaryUnit, experiment.primary_metric_key)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-500">{experiment.control}</p>
                </div>
                <div className="col-span-2 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2.5 sm:col-span-1">
                  <p className="text-[10px] uppercase text-zinc-500">Δ A−B</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
                    {results.delta != null
                      ? formatMean(results.delta, primaryUnit, experiment.primary_metric_key)
                      : '—'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-500">
                    {results.ready ? 'Primary comparison' : 'Need data on both arms'}
                  </p>
                </div>
              </div>
              {!results.ready ? (
                <p className="mt-3 text-xs text-zinc-500">
                  Mark days completed and log your primary metric on both intervention and control
                  days to compare arms.
                </p>
              ) : null}
              {(results.excludedConfounderDays > 0 || results.excludedUnconfirmedDays > 0) && (
                <div className="mt-3 space-y-1">
                  {results.excludedConfounderDays > 0 && (
                    <p className="text-[10px] text-amber-500/80">
                      Excluded {results.excludedConfounderDays} day
                      {results.excludedConfounderDays === 1 ? '' : 's'} with controlled
                      confounders
                    </p>
                  )}
                  {results.excludedUnconfirmedDays > 0 && (
                    <p className="text-[10px] text-zinc-500">
                      Excluded {results.excludedUnconfirmedDays} day
                      {results.excludedUnconfirmedDays === 1 ? '' : 's'} not marked completed
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-800/80 px-6 py-3">
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
            {experiment.status === 'completed' && (
              <Button type="button" variant="secondary" size="sm" onClick={reopenExperiment}>
                Undo
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
