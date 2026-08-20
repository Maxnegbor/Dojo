import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { PulseMeter } from '@/components/pulse/PulseMeter'
import { PULSE_HEADER_SCALE, pulseCorePx } from '@/lib/pulse'
import {
  groupPulseContributorsByCategory,
  type PulseContributor,
} from '@/lib/pulseBreakdown'
import { cn } from '@/lib/utils'

const HOVER_DELAY_MS = 500
const BREAKDOWN_ANIMATION_MS = 420

interface HomePulseCardProps {
  score: number
  contributors?: PulseContributor[]
  scale?: number
  className?: string
  /** Applied to the meter only. */
  meterClassName?: string
  onDisplayScoreChange?: (score: number) => void
  onBreakdownOpenChange?: (open: boolean) => void
}

function formatScorePts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function PulseBreakdownPanel({
  contributors,
  score,
  closing,
}: {
  contributors: PulseContributor[]
  score: number
  closing?: boolean
}) {
  const categories = groupPulseContributorsByCategory(contributors)

  return (
    <div
      className={cn(
        'w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-zinc-700/80 bg-zinc-950/95 p-3 shadow-2xl shadow-black/50 ring-1 ring-[var(--accent-500)]/20 backdrop-blur-md',
        closing ? 'pulse-breakdown-close' : 'pulse-breakdown-open',
      )}
      role="tooltip"
    >
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-0.5">
        <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
          Score breakdown
        </p>
        <p className="text-[11px] tabular-nums text-zinc-400">
          <span className="font-semibold text-[var(--accent-300)]">{score}</span>
          <span className="text-zinc-600"> / 100</span>
        </p>
      </div>

      {contributors.length === 0 ? (
        <p className="px-0.5 py-2 text-xs text-zinc-500">
          Configure Pulse to choose what counts toward your score.
        </p>
      ) : (
        <div className="max-h-[min(24rem,55vh)] space-y-3 overflow-y-auto overscroll-contain scrollbar-hidden">
          {categories.map((category) => (
            <section key={category.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  {category.label}
                </p>
                <p className="text-[10px] tabular-nums text-zinc-600">
                  +{formatScorePts(category.scoreEarned)} / {formatScorePts(category.scoreMax)}
                </p>
              </div>
              <ul className="space-y-1">
                {category.rows.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-xl border border-zinc-800/90 bg-zinc-900/70 px-2.5 py-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-zinc-100">
                          {row.label}
                          {row.kind === 'or-group' && (
                            <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-zinc-500">
                              either/or
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[11px] tabular-nums text-zinc-500">{row.detail}</p>
                        {row.subdetails?.map((line) => (
                          <p
                            key={line}
                            className="mt-0.5 text-[10px] tabular-nums text-zinc-600"
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                      <p className="shrink-0 text-xs font-semibold tabular-nums text-[var(--accent-300)]">
                        +{formatScorePts(row.scoreEarned)}
                        <span className="font-normal text-zinc-600">
                          {' '}
                          / {formatScorePts(row.scoreMax)}
                        </span>
                      </p>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-[var(--accent-500)]/80"
                        style={{
                          width: `${
                            row.scoreMax > 0
                              ? Math.min(100, Math.max(0, (row.scoreEarned / row.scoreMax) * 100))
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export function HomePulseCard({
  score,
  contributors = [],
  scale = PULSE_HEADER_SCALE,
  className,
  meterClassName,
  onDisplayScoreChange,
  onBreakdownOpenChange,
}: HomePulseCardProps) {
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)
  const timerRef = useRef<number | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const corePx = pulseCorePx(scale)
  const onBreakdownOpenChangeRef = useRef(onBreakdownOpenChange)
  onBreakdownOpenChangeRef.current = onBreakdownOpenChange

  const clearOpenTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const clearCloseTimer = () => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const handleEnter = () => {
    clearOpenTimer()
    clearCloseTimer()
    if (closing) {
      setClosing(false)
      onBreakdownOpenChangeRef.current?.(true)
      return
    }
    if (mounted) {
      onBreakdownOpenChangeRef.current?.(true)
      return
    }
    timerRef.current = window.setTimeout(() => {
      setMounted(true)
      onBreakdownOpenChangeRef.current?.(true)
    }, HOVER_DELAY_MS)
  }

  const handleLeave = () => {
    clearOpenTimer()
    if (!mounted) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => {
      setMounted(false)
      setClosing(false)
      onBreakdownOpenChangeRef.current?.(false)
    }, BREAKDOWN_ANIMATION_MS)
  }

  useEffect(() => {
    return () => {
      clearOpenTimer()
      clearCloseTimer()
      onBreakdownOpenChangeRef.current?.(false)
    }
  }, [])

  return (
    <div
      className={cn('relative rounded-full', className)}
      style={{ width: corePx, height: corePx }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      <PulseMeter
        score={score}
        scale={scale}
        className={meterClassName}
        onDisplayScoreChange={onDisplayScoreChange}
      />

      <NavLink
        to="/overview"
        aria-label="Open Overview pulse history"
        className="absolute inset-0 z-10 rounded-full"
      />

      <div
        className={cn(
          'absolute left-1/2 top-full z-40 -translate-x-1/2 pt-1',
          !mounted && 'pointer-events-none',
        )}
        aria-hidden={!mounted || closing}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {mounted ? (
          <PulseBreakdownPanel
            contributors={contributors}
            score={score}
            closing={closing}
          />
        ) : null}
      </div>
    </div>
  )
}
