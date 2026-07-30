import {
  pulseCorePx,
  pulseMeterVisuals,
  pulseRingAnimationDelay,
  pulseScoreLabel,
} from '@/lib/pulse'
import {
  usePulseScoreAnimation,
  type PulseRadiantNova,
} from '@/hooks/usePulseScoreAnimation'
import { warmAudioContext } from '@/lib/timerSound'
import { cn } from '@/lib/utils'
import { useEffect, useRef, type CSSProperties } from 'react'

interface PulseMeterProps {
  score: number
  scale?: number
  className?: string
  /** Fires whenever the animated display score changes (including mount). */
  onDisplayScoreChange?: (score: number) => void
  /**
   * When animating toward 100, grow then slam so impact lands exactly as the ticker hits 100.
   * Increment `radiantSlamKey` to force the celebration again (dev).
   */
  celebrateRadiant?: boolean
  onRadiantImpact?: () => void
  radiantSlamKey?: number
  /** True while the core is scaled/shaking for the radiant celebrate. */
  onCelebratingChange?: (celebrating: boolean) => void
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
    '--pulse-ring-peak-opacity': 0.25,
    '--pulse-ring-color': brightBorder,
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

function novaVisuals(nova: PulseRadiantNova) {
  const { phase, t } = nova
  if (phase === 'emit') {
    return {
      softScale: 1.05 + t * 0.72,
      ringScale: 1.02 + t * 0.58,
      softOpacity: 0.2 + t * 0.55,
      ringOpacity: 0.35 + t * 0.55,
      coreFlash: 0,
    }
  }

  // Implode: rush inward, brighten, then vanish into the slam.
  const collapse = t
  const softScale = 1.77 * (1 - collapse) + 0.18 * collapse
  const ringScale = 1.6 * (1 - collapse) + 0.12 * collapse
  const softOpacity =
    collapse < 0.55 ? 0.75 + collapse * 0.35 : Math.max(0, 0.95 * (1 - (collapse - 0.55) / 0.45))
  const ringOpacity =
    collapse < 0.4 ? 0.95 : Math.max(0, 0.95 * (1 - (collapse - 0.4) / 0.6))
  const coreFlash =
    collapse < 0.65 ? collapse * 1.15 : Math.max(0, 1.2 * (1 - (collapse - 0.65) / 0.35))

  return { softScale, ringScale, softOpacity, ringOpacity, coreFlash }
}

export function PulseMeter({
  score,
  scale = 1,
  className,
  onDisplayScoreChange,
  celebrateRadiant = false,
  onRadiantImpact,
  radiantSlamKey = 0,
  onCelebratingChange,
}: PulseMeterProps) {
  const onRadiantImpactRef = useRef(onRadiantImpact)
  onRadiantImpactRef.current = onRadiantImpact

  const { displayScore, visualScore, coreScale, coreShake, radiantNova } = usePulseScoreAnimation(
    score,
    {
      celebrateRadiant,
      forceCelebrateKey: radiantSlamKey,
      onRadiantImpact: () => onRadiantImpactRef.current?.(),
    },
  )
  const label = pulseScoreLabel(displayScore)
  const { visuals, meterStyle, baseBorder, corePx } = buildMeterStyle(visualScore, scale)
  const celebrating =
    coreScale !== 1 ||
    Math.abs(coreShake.x) > 0.01 ||
    Math.abs(coreShake.y) > 0.01 ||
    radiantNova != null
  const coreTransform = !celebrating
    ? undefined
    : `translate(${coreShake.x.toFixed(2)}px, ${coreShake.y.toFixed(2)}px) scale(${coreScale})`
  const nova = radiantNova ? novaVisuals(radiantNova) : null

  useEffect(() => {
    onDisplayScoreChange?.(displayScore)
  }, [displayScore, onDisplayScoreChange])

  useEffect(() => {
    onCelebratingChange?.(celebrating)
  }, [celebrating, onCelebratingChange])

  useEffect(() => {
    return () => onCelebratingChange?.(false)
  }, [onCelebratingChange])

  useEffect(() => {
    if (celebrating) warmAudioContext()
  }, [celebrating])

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
  const showPulse = visualScore > 0

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
            !celebrating &&
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
            className="relative flex items-center justify-center origin-top"
            style={{
              width: corePx,
              height: corePx,
              transform: coreTransform,
              willChange: coreTransform ? 'transform' : undefined,
            }}
          >
            {nova && (
              <>
                <div
                  className="pulse-radiant-nova-soft pointer-events-none absolute left-1/2 top-1/2 rounded-full"
                  style={{
                    width: corePx,
                    height: corePx,
                    opacity: nova.softOpacity,
                    transform: `translate(-50%, -50%) scale(${nova.softScale})`,
                  }}
                />
                <div
                  className="pulse-radiant-nova-ring pointer-events-none absolute left-1/2 top-1/2 rounded-full"
                  style={{
                    width: corePx,
                    height: corePx,
                    opacity: nova.ringOpacity,
                    transform: `translate(-50%, -50%) scale(${nova.ringScale})`,
                  }}
                />
                {nova.coreFlash > 0.02 && (
                  <div
                    className="pulse-radiant-nova-flash pointer-events-none absolute left-1/2 top-1/2 rounded-full"
                    style={{
                      width: corePx * 0.55,
                      height: corePx * 0.55,
                      opacity: Math.min(1, nova.coreFlash),
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                )}
              </>
            )}

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
                'relative flex flex-col items-center justify-center rounded-full',
                celebrating ? 'bg-zinc-950' : 'bg-zinc-950/80',
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
