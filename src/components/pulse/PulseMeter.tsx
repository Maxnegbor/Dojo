import { pulseCorePx, pulseMeterVisuals } from '@/lib/pulse'
import { cn } from '@/lib/utils'
import { useEffect, type CSSProperties } from 'react'

interface PulseMeterProps {
  score: number
  scale?: number
  className?: string
  /** Fires whenever the displayed score changes (including mount). */
  onDisplayScoreChange?: (score: number) => void
  /** @deprecated Static meter — ignored. */
  celebrateRadiant?: boolean
  /** @deprecated Static meter — ignored. */
  onRadiantImpact?: () => void
  /** @deprecated Static meter — ignored. */
  radiantSlamKey?: number
  /** @deprecated Static meter — ignored. */
  onCelebratingChange?: (celebrating: boolean) => void
}

export function PulseMeter({
  score,
  scale = 1,
  className,
  onDisplayScoreChange,
}: PulseMeterProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const visuals = pulseMeterVisuals(clamped, scale)
  const corePx = pulseCorePx(scale)
  const borderColor =
    clamped > 0
      ? 'var(--accent-400)'
      : 'color-mix(in srgb, var(--accent-500) 22%, rgb(63 63 70))'

  useEffect(() => {
    onDisplayScoreChange?.(clamped)
  }, [clamped, onDisplayScoreChange])

  const scoreTextClass =
    scale >= 1
      ? 'text-[2rem] leading-none'
      : scale >= 0.85
        ? 'text-[1.6rem] leading-none'
        : scale >= 0.7
          ? 'text-xl leading-none'
          : scale >= 0.55
            ? 'text-lg leading-none'
            : 'text-base leading-none'

  const style = {
    width: corePx,
    height: corePx,
    borderStyle: 'solid',
    borderWidth: Math.max(2.5, visuals.coreBorderPx),
    borderColor,
    boxShadow: 'none',
  } as CSSProperties

  return (
    <div
      className={cn(
        'relative mx-auto flex items-center justify-center rounded-full bg-zinc-950',
        className,
      )}
      style={style}
      aria-label={`Pulse ${clamped}`}
    >
      <span className={cn('font-bold tabular-nums text-zinc-50', scoreTextClass)}>
        {clamped}
      </span>
    </div>
  )
}
