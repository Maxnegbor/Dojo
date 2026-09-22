import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { FocusScorePromptPayload } from '@/components/focus/FocusScorePrompt'

interface FocusTimerAlarmModalProps {
  title: string
  subtitle: string
  confirmLabel: string
  scorePayload: FocusScorePromptPayload | null
  onDismiss: (score?: number) => void
}

export function FocusTimerAlarmModal({
  title,
  subtitle,
  confirmLabel,
  scorePayload,
  onDismiss,
}: FocusTimerAlarmModalProps) {
  const [score, setScore] = useState(5)

  return createPortal(
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/92 p-6 backdrop-blur-md"
      onClick={() => onDismiss()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDismiss()
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-labelledby="focus-timer-alarm-title"
        aria-modal="true"
        className="flex w-full max-w-md flex-col items-center text-center"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-950/80 ring-2 ring-red-500/60">
          <Bell size={40} className="text-red-400" aria-hidden />
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-red-400">Timer alarm</p>
        <h2 id="focus-timer-alarm-title" className="mt-2 text-3xl font-bold text-zinc-50">
          {title}
        </h2>
        <p className="mt-2 text-lg text-zinc-400">{subtitle}</p>

        {scorePayload && (
          <div className="mt-6 w-full text-left">
            <p className="mb-3 text-center text-sm font-medium text-zinc-300">How focused were you?</p>
            <div className="mb-2 text-center">
              <span className="text-3xl font-semibold tabular-nums text-zinc-50">{score}</span>
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
                  '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full',
                  '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--accent-500)]',
                )}
              />
              <div className="mt-1.5 flex justify-between text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                <span>1 low</span>
                <span>10 locked in</span>
              </div>
            </label>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => onDismiss()}>
                Skip
              </Button>
              <Button className="flex-[2]" onClick={() => onDismiss(score)}>
                Save score
              </Button>
            </div>
          </div>
        )}

        {!scorePayload && (
          <Button size="lg" className="mt-8 min-w-[10rem]" onClick={() => onDismiss()}>
            {confirmLabel}
          </Button>
        )}
      </div>
    </div>,
    document.body,
  )
}
