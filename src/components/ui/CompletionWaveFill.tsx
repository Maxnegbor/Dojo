import { cn } from '@/lib/utils'

type CompletionWavePhase = 'animating' | 'done'

interface CompletionWaveFillProps {
  phase?: CompletionWavePhase
  /** No inset border on the fill — used for reminders. */
  plain?: boolean
  onAnimationEnd?: () => void
}

export function CompletionWaveFill({ phase, plain, onAnimationEnd }: CompletionWaveFillProps) {
  if (!phase) return null

  return (
    <span
      className={cn(
        'completion-wave-fill',
        plain && 'completion-wave-fill--plain',
        phase === 'animating' && 'completion-wave-fill--animating',
        phase === 'done' && 'completion-wave-fill--done',
      )}
      aria-hidden
      onAnimationEnd={(event) => {
        if (event.animationName !== 'completion-wave-ripple') return
        onAnimationEnd?.()
      }}
    />
  )
}
