import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { HabitStreakBadge } from '@/components/today/HabitStreakBadge'
import type { ProgressDelta } from '@/lib/metrics'
import { isWeightGoal, weightGoalMode } from '@/lib/weightGoal'
import { formatWeightStepper } from '@/lib/settingsStore'
import { playGoalProgressSound, warmAudioContext } from '@/lib/timerSound'
import { cn } from '@/lib/utils'

export interface CompletedHabitSummary {
  label: string
  streak: number
}

interface GoalProgressModalProps {
  deltas: ProgressDelta[]
  onClose: () => void
  title?: string
  subtitle?: string
  buttonLabel?: string
  completedHabits?: CompletedHabitSummary[]
}

function AnimatedGoalBar({
  delta,
  playSound,
}: {
  delta: ProgressDelta
  playSound?: boolean
}) {
  const isWeight = isWeightGoal(delta.goal)
  const weightUnit = (delta.unit === 'lb' ? 'lb' : 'kg') as 'kg' | 'lb'
  const beforePct = Math.min(100, delta.percentBefore)
  const afterPct = Math.min(100, delta.percentAfter)
  const hitTarget = isWeight
    ? (delta.weightWeekHit ?? false)
    : afterPct >= 100

  const [widthPct, setWidthPct] = useState(beforePct)

  useEffect(() => {
    if (afterPct <= beforePct && !isWeight) return
    const extend = window.setTimeout(() => {
      setWidthPct(afterPct)
      if (playSound) playGoalProgressSound({ hitTarget })
    }, 1000)
    return () => clearTimeout(extend)
  }, [afterPct, beforePct, hitTarget, playSound, isWeight])

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/80 p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">{delta.name}</h3>
          <p className="text-[11px] text-zinc-500">
            {isWeight
              ? `${weightGoalMode(delta.goal) === 'bulk' ? 'Bulk' : 'Cut'} · week avg`
              : delta.isWeekly
                ? 'Weekly goal'
                : 'Daily goal'}
            {' · '}
            <span className="text-zinc-300">
              {isWeight
                ? `${formatWeightStepper(delta.after, weightUnit)} ${weightUnit} avg this week`
                : `${delta.after} / ${delta.target} ${delta.unit}`}
            </span>
          </p>
        </div>
        {hitTarget && (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            {isWeight ? 'On track' : 'Hit!'}
          </span>
        )}
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 ease-out',
            isWeight && hitTarget
              ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
              : isWeight && !hitTarget
                ? 'bg-gradient-to-r from-red-400 to-red-600'
                : 'bg-gradient-to-r from-[var(--accent-400)] to-[var(--accent-700)]',
          )}
          style={{ width: `${widthPct}%` }}
        />
      </div>

      <div className="mt-2 space-y-1 text-[10px] text-zinc-500">
        {isWeight ? (
          <p className="text-zinc-400">
            Week avg moved on your {weightGoalMode(delta.goal) === 'bulk' ? 'bulk' : 'cut'} range
          </p>
        ) : delta.isWeekly ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {delta.before > 0 && (
                <span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-400)]" />
                  {' '}
                  {delta.before} {delta.unit} before today
                </span>
              )}
              {delta.todayContribution > 0 && (
                <span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-700)]" />
                  {' '}
                  +{delta.todayContribution} {delta.unit} today
                </span>
              )}
            </div>
            <p className="text-zinc-400">
              Week total:{' '}
              <span className="font-medium text-zinc-200">
                {delta.after} / {delta.target} {delta.unit}
              </span>
            </p>
          </>
        ) : (
          <span>
            {delta.after} of {delta.target} {delta.unit}
          </span>
        )}
        {!isWeight && (
          <div className="flex justify-end">
            <span className={cn(hitTarget ? 'text-emerald-400' : 'text-zinc-400')}>
              {Math.round(afterPct)}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function GoalProgressModal({
  deltas,
  onClose,
  title = 'Log saved!',
  subtitle = "Here's how today moved your goals",
  buttonLabel = 'Keep going',
  completedHabits = [],
}: GoalProgressModalProps) {
  const meaningful = deltas
  const soundGoalId = meaningful.find((d) =>
    isWeightGoal(d.goal)
      ? d.percentAfter !== d.percentBefore
      : d.percentAfter > d.percentBefore,
  )?.goal.id

  useEffect(() => {
    warmAudioContext()
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-700/80 bg-[#0c0c14] p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X size={18} />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-950)]">
            <Sparkles size={20} className="text-[var(--accent-400)]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
            <p className="text-xs text-zinc-400">{subtitle}</p>
          </div>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {completedHabits.length > 0 && (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/80 p-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Habits
              </p>
              <div className="flex flex-wrap gap-2">
                {completedHabits.map((habit) => (
                  <span
                    key={habit.label}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400"
                  >
                    {habit.label}
                    <HabitStreakBadge streak={habit.streak} />
                  </span>
                ))}
              </div>
            </div>
          )}

          {meaningful.length === 0 && completedHabits.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              Metrics saved. Set goals to track your progress visually.
            </p>
          ) : (
            meaningful.map((delta) => (
              <AnimatedGoalBar
                key={delta.goal.id}
                delta={delta}
                playSound={delta.goal.id === soundGoalId}
              />
            ))
          )}
        </div>

        <Button onClick={onClose} className="mt-5 w-full">
          {buttonLabel}
        </Button>
      </div>
    </div>
  )
}
