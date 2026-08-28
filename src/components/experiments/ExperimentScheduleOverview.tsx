import { useState } from 'react'
import { Check } from 'lucide-react'
import { armLabel, getAdherenceForDate, getConfounderTicksForDate } from '@/lib/experiments'
import { cn, formatDate } from '@/lib/utils'
import type { Experiment } from '@/types'

interface ExperimentScheduleOverviewProps {
  experiment: Experiment
  /** Highlight and scroll target for today. */
  today?: string
  /** Allow toggling completion from the schedule. */
  onToggleAdherence?: (date: string) => void
  /** Toggle a confounder tick for a schedule day. */
  onToggleConfounder?: (date: string, confounderId: string, present: boolean) => void
  className?: string
  listClassName?: string
}

export function ExperimentScheduleOverview({
  experiment,
  today = formatDate(new Date()),
  onToggleAdherence,
  onToggleConfounder,
  className,
  listClassName,
}: ExperimentScheduleOverviewProps) {
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const canEditConfounders =
    experiment.confounders.length > 0 && Boolean(onToggleConfounder)

  const handleRowClick = (date: string) => {
    if (!canEditConfounders) return
    setEditingDate((prev) => (prev === date ? null : date))
  }

  return (
    <section className={cn('min-h-0', className)}>
      <div className="mb-2 shrink-0 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Schedule
          </h3>
          {canEditConfounders ? (
            <p className="mt-0.5 text-[10px] text-zinc-600">Click a day to edit confounders</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-zinc-600">
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <Check size={9} strokeWidth={3} />
            </span>
            Completed
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-950/60 text-red-400/80">
              <Check size={9} strokeWidth={3} />
            </span>
            Skipped
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500/70" />
            Confounder
          </span>
        </div>
      </div>
      <ul
        className={cn(
          'scrollbar-hidden min-h-0 space-y-1.5 overflow-y-auto overscroll-contain rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-2',
          listClassName,
        )}
      >
        {experiment.schedule.map((day) => {
          const isToday = day.date === today
          const adherence = getAdherenceForDate(experiment, day.date)
          const followed = adherence === true
          const skipped = adherence === false
          const dayTicks = getConfounderTicksForDate(experiment, day.date)
          const tickedConfounders = experiment.confounders.filter((c) => dayTicks[c.id])
          const isEditing = editingDate === day.date

          return (
            <li
              key={day.date}
              className={cn(
                'rounded-lg border transition-colors',
                isToday
                  ? 'border-[var(--accent-500)]/40 bg-[var(--accent-950)]/35'
                  : isEditing
                    ? 'border-amber-500/35 bg-amber-950/10'
                    : 'border-zinc-800/70 bg-zinc-900/50',
              )}
            >
              <div
                role={canEditConfounders ? 'button' : undefined}
                tabIndex={canEditConfounders ? 0 : undefined}
                onClick={() => handleRowClick(day.date)}
                onKeyDown={(e) => {
                  if (!canEditConfounders) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleRowClick(day.date)
                  }
                }}
                className={cn(
                  'flex items-start gap-3 px-3 py-2.5',
                  canEditConfounders && 'cursor-pointer hover:bg-zinc-900/80',
                )}
              >
                <div className="w-[4.5rem] shrink-0 pt-0.5">
                  <p
                    className={cn(
                      'text-sm font-medium tabular-nums',
                      isToday ? 'text-[var(--accent-200)]' : 'text-zinc-300',
                    )}
                  >
                    {day.date.slice(5)}
                  </p>
                  {isToday ? (
                    <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--accent-400)]">
                      Today
                    </p>
                  ) : null}
                </div>
                <div
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold',
                    day.arm === 'A'
                      ? 'bg-[var(--accent-950)] text-[var(--accent-300)] ring-1 ring-[var(--accent-500)]/30'
                      : 'bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700/80',
                  )}
                >
                  {day.arm}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200">{armLabel(day.arm, experiment)}</p>
                  {tickedConfounders.length > 0 ? (
                    <ul className="mt-1.5 flex flex-wrap gap-1">
                      {tickedConfounders.map((confounder) => (
                        <li
                          key={confounder.id}
                          className="rounded-md border border-amber-500/30 bg-amber-950/30 px-1.5 py-0.5 text-[10px] text-amber-200/90"
                        >
                          {confounder.label}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-0.5 text-[10px] text-zinc-600">
                      {canEditConfounders ? 'Tap to log confounders' : 'No confounders logged'}
                    </p>
                  )}
                </div>
                {onToggleAdherence ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleAdherence(day.date)
                    }}
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                      followed
                        ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                        : skipped
                          ? 'bg-red-950/40 text-red-400/80 ring-1 ring-red-500/20'
                          : 'bg-zinc-800 text-zinc-600 hover:bg-zinc-700 hover:text-zinc-400',
                    )}
                    aria-label={
                      followed
                        ? 'Mark skipped'
                        : skipped
                          ? 'Clear status'
                          : 'Mark completed'
                    }
                    title={
                      followed
                        ? 'Completed — click for skipped'
                        : skipped
                          ? 'Skipped — click to clear'
                          : 'Not set — click to mark completed'
                    }
                  >
                    <Check size={14} strokeWidth={3} />
                  </button>
                ) : (
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      followed
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : skipped
                          ? 'bg-red-950/40 text-red-400/70'
                          : 'bg-zinc-800/80 text-zinc-700',
                    )}
                    aria-hidden
                  >
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
              </div>

              {isEditing && canEditConfounders ? (
                <div className="border-t border-zinc-800/80 px-3 py-2.5">
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Confounders · {day.date}
                  </p>
                  <ul className="space-y-1.5">
                    {experiment.confounders.map((confounder) => {
                      const on = Boolean(dayTicks[confounder.id])
                      return (
                        <li key={confounder.id}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onToggleConfounder?.(day.date, confounder.id, !on)
                            }}
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
                                on
                                  ? 'bg-amber-500/30 text-amber-300'
                                  : 'bg-zinc-800 text-zinc-600',
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
            </li>
          )
        })}
      </ul>
    </section>
  )
}
