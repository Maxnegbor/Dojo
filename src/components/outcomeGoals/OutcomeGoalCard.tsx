import { Check, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OutcomeGoalProgress } from '@/lib/outcomeGoals'
import { formatDeadlineLabel } from '@/lib/outcomeGoals'

interface OutcomeGoalCardProps {
  progress: OutcomeGoalProgress
  onEdit: () => void
  onDelete: () => void
}

export function OutcomeGoalCard({ progress, onEdit, onDelete }: OutcomeGoalCardProps) {
  const { goal, primary, processes, onTrack } = progress
  const deadlineLabel = formatDeadlineLabel(goal.deadline)

  return (
    <article
      className={cn(
        'h-full rounded-xl border border-zinc-800/80 bg-zinc-900 p-4',
        'transition-colors hover:border-zinc-700',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
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
          {primary && (
            <p className="mt-1.5 text-lg font-semibold tabular-nums text-zinc-100">
              {primary.display.replace(/ \(.*\)$/, '')}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {primary ? primary.label : 'No metrics linked'}
            {deadlineLabel ? ` · by ${deadlineLabel}` : ''}
            {` · Review ${goal.review}`}
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

      {processes.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-zinc-800/80 pt-3">
          <li className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">
            This {goal.review === 'monthly' ? 'month' : 'week'}
          </li>
          {processes.map((entry) => (
            <li
              key={entry.link.id}
              className="flex items-center gap-2 text-xs text-zinc-300"
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                  entry.hit
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-zinc-800 text-zinc-600',
                )}
              >
                <Check size={10} strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {entry.label}
                <span className="text-zinc-500"> · {entry.display.replace(/ \(.*\)$/, '')}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
