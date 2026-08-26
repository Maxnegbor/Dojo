import { useMemo } from 'react'
import { Check, Pencil, Target, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  computeOutcomeGoalDetailStats,
  formatDeadlineLabel,
  formatOutcomeGoalRecurrence,
  type OutcomeGoalProgress,
} from '@/lib/outcomeGoals'
import { formatMetricAmount } from '@/lib/timedMetrics'
import type { DailyLog, Goal, Workout } from '@/types'
import { cn, formatDate } from '@/lib/utils'

interface OutcomeGoalDetailModalProps {
  progress: OutcomeGoalProgress
  logs: DailyLog[]
  workouts: Workout[]
  hybridGoals: Goal[]
  weekStartsOn: 0 | 1
  onEdit: () => void
  onClose: () => void
}

export function OutcomeGoalDetailModal({
  progress,
  logs,
  workouts,
  hybridGoals,
  weekStartsOn,
  onEdit,
  onClose,
}: OutcomeGoalDetailModalProps) {
  const { goal, outcomes, onTrack, assessedAt } = progress
  const today = formatDate(new Date())

  const stats = useMemo(
    () =>
      computeOutcomeGoalDetailStats(
        goal,
        logs,
        workouts,
        hybridGoals,
        new Date(`${today}T12:00:00`),
        weekStartsOn,
        12,
      ),
    [goal, logs, workouts, hybridGoals, today, weekStartsOn],
  )

  const deadlineLabel = formatDeadlineLabel(goal.deadline)
  const recurrenceLabel = formatOutcomeGoalRecurrence(goal)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="outcome-goal-detail-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800/80 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="outcome-goal-detail-title"
                className="text-base font-semibold text-zinc-100"
              >
                {goal.title}
              </h2>
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                  onTrack
                    ? 'bg-emerald-950/80 text-emerald-300'
                    : 'bg-zinc-800 text-zinc-400',
                )}
              >
                {onTrack ? 'On track' : 'Off track'}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {recurrenceLabel}
              {deadlineLabel ? ` · by ${deadlineLabel}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              aria-label={`Edit ${goal.title}`}
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="scrollbar-hidden min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* This period */}
          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              This {goal.recurrence === 'daily' ? 'day' : 'period'}
            </h3>
            {outcomes.length === 0 ? (
              <p className="text-sm text-zinc-500">No metrics linked yet.</p>
            ) : (
              <ul className="space-y-2">
                {outcomes.map((entry) => (
                  <li
                    key={entry.link.id}
                    className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                            entry.onPace
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-zinc-800 text-zinc-600',
                          )}
                        >
                          <Check size={11} strokeWidth={3} />
                        </span>
                        <span className="truncate text-sm font-medium text-zinc-100">
                          {entry.label}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                        {entry.display.replace(/ \(.*\)$/, '')}
                      </span>
                    </div>
                    {entry.start != null ? (
                      <p className="mt-1 text-[10px] text-zinc-500">
                        From {formatMetricAmount(entry.start, entry.unit, entry.link.metric_key)}
                      </p>
                    ) : null}
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width]',
                          entry.onPace ? 'bg-emerald-500' : 'bg-[var(--accent-500)]',
                        )}
                        style={{ width: `${Math.min(100, Math.max(0, entry.percent))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Stats strip */}
          <section className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Hit rate</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-100">
                {stats.periodCount > 0 ? `${stats.hitRate}%` : '—'}
              </p>
              <p className="text-[10px] text-zinc-600">
                {stats.periodCount > 0
                  ? `${stats.hitCount}/${stats.periodCount} periods`
                  : 'No past periods'}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Streak</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-100">
                {stats.currentStreak}
              </p>
              <p className="text-[10px] text-zinc-600">in a row</p>
            </div>
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Cadence</p>
              <p className="mt-0.5 text-sm font-semibold leading-tight text-zinc-100">
                {recurrenceLabel}
              </p>
              <p className="text-[10px] text-zinc-600">review cycle</p>
            </div>
          </section>

          {/* Deadline progress */}
          {stats.deadline ? (
            <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Target size={14} className="text-[var(--accent-400)]" />
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Start → deadline
                </h3>
              </div>
              <div className="flex items-end justify-between gap-2 text-xs">
                <span className="tabular-nums text-zinc-400">
                  {formatDeadlineLabel(stats.deadline.start)}
                </span>
                <span className="text-[11px] font-medium tabular-nums text-zinc-200">
                  {Math.round(stats.deadline.elapsedPercent)}% ·{' '}
                  {stats.deadline.remainingDays === 0
                    ? 'ended'
                    : `${stats.deadline.remainingDays}d left`}
                </span>
                <span className="tabular-nums text-zinc-400">
                  {formatDeadlineLabel(stats.deadline.end)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-[var(--accent-500)]"
                  style={{ width: `${stats.deadline.elapsedPercent}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-zinc-600">
                Day {stats.deadline.elapsedDays} of {stats.deadline.totalDays}
                {assessedAt
                  ? ` · pace as of ${formatDeadlineLabel(assessedAt) ?? assessedAt}`
                  : ''}
              </p>
            </section>
          ) : null}

          {/* Recurrence history */}
          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              History
            </h3>
            <ul className="space-y-1.5">
              {stats.periods.map((period) => (
                <li
                  key={`${period.start}-${period.end}`}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border px-2.5 py-2',
                    period.isCurrent
                      ? 'border-[var(--accent-500)]/35 bg-[var(--accent-950)]/40'
                      : 'border-zinc-800/70 bg-zinc-900/40',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                      period.metricCount === 0
                        ? 'bg-zinc-800 text-zinc-600'
                        : period.onTrack
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-zinc-800 text-zinc-500',
                    )}
                  >
                    <Check size={11} strokeWidth={3} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-zinc-200">
                      {period.label}
                      {period.isCurrent ? (
                        <span className="ml-1.5 text-[10px] font-normal text-[var(--accent-300)]">
                          now
                        </span>
                      ) : null}
                    </p>
                    {period.metricCount > 0 ? (
                      <p className="truncate text-[10px] text-zinc-500">
                        {period.outcomes
                          .map((entry) => `${entry.label} ${entry.display.replace(/ \(.*\)$/, '')}`)
                          .join(' · ')}
                      </p>
                    ) : (
                      <p className="text-[10px] text-zinc-600">No metrics</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                    {period.metricCount > 0
                      ? `${period.hitCount}/${period.metricCount}`
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="shrink-0 border-t border-zinc-800/80 px-5 py-3">
          <Button type="button" variant="secondary" className="w-full" onClick={onClose}>
            Close
          </Button>
        </footer>
      </div>
    </div>
  )
}
