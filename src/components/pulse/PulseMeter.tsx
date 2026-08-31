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
  const strokeWidth = Math.max(2.5, visuals.coreBorderPx)
  const ringRadius = (corePx - strokeWidth) / 2
  const circumference = 2 * Math.PI * ringRadius
  const fillFraction = clamped / 100
  const dashOffset = circumference * (1 - fillFraction)

  const accentLightness = visuals.accentLightness
  const trackColor =
    clamped > 0
      ? `color-mix(in srgb, var(--accent-500) ${Math.max(12, visuals.borderOpacity * 55)}%, rgb(63 63 70))`
      : 'color-mix(in srgb, var(--accent-500) 22%, rgb(63 63 70))'
  const fillColor =
    clamped > 0
      ? `color-mix(in srgb, var(--accent-500) ${Math.min(100, visuals.borderOpacity * 100 + accentLightness * 0.35 + 28)}%, white ${Math.min(35, accentLightness * 0.45)}%)`
      : trackColor

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
      <svg
        className="pointer-events-none absolute inset-0 -rotate-90"
        width={corePx}
        height={corePx}
        viewBox={`0 0 ${corePx} ${corePx}`}
        aria-hidden
      >
        <circle
          cx={corePx / 2}
          cy={corePx / 2}
          r={ringRadius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {clamped > 0 && (
          <circle
            cx={corePx / 2}
            cy={corePx / 2}
            r={ringRadius}
            fill="none"
            stroke={fillColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        )}
      </svg>
      <span className={cn('relative font-bold tabular-nums text-zinc-50', scoreTextClass)}>
        {clamped}
      </span>
    </div>
  )
}
