import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Trophy, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  playWeeklyGoalFailSound,
  playWeeklyGoalWinSound,
  warmAudioContext,
} from '@/lib/timerSound'
import type { WeeklyShutdownGoalSummary, WeeklyReviewStat } from '@/lib/weeklyShutdown'
import { cn } from '@/lib/utils'

interface WeeklyGoalRevealModalProps {
  summaries: WeeklyShutdownGoalSummary[]
  untargetedStats: WeeklyReviewStat[]
  weekLabel: string
  onClose: () => void
}

const BAR_DURATION_MS = 2000
/** Each bar starts this long after the previous — ends stay ~1.5s apart with overlapping fills. */
const BAR_START_STAGGER_MS = 1500
const INTRO_BEFORE_BAR_MS = 500
/** Weight bars sit at last week's position this long before animating to this week. */
const WEIGHT_HOLD_MS = 1800
/** Extra pause after the weight bar finishes before workout/daily goals animate. */
const POST_WEIGHT_GAP_MS = 2200
const SOUND_BEFORE_BAR_END_MS = 500
const PAUSE_BEFORE_FINALE_MS = 600
const STAT_INTRO_MS = 450
const STAT_HOLD_MS = 1100
/** Max scrollable review body height. */
const BODY_MAX_PX = 520

function formatPercent(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function GoalRevealCard({
  summary,
  cardIndex,
  isAfterWeight = false,
  postWeightIndex = 0,
  onBarComplete,
}: {
  summary: WeeklyShutdownGoalSummary
  cardIndex: number
  isAfterWeight?: boolean
  postWeightIndex?: number
  onBarComplete?: () => void
}) {
  const isWeight = summary.isWeight
  const barStart = isWeight ? (summary.percentBefore ?? 0) : 0
  const barEnd = isWeight ? summary.percent : Math.min(100, summary.percent)
  const barStartDelayMs = isWeight
    ? WEIGHT_HOLD_MS
    : isAfterWeight
      ? WEIGHT_HOLD_MS + BAR_DURATION_MS + POST_WEIGHT_GAP_MS + postWeightIndex * BAR_START_STAGGER_MS
      : INTRO_BEFORE_BAR_MS + cardIndex * BAR_START_STAGGER_MS
  const barDurationMs = BAR_DURATION_MS
  const [widthPct, setWidthPct] = useState(barStart)
  const [barReady, setBarReady] = useState(false)
  const [weightAnimating, setWeightAnimating] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const barDoneRef = useRef(false)
  const barFillRef = useRef<HTMLDivElement>(null)
  const onBarCompleteRef = useRef(onBarComplete)
  onBarCompleteRef.current = onBarComplete

  useEffect(() => {
    setWidthPct(barStart)
    setBarReady(false)
    setWeightAnimating(false)
    setRevealed(false)
    barDoneRef.current = false

    let holdTimer: number | undefined
    let soundTimer: number | undefined
    let fallbackTimer: number | undefined

    const revealResult = () => {
      setRevealed(true)
      if (summary.hit) {
        playWeeklyGoalWinSound()
      } else {
        playWeeklyGoalFailSound()
      }
    }

    const finishBar = () => {
      if (barDoneRef.current) return
      barDoneRef.current = true
      onBarCompleteRef.current?.()
    }

    const startBarAnimation = () => {
      const el = barFillRef.current
      if (!el) return

      const onTransitionEnd = (e: TransitionEvent) => {
        if (e.propertyName !== 'width' || e.target !== el) return
        el.removeEventListener('transitionend', onTransitionEnd)
        if (fallbackTimer != null) window.clearTimeout(fallbackTimer)
        finishBar()
      }

      el.addEventListener('transitionend', onTransitionEnd)
      if (isWeight) setWeightAnimating(true)
      setBarReady(true)
      setWidthPct(barStart)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setWidthPct(barEnd))
      })

      soundTimer = window.setTimeout(revealResult, Math.max(0, barDurationMs - SOUND_BEFORE_BAR_END_MS))

      fallbackTimer = window.setTimeout(() => {
        el.removeEventListener('transitionend', onTransitionEnd)
        finishBar()
      }, barDurationMs + 32)
    }

    // Weight: bar is already at last week's position on mount — hold, then animate.
    // Other goals: wait for stagger, then fill from zero.
    holdTimer = window.setTimeout(startBarAnimation, barStartDelayMs)

    return () => {
      if (holdTimer != null) window.clearTimeout(holdTimer)
      if (soundTimer != null) window.clearTimeout(soundTimer)
      if (fallbackTimer != null) window.clearTimeout(fallbackTimer)
    }
  }, [
    summary.id,
    summary.percent,
    summary.hit,
    isWeight,
    barStart,
    barEnd,
    barStartDelayMs,
    barDurationMs,
  ])

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-zinc-950/80 p-4 transition-[border-color,box-shadow] duration-500',
        revealed && summary.hit
          ? 'border-emerald-500 shadow-[0_0_24px_rgba(16,185,129,0.2)]'
          : revealed && !summary.hit
            ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.12)]'
            : 'border-zinc-800/80',
      )}
    >
      {revealed && summary.hit && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent" />
      )}

      <div className="relative">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
              {summary.isWorkout
                ? summary.kind === 'weekly'
                  ? 'Workout · weekly total'
                  : 'Workout · daily avg'
                : summary.isWeight
                  ? summary.weightMode === 'bulk'
                    ? 'Weight · bulk'
                    : 'Weight · cut'
                  : summary.kind === 'weekly'
                    ? 'Weekly'
                    : 'Week avg'}
            </p>
            <h3 className="mt-0.5 truncate text-base font-semibold text-zinc-50">{summary.name}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">{summary.detail}</p>
        </div>

        <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-zinc-800/80 ring-1 ring-zinc-700/50">
          <div
            ref={barFillRef}
            className={cn(
              'relative h-full rounded-full',
              isWeight && !weightAnimating && !revealed
                ? 'bg-gradient-to-r from-zinc-400 via-zinc-500 to-zinc-600'
                : summary.isWeight && summary.hit
                  ? 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600'
                  : summary.isWeight && !summary.hit
                    ? 'bg-gradient-to-r from-red-400 via-red-500 to-red-600'
                    : summary.hit
                      ? 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600'
                      : 'bg-gradient-to-r from-[var(--accent-400)] via-[var(--accent-500)] to-[var(--accent-600)]',
              !summary.isWeight && summary.percent > 100 && revealed && 'shadow-[0_0_8px_rgba(16,185,129,0.5)]',
            )}
            style={{
              width: `${widthPct}%`,
              transitionProperty: 'width',
              transitionDuration: barReady ? `${barDurationMs}ms` : '0ms',
              transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          {summary.isWeight ? (
            <span className="text-sm font-medium tabular-nums text-zinc-100">
              {summary.weightLabel ?? summary.detail}
            </span>
          ) : (
            <span
              className={cn(
                'text-xl font-light tabular-nums',
                summary.percent >= 100 ? 'text-emerald-300' : 'text-zinc-100',
              )}
            >
              {formatPercent(summary.percent)}
              <span className="text-sm text-zinc-500">%</span>
            </span>
          )}
          {revealed && summary.hit && (
            <span className="text-xs font-medium text-emerald-400">
              {summary.isWeight
                ? 'Good week'
                : summary.percent > 100
                  ? 'Crushed it!'
                  : 'Goal crushed!'}
            </span>
          )}
          {revealed && !summary.hit && (
            <span className="text-xs font-medium text-red-400/90">
              {summary.isWeight ? 'Off track' : 'Missed'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function StatRevealCard({
  stat,
  compact = false,
}: {
  stat: WeeklyReviewStat
  compact?: boolean
}) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    setRevealed(false)
    const introTimer = window.setTimeout(() => setRevealed(true), STAT_INTRO_MS)
    return () => clearTimeout(introTimer)
  }, [stat.id])

  return (
    <div
      className={cn(
        'relative h-full overflow-hidden rounded-xl border bg-zinc-950/80 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
        compact ? 'p-3.5' : 'p-4',
        revealed
          ? 'border-[var(--accent-500)]/30 shadow-[0_0_20px_var(--accent-glow)]'
          : 'border-zinc-800/80 opacity-0 translate-y-3',
      )}
    >
      {revealed && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--accent-500)]/8 via-transparent to-transparent" />
      )}

      <div className="relative">
        <p
          className={cn(
            'text-[10px] font-medium uppercase tracking-widest text-zinc-500 transition-all duration-500',
            revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
          )}
        >
          {stat.label}
        </p>
        <p
          className={cn(
            'mt-1.5 font-light tabular-nums tracking-tight text-zinc-50 transition-all duration-700 delay-100 ease-[cubic-bezier(0.22,1,0.36,1)]',
            compact ? 'text-2xl' : 'text-3xl',
            revealed ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
          )}
        >
          {stat.value}
        </p>
        <p
          className={cn(
            'mt-1.5 text-[11px] leading-snug text-zinc-500 transition-all duration-500 delay-200',
            revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
          )}
        >
          {stat.detail}
        </p>
      </div>
    </div>
  )
}

export function WeeklyGoalRevealModal({
  summaries,
  untargetedStats,
  weekLabel,
  onClose,
}: WeeklyGoalRevealModalProps) {
  const weeklyGoals = useMemo(
    () => summaries.filter((s) => s.kind === 'weekly' && !s.isWorkout && !s.isWeight),
    [summaries],
  )
  const weightGoals = useMemo(() => summaries.filter((s) => s.isWeight), [summaries])
  const workoutGoals = useMemo(() => summaries.filter((s) => s.isWorkout), [summaries])
  const dailyGoals = useMemo(
    () => summaries.filter((s) => s.kind === 'daily' && !s.isWorkout && !s.isWeight),
    [summaries],
  )
  const orderedGoals = useMemo(
    () => [...weeklyGoals, ...weightGoals, ...workoutGoals, ...dailyGoals],
    [weeklyGoals, weightGoals, workoutGoals, dailyGoals],
  )
  const lastWeightIndex = useMemo(() => {
    let last = -1
    orderedGoals.forEach((g, i) => {
      if (g.isWeight) last = i
    })
    return last
  }, [orderedGoals])

  const [showGoals, setShowGoals] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showFinale, setShowFinale] = useState(false)
  const goalsCompletedRef = useRef(0)
  const [bodyHeight, setBodyHeight] = useState(120)
  const [bodyMaxPx, setBodyMaxPx] = useState(BODY_MAX_PX)
  const bodyContentRef = useRef<HTMLDivElement>(null)
  const bottomAnchorRef = useRef<HTMLDivElement>(null)

  const hits = orderedGoals.filter((g) => g.hit).length

  const scrollToBottom = useCallback(() => {
    const anchor = bottomAnchorRef.current
    if (!anchor) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    anchor.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'end',
    })
  }, [])

  useEffect(() => {
    warmAudioContext()
  }, [])

  useEffect(() => {
    goalsCompletedRef.current = 0
    setShowGoals(false)
    setShowStats(false)
    setShowFinale(false)
  }, [summaries, untargetedStats])

  useEffect(() => {
    if (orderedGoals.length === 0) {
      if (untargetedStats.length > 0) {
        const t = window.setTimeout(() => setShowStats(true), 600)
        return () => clearTimeout(t)
      }
      const t = window.setTimeout(() => setShowFinale(true), 800)
      return () => clearTimeout(t)
    }
    const t = window.setTimeout(() => setShowGoals(true), 600)
    return () => clearTimeout(t)
  }, [orderedGoals.length, untargetedStats.length])

  useEffect(() => {
    if (!showStats || untargetedStats.length === 0) return
    const t = window.setTimeout(() => setShowFinale(true), STAT_INTRO_MS + STAT_HOLD_MS)
    return () => clearTimeout(t)
  }, [showStats, untargetedStats.length])

  useEffect(() => {
    const t = window.setTimeout(scrollToBottom, 60)
    return () => clearTimeout(t)
  }, [showGoals, showFinale, showStats, scrollToBottom])

  useEffect(() => {
    const updateViewportCap = () => {
      setBodyMaxPx(Math.min(window.innerHeight * 0.62, BODY_MAX_PX))
    }
    updateViewportCap()
    window.addEventListener('resize', updateViewportCap)
    return () => window.removeEventListener('resize', updateViewportCap)
  }, [])

  useEffect(() => {
    const el = bodyContentRef.current
    if (!el) return

    const updateHeight = () => {
      const next = Math.min(el.scrollHeight, bodyMaxPx)
      setBodyHeight(Math.max(120, next))
      window.setTimeout(scrollToBottom, 60)
    }

    updateHeight()
    const ro = new ResizeObserver(updateHeight)
    ro.observe(el)
    return () => ro.disconnect()
  }, [showGoals, showFinale, orderedGoals.length, scrollToBottom, showStats, bodyMaxPx])

  const handleGoalBarComplete = useCallback(() => {
    goalsCompletedRef.current += 1
    if (goalsCompletedRef.current < orderedGoals.length) return

    if (untargetedStats.length > 0) {
      window.setTimeout(() => setShowStats(true), PAUSE_BEFORE_FINALE_MS)
    } else {
      window.setTimeout(() => setShowFinale(true), PAUSE_BEFORE_FINALE_MS)
    }
  }, [orderedGoals.length, untargetedStats.length])

  const reviewStarted = showGoals || showStats || showFinale

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--accent-500)]/30 bg-[#0c0c14] shadow-2xl shadow-[var(--accent-500)]/10 transition-[height] duration-[550ms] ease-[cubic-bezier(0.22,1,0.36,1)]">
        <div className="shrink-0 border-b border-zinc-800/80 bg-gradient-to-br from-[var(--accent-950)]/60 to-transparent px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-500)]">
                <Sparkles size={18} className="text-black" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-50">Your week in review</h2>
                <p className="text-xs text-[var(--accent-300)]">{weekLabel}</p>
              </div>
            </div>
            {!showFinale && (
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <div
          className="overflow-hidden transition-[height] duration-[550ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ height: bodyHeight }}
        >
          <div
            ref={bodyContentRef}
            className="overflow-y-auto px-6 py-5"
            style={{ maxHeight: bodyMaxPx }}
          >
            {!reviewStarted && (
              <p className="py-8 text-center text-sm text-zinc-500">Loading your week…</p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {showGoals &&
                orderedGoals.map((goal, index) => {
                  const prev = index > 0 ? orderedGoals[index - 1] : null
                  const isFirstWeekly =
                    !goal.isWorkout &&
                    !goal.isWeight &&
                    goal.kind === 'weekly' &&
                    (!prev || prev.isWorkout || prev.isWeight || prev.kind !== 'weekly')
                  const isFirstWeight = goal.isWeight && !prev?.isWeight
                  const isFirstWorkout = goal.isWorkout && !prev?.isWorkout
                  const isFirstDaily =
                    !goal.isWorkout &&
                    !goal.isWeight &&
                    goal.kind === 'daily' &&
                    (!prev || prev.isWorkout || prev.isWeight || prev.kind !== 'daily')

                  return (
                    <div key={goal.id} className="contents">
                      {isFirstWeekly && weeklyGoals.length > 0 && (
                        <p className="col-span-full mb-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-600">
                          Weekly goals
                        </p>
                      )}
                      {isFirstWeight && weightGoals.length > 0 && (
                        <p className="col-span-full mb-0.5 mt-1 text-[10px] font-medium uppercase tracking-widest text-zinc-600">
                          Weight goal
                        </p>
                      )}
                      {isFirstWorkout && workoutGoals.length > 0 && (
                        <p className="col-span-full mb-0.5 mt-1 text-[10px] font-medium uppercase tracking-widest text-zinc-600">
                          Workout goals
                        </p>
                      )}
                      {isFirstDaily && (
                        <p className="col-span-full mb-0.5 mt-1 text-[10px] font-medium uppercase tracking-widest text-zinc-600">
                          Daily goals · week average
                        </p>
                      )}
                      <div className="animate-[slideUp_0.55s_cubic-bezier(0.22,1,0.36,1)]">
                        <GoalRevealCard
                          summary={goal}
                          cardIndex={index}
                          isAfterWeight={lastWeightIndex >= 0 && index > lastWeightIndex}
                          postWeightIndex={lastWeightIndex >= 0 && index > lastWeightIndex ? index - lastWeightIndex - 1 : 0}
                          onBarComplete={handleGoalBarComplete}
                        />
                      </div>
                    </div>
                  )
                })}

              {showStats && (
                <p className="col-span-full mb-0.5 mt-2 text-[10px] font-medium uppercase tracking-widest text-zinc-600">
                  Also this week
                </p>
              )}
              {showStats &&
                untargetedStats.map((stat) => (
                  <StatRevealCard key={stat.id} stat={stat} compact />
                ))}
            </div>

            {showFinale && (
              <div className="mt-4 animate-[slideUp_0.55s_cubic-bezier(0.22,1,0.36,1)]">
                <div className="rounded-xl border border-[var(--accent-500)]/25 bg-zinc-900/80 p-5 text-center sm:px-8">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-500)] shadow-lg shadow-[var(--accent-500)]/30">
                    <Trophy size={22} className="text-black" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-50">Week complete</h3>
                  {orderedGoals.length > 0 ? (
                    <p className="mt-2 text-sm text-[var(--accent-300)]">
                      {hits} of {orderedGoals.length} goals hit
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-500">
                      Add goals to track your progress next week.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div ref={bottomAnchorRef} className="h-px shrink-0" aria-hidden />
          </div>
        </div>

        {showFinale && (
          <div className="shrink-0 border-t border-zinc-800/80 px-6 py-5 animate-[slideUp_0.5s_cubic-bezier(0.22,1,0.36,1)]">
            <Button
              onClick={onClose}
              className="w-full bg-[var(--accent-500)] font-bold text-black hover:bg-[var(--accent-400)]"
            >
              Start fresh
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
