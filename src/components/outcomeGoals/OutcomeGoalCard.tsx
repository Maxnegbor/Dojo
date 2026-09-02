import { Check, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OutcomeGoalProgress } from '@/lib/outcomeGoals'
import { formatDeadlineLabel, formatOutcomeGoalRecurrence } from '@/lib/outcomeGoals'

interface OutcomeGoalCardProps {
  progress: OutcomeGoalProgress
  onOpen: () => void
  onDelete: () => void
}

export function OutcomeGoalCard({ progress, onOpen, onDelete }: OutcomeGoalCardProps) {
  const { goal, outcomes, onTrack } = progress
  const deadlineLabel = formatDeadlineLabel(goal.deadline)
  const recurrenceLabel = formatOutcomeGoalRecurrence(goal)
  const metrics = outcomes

  return (
    <article
      className={cn(
        'flex h-full flex-col rounded-xl border border-zinc-800/80 bg-zinc-900 p-4',
        'transition-colors hover:border-zinc-700',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">{goal.title}</h3>
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
            {metrics.length === 0
              ? 'No metrics linked'
              : `${metrics.length} metric${metrics.length === 1 ? '' : 's'}`}
            {deadlineLabel ? ` · by ${deadlineLabel}` : ''}
            {` · ${recurrenceLabel}`}
          </p>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${goal.title}`}
          className="rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {metrics.length > 0 && (
        <button
          type="button"
          onClick={onOpen}
          className="mt-3 w-full flex-1 space-y-2 border-t border-zinc-800/80 pt-3 text-left"
        >
          <ul className="space-y-2">
            {metrics.map((entry) => (
              <li key={entry.link.id} className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-zinc-300">
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                      entry.onPace
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-zinc-800 text-zinc-600',
                    )}
                  >
                    <Check size={10} strokeWidth={3} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {entry.label}
                    <span className="text-zinc-500">
                      {' '}
                      · {entry.display.replace(/ \(.*\)$/, '')}
                    </span>
                  </span>
                </div>
                <div className="ml-6 h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      entry.onPace ? 'bg-emerald-500' : 'bg-[var(--accent-500)]',
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, entry.percent))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </button>
      )}
    </article>
  )
}
