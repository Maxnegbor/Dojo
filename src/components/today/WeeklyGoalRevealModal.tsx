import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Check, Sparkles, Trophy, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GoalPaceBar } from '@/components/ui/GoalPaceBar'
import {
  SplitAccentProgressBar,
} from '@/components/ui/SplitAccentProgressBar'
import type {
  WeeklyShutdownGoalSummary,
  WeeklyReviewStat,
  WeeklyHabitReviewSummary,
} from '@/lib/weeklyShutdown'
import { cn } from '@/lib/utils'

interface WeeklyGoalRevealModalProps {
  summaries: WeeklyShutdownGoalSummary[]
  untargetedStats: WeeklyReviewStat[]
  habitSummaries?: WeeklyHabitReviewSummary[]
  weekLabel: string
  onClose: () => void
}

const BAR_DURATION_MS = 1400
const INTRO_BEFORE_BAR_MS = 350
const STATS_EXTRA_DELAY_MS = 450
const STAT_STAGGER_MS = 90
const FOOTER_EXTRA_DELAY_MS = 350

function formatPercent(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function goalKindLabel(summary: WeeklyShutdownGoalSummary): string {
  if (summary.metricKey === 'focus') {
    return summary.kind === 'weekly' ? 'Focus · weekly goal' : 'Focus · daily goal'
  }
  if (summary.isWorkout) {
    return summary.kind === 'weekly' ? 'Workout · weekly goal' : 'Workout · daily goal'
  }
  if (summary.isWeight) {
    if (summary.weightMode === 'maintain') return 'Weight · maintain'
    return summary.weightMode === 'bulk' ? 'Weight · bulk' : 'Weight · cut'
  }
  return summary.kind === 'weekly' ? 'Weekly goal' : 'Daily goal'
}

function reviewHitLabel(summary: WeeklyShutdownGoalSummary): string {
  if (summary.isWeight) return 'Good week'
  if (summary.usesPaceReview) return 'On track'
  return summary.percent > 100 ? 'Crushed it!' : 'Goal crushed!'
}

function reviewMissLabel(summary: WeeklyShutdownGoalSummary): string {
  if (summary.isWeight) return 'Off track'
  if (summary.usesPaceReview) return 'Behind'
  return 'Missed'
}

function HabitDayRing({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-1 sm:h-[18px] sm:w-[18px]',
          done
            ? 'bg-emerald-500/15 ring-emerald-500/50 text-emerald-400'
            : 'bg-red-500/10 ring-red-500/40 text-red-400',
        )}
        aria-label={done ? 'Done' : 'Missed'}
      >
        {done ? <Check size={9} strokeWidth={3} /> : <X size={9} strokeWidth={3} />}
      </span>
      <span className="truncate text-[7px] font-medium uppercase text-zinc-600 sm:text-[8px]">
        {label}
      </span>
    </div>
  )
}

function HabitReviewCard({ habit }: { habit: WeeklyHabitReviewSummary }) {
  const doneCount = habit.days.filter((d) => d.done).length
  const isDaily = habit.logPeriod === 'daily'

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-zinc-800/80 bg-zinc-950 px-2 py-1.5">
      <div className="flex items-center justify-between gap-1.5">
        <p className="min-w-0 truncate text-[10px] font-medium text-zinc-200">{habit.label}</p>
        {isDaily && (
          <span className="shrink-0 text-[9px] tabular-nums text-zinc-500">
            {doneCount}/{habit.days.length}
          </span>
        )}
      </div>
      <div className={cn('mt-auto flex gap-0.5 pt-1.5', isDaily ? 'justify-between' : 'justify-start')}>
        {habit.days.map((day) => (
          <HabitDayRing key={day.date} done={day.done} label={day.dayLabel} />
        ))}
      </div>
    </div>
  )
}

function StatReviewCard({ stat }: { stat: WeeklyReviewStat }) {
  return (
    <div className="flex h-full flex-col rounded-md border border-[var(--accent-500)]/20 bg-zinc-950 px-2 py-1.5">
      <p className="truncate text-[8px] font-medium uppercase tracking-widest text-zinc-500">
        {stat.label}
      </p>
      <p className="mt-auto truncate pt-1 text-sm font-light tabular-nums text-zinc-50">{stat.value}</p>
      <p className="truncate text-[9px] text-zinc-500">{stat.detail}</p>
    </div>
  )
}

function WeightWeekProgressBar({
  percentBefore,
  percentAfter,
  size = 'md',
  /** Gray bar width on the campaign scale (last week; may shrink on loss). */
  grayPct,
  /** Green segment width beyond gray (gain only). */
  greenPct = 0,
  animate = false,
  barReady = false,
  barDurationMs = BAR_DURATION_MS,
  fillRef,
}: {
  percentBefore: number
  percentAfter: number
  size?: 'sm' | 'md'
  grayPct: number
  greenPct?: number
  animate?: boolean
  barReady?: boolean
  barDurationMs?: number
  fillRef?: RefObject<HTMLDivElement | null>
}) {
  const lastPct = Math.min(100, Math.max(0, percentBefore))
  const thisPct = Math.min(100, Math.max(0, percentAfter))
  const gained = thisPct > lastPct
  const lost = thisPct < lastPct
  const overlapPx = size === 'sm' ? 1 : 2
  const clampedGray = Math.min(100, Math.max(0, grayPct))
  const clampedGreen = Math.min(100 - clampedGray, Math.max(0, greenPct))
  const transition =
    animate && barReady
      ? `width ${barDurationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`
      : undefined

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-full bg-zinc-800 ring-1 ring-zinc-700/50',
        size === 'sm' ? 'h-1.5' : 'h-2.5',
      )}
    >
      {lost && (
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-red-400 via-red-500 to-red-600"
          style={{ width: `${thisPct}%` }}
        >
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/15 to-transparent" />
        </div>
      )}

      {gained && (
        <div
          ref={fillRef}
          className="absolute inset-y-0 z-[5] rounded-r-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600"
          style={{
            left: `calc(${clampedGray}% - ${overlapPx}px)`,
            width:
              clampedGreen > 0
                ? `calc(${clampedGreen}% + ${overlapPx}px)`
                : '0%',
            transition,
          }}
        >
          <div className="absolute inset-0 rounded-r-full bg-gradient-to-b from-white/20 to-transparent" />
        </div>
      )}

      <div
        ref={lost ? fillRef : undefined}
        className={cn(
          'absolute inset-y-0 left-0 z-10 bg-zinc-500',
          gained ? 'rounded-l-full' : 'rounded-full',
        )}
        style={{
          width: `${clampedGray}%`,
          transition: lost ? transition : undefined,
        }}
        title="Last week's average"
      />
    </div>
  )
}

function GoalRevealCard({
  summary,
  barsActive,
  barDurationMs,
  featured = false,
  compact = false,
}: {
  summary: WeeklyShutdownGoalSummary
  barsActive: boolean
  barDurationMs: number
  featured?: boolean
  compact?: boolean
}) {
  const isCompact = compact && !featured
  const isWeight = summary.isWeight
  const showPriorPeriod = summary.usesPaceReview === true
  const rawBeforePct = Math.min(100, Math.max(0, summary.percentBefore ?? 0))
  const beforePct = showPriorPeriod ? rawBeforePct : 0
  const afterPct = Math.min(100, Math.max(0, summary.percent))
  const lastPct = isWeight ? rawBeforePct : beforePct
  const thisPct = isWeight ? afterPct : afterPct
  const gainPct = showPriorPeriod ? afterPct - rawBeforePct : afterPct
  const isDecrease = showPriorPeriod && gainPct < -0.01
  const showRoundedJunction = showPriorPeriod && gainPct > 0.01 && rawBeforePct > 0.01
  const hitTarget = summary.usesPaceReview ? summary.hit : afterPct >= 100
  const weightGained = thisPct > lastPct
  const weightLost = thisPct < lastPct
  const barStartDelayMs = INTRO_BEFORE_BAR_MS
  const gainDelta = Math.max(0, thisPct - lastPct)
  const [grayPct, setGrayPct] = useState(isWeight ? lastPct : 0)
  const [greenPct, setGreenPct] = useState(0)
  const [barReady, setBarReady] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const barDoneRef = useRef(false)
  const barFillRef = useRef<HTMLDivElement>(null)

  // Non-weight bars: split accent animation (increase junction or decrease layer)
  const [clipWidth, setClipWidth] = useState(beforePct)
  const [gainWidth, setGainWidth] = useState(0)
  const [animating, setAnimating] = useState(false)
  const crushed = !isWeight && !summary.usesPaceReview && summary.percent >= 100

  useEffect(() => {
    if (!barsActive) return

    setBarReady(false)
    setRevealed(false)
    barDoneRef.current = false

    if (isWeight) {
      setGrayPct(lastPct)
      setGreenPct(0)
    } else {
      setClipWidth(beforePct)
      setGainWidth(0)
      setAnimating(false)
    }

    let holdTimer: number | undefined
    let fallbackTimer: number | undefined

    const finishBar = () => {
      if (barDoneRef.current) return
      barDoneRef.current = true
      setRevealed(true)
    }

    const startBarAnimation = () => {
      const el = barFillRef.current

      const onTransitionEnd = (e: TransitionEvent) => {
        if (!el || e.propertyName !== 'width' || e.target !== el) return
        el.removeEventListener('transitionend', onTransitionEnd)
        if (fallbackTimer != null) window.clearTimeout(fallbackTimer)
        finishBar()
      }

      if (isWeight) {
        setBarReady(false)
        setGrayPct(lastPct)
        setGreenPct(0)

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setBarReady(true)
            requestAnimationFrame(() => {
              const animEl = barFillRef.current
              if (animEl && (weightGained || weightLost)) {
                animEl.addEventListener('transitionend', onTransitionEnd)
                fallbackTimer = window.setTimeout(() => {
                  animEl.removeEventListener('transitionend', onTransitionEnd)
                  finishBar()
                }, barDurationMs + 32)
              } else {
                window.setTimeout(finishBar, 32)
              }
              if (weightGained) {
                setGreenPct(gainDelta)
              } else if (weightLost) {
                setGrayPct(thisPct)
              }
            })
          })
        })
      } else {
        if (!el) return
        el.addEventListener('transitionend', onTransitionEnd)
        setAnimating(true)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (showRoundedJunction) {
              setGainWidth(gainPct)
            } else {
              setClipWidth(afterPct)
            }
          })
        })
        fallbackTimer = window.setTimeout(() => {
          el.removeEventListener('transitionend', onTransitionEnd)
          finishBar()
        }, barDurationMs + 32)
      }
    }

    holdTimer = window.setTimeout(startBarAnimation, barStartDelayMs)

    return () => {
      if (holdTimer != null) window.clearTimeout(holdTimer)
      if (fallbackTimer != null) window.clearTimeout(fallbackTimer)
    }
  }, [
    barsActive,
    barDurationMs,
    summary.id,
    summary.percent,
    summary.hit,
    isWeight,
    lastPct,
    thisPct,
    weightGained,
    weightLost,
    gainDelta,
    barStartDelayMs,
    beforePct,
    afterPct,
    gainPct,
    showRoundedJunction,
  ])

  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-zinc-950 transition-[border-color,box-shadow] duration-300',
        featured ? 'p-2' : 'p-1.5',
        featured &&
          !revealed &&
          'border-[var(--accent-500)]/35 bg-gradient-to-br from-[var(--accent-950)]/40 to-zinc-950 ring-1 ring-[var(--accent-500)]/20',
        revealed && crushed && 'goal-card-shine border-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.25)]',
        revealed && summary.hit && !crushed
          ? 'border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.12)]'
          : revealed && !summary.hit
            ? 'border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.08)]'
            : !revealed && !featured && 'border-zinc-800/80',
      )}
    >
      {revealed && crushed && (
        <div className="pointer-events-none absolute inset-0 goal-card-shine-sweep" aria-hidden />
      )}
      {revealed && summary.hit && !crushed && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent" />
      )}

      <div className="relative">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <p className="text-[8px] font-medium uppercase tracking-widest text-zinc-500">
              {goalKindLabel(summary)}
            </p>
            <h3
              className={cn(
                'truncate font-semibold leading-tight text-zinc-50',
                featured ? 'text-sm' : 'text-xs',
              )}
            >
              {summary.name}
            </h3>
          </div>
          {(isCompact || featured) && revealed && (
            <span
              className={cn(
                'shrink-0 text-[9px] font-medium',
                summary.hit ? 'text-emerald-400' : 'text-red-400/90',
              )}
            >
              {summary.hit ? reviewHitLabel(summary) : reviewMissLabel(summary)}
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[8px] leading-tight text-zinc-500">{summary.detail}</p>

        {isWeight ? (
          <div className="mt-1">
            <WeightWeekProgressBar
              percentBefore={lastPct}
              percentAfter={thisPct}
              grayPct={grayPct}
              greenPct={greenPct}
              animate
              barReady={barReady}
              barDurationMs={barDurationMs}
              size="sm"
              fillRef={barFillRef}
            />
          </div>
        ) : (
          <div className="mt-1">
            <SplitAccentProgressBar
              beforePct={beforePct}
              fillPct={isDecrease ? clipWidth : showRoundedJunction ? afterPct : clipWidth}
              gainPct={showRoundedJunction ? (animating ? gainWidth : 0) : gainPct}
              hitTarget={hitTarget}
              animating={animating}
              durationMs={barDurationMs}
              fillRef={barFillRef}
              isDecrease={isDecrease}
              size="sm"
            />
            {summary.showPaceBar && summary.timeElapsedPercent != null && (
              <GoalPaceBar percent={summary.timeElapsedPercent} size="sm" />
            )}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between pt-1">
          {summary.isWeight ? (
            <span className="truncate text-[10px] font-medium tabular-nums text-zinc-100">
              {summary.weightLabel ?? summary.detail}
            </span>
          ) : (
            <span
              className={cn(
                'font-light tabular-nums',
                featured ? 'text-base' : 'text-sm',
                summary.percent >= 100 ? 'text-emerald-300' : 'text-zinc-100',
              )}
            >
              {formatPercent(summary.percent)}
              <span className="text-[10px] text-zinc-500">%</span>
            </span>
          )}
          {!isCompact && !featured && revealed && summary.hit && (
            <span className="text-[9px] font-medium text-emerald-400">
              {reviewHitLabel(summary)}
            </span>
          )}
          {!isCompact && !featured && revealed && !summary.hit && (
            <span className="text-[9px] font-medium text-red-400/90">
              {reviewMissLabel(summary)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="col-span-full pt-0.5 text-[8px] font-medium uppercase tracking-widest text-zinc-600">
      {children}
    </p>
  )
}

function isFocusSummary(summary: WeeklyShutdownGoalSummary): boolean {
  return summary.metricKey === 'focus'
}

export function WeeklyGoalRevealModal({
  summaries,
  untargetedStats,
  habitSummaries = [],
  weekLabel,
  onClose,
}: WeeklyGoalRevealModalProps) {
  const focusGoals = useMemo(() => summaries.filter(isFocusSummary), [summaries])
  const weeklyGoals = useMemo(
    () => summaries.filter((s) => s.kind === 'weekly' && !s.isWorkout && !s.isWeight && !isFocusSummary(s)),
    [summaries],
  )
  const weightGoals = useMemo(() => summaries.filter((s) => s.isWeight), [summaries])
  const workoutGoals = useMemo(() => summaries.filter((s) => s.isWorkout), [summaries])
  const dailyGoals = useMemo(
    () => summaries.filter((s) => s.kind === 'daily' && !s.isWorkout && !s.isWeight && !isFocusSummary(s)),
    [summaries],
  )
  const orderedGoals = useMemo(
    () => [...focusGoals, ...weightGoals, ...workoutGoals, ...weeklyGoals, ...dailyGoals],
    [focusGoals, weightGoals, workoutGoals, weeklyGoals, dailyGoals],
  )

  const hasContent =
    orderedGoals.length > 0 || untargetedStats.length > 0 || habitSummaries.length > 0

  const [barsActive, setBarsActive] = useState(false)
  const [footerVisible, setFooterVisible] = useState(false)

  const hits = orderedGoals.filter((g) => g.hit).length

  const barSequenceDurationMs = useMemo(() => {
    if (orderedGoals.length === 0) return 0
    return INTRO_BEFORE_BAR_MS + BAR_DURATION_MS
  }, [orderedGoals.length])

  const statsBaseDelay = barSequenceDurationMs + STATS_EXTRA_DELAY_MS
  const footerDelay =
    statsBaseDelay + untargetedStats.length * STAT_STAGGER_MS + FOOTER_EXTRA_DELAY_MS

  useEffect(() => {
    setBarsActive(false)
    setFooterVisible(false)
    const barTimer = window.setTimeout(() => setBarsActive(true), 0)
    return () => clearTimeout(barTimer)
  }, [summaries, untargetedStats, habitSummaries])

  useEffect(() => {
    if (!barsActive) return
    const t = window.setTimeout(() => setFooterVisible(true), footerDelay)
    return () => clearTimeout(t)
  }, [barsActive, footerDelay])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-5">
      <style>{`
        @keyframes goalCardShineSweep {
          0% { transform: translateX(-120%) skewX(-12deg); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translateX(120%) skewX(-12deg); opacity: 0; }
        }
        .goal-card-shine-sweep {
          background: linear-gradient(
            105deg,
            transparent 35%,
            rgba(255, 255, 255, 0.14) 48%,
            rgba(167, 243, 208, 0.22) 52%,
            transparent 65%
          );
          animation: goalCardShineSweep 900ms cubic-bezier(0.22, 1, 0.36, 1) 150ms both;
        }
      `}</style>
      <div className="flex h-[min(92vh,820px)] w-full max-w-[min(96vw,68rem)] flex-col overflow-hidden rounded-2xl border border-[var(--accent-500)]/30 bg-[#0c0c14] shadow-2xl shadow-[var(--accent-500)]/10">
        <div className="shrink-0 border-b border-zinc-800/80 bg-gradient-to-br from-[var(--accent-950)]/60 to-transparent px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-500)]">
                <Sparkles size={14} className="text-black" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-zinc-50 sm:text-base">Your week in review</h2>
                <p className="truncate text-[11px] text-[var(--accent-300)]">{weekLabel}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {orderedGoals.length > 0 && (
                <p className="hidden text-xs tabular-nums text-zinc-400 sm:block">
                  <span className="font-medium text-[var(--accent-300)]">{hits}</span>
                  {' / '}
                  {orderedGoals.length} goals hit
                </p>
              )}
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-3 py-2 sm:px-3.5">
          {!hasContent && (
            <div className="flex h-full items-center justify-center py-8">
              <div className="text-center">
                <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-500)]">
                  <Trophy size={16} className="text-black" />
                </div>
                <p className="text-sm text-zinc-500">Add goals to track your progress next week.</p>
              </div>
            </div>
          )}

          {hasContent && (
            <div className="grid auto-rows-fr gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(9.75rem,1fr))] sm:[grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr))]">
              {orderedGoals.map((goal) => {
                const featured = isFocusSummary(goal)
                return (
                  <div
                    key={goal.id}
                    className={cn('min-h-0', featured && 'col-span-2 row-span-1 sm:col-span-2')}
                  >
                    <GoalRevealCard
                      summary={goal}
                      barsActive={barsActive}
                      barDurationMs={BAR_DURATION_MS}
                      featured={featured}
                      compact={!featured}
                    />
                  </div>
                )
              })}

              {barsActive && habitSummaries.length > 0 && (
                <>
                  <SectionLabel>Habits</SectionLabel>
                  {habitSummaries.map((habit) => (
                    <div
                      key={habit.id}
                      className={cn(
                        'min-h-0',
                        habit.logPeriod === 'daily' ? 'col-span-2' : 'col-span-1',
                      )}
                    >
                      <HabitReviewCard habit={habit} />
                    </div>
                  ))}
                </>
              )}

              {barsActive && untargetedStats.length > 0 && (
                <>
                  <SectionLabel>Also this week</SectionLabel>
                  {untargetedStats.map((stat) => (
                    <div key={stat.id} className="min-h-0">
                      <StatReviewCard stat={stat} />
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-800/80 px-4 py-2.5">
          {orderedGoals.length > 0 && (
            <p className="mb-3 text-center text-xs text-zinc-500 sm:hidden">
              {hits} of {orderedGoals.length} goals hit
            </p>
          )}
          {footerVisible && (
            <Button
              onClick={onClose}
              className="w-full bg-[var(--accent-500)] font-bold text-black hover:bg-[var(--accent-400)]"
            >
              Start fresh
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
