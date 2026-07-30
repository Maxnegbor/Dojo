import { useMemo, useState } from 'react'
import { parseISO } from 'date-fns'
import { Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useSettings } from '@/context/SettingsContext'
import { getActiveGoalByMetricKey, hasTarget } from '@/lib/goals'
import { getWeeklyWorkoutTotal } from '@/lib/metrics'
import {
  DEFAULT_WORKOUT_UNIT,
  getHomeLogWorkoutTypes,
  workoutMetricKey,
} from '@/lib/workoutTypes'
import type { Goal, Workout, WorkoutCategory } from '@/types'
import { cn, getWeekDates } from '@/lib/utils'

interface WorkoutLogCardProps {
  date: string
  goals: Goal[]
  weekWorkouts: Workout[]
  workouts: Workout[]
  disabled?: boolean
  onAddWorkout: (category: WorkoutCategory, minutes: number) => Promise<void>
}

export function WorkoutLogCard({
  date,
  goals,
  weekWorkouts,
  disabled = false,
  onAddWorkout,
}: WorkoutLogCardProps) {
  const { settings } = useSettings()
  const workoutTypes = useMemo(() => getHomeLogWorkoutTypes(), [])
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [savingCategory, setSavingCategory] = useState<string | null>(null)

  const weekDates = useMemo(
    () => getWeekDates(parseISO(`${date}T12:00:00`), settings.weekStartsOn),
    [date, settings.weekStartsOn],
  )

  const weeklyGoalByType = useMemo(() => {
    const map = new Map<string, { logged: number; target: number; unit: string }>()
    for (const type of workoutTypes) {
      const goal = getActiveGoalByMetricKey(goals, workoutMetricKey(type.id))
      if (!goal || !hasTarget(goal)) continue
      map.set(type.id, {
        logged: getWeeklyWorkoutTotal(type.id, weekWorkouts, weekDates),
        target: Math.round(goal.target_value ?? 0),
        unit: goal.unit || type.unit || DEFAULT_WORKOUT_UNIT,
      })
    }
    return map
  }, [workoutTypes, goals, weekWorkouts, weekDates])

  if (!settings.showWorkoutMetrics || workoutTypes.length === 0) {
    return null
  }

  const logWorkout = async (category: WorkoutCategory) => {
    const raw = inputs[category]?.trim()
    const amount = raw ? parseFloat(raw) : NaN
    if (!Number.isFinite(amount) || amount <= 0) return

    setSavingCategory(category)
    try {
      await onAddWorkout(category, amount)
      setInputs((prev) => ({ ...prev, [category]: '' }))
    } finally {
      setSavingCategory(null)
    }
  }

  return (
    <Card title="Workouts">
      <ul className="space-y-1.5">
        {workoutTypes.map((type) => {
          const inputValue = inputs[type.id] ?? ''
          const isSaving = savingCategory === type.id
          const weeklyGoal = weeklyGoalByType.get(type.id)
          const unit = type.unit || DEFAULT_WORKOUT_UNIT

          const weeklyComplete =
            weeklyGoal != null && weeklyGoal.target > 0 && weeklyGoal.logged >= weeklyGoal.target

          return (
            <li
              key={type.id}
              className={cn(
                'rounded-lg border px-2.5 py-2',
                weeklyComplete
                  ? 'border-[var(--accent-500)]/55 bg-[var(--accent-950)]/40 ring-1 ring-[var(--accent-ring)]'
                  : 'border-zinc-800/80 bg-zinc-950/40',
              )}
            >
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent-500)]" />
                  <span className="truncate text-sm font-medium text-zinc-200">{type.label}</span>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="relative w-[4.75rem]">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      placeholder="Add"
                      disabled={disabled || isSaving}
                      value={inputValue}
                      onChange={(e) =>
                        setInputs((prev) => ({ ...prev, [type.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void logWorkout(type.id)
                      }}
                      className={cn(
                        'w-full rounded-lg border border-zinc-700/60 bg-zinc-900/80 py-1.5 pl-2 pr-7 text-sm text-zinc-100',
                        'placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]',
                        'disabled:cursor-not-allowed disabled:opacity-60',
                        '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                      )}
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">
                      {unit}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={disabled || isSaving || !inputValue.trim()}
                    onClick={() => void logWorkout(type.id)}
                    className="h-[34px] shrink-0 px-2.5"
                    aria-label={`Add ${type.label} ${unit}`}
                  >
                    <Plus size={14} />
                  </Button>
                </div>
              </div>

              {weeklyGoal && weeklyGoal.target > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div
                    className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-800"
                    role="progressbar"
                    aria-valuenow={Math.min(
                      100,
                      Math.round((weeklyGoal.logged / weeklyGoal.target) * 100),
                    )}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${type.label} weekly progress`}
                  >
                    <div
                      className="h-full rounded-full bg-[var(--accent-500)] transition-[width] duration-300"
                      style={{
                        width: `${Math.min(100, (weeklyGoal.logged / weeklyGoal.target) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="min-w-0 text-[10px] tabular-nums text-zinc-500">
                    {weeklyGoal.logged} / {weeklyGoal.target} {weeklyGoal.unit || unit} this week
                  </p>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
