import { TrendingDown, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getConsistencyHeatColor } from '@/lib/habitStreaks'
import type { HabitRampFailurePrompt } from '@/lib/habitRamp'

interface HabitRampFailureModalProps {
  prompt: HabitRampFailurePrompt
  onDecrease: () => void
  onKeep: () => void
}

export function HabitRampFailureModal({ prompt, onDecrease, onKeep }: HabitRampFailureModalProps) {
  const formatted = new Date(prompt.failedDate + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
  const consistency = Math.round(prompt.consistency7Days)
  const consistencyColor = getConsistencyHeatColor(consistency)

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-labelledby="habit-ramp-failure-title"
        className="w-full max-w-md rounded-2xl border border-zinc-700/80 bg-zinc-900 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-950/60 text-amber-400">
              <TrendingDown size={18} />
            </div>
            <div>
              <h2 id="habit-ramp-failure-title" className="text-base font-semibold text-zinc-100">
                Missed {prompt.habitLabel}
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                You didn&apos;t complete this habit on {formatted}. Lower your ramp level by one
                step?
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onKeep}
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Keep current level"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Current target</span>
            <span className="font-semibold tabular-nums text-zinc-100">
              {prompt.currentTarget} {prompt.unit}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-zinc-500">If you step down</span>
            <span className="font-semibold tabular-nums text-[var(--accent-300)]">
              {prompt.decreasedTarget} {prompt.unit}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-zinc-500">Last 7 days consistency</span>
            <span
              className="font-semibold tabular-nums"
              style={{ color: consistencyColor }}
            >
              {consistency}%
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onKeep}>
            Keep level
          </Button>
          <Button className="flex-1" onClick={onDecrease}>
            Step down
          </Button>
        </div>
      </div>
    </div>
  )
}
