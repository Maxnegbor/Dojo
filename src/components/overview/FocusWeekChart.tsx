import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { cn, formatDuration } from '@/lib/utils'

export interface FocusWeekDayBucket {
  date: string
  minutes: number
}

interface FocusWeekChartProps {
  days: FocusWeekDayBucket[]
  className?: string
}

export function FocusWeekChart({ days, className }: FocusWeekChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const maxMinutes = useMemo(
    () => Math.max(1, ...days.map((day) => day.minutes)),
    [days],
  )

  if (days.length === 0) return null

  return (
    <div className={cn('w-full', className)}>
      <div className="relative flex h-24 items-stretch gap-1.5">
        {days.map((day, index) => {
          const roundedMinutes = Math.round(day.minutes)
          const heightPct =
            roundedMinutes > 0 ? Math.max(10, (day.minutes / maxMinutes) * 100) : 0
          const isHovered = hoveredIndex === index
          const label = format(parseISO(`${day.date}T12:00:00`), 'EEEEEE')

          return (
            <div
              key={day.date}
              className="relative flex min-w-0 flex-1 flex-col"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="relative min-h-0 w-full flex-1">
                {isHovered && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-zinc-700/80 bg-zinc-950 px-2 py-1 text-[10px] font-medium text-zinc-100 shadow-lg">
                    {format(parseISO(`${day.date}T12:00:00`), 'EEE MMM d')} ·{' '}
                    {formatDuration(roundedMinutes)}
                  </div>
                )}
                <div
                  className={cn(
                    'absolute bottom-0 left-0 right-0 rounded-sm transition-colors',
                    isHovered
                      ? 'bg-[var(--accent-400)]'
                      : roundedMinutes > 0
                        ? 'bg-[var(--accent-600)]'
                        : 'bg-zinc-800/80',
                  )}
                  style={{ height: roundedMinutes > 0 ? `${heightPct}%` : '2px' }}
                  title={`${label}: ${formatDuration(roundedMinutes)}`}
                  aria-label={`${label}: ${formatDuration(roundedMinutes)}`}
                />
              </div>
              <span className="mt-1 w-full shrink-0 text-center text-[9px] tabular-nums text-zinc-600">
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
