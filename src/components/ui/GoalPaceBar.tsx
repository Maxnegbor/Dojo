import { cn } from '@/lib/utils'

interface GoalPaceBarProps {
  percent: number
  size?: 'sm' | 'md'
  className?: string
  /** Show a caption under the bar. Defaults to true. */
  showLegend?: boolean
}

/** Thin bar showing how far through the goal's time window you are (pace vs. end date). */
export function GoalPaceBar({
  percent,
  size = 'md',
  className,
  showLegend = true,
}: GoalPaceBarProps) {
  const clamped = Math.min(100, Math.max(0, percent))

  return (
    <div className={cn(size === 'sm' ? 'mt-1' : 'mt-1.5', className)}>
      <div
        className={cn(
          'w-full overflow-hidden rounded-full bg-zinc-800/50',
          size === 'sm' ? 'h-0.5' : 'h-1',
        )}
        title={`${Math.round(clamped)}% of goal period elapsed`}
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-indigo-500/45 transition-all duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p
        className={cn(
          'font-medium text-indigo-400/55',
          size === 'sm' ? 'mt-0.5 text-[9px]' : 'mt-1 text-[10px]',
        )}
      >
        <span className="tabular-nums text-indigo-400/70">{Math.round(clamped)}%</span>
        {showLegend && (
          <>
            <span className="mx-1 text-indigo-400/35">·</span>
            <span>Time elapsed in goal</span>
          </>
        )}
      </p>
    </div>
  )
}
