import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Equal, Minus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  DEFAULT_PULSE_WEIGHTS,
  PULSE_POINTS_TOTAL,
  assignPointsPulseFormula,
  copyPulseFormula,
  equalizePulseFormula,
  formulaIncludedCount,
  formulaWeightsSum,
  getPulseCustomMetricGoals,
  getWorkoutGoalCategories,
  hasWorkoutGoalsForPulse,
  isValidPulseFormula,
  prunePulseFormulaMetrics,
  pulseCustomMetricLabel,
  type PulseCoreArea,
  type PulseFormula,
} from '@/lib/pulseConfig'
import { getPulseSleepMetrics, type SleepMetricsConfig } from '@/lib/sleepMetrics'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { getWorkoutTypeLabel } from '@/lib/workoutTypes'
import type { Goal, MetricKey } from '@/types'
import { cn } from '@/lib/utils'

interface PulseConfigureModalProps {
  goals: Goal[]
  initialFormula: PulseFormula | null
  isReconfigure: boolean
  onClose: () => void
  onSave: (formula: PulseFormula) => void
}

const AREA_ROWS: { key: PulseCoreArea; label: string; description: string }[] = [
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

function createDraft(initialFormula: PulseFormula | null, goals: Goal[]): PulseFormula {
  if (initialFormula) return prunePulseFormulaMetrics(copyPulseFormula(initialFormula), goals)
  return {
    weights: { ...DEFAULT_PULSE_WEIGHTS },
    metricWeights: {},
    exerciseDailyMinutes: {},
    equalWeights: false,
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

function IncludeToggle({
  included,
  disabled,
  onChange,
}: {
  included: boolean
  disabled?: boolean
  onChange: (included: boolean) => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!included)}
      className={cn(
        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40',
        included
          ? 'border-[var(--accent-500)]/50 bg-[var(--accent-500)]/15 text-[var(--accent-300)]'
          : 'border-zinc-700 bg-zinc-800/60 text-zinc-500 hover:text-zinc-300',
      )}
    >
      {included ? 'Included' : 'Excluded'}
    </button>
  )
}

export function PulseConfigureModal({
  goals,
  initialFormula,
  isReconfigure,
  onClose,
  onSave,
}: PulseConfigureModalProps) {
  const [draft, setDraft] = useState(() => createDraft(initialFormula, goals))
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()
  const sleepDescription = useMemo(
    () => sleepPulseAreaDescription(sleepMetricsConfig),
    [sleepMetricsConfig],
  )
  const workoutGoalsAvailable = hasWorkoutGoalsForPulse(goals)
  const workoutCategories = useMemo(() => getWorkoutGoalCategories(goals), [goals])
  const customMetricGoals = useMemo(() => getPulseCustomMetricGoals(goals), [goals])
  const equalMode = draft.equalWeights === true
  const assigned = formulaWeightsSum(draft)
  const remaining = PULSE_POINTS_TOTAL - assigned
  const includedCount = formulaIncludedCount(draft)
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

  useEffect(() => {
    setDraft((prev) => {
      const next = prunePulseFormulaMetrics(prev, goals)
      const prevKeys = Object.keys(prev.metricWeights).sort().join(',')
      const nextKeys = Object.keys(next.metricWeights).sort().join(',')
      return prevKeys === nextKeys ? prev : next
    })
  }, [goals])

  const adjustCoreWeight = (key: PulseCoreArea, delta: number) => {
    setDraft((prev) => {
      const nextValue = prev.weights[key] + delta
      if (nextValue < 0) return prev
      if (delta > 0 && formulaWeightsSum(prev) >= PULSE_POINTS_TOTAL) return prev
      return {
        ...prev,
        equalWeights: false,
        weights: { ...prev.weights, [key]: nextValue },
      }
    })
  }

  const adjustMetricWeight = (key: MetricKey, delta: number) => {
    setDraft((prev) => {
      const current = prev.metricWeights[key] ?? 0
      const nextValue = current + delta
      if (nextValue < 0) return prev
      if (delta > 0 && formulaWeightsSum(prev) >= PULSE_POINTS_TOTAL) return prev
      const metricWeights = { ...prev.metricWeights }
      if (nextValue <= 0) delete metricWeights[key]
      else metricWeights[key] = nextValue
      return { ...prev, equalWeights: false, metricWeights }
    })
  }

  const setCoreIncluded = (key: PulseCoreArea, included: boolean) => {
    setDraft((prev) => ({
      ...prev,
      equalWeights: true,
      weights: { ...prev.weights, [key]: included ? 1 : 0 },
    }))
  }

  const setMetricIncluded = (key: MetricKey, included: boolean) => {
    setDraft((prev) => {
      const metricWeights = { ...prev.metricWeights }
      if (included) metricWeights[key] = 1
      else delete metricWeights[key]
      return { ...prev, equalWeights: true, metricWeights }
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

  const handleEqualize = () => {
    setDraft((prev) => equalizePulseFormula(prev, goals))
  }

  const handleAssignPoints = () => {
    setDraft((prev) => assignPointsPulseFormula(prev, goals))
  }

  const equalShareLabel =
    includedCount > 0 ? `1/${includedCount} each` : 'No categories included'

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
                {equalMode
                  ? 'Included categories each make up an equal share of your daily score.'
                  : `Distribute ${PULSE_POINTS_TOTAL} points across what matters most. Each point is 10% of your daily score.`}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <div
              className={cn(
                'flex-1 rounded-xl border px-4 py-3 text-center text-sm font-medium',
                equalMode || remaining === 0
                  ? 'border-[var(--accent-500)]/40 bg-[var(--accent-950)]/40 text-[var(--accent-300)]'
                  : 'border-zinc-800 bg-zinc-950/50 text-zinc-400',
              )}
            >
              {equalMode ? (
                <>
                  Equal weights
                  <span className="block text-xs font-normal text-zinc-500">{equalShareLabel}</span>
                </>
              ) : (
                <>
                  {assigned} / {PULSE_POINTS_TOTAL} points assigned
                  {remaining > 0 && (
                    <span className="block text-xs font-normal text-zinc-500">
                      {remaining} remaining
                    </span>
                  )}
                </>
              )}
            </div>
            {equalMode ? (
              <button
                type="button"
                onClick={handleAssignPoints}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
              >
                Assign points
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEqualize}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
              >
                <Equal size={16} className="text-zinc-400" />
                Split equally
              </button>
            )}
          </div>

          <div className="space-y-2">
            {AREA_ROWS.map((row) => {
              const exerciseDisabled = row.key === 'exercise' && !workoutGoalsAvailable
              const included = draft.weights[row.key] > 0

              return (
                <div
                  key={row.key}
                  className={cn(
                    'rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3',
                    exerciseDisabled && 'opacity-70',
                    equalMode && !included && !exerciseDisabled && 'opacity-60',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">{row.label}</p>
                      <p className="text-[11px] text-zinc-500">
                        {row.key === 'sleep' ? sleepDescription : row.description}
                      </p>
                    </div>
                    {equalMode ? (
                      <IncludeToggle
                        included={included}
                        disabled={exerciseDisabled}
                        onChange={(next) => setCoreIncluded(row.key, next)}
                      />
                    ) : (
                      <WeightStepper
                        value={draft.weights[row.key]}
                        disableMinus={exerciseDisabled}
                        disablePlus={exerciseDisabled || remaining <= 0}
                        onChange={(next) => adjustCoreWeight(row.key, next - draft.weights[row.key])}
                      />
                    )}
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

            {customMetricGoals.map((goal) => {
              const value = draft.metricWeights[goal.metric_key] ?? 0
              const included = value > 0
              const unit = goal.unit?.trim()
              const target = goal.target_value
              return (
                <div
                  key={goal.id}
                  className={cn(
                    'rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3',
                    equalMode && !included && 'opacity-60',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">
                        {pulseCustomMetricLabel(goal)}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        Daily
                        {target != null && target > 0
                          ? ` · ${target}${unit ? ` ${unit}` : ''} goal`
                          : ' goal'}
                      </p>
                    </div>
                    {equalMode ? (
                      <IncludeToggle
                        included={included}
                        onChange={(next) => setMetricIncluded(goal.metric_key, next)}
                      />
                    ) : (
                      <WeightStepper
                        value={value}
                        disablePlus={remaining <= 0}
                        onChange={(next) =>
                          adjustMetricWeight(goal.metric_key, next - value)
                        }
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {draft.weights.exercise > 0 && workoutGoalsAvailable && (
            <div className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
              <div>
                <p className="text-sm font-medium text-zinc-200">Daily exercise targets</p>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                  Minutes pool into one Exercise score. Hitting any type’s daily target fully
                  completes exercise, or combine partials (e.g. 30 + 30 when each target is 60).
                  Extra volume past 100% doesn’t raise the score further.
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
          {!validation.valid &&
            validation.reason &&
            (equalMode ? includedCount > 0 || assigned > 0 : assigned > 0) && (
            <p className="mb-3 text-center text-xs text-amber-400/90">{validation.reason}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!canSave} onClick={() => onSave(prunePulseFormulaMetrics(draft, goals))}>
              Save formula
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
