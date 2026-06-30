import type { RefObject } from 'react'
import { cn } from '@/lib/utils'

export const ACCENT_BAR_BEFORE = 'var(--accent-700)'
export const ACCENT_BAR_GAIN = 'var(--accent-400)'
export const ACCENT_BAR_GAIN_HIT = 'var(--accent-300)'
/** Bar height (h-2.5) — tucks gain under the rounded junction cap. */
export const JUNCTION_OVERLAP = '0.625rem'

interface SplitAccentProgressBarProps {
  beforePct: number
  fillPct: number
  gainPct: number
  hitTarget?: boolean
  animating?: boolean
  durationMs?: number
  size?: 'sm' | 'md'
  fillRef?: RefObject<HTMLDivElement | null>
  /** Decrease: darker previous layer + shorter bar on top. */
  isDecrease?: boolean
}

export function SplitAccentProgressBar({
  beforePct,
  fillPct,
  gainPct,
  hitTarget = false,
  animating = false,
  durationMs = 2000,
  size = 'md',
  fillRef,
  isDecrease = false,
}: SplitAccentProgressBarProps) {
  const gainColor = hitTarget ? ACCENT_BAR_GAIN_HIT : ACCENT_BAR_GAIN
  const showRoundedJunction = !isDecrease && gainPct > 0.01 && beforePct > 0.01
  const transition = animating
    ? `width ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`
    : undefined

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-full bg-zinc-800 ring-1 ring-zinc-700/50',
        size === 'sm' ? 'h-1.5' : 'h-2.5',
      )}
    >
      {isDecrease ? (
        <>
          <div
            className="absolute inset-y-0 left-0 z-0 rounded-full bg-red-950/80"
            style={{ width: `${beforePct}%` }}
          />
          <div
            ref={fillRef}
            className="absolute inset-y-0 left-0 z-10 rounded-full bg-red-500/85"
            style={{ width: `${fillPct}%`, transition }}
          >
            <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/10 to-transparent" />
          </div>
        </>
      ) : showRoundedJunction ? (
        <>
          <div
            ref={fillRef}
            className="absolute inset-y-0 z-0 rounded-r-full"
            style={{
              left: `calc(${beforePct}% - ${JUNCTION_OVERLAP})`,
              width: animating ? `calc(${gainPct}% + ${JUNCTION_OVERLAP})` : 0,
              backgroundColor: gainColor,
              transition,
              boxShadow: fillPct >= 100 ? '0 0 10px var(--accent-glow)' : undefined,
            }}
          >
            <div className="pointer-events-none absolute inset-0 rounded-r-full bg-gradient-to-b from-white/12 to-transparent" />
          </div>
          <div
            className="absolute inset-y-0 left-0 z-10 rounded-r-full"
            style={{ width: `${beforePct}%`, backgroundColor: ACCENT_BAR_BEFORE }}
          >
            <div className="pointer-events-none absolute inset-0 rounded-r-full bg-gradient-to-b from-white/10 to-transparent" />
          </div>
        </>
      ) : (
        <div
          ref={fillRef}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${fillPct}%`,
            backgroundColor: gainColor,
            transition,
            boxShadow: fillPct >= 100 ? '0 0 10px var(--accent-glow)' : undefined,
          }}
        >
          <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/12 to-transparent" />
        </div>
      )}
    </div>
  )
}

export function barLegendColors(hitTarget: boolean) {
  return {
    beforeColor: ACCENT_BAR_BEFORE,
    gainColor: hitTarget ? ACCENT_BAR_GAIN_HIT : ACCENT_BAR_GAIN,
  }
}
