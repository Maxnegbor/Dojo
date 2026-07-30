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
  const [score, setScore] = useState<number | null>(null)

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
          <div className="mb-4 flex items-center gap-3">
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

          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: 10 }, (_, index) => {
              const value = index + 1
              const selected = score === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScore(value)}
                  className={cn(
                    'rounded-xl border py-2.5 text-sm font-semibold tabular-nums transition-colors',
                    selected
                      ? 'border-[var(--accent-500)] bg-[var(--accent-500)] text-black'
                      : 'border-zinc-700/80 bg-zinc-900/70 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100',
                  )}
                >
                  {value}
                </button>
              )
            })}
          </div>

          <div className="mt-5 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onSkip}>
              Skip
            </Button>
            <Button
              className="flex-[2]"
              disabled={score == null}
              onClick={() => {
                if (score == null) return
                onSubmit(score)
              }}
            >
              Save score
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
