import { useEffect, useMemo, useState } from 'react'
import { Activity, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  pulseCorePx,
  pulseMeterVisuals,
  pulseRingAnimationDelay,
  pulseScoreLabel,
} from '@/lib/pulse'
import {
  weeklyPulseDeltaLabel,
  type WeeklyPulseReview,
} from '@/lib/weeklyPulseReview'
import { cn } from '@/lib/utils'
import type { CSSProperties } from 'react'

const CHARGE_MS = 1800
const LIVE_DELAY_MS = 220
const COMPARISON_DELAY_MS = 900
const FOOTER_DELAY_MS = 1400

interface WeeklyPulseRevealModalProps {
  review: WeeklyPulseReview
  weekLabel: string
  onContinue: () => void
  onClose: () => void
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function buildAccentStyle(score: number, scale: number) {
  const visuals = pulseMeterVisuals(score, scale)
  const accent = `color-mix(in srgb, var(--accent-500) ${100 - visuals.accentLightness}%, white ${visuals.accentLightness}%)`
  const accentSoft = `color-mix(in srgb, var(--accent-300) ${100 - visuals.accentLightness * 0.7}%, white ${visuals.accentLightness * 0.7}%)`
  const baseBorder = `color-mix(in srgb, var(--pulse-accent) ${visuals.borderOpacity * 100}%, transparent)`
  const brightBorder = `color-mix(in srgb, var(--pulse-accent) ${Math.min(100, visuals.borderOpacity * 100 + 40)}%, white 30%)`
  const borderWidthMid =
    visuals.coreBorderPx + (visuals.coreBorderPeakPx - visuals.coreBorderPx) * 0.35
  const borderWidthRise =
    visuals.coreBorderPx + (visuals.coreBorderPeakPx - visuals.coreBorderPx) * 0.7

  return {
    visuals,
    corePx: pulseCorePx(scale),
    style: {
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
    } as CSSProperties,
    baseBorder,
    brightBorder,
  }
}

function ChargingPulseCircle({
  score,
  scale = 0.82,
}: {
  score: number
  scale?: number
}) {
  const [progress, setProgress] = useState(0)
  const [live, setLive] = useState(false)
  const displayScore = Math.round(easeOutCubic(progress) * score)
  const visualScore = Math.max(displayScore, live ? score : Math.round(progress * score))
  const { visuals, corePx, style, baseBorder, brightBorder } = buildAccentStyle(
    Math.max(visualScore, 1),
    scale,
  )
  const label = pulseScoreLabel(displayScore)

  const ringRadius = corePx / 2 + visuals.coreBorderPx * 0.35
  const circumference = 2 * Math.PI * ringRadius
  const chargeT = easeOutCubic(progress)
  const dashOffset = circumference * (1 - (chargeT * score) / 100)

  useEffect(() => {
    let raf = 0
    const started = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / CHARGE_MS)
      setProgress(t)
      if (t < 1) {
        raf = requestAnimationFrame(tick)
        return
      }
      window.setTimeout(() => setLive(true), LIVE_DELAY_MS)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [score])

  const showPulse = live && score > 0

  return (
    <div
      className="relative mx-auto flex items-center justify-center overflow-visible"
      style={{ width: visuals.ringArenaPx, height: visuals.ringArenaPx }}
    >
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ ...style, width: visuals.meterZonePx, height: visuals.meterZonePx }}
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
              <svg
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90"
                width={corePx + visuals.coreBorderPeakPx * 4}
                height={corePx + visuals.coreBorderPeakPx * 4}
                viewBox={`0 0 ${corePx + visuals.coreBorderPeakPx * 4} ${corePx + visuals.coreBorderPeakPx * 4}`}
                aria-hidden
              >
                <circle
                  cx={(corePx + visuals.coreBorderPeakPx * 4) / 2}
                  cy={(corePx + visuals.coreBorderPeakPx * 4) / 2}
                  r={ringRadius}
                  fill="none"
                  stroke={baseBorder}
                  strokeWidth={visuals.coreBorderPx}
                  opacity={0.55}
                />
                <circle
                  cx={(corePx + visuals.coreBorderPeakPx * 4) / 2}
                  cy={(corePx + visuals.coreBorderPeakPx * 4) / 2}
                  r={ringRadius}
                  fill="none"
                  stroke={brightBorder}
                  strokeWidth={visuals.coreBorderPeakPx}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  style={{
                    filter: `drop-shadow(0 0 ${8 + chargeT * 16}px color-mix(in srgb, var(--pulse-accent) ${40 + chargeT * 40}%, transparent))`,
                    transition: live ? 'opacity 400ms ease' : undefined,
                    opacity: live ? 0.35 : 1,
                  }}
                />
              </svg>

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
                className="relative flex flex-col items-center justify-center gap-1 rounded-full bg-zinc-950/90 px-2.5"
                style={{
                  width: corePx,
                  height: corePx,
                  boxShadow: live
                    ? undefined
                    : `0 0 ${12 + chargeT * 28}px color-mix(in srgb, var(--pulse-accent) ${30 + chargeT * 40}%, transparent)`,
                }}
              >
                <span className="text-[1.75rem] font-bold leading-none tabular-nums text-zinc-50">
                  {displayScore}
                </span>
                <span
                  className="text-[10px] font-medium uppercase leading-none tracking-[0.12em]"
                  style={{ color: 'var(--pulse-accent-soft)' }}
                >
                  {label}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PastWeekRow({
  label,
  score,
  maxScore,
  visible,
  delayMs,
}: {
  label: string
  score: number
  maxScore: number
  visible: boolean
  delayMs: number
}) {
  const width = maxScore > 0 ? Math.max(4, (score / Math.max(maxScore, 100)) * 100) : 0
  const tierLabel = pulseScoreLabel(score)

  return (
    <div
      className={cn(
        'grid grid-cols-[4.25rem_1fr_auto] items-center gap-2.5 transition-all duration-500',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0',
      )}
      style={{ transitionDelay: visible ? `${delayMs}ms` : '0ms' }}
    >
      <p className="text-[10px] text-zinc-500">{label}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800/90">
        <div
          className="h-full rounded-full bg-[var(--accent-500)] transition-[width] duration-700 ease-out"
          style={{
            width: visible ? `${width}%` : '0%',
            transitionDelay: visible ? `${delayMs + 80}ms` : '0ms',
            opacity: 0.55 + (score / 100) * 0.45,
          }}
        />
      </div>
      <div className="flex min-w-[4.25rem] items-baseline justify-end gap-1.5 tabular-nums">
        <span className="text-sm font-semibold text-zinc-100">{score}</span>
        <span className="text-[9px] uppercase tracking-wide text-zinc-600">{tierLabel}</span>
      </div>
    </div>
  )
}

export function WeeklyPulseRevealModal({
  review,
  weekLabel,
  onContinue,
  onClose,
}: WeeklyPulseRevealModalProps) {
  const [showComparison, setShowComparison] = useState(false)
  const [showFooter, setShowFooter] = useState(false)

  const currentScore = review.current.averageScore
  const lastWeek = review.previous[0]
  const delta = lastWeek ? weeklyPulseDeltaLabel(currentScore, lastWeek.averageScore) : null
  const maxBar = useMemo(
    () => Math.max(100, currentScore, ...review.previous.map((week) => week.averageScore)),
    [currentScore, review.previous],
  )

  useEffect(() => {
    const comparisonTimer = window.setTimeout(() => setShowComparison(true), COMPARISON_DELAY_MS)
    const footerTimer = window.setTimeout(() => setShowFooter(true), FOOTER_DELAY_MS)
    return () => {
      window.clearTimeout(comparisonTimer)
      window.clearTimeout(footerTimer)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-5">
      <div className="flex max-h-[min(92vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--accent-500)]/30 bg-[#0c0c14] shadow-2xl shadow-[var(--accent-500)]/10 sm:max-w-lg">
        <div className="shrink-0 border-b border-zinc-800/80 bg-gradient-to-br from-[var(--accent-950)]/60 via-transparent to-transparent px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-500)] shadow-md shadow-[var(--accent-500)]/30">
                <Activity size={16} className="text-black" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-zinc-50 sm:text-lg">Week pulse</h2>
                <p className="truncate text-xs text-zinc-400">{weekLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-between gap-4 overflow-hidden px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex shrink-0 flex-col items-center">
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
              Average pulse
            </p>
            <ChargingPulseCircle score={currentScore} />
            {delta && (
              <p
                className={cn(
                  '-mt-1 text-xs tabular-nums transition-opacity duration-500',
                  showComparison ? 'opacity-100' : 'opacity-0',
                  currentScore >= (lastWeek?.averageScore ?? 0)
                    ? 'text-emerald-400'
                    : 'text-zinc-500',
                )}
              >
                {delta}
              </p>
            )}
          </div>

          {review.previous.length > 0 && (
            <section className="shrink-0 space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                Past 3 weeks
              </p>
              <div className="space-y-2 rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3 py-2.5">
                {review.previous.map((week, index) => (
                  <PastWeekRow
                    key={week.weekDates[0] ?? index}
                    label={week.shortLabel}
                    score={week.averageScore}
                    maxScore={maxBar}
                    visible={showComparison}
                    delayMs={index * 120}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        <div
          className={cn(
            'shrink-0 border-t border-zinc-800/80 px-4 py-3 transition-opacity duration-500 sm:px-5',
            showFooter ? 'opacity-100' : 'opacity-0',
          )}
        >
          <Button
            type="button"
            className="today-btn-breathe-accent w-full"
            onClick={onContinue}
            disabled={!showFooter}
          >
            Review my goals
          </Button>
        </div>
      </div>
    </div>
  )
}
