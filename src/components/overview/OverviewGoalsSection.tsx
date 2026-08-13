import { Link } from 'react-router-dom'
import { Check, Flag } from 'lucide-react'
import type { OutcomeGoalProgress } from '@/lib/outcomeGoals'
import { cn } from '@/lib/utils'

interface OverviewGoalsSectionProps {
  progressList: OutcomeGoalProgress[]
}

export function OverviewGoalsSection({ progressList }: OverviewGoalsSectionProps) {
  if (progressList.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-5 text-center">
        <p className="text-sm text-zinc-400">No goals yet</p>
        <p className="mt-1 text-xs text-zinc-600">
          Define outcomes on the{' '}
          <Link to="/goals" className="text-[var(--accent-300)] hover:underline">
            Goals
          </Link>{' '}
          page — Metrics stay for measurement only.
        </p>
      </div>
    )
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          <Flag size={12} />
          Goals
        </h3>
        <Link
          to="/goals"
          className="text-[11px] text-zinc-500 transition-colors hover:text-[var(--accent-300)]"
        >
          Manage
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {progressList.map(({ goal, primary, processes, onTrack }) => (
          <Link
            key={goal.id}
            to="/goals"
            className={cn(
              'rounded-xl border border-zinc-800/80 bg-zinc-900 p-3',
              'transition-colors hover:border-zinc-700 hover:bg-zinc-800/80',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-zinc-100">{goal.title}</p>
              <span
                className={cn(
                  'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                  onTrack
                    ? 'bg-emerald-950/80 text-emerald-300'
                    : 'bg-zinc-800 text-zinc-500',
                )}
              >
                {onTrack ? 'On track' : 'Off track'}
              </span>
            </div>
            {primary && (
              <p className="mt-1 text-base font-semibold tabular-nums text-zinc-200">
                {primary.display.replace(/ \(.*\)$/, '')}
              </p>
            )}
            {processes.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {processes.slice(0, 3).map((entry) => (
                  <li
                    key={entry.link.id}
                    className="flex items-center gap-1.5 text-[11px] text-zinc-400"
                  >
                    <Check
                      size={11}
                      className={entry.hit ? 'text-emerald-400' : 'text-zinc-600'}
                    />
                    <span className="truncate">
                      {entry.label}
                      <span className="text-zinc-600">
                        {' '}
                        · {entry.display.replace(/ \(.*\)$/, '')}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}
