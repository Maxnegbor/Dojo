import { cn } from '@/lib/utils'

interface GoalPaceBarProps {
  percent: number
  size?: 'sm' | 'md'
  className?: string
}

/** Thin bar showing how far through the goal's time window you are (pace vs. end date). */
export function GoalPaceBar({ percent, size = 'md', className }: GoalPaceBarProps) {
  const clamped = Math.min(100, Math.max(0, percent))

  return (
    <div
      className={cn(
        'overflow-hidden rounded-full bg-zinc-800/50',
        size === 'sm' ? 'mt-1 h-0.5' : 'mt-1.5 h-1',
        className,
      )}
      title={`${Math.round(clamped)}% of goal period elapsed`}
      aria-hidden
    >
      <div
        className="h-full rounded-full bg-indigo-500/45 transition-all duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
