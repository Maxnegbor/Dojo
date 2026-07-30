import { useMemo, useState } from 'react'
import { getRollingFocusHours, getDevDummyRollingFocusHours, withLiveFocusSession } from '@/lib/focusHourly'
import { cn, formatDuration } from '@/lib/utils'

interface FocusHourlyChartProps {
  formatHour: (date: Date) => string
  liveSession?: { startMs: number; endMs: number } | null
  useDevDummy?: boolean
  className?: string
}

export function FocusHourlyChart({
  formatHour,
  liveSession,
  useDevDummy = false,
  className,
}: FocusHourlyChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const now = liveSession?.endMs ?? Date.now()

  const buckets = useMemo(() => {
    const base = useDevDummy
      ? getDevDummyRollingFocusHours(new Date(now))
      : getRollingFocusHours(new Date(now))
    return useDevDummy ? base : withLiveFocusSession(base, liveSession ?? null)
  }, [now, liveSession, useDevDummy])

  const maxMinutes = useMemo(
    () => Math.max(1, ...buckets.map((bucket) => bucket.minutes)),
    [buckets],
  )

  return (
    <div className={cn('w-full', className)}>
      <div className="relative flex h-20 items-end gap-1">
        {buckets.map((bucket, index) => {
          const roundedMinutes = Math.round(bucket.minutes)
          const heightPct =
            roundedMinutes > 0 ? Math.max(8, (bucket.minutes / maxMinutes) * 100) : 0
          const isHovered = hoveredIndex === index

          return (
            <div
              key={bucket.hourStart.toISOString()}
              className="relative flex min-w-0 flex-1 flex-col items-center"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {isHovered && (
                <div className="pointer-events-none absolute bottom-full z-20 mb-2 whitespace-nowrap rounded-md border border-zinc-700/80 bg-zinc-950 px-2 py-1 text-[10px] font-medium text-zinc-100 shadow-lg">
                  {formatHour(bucket.hourStart)} · {formatDuration(roundedMinutes)}
                </div>
              )}
              <div
                className={cn(
                  'w-full rounded-sm transition-colors',
                  isHovered
                    ? 'bg-[var(--accent-400)]'
                    : roundedMinutes > 0
                      ? 'bg-[var(--accent-600)]'
                      : 'bg-zinc-800/80',
                )}
                style={{ height: roundedMinutes > 0 ? `${heightPct}%` : '2px' }}
                title={`${formatHour(bucket.hourStart)}: ${formatDuration(roundedMinutes)}`}
                aria-label={`${formatHour(bucket.hourStart)}: ${formatDuration(roundedMinutes)}`}
              />
              <span className="mt-1 w-full truncate text-center text-[9px] tabular-nums text-zinc-600">
                {formatHour(bucket.hourStart)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
