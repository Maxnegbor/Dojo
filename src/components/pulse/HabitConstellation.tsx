import type { HabitStar } from '@/lib/pulse'
import { cn } from '@/lib/utils'

interface HabitConstellationProps {
  stars: HabitStar[]
}

export function HabitConstellation({ stars }: HabitConstellationProps) {
  const size = 280
  const center = size / 2

  if (stars.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
        Add habits on Metrics to light up your constellation.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-zinc-200">Habit constellation</h2>
        <p className="text-[10px] text-zinc-500">Brightness = this week&apos;s consistency · size = streak</p>
      </div>

      <div className="relative mx-auto aspect-square max-w-[320px]">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
          <circle
            cx={center}
            cy={center}
            r={center - 8}
            fill="none"
            stroke="rgb(39 39 42 / 0.6)"
            strokeWidth="1"
            strokeDasharray="4 6"
          />
          <circle
            cx={center}
            cy={center}
            r={center * 0.55}
            fill="none"
            stroke="rgb(39 39 42 / 0.35)"
            strokeWidth="1"
            strokeDasharray="2 8"
          />
          {stars.map((star) => {
            const r = (center - 36) * star.orbit
            const x = center + Math.cos(star.angle) * r
            const y = center + Math.sin(star.angle) * r
            const glow = 0.25 + (star.weekRate / 100) * 0.75
            const dotR = 4 + Math.min(star.streak, 14) * 0.35
            return (
              <g key={star.id}>
                <circle
                  cx={x}
                  cy={y}
                  r={dotR + 6}
                  fill="var(--accent-500)"
                  opacity={glow * 0.2}
                  className="pulse-star-glow"
                />
                <circle
                  cx={x}
                  cy={y}
                  r={dotR}
                  fill="var(--accent-400)"
                  opacity={glow}
                />
              </g>
            )
          })}
        </svg>

        <ul className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-1.5 px-2 pb-1">
          {stars.map((star) => (
            <li
              key={star.id}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[10px]',
                star.weekRate >= 70
                  ? 'border-[var(--accent-500)]/40 bg-[var(--accent-950)]/80 text-[var(--accent-300)]'
                  : 'border-zinc-800 bg-zinc-950/60 text-zinc-400',
              )}
            >
              {star.label}
              {star.streak > 0 && (
                <span className="ml-1 tabular-nums text-zinc-500">· {star.streak}d</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
