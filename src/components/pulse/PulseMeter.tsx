import {
  pulseCorePx,
  pulseMeterVisuals,
  pulseRingAnimationDelay,
  pulseScoreLabel,
} from '@/lib/pulse'
import { usePulseScoreAnimation } from '@/hooks/usePulseScoreAnimation'
import { cn } from '@/lib/utils'
import type { CSSProperties } from 'react'

interface PulseMeterProps {
  score: number
  scale?: number
  className?: string
}

function buildMeterStyle(score: number, scale: number) {
  const visuals = pulseMeterVisuals(score, scale)
  const accent = `color-mix(in srgb, var(--accent-500) ${100 - visuals.accentLightness}%, white ${visuals.accentLightness}%)`
  const accentSoft = `color-mix(in srgb, var(--accent-300) ${100 - visuals.accentLightness * 0.7}%, white ${visuals.accentLightness * 0.7}%)`
  const baseBorder = `color-mix(in srgb, var(--pulse-accent) ${visuals.borderOpacity * 100}%, transparent)`
  const brightBorder = `color-mix(in srgb, var(--pulse-accent) ${Math.min(100, visuals.borderOpacity * 100 + 40)}%, white 30%)`
  const borderWidthMid =
    visuals.coreBorderPx + (visuals.coreBorderPeakPx - visuals.coreBorderPx) * 0.35
  const borderWidthRise =
    visuals.coreBorderPx + (visuals.coreBorderPeakPx - visuals.coreBorderPx) * 0.7
  const corePx = pulseCorePx(scale)

  const meterStyle = {
    '--pulse-duration': `${visuals.animationDuration}s`,
    '--pulse-ring-start': visuals.ringStartScale,
    '--pulse-ring-expand': visuals.ringExpandEnd,
    '--pulse-accent': accent,
    '--pulse-accent-soft': accentSoft,
    '--pulse-border-opacity': visuals.borderOpacity,
    '--pulse-core-glow': `${visuals.coreGlowPx}px`,
    '--pulse-ring-border': `${visuals.ringBorderPx}px`,
    '--pulse-core-border-base': baseBorder,
    '--pulse-core-border-bright': brightBorder,
    '--pulse-core-border-width-base': `${visuals.coreBorderPx}px`,
    '--pulse-core-border-width-mid': `${borderWidthMid}px`,
    '--pulse-core-border-width-rise': `${borderWidthRise}px`,
    '--pulse-core-border-width-thick': `${visuals.coreBorderPeakPx}px`,
    '--pulse-core-glow-base': `0 0 var(--pulse-core-glow) color-mix(in srgb, var(--pulse-accent) 40%, transparent)`,
    '--pulse-core-glow-mid': `0 0 calc(var(--pulse-core-glow) * 1.08) color-mix(in srgb, var(--pulse-accent) 46%, transparent)`,
    '--pulse-core-glow-rise': `0 0 calc(var(--pulse-core-glow) * 1.22) color-mix(in srgb, var(--pulse-accent) 52%, transparent)`,
    '--pulse-core-glow-bright': `0 0 calc(var(--pulse-core-glow) * 1.4) color-mix(in srgb, var(--pulse-accent) 58%, transparent), 0 0 calc(var(--pulse-core-glow) * 0.55) color-mix(in srgb, var(--pulse-accent) 32%, transparent)`,
  } as CSSProperties

  return { visuals, meterStyle, baseBorder, corePx }
}

export function PulseMeter({ score, scale = 1, className }: PulseMeterProps) {
  const { displayScore } = usePulseScoreAnimation(score)
  const label = pulseScoreLabel(displayScore)
  const { visuals, meterStyle, baseBorder, corePx } = buildMeterStyle(score, scale)
  const scoreTextClass =
    scale >= 1
      ? 'text-[1.75rem] leading-none'
      : scale >= 0.65
        ? 'text-base leading-none'
        : 'text-sm leading-none'
  const labelTextClass =
    scale >= 1
      ? 'text-[10px] leading-none tracking-[0.12em]'
      : scale >= 0.65
        ? 'text-[7px] leading-none tracking-[0.1em]'
        : 'text-[6px] leading-none tracking-[0.08em]'
  const corePadding = scale >= 1 ? 'px-2.5' : scale >= 0.65 ? 'px-1.5' : 'px-1'
  const coreGap = scale >= 1 ? 'gap-1' : 'gap-0.5'
  const showPulse = score > 0

  return (
    <div
      className={cn('relative mx-auto', className)}
      style={{ ...meterStyle, width: visuals.meterZonePx, height: visuals.meterZonePx }}
    >
      <div className="relative flex h-full w-full items-center justify-center">
        <div
          className="relative flex items-center justify-center overflow-visible"
          style={{ width: visuals.ringArenaPx, height: visuals.ringArenaPx }}
        >
          {showPulse &&
            [0, 1, 2].map((ring) => (
              <div
                key={ring}
                className="pulse-hero-ring absolute h-full w-full origin-center rounded-full border-solid"
                style={{
                  animation: `pulse-ring-ripple var(--pulse-duration) linear infinite`,
                  animationDelay: `${pulseRingAnimationDelay(ring, visuals.animationDuration)}s`,
                }}
              />
            ))}

          <div
            className="relative flex items-center justify-center"
            style={{ width: corePx, height: corePx }}
          >
            {showPulse && (
              <div
                className="pulse-hero-core pointer-events-none absolute left-1/2 top-1/2 rounded-full border-solid"
                style={{
                  width: corePx,
                  height: corePx,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            )}

            <div
              className={cn(
                'relative flex flex-col items-center justify-center rounded-full bg-zinc-950/80',
                corePadding,
                coreGap,
              )}
              style={{
                width: corePx,
                height: corePx,
                ...(showPulse
                  ? {}
                  : {
                      borderStyle: 'solid',
                      borderWidth: visuals.coreBorderPx,
                      borderColor: baseBorder,
                      boxShadow: `0 0 var(--pulse-core-glow) color-mix(in srgb, var(--pulse-accent) 40%, transparent)`,
                    }),
              }}
            >
              <span className={cn('font-bold tabular-nums text-zinc-50', scoreTextClass)}>
                {displayScore}
              </span>
              <span
                className={cn('font-medium uppercase', labelTextClass)}
                style={{ color: 'var(--pulse-accent-soft)' }}
              >
                {label}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
