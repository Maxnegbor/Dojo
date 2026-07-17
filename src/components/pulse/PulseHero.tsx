import { PulseMeter } from '@/components/pulse/PulseMeter'
import type { PulseFormula } from '@/lib/pulseConfig'

interface PulseHeroProps {
  score: number
  habitRate: number
  focusRate: number
  sleepRate: number
  exerciseRate: number
  formula: PulseFormula | null
  configured: boolean
}

export function PulseHero({
  score,
  habitRate,
  focusRate,
  sleepRate,
  exerciseRate,
  formula,
  configured,
}: PulseHeroProps) {
  const breakdownItems = formula
    ? (
        [
          { key: 'habits', label: 'Habits', value: habitRate, points: formula.weights.habits },
          { key: 'focus', label: 'Focus', value: focusRate, points: formula.weights.focus },
          { key: 'sleep', label: 'Sleep', value: sleepRate, points: formula.weights.sleep },
          {
            key: 'exercise',
            label: 'Exercise',
            value: exerciseRate,
            points: formula.weights.exercise,
          },
        ] as const
      ).filter((item) => item.points > 0)
    : []

  return (
    <div className="relative overflow-visible rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6">
      <div className="relative flex flex-col items-center py-4">
        <PulseMeter score={score} />

        {configured ? (
          breakdownItems.length > 0 && (
            <div
              className="mt-5 grid w-full max-w-md gap-2"
              style={{
                gridTemplateColumns: `repeat(${Math.min(breakdownItems.length, 4)}, minmax(0, 1fr))`,
              }}
            >
              {breakdownItems.map((item) => (
                <div
                  key={item.key}
                  className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-2 py-2 text-center"
                >
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                    {item.label}
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-zinc-200">
                    {Math.round(item.value)}%
                  </p>
                </div>
              ))}
            </div>
          )
        ) : (
          <p className="mt-4 max-w-sm text-center text-sm text-zinc-400">
            Configure Pulse to choose what counts toward your daily score — habits, focus, sleep, and
            optionally exercise.
          </p>
        )}
      </div>
    </div>
  )
}
