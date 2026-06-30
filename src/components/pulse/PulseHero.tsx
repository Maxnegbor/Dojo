import { pulseScoreLabel } from '@/lib/pulse'
import { cn } from '@/lib/utils'

interface PulseHeroProps {
  score: number
  habitRate: number
  focusRate: number
  metricRate: number
}

export function PulseHero({ score, habitRate, focusRate, metricRate }: PulseHeroProps) {
  const label = pulseScoreLabel(score)
  const intensity = Math.max(0.15, score / 100)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background: `radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--accent-500) ${Math.round(intensity * 45)}%, transparent) 0%, transparent 65%)`,
        }}
      />

      <div className="relative flex flex-col items-center py-4">
        <div className="relative flex h-44 w-44 items-center justify-center">
          {[0, 1, 2].map((ring) => (
            <div
              key={ring}
              className={cn(
                'absolute rounded-full border border-[var(--accent-500)]/30',
                ring === 0 && 'pulse-ring-1 h-full w-full',
                ring === 1 && 'pulse-ring-2 h-[78%] w-[78%]',
                ring === 2 && 'pulse-ring-3 h-[56%] w-[56%]',
              )}
              style={{ opacity: 0.12 + intensity * 0.35 - ring * 0.08 }}
            />
          ))}
          <div
            className="relative flex h-24 w-24 flex-col items-center justify-center rounded-full border border-[var(--accent-500)]/40 bg-zinc-950/80 shadow-[0_0_40px_var(--accent-glow)]"
            style={{ boxShadow: `0 0 ${24 + score * 0.4}px color-mix(in srgb, var(--accent-500) 35%, transparent)` }}
          >
            <span className="text-3xl font-bold tabular-nums text-zinc-50">{score}</span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--accent-300)]">
              {label}
            </span>
          </div>
        </div>

        <p className="mt-4 max-w-xs text-center text-sm text-zinc-400">
          Your life rhythm today — habits, focus, and metrics woven into one living score.
        </p>

        <div className="mt-5 grid w-full max-w-sm grid-cols-3 gap-2">
          {[
            { label: 'Habits', value: Math.round(habitRate) },
            { label: 'Focus', value: Math.round(focusRate) },
            { label: 'Metrics', value: Math.round(metricRate) },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-2 py-2 text-center"
            >
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">{item.label}</p>
              <p className="text-sm font-semibold tabular-nums text-zinc-200">{item.value}%</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
