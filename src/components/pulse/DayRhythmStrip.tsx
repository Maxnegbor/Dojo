import type { WeekdayRhythm } from '@/lib/pulse'
import { cn } from '@/lib/utils'

interface DayRhythmStripProps {
  rhythm: WeekdayRhythm[]
}

export function DayRhythmStrip({ rhythm }: DayRhythmStripProps) {
  const max = Math.max(...rhythm.map((d) => d.avgScore), 1)
  const best = Math.max(...rhythm.map((d) => d.avgScore))

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-zinc-200">Weekly rhythm</h2>
        <p className="text-[10px] text-zinc-500">Average pulse by weekday (last 5 weeks)</p>
      </div>

      <div className="flex items-end justify-between gap-1.5">
        {rhythm.map((day) => {
          const h = day.avgScore > 0 ? Math.max(12, (day.avgScore / max) * 100) : 8
          const isPeak = day.avgScore > 0 && day.avgScore === best
          return (
            <div key={day.label} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="relative flex h-24 w-full items-end justify-center">
                <div
                  className={cn(
                    'w-full max-w-[2rem] rounded-t-md transition-all',
                    day.avgScore > 0
                      ? isPeak
                        ? 'bg-[var(--accent-500)] shadow-[0_0_16px_var(--accent-glow)]'
                        : 'bg-[var(--accent-600)]/70'
                      : 'bg-zinc-800/60',
                  )}
                  style={{ height: `${h}%` }}
                  title={day.samples > 0 ? `${day.avgScore}% avg` : 'No data'}
                />
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium',
                  isPeak ? 'text-[var(--accent-300)]' : 'text-zinc-500',
                )}
              >
                {day.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
