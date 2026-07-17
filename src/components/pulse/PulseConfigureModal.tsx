import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Minus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  DEFAULT_PULSE_WEIGHTS,
  PULSE_POINTS_TOTAL,
  copyPulseFormula,
  getWorkoutGoalCategories,
  hasWorkoutGoalsForPulse,
  isValidPulseFormula,
  weightsSum,
  type PulseFormula,
  type PulseWeights,
} from '@/lib/pulseConfig'
import { getPulseSleepMetrics, type SleepMetricsConfig } from '@/lib/sleepMetrics'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { getWorkoutTypeLabel } from '@/lib/workoutTypes'
import type { Goal } from '@/types'
import { cn } from '@/lib/utils'

interface PulseConfigureModalProps {
  goals: Goal[]
  initialFormula: PulseFormula | null
  isReconfigure: boolean
  onClose: () => void
  onSave: (formula: PulseFormula) => void
}

type PulseArea = keyof PulseWeights

const AREA_ROWS: { key: PulseArea; label: string; description: string }[] = [
  {
    key: 'habits',
    label: 'Habits',
    description: 'Daily habit check-offs',
  },
  {
    key: 'focus',
    label: 'Focus',
    description: 'Focus minutes vs your goal',
  },
  {
    key: 'sleep',
    label: 'Sleep',
    description: 'Morning sleep metrics',
  },
  {
    key: 'exercise',
    label: 'Exercise',
    description: 'Workouts logged today',
  },
]

function sleepPulseAreaDescription(config: SleepMetricsConfig): string {
  const metrics = getPulseSleepMetrics(config)
  if (metrics.length === 0) return 'Morning sleep log'
  if (metrics.length === 1) {
    const metric = metrics[0]
    if (metric.unit === 'percent') return 'Wearable or % sleep score'
    if (metric.id === 'sleep_duration') return 'Sleep duration vs your goal'
    return `${metric.label} from your morning log`
  }
  return 'Morning sleep metrics vs your goal'
}

function createDraft(initialFormula: PulseFormula | null): PulseFormula {
  if (initialFormula) return copyPulseFormula(initialFormula)
  return {
    weights: { ...DEFAULT_PULSE_WEIGHTS },
    exerciseDailyMinutes: {},
  }
}

function WeightStepper({
  value,
  disableMinus,
  disablePlus,
  onChange,
}: {
  value: number
  disableMinus?: boolean
  disablePlus?: boolean
  onChange: (next: number) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={disableMinus || value <= 0}
        onClick={() => onChange(value - 1)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/80 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-40"
        aria-label="Decrease points"
      >
        <Minus size={14} />
      </button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums text-zinc-100">{value}</span>
      <button
        type="button"
        disabled={disablePlus}
        onClick={() => onChange(value + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/80 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-40"
        aria-label="Increase points"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

export function PulseConfigureModal({
  goals,
  initialFormula,
  isReconfigure,
  onClose,
  onSave,
}: PulseConfigureModalProps) {
  const [draft, setDraft] = useState(() => createDraft(initialFormula))
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()
  const sleepDescription = useMemo(
    () => sleepPulseAreaDescription(sleepMetricsConfig),
    [sleepMetricsConfig],
  )
  const workoutGoalsAvailable = hasWorkoutGoalsForPulse(goals)
  const workoutCategories = useMemo(() => getWorkoutGoalCategories(goals), [goals])
  const assigned = weightsSum(draft.weights)
  const remaining = PULSE_POINTS_TOTAL - assigned
  const validation = isValidPulseFormula(draft, goals)
  const canSave = validation.valid

  useEffect(() => {
    if (draft.weights.exercise > 0 && !workoutGoalsAvailable) {
      setDraft((prev) => ({
        ...prev,
        weights: { ...prev.weights, exercise: 0 },
      }))
    }
  }, [draft.weights.exercise, workoutGoalsAvailable])

  const adjustWeight = (key: PulseArea, delta: number) => {
    setDraft((prev) => {
      const nextValue = prev.weights[key] + delta
      if (nextValue < 0) return prev
      if (delta > 0 && remaining <= 0) return prev
      return {
        ...prev,
        weights: { ...prev.weights, [key]: nextValue },
      }
    })
  }

  const setExerciseMinutes = (category: string, raw: string) => {
    const parsed = parseInt(raw, 10)
    setDraft((prev) => ({
      ...prev,
      exerciseDailyMinutes: {
        ...prev.exerciseDailyMinutes,
        [category]: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
      },
    }))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="pulse-configure-title"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700">
              <Activity size={20} />
            </div>
            <div>
              <h2 id="pulse-configure-title" className="text-lg font-semibold text-zinc-100">
                {isReconfigure ? 'Reconfigure Pulse' : 'Configure Pulse'}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Distribute {PULSE_POINTS_TOTAL} points across what matters most. Each point is 10% of
                your daily score.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div
            className={cn(
              'rounded-xl border px-4 py-3 text-center text-sm font-medium',
              remaining === 0
                ? 'border-[var(--accent-500)]/40 bg-[var(--accent-950)]/40 text-[var(--accent-300)]'
                : 'border-zinc-800 bg-zinc-950/50 text-zinc-400',
            )}
          >
            {assigned} / {PULSE_POINTS_TOTAL} points assigned
            {remaining > 0 && (
              <span className="block text-xs font-normal text-zinc-500">
                {remaining} remaining
              </span>
            )}
          </div>

          <div className="space-y-2">
            {AREA_ROWS.map((row) => {
              const exerciseDisabled = row.key === 'exercise' && !workoutGoalsAvailable

              return (
                <div
                  key={row.key}
                  className={cn(
                    'rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3',
                    exerciseDisabled && 'opacity-70',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">{row.label}</p>
                      <p className="text-[11px] text-zinc-500">
                        {row.key === 'sleep' ? sleepDescription : row.description}
                      </p>
                    </div>
                    <WeightStepper
                      value={draft.weights[row.key]}
                      disableMinus={exerciseDisabled}
                      disablePlus={exerciseDisabled || remaining <= 0}
                      onChange={(next) => adjustWeight(row.key, next - draft.weights[row.key])}
                    />
                  </div>
                  {exerciseDisabled && (
                    <p className="mt-2 text-[11px] text-zinc-500">
                      Add a workout goal in{' '}
                      <Link
                        to="/goals"
                        className="text-[var(--accent-400)] underline-offset-2 hover:underline"
                        onClick={onClose}
                      >
                        Metrics
                      </Link>{' '}
                      to include this.
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {draft.weights.exercise > 0 && workoutGoalsAvailable && (
            <div className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
              <div>
                <p className="text-sm font-medium text-zinc-200">Daily exercise targets</p>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                  For each workout type, how many minutes in one day count as 100% for that type?
                  Different types add together (e.g. 30 min Zone 2 + 30 min Strength can reach 100%
                  if each threshold is 60 min).
                </p>
              </div>
              <div className="space-y-2">
                {workoutCategories.map((category) => (
                  <label key={category} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-zinc-300">{getWorkoutTypeLabel(category)}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        step={5}
                        value={draft.exerciseDailyMinutes[category] || ''}
                        onChange={(e) => setExerciseMinutes(category, e.target.value)}
                        placeholder="min"
                        className="w-20 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-right text-sm tabular-nums text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                      />
                      <span className="text-xs text-zinc-500">min = 100%</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800/80 px-6 py-4">
          {!validation.valid && validation.reason && assigned > 0 && (
            <p className="mb-3 text-center text-xs text-amber-400/90">{validation.reason}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!canSave} onClick={() => onSave(draft)}>
              Save formula
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
