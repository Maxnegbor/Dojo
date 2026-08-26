import {
  armLabel,
  experimentDisplayTitle,
  formatProtocolShort,
  todayArm,
} from '@/lib/experiments'
import { cn, formatDate } from '@/lib/utils'
import type { Experiment } from '@/types'
import { Trash2 } from 'lucide-react'

interface ExperimentCardProps {
  experiment: Experiment
  onOpen: () => void
  onDelete: () => void
}

export function ExperimentCard({ experiment, onOpen, onDelete }: ExperimentCardProps) {
  const today = formatDate(new Date())
  const arm = todayArm(experiment, today)
  const statusLabel =
    experiment.status === 'running'
      ? 'Running'
      : experiment.status === 'completed'
        ? 'Done'
        : 'Draft'

  return (
    <article
      className={cn(
        'h-full rounded-xl border border-zinc-800/80 bg-zinc-900 p-4',
        'transition-colors hover:border-zinc-700',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">
              {experimentDisplayTitle(experiment)}
            </h3>
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
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
            {formatProtocolShort(experiment.protocol)} · {experiment.schedule.length} days
            {arm
              ? ` · Today: ${arm.arm} (${armLabel(arm.arm, experiment)})`
              : ''}
          </p>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete experiment`}
          className="rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  )
}
