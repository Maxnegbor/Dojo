import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Sparkles, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  SplitAccentProgressBar,
  barLegendColors,
} from '@/components/ui/SplitAccentProgressBar'
import { HabitStreakBadge } from '@/components/today/HabitStreakBadge'
import { GoalProgressWithPace } from '@/components/ui/GoalProgressWithPace'
import { useSettings } from '@/context/SettingsContext'
import { deltaHasProgressToday } from '@/lib/dailyLogProgress'
import { goalProgressPeriodLabel, towardGoalLabel } from '@/lib/goalLabels'
import type { ProgressDelta } from '@/lib/metrics'
import { playGoalProgressSound, warmAudioContext } from '@/lib/timerSound'
import { cn, formatDate, formatDuration } from '@/lib/utils'
import { formatMetricAmount, usesTimedMetricDisplay } from '@/lib/timedMetrics'

export interface CompletedHabitSummary {
  label: string
  streak: number
}

interface GoalProgressModalProps {
  deltas: ProgressDelta[]
  untrackedFocusMinutes?: number | null
  onClose: () => void
  title?: string
  subtitle?: string
  buttonLabel?: string
  completedHabits?: CompletedHabitSummary[]
}

const BAR_DURATION_MS = 2000
const BAR_STAGGER_MS = 500
const BAR_INTRO_MS = 500

function formatGoalAmount(value: number, unit: string, metricKey?: string): string {
  if (usesTimedMetricDisplay(unit, metricKey)) return formatMetricAmount(value, unit, metricKey)
  if (unit === 'min') return formatDuration(value)
  return `${value} ${unit}`
}

function goalPeriodLabel(
  delta: ProgressDelta,
  asOfDate: string,
  weekStartsOn: 0 | 1,
): string {
  return goalProgressPeriodLabel(delta.goal, asOfDate, weekStartsOn)
}

function NoChangeGoalCard({ delta }: { delta: ProgressDelta }) {
  const beforePct = Math.min(100, Math.max(0, delta.percentBefore))

  return (
    <div className="flex items-center gap-2 rounded-md border border-zinc-800/50 bg-zinc-950/40 px-2.5 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-zinc-500">
        {delta.name}
      </span>
      <div className="hidden h-1 w-12 overflow-hidden rounded-full bg-zinc-800 sm:block">
        <div
          className="h-full rounded-full bg-zinc-600/70"
          style={{ width: `${beforePct}%` }}
        />
      </div>
      <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-zinc-600">
        No changes
      </span>
    </div>
  )
}

function formatSignedContribution(value: number, unit: string, metricKey?: string): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatGoalAmount(Math.abs(value), unit, metricKey)}`
}

function formatHours(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)} h`
}

function SimpleSleepGoalCard({ delta }: { delta: ProgressDelta }) {
  const todayHours = delta.todayValue ?? 0
  const target = delta.target ?? 0
  const diff = todayHours - target
  const hit = target > 0 && diff >= -0.05
  const missBy = Math.max(0, target - todayHours)
  const weekSoFar = delta.after
  const vsWeek = todayHours - weekSoFar

  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-3">
      <h3 className="text-xs font-semibold text-zinc-100">{delta.name}</h3>
      <p className="mt-1 text-[10px] text-zinc-500">
        Today&apos;s sleep ·{' '}
        <span className="text-zinc-300">
          {formatHours(todayHours)} / {formatHours(target)}
        </span>
      </p>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        {hit ? (
          <>
            <Check size={14} className="text-emerald-400" strokeWidth={2.5} />
            <span className="font-medium text-emerald-400">Hit target</span>
          </>
        ) : (
          <>
            <XCircle size={14} className="text-red-400" strokeWidth={2.5} />
            <span className="font-medium text-red-400/90">
              Missed target by {formatHours(missBy).replace(' h', 'h')}
            </span>
          </>
        )}
      </div>
      {weekSoFar > 0 && Math.abs(vsWeek) > 0.05 && (
        <p className="mt-2 text-[10px] text-zinc-500">
          {vsWeek < 0 ? '↓' : '↑'} {Math.abs(Math.round(vsWeek * 10) / 10).toFixed(1)}h vs your week so far
        </p>
      )}
    </div>
  )
}

function AnimatedGoalBar({
  delta,
  animIndex,
  playSound,
  asOfDate,
  weekStartsOn,
}: {
  delta: ProgressDelta
  animIndex: number
  playSound?: boolean
  asOfDate: string
  weekStartsOn: 0 | 1
}) {
  const beforePct = Math.min(100, Math.max(0, delta.percentBefore))
  const afterPct = Math.min(100, Math.max(0, delta.percentAfter))
  const gainPct = afterPct - beforePct
  const isDecrease = gainPct < -0.01
  const hitTarget = afterPct >= 100
  const { beforeColor, gainColor } = barLegendColors(hitTarget)
  const showRoundedJunction = gainPct > 0.01 && beforePct > 0.01

  const [clipWidth, setClipWidth] = useState(beforePct)
  const [gainWidth, setGainWidth] = useState(0)
  const [animating, setAnimating] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const soundPlayedRef = useRef(false)
  const fillRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    soundPlayedRef.current = false
    setClipWidth(beforePct)
    setGainWidth(0)
    setAnimating(false)
    setRevealed(false)

    const startDelay = BAR_INTRO_MS + animIndex * BAR_STAGGER_MS
    let soundTimer: number | undefined
    let fallbackTimer: number | undefined

    const startTimer = window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimating(true)
          if (showRoundedJunction) {
            setGainWidth(gainPct)
          } else {
            setClipWidth(afterPct)
          }

          const el = fillRef.current
          const onTransitionEnd = (e: TransitionEvent) => {
            if (!el || e.propertyName !== 'width' || e.target !== el) return
            el.removeEventListener('transitionend', onTransitionEnd)
            if (fallbackTimer != null) window.clearTimeout(fallbackTimer)
            setRevealed(true)
          }

          if (el) {
            el.addEventListener('transitionend', onTransitionEnd)
            fallbackTimer = window.setTimeout(() => {
              el.removeEventListener('transitionend', onTransitionEnd)
              setRevealed(true)
            }, BAR_DURATION_MS + 48)
          } else {
            setRevealed(true)
          }

          if (playSound && !soundPlayedRef.current && !isDecrease) {
            soundPlayedRef.current = true
            playGoalProgressSound({ hitTarget })
          }
        })
      })

      soundTimer = window.setTimeout(() => {
        setRevealed(true)
      }, BAR_DURATION_MS - 400)
    }, startDelay)

    return () => {
      window.clearTimeout(startTimer)
      if (soundTimer != null) window.clearTimeout(soundTimer)
      if (fallbackTimer != null) window.clearTimeout(fallbackTimer)
    }
  }, [afterPct, animIndex, beforePct, gainPct, hitTarget, isDecrease, playSound, showRoundedJunction])
  const showLegend =
    delta.usesWeekAverage ||
    delta.isWeekly ||
    delta.before > 0 ||
    Math.abs(delta.todayContribution) > 0.001

  return (
    <div
      className={cn(
        'rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-3 transition-[border-color,box-shadow] duration-500',
        revealed && hitTarget && 'border-[var(--accent-500)]/40 shadow-[0_0_20px_var(--accent-glow)]',
      )}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-zinc-100">{delta.name}</h3>
          <p className="text-[10px] text-zinc-500">
            {goalPeriodLabel(delta, asOfDate, weekStartsOn)}
            {' · '}
            <span className="text-zinc-300">
              {formatGoalAmount(delta.after, delta.unit, delta.goal.metric_key)} /{' '}
              {delta.target != null ? formatGoalAmount(delta.target, delta.unit, delta.goal.metric_key) : '—'}
            </span>
          </p>
        </div>
        {revealed && hitTarget && (
          <span className="rounded-full bg-[var(--accent-500)]/20 px-1.5 py-0.5 text-[9px] font-medium text-[var(--accent-300)]">
            Hit!
          </span>
        )}
      </div>

      <GoalProgressWithPace
        goal={delta.goal}
        asOfDate={asOfDate}
        weekStartsOn={weekStartsOn}
        size="md"
      >
        <SplitAccentProgressBar
          beforePct={beforePct}
          fillPct={isDecrease ? clipWidth : showRoundedJunction ? afterPct : clipWidth}
          gainPct={showRoundedJunction ? (animating ? gainWidth : 0) : gainPct}
          hitTarget={hitTarget}
          animating={animating}
          durationMs={BAR_DURATION_MS}
          fillRef={fillRef}
          isDecrease={isDecrease}
        />
      </GoalProgressWithPace>

      <div className="mt-1.5 text-[10px] text-zinc-500">
        {showLegend ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {delta.before > 0 && (
                <span>
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: beforeColor }}
                  />
                  {' '}
                  {formatGoalAmount(delta.before, delta.unit, delta.goal.metric_key)} before today
                </span>
              )}
              {Math.abs(delta.todayContribution) > 0.001 && (
                <span
                  className={cn(
                    'transition-opacity duration-300',
                    animating ? 'opacity-100' : 'opacity-40',
                    delta.todayContribution < 0 && 'text-red-400/90',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-1.5 w-1.5 rounded-full',
                      delta.todayContribution < 0 ? 'bg-red-500/80' : undefined,
                    )}
                    style={
                      delta.todayContribution >= 0
                        ? { backgroundColor: gainColor }
                        : undefined
                    }
                  />
                  {' '}
                  {delta.usesWeekAverage
                    ? `${formatSignedContribution(delta.todayContribution, delta.unit, delta.goal.metric_key)} ${towardGoalLabel(delta.goal)}`
                    : `${formatSignedContribution(Math.max(0, delta.todayContribution), delta.unit, delta.goal.metric_key)} today`}
                </span>
              )}
            </div>
            <span
              className={cn(
                'tabular-nums transition-colors duration-300',
                revealed && hitTarget ? 'text-[var(--accent-300)]' : 'text-zinc-400',
              )}
            >
              {Math.round(animating || revealed ? afterPct : beforePct)}%
              {(animating || revealed) && afterPct !== beforePct && (
                <span className="text-zinc-600"> · was {Math.round(beforePct)}%</span>
              )}
            </span>
          </div>
        ) : (
          <div className="flex justify-end">
            <span
              className={cn(
                'tabular-nums transition-colors duration-300',
                revealed && hitTarget ? 'text-[var(--accent-300)]' : 'text-zinc-400',
              )}
            >
              {Math.round(animating || revealed ? afterPct : beforePct)}%
              {(animating || revealed) && afterPct !== beforePct && (
                <span className="text-zinc-600"> · was {Math.round(beforePct)}%</span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function FocusTimeSummary({ minutes }: { minutes: number }) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-3">
      <h3 className="text-xs font-semibold text-zinc-100">Focus</h3>
      <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
        {formatDuration(minutes)}
      </p>
      <p className="mt-0.5 text-[10px] text-zinc-500">focused today</p>
    </div>
  )
}

export function GoalProgressModal({
  deltas,
  untrackedFocusMinutes = null,
  onClose,
  title = 'Log saved!',
  subtitle = "Here's how today moved your goals",
  buttonLabel = 'Keep going',
  completedHabits = [],
}: GoalProgressModalProps) {
  const { settings } = useSettings()
  const asOfDate = formatDate(new Date())
  const animIndexByGoalId = useMemo(() => {
    const map = new Map<string, number>()
    let index = 0
    for (const delta of deltas) {
      if (deltaHasProgressToday(delta)) {
        map.set(delta.goal.id, index++)
      }
    }
    return map
  }, [deltas])

  const soundGoalId = useMemo(
    () => deltas.find((d) => deltaHasProgressToday(d))?.goal.id,
    [deltas],
  )

  useEffect(() => {
    warmAudioContext()
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-700/80 bg-[#0c0c14] p-5 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X size={18} />
        </button>

        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-950)]">
            <Sparkles size={18} className="text-[var(--accent-400)]" />
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-100">{title}</h2>
            <p className="text-[11px] text-zinc-400">{subtitle}</p>
          </div>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {completedHabits.length > 0 && (
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-3">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Habits
              </p>
              <div className="flex flex-wrap gap-1.5">
                {completedHabits.map((habit) => (
                  <span
                    key={habit.label}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400"
                  >
                    {habit.label}
                    <HabitStreakBadge streak={habit.streak} />
                  </span>
                ))}
              </div>
            </div>
          )}

          {deltas.length === 0 && completedHabits.length === 0 && !untrackedFocusMinutes ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              Metrics saved. Set goals to track your progress visually.
            </p>
          ) : (
            <>
              {untrackedFocusMinutes != null && untrackedFocusMinutes > 0 && (
                <FocusTimeSummary minutes={untrackedFocusMinutes} />
              )}
              {deltas.map((delta) =>
                delta.goal.metric_key === 'sleep' && (delta.todayValue ?? 0) > 0 ? (
                  <SimpleSleepGoalCard key={delta.goal.id} delta={delta} />
                ) : deltaHasProgressToday(delta) ? (
                  <AnimatedGoalBar
                    key={delta.goal.id}
                    delta={delta}
                    animIndex={animIndexByGoalId.get(delta.goal.id) ?? 0}
                    playSound={delta.goal.id === soundGoalId}
                    asOfDate={asOfDate}
                    weekStartsOn={settings.weekStartsOn}
                  />
                ) : (
                  <NoChangeGoalCard key={delta.goal.id} delta={delta} />
                ),
              )}
            </>
          )}
        </div>

        <Button onClick={onClose} className="mt-4 w-full" size="md">
          {buttonLabel}
        </Button>
      </div>
    </div>
  )
}
