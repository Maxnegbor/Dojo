import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Brain, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export interface FocusScorePromptPayload {
  date: string
  startMs: number
  endMs: number
  minutes: number
}

interface FocusScorePromptProps {
  payload: FocusScorePromptPayload
  onSubmit: (score: number) => void
  onSkip: () => void
}

export function FocusScorePrompt({ payload, onSubmit, onSkip }: FocusScorePromptProps) {
  const [score, setScore] = useState(5)

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl">
        <button
          type="button"
          onClick={onSkip}
          className="absolute right-3 top-3 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Skip"
        >
          <X size={16} />
        </button>

        <div className="px-5 pb-5 pt-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-950)]">
              <Brain size={20} className="text-[var(--accent-400)]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">How focused were you?</h2>
              <p className="text-xs text-zinc-400">
                Rate this {payload.minutes}m session · 1 low · 10 locked in
              </p>
            </div>
          </div>

          <div className="mb-3 text-center">
            <span className="text-4xl font-semibold tabular-nums text-zinc-50">{score}</span>
          </div>

          <label className="block px-1">
            <span className="sr-only">Focus score from 1 to 10</span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              className={cn(
                'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-700/80',
                '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
                '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
                '[&::-webkit-slider-thumb]:bg-[var(--accent-500)] [&::-webkit-slider-thumb]:shadow-[0_0_8px_var(--accent-glow)]',
                '[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110',
                '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full',
                '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--accent-500)]',
              )}
              aria-valuemin={1}
              aria-valuemax={10}
              aria-valuenow={score}
            />
            <div className="mt-1.5 flex justify-between text-[10px] font-medium uppercase tracking-wide text-zinc-600">
              <span>1 low</span>
              <span>10 locked in</span>
            </div>
          </label>

          <div className="mt-5 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onSkip}>
              Skip
            </Button>
            <Button className="flex-[2]" onClick={() => onSubmit(score)}>
              Save score
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
