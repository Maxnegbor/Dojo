import { useEffect, useMemo, useState } from 'react'
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
  WORKOUT_TYPES_CHANGED,
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
  workouts,
  disabled = false,
  onAddWorkout,
}: WorkoutLogCardProps) {
  const { settings } = useSettings()
  const [workoutTypes, setWorkoutTypes] = useState(() => getHomeLogWorkoutTypes())
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [savingCategory, setSavingCategory] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => setWorkoutTypes(getHomeLogWorkoutTypes())
    window.addEventListener(WORKOUT_TYPES_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(WORKOUT_TYPES_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [])

  const weekDates = useMemo(
    () => getWeekDates(parseISO(`${date}T12:00:00`), settings.weekStartsOn),
    [date, settings.weekStartsOn],
  )

  /** Union week-scoped + day workouts so progress updates right after logging. */
  const workoutsForWeek = useMemo(() => {
    const weekSet = new Set(weekDates)
    const byId = new Map<string, Workout>()
    for (const workout of [...weekWorkouts, ...workouts]) {
      if (!weekSet.has(workout.date)) continue
      byId.set(workout.id, workout)
    }
    return [...byId.values()]
  }, [weekWorkouts, workouts, weekDates])

  const weeklyGoalByType = useMemo(() => {
    const map = new Map<string, { logged: number; target: number; unit: string }>()
    for (const type of workoutTypes) {
      const goal = getActiveGoalByMetricKey(goals, workoutMetricKey(type.id))
      if (!goal || !hasTarget(goal)) continue
      const target = Math.round(goal.target_value ?? 0)
      if (target <= 0) continue
      map.set(type.id, {
        logged: getWeeklyWorkoutTotal(type.id, workoutsForWeek, weekDates),
        target,
        unit: goal.unit || type.unit || DEFAULT_WORKOUT_UNIT,
      })
    }
    return map
  }, [workoutTypes, goals, workoutsForWeek, weekDates])

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
          const hasWeeklyTarget = weeklyGoal != null && weeklyGoal.target > 0
          const progressPct = hasWeeklyTarget
            ? Math.min(100, (weeklyGoal.logged / weeklyGoal.target) * 100)
            : 0
          const weeklyComplete = hasWeeklyTarget && weeklyGoal.logged >= weeklyGoal.target

          return (
            <li
              key={type.id}
              className={cn(
                'relative overflow-hidden rounded-lg border px-2.5 py-2',
                weeklyComplete
                  ? 'border-[var(--accent-500)]/60 ring-1 ring-[var(--accent-ring)]'
                  : 'border-zinc-800/80',
              )}
              style={{ backgroundColor: 'rgb(9 9 11 / 0.55)' }}
            >
              {/* Weekly target progress — accent fills left → right behind content */}
              {hasWeeklyTarget && (
                <div
                  className="pointer-events-none absolute inset-0 origin-left transition-[width] duration-300 ease-out"
                  style={{
                    width: `${progressPct}%`,
                    backgroundColor:
                      'color-mix(in srgb, var(--accent-500) 42%, transparent)',
                  }}
                  role="progressbar"
                  aria-valuenow={Math.round(progressPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${type.label} weekly progress`}
                />
              )}

              <div className="relative z-[1] flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent-500)]" />
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium text-zinc-100">
                      {type.label}
                    </span>
                    {hasWeeklyTarget ? (
                      <span className="block text-[10px] tabular-nums text-zinc-300/90">
                        {weeklyGoal.logged} / {weeklyGoal.target} {weeklyGoal.unit || unit}
                      </span>
                    ) : null}
                  </div>
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
                        'w-full rounded-lg border border-zinc-700/70 bg-zinc-950/90 py-1.5 pl-2 pr-7 text-sm text-zinc-100',
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
                    className="h-[34px] shrink-0 border-zinc-700/70 bg-zinc-950/90 px-2.5"
                    aria-label={`Add ${type.label} ${unit}`}
                  >
                    <Plus size={14} />
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
