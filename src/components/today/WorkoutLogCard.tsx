import { useMemo, useState } from 'react'
import { parseISO } from 'date-fns'
import { Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useSettings } from '@/context/SettingsContext'
import { hasTarget } from '@/lib/goals'
import { getWeeklyWorkoutTotal } from '@/lib/metrics'
import { workoutsFromListForDate } from '@/lib/dailyLogDraft'
import { getWorkoutTypes, workoutMetricKey } from '@/lib/workoutTypes'
import type { Goal, Workout, WorkoutCategory } from '@/types'
import { cn, formatDuration, getWeekDates } from '@/lib/utils'

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
  const workoutTypes = useMemo(() => getWorkoutTypes(), [])
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [savingCategory, setSavingCategory] = useState<string | null>(null)

  const weekDates = useMemo(
    () => getWeekDates(parseISO(`${date}T12:00:00`), settings.weekStartsOn),
    [date, settings.weekStartsOn],
  )

  const totals = useMemo(
    () => workoutsFromListForDate(workouts, date),
    [workouts, date],
  )

  const weeklyGoalByType = useMemo(() => {
    const map = new Map<string, { logged: number; target: number }>()
    for (const type of workoutTypes) {
      const goal = goals.find(
        (entry) => entry.is_active && entry.metric_key === workoutMetricKey(type.id),
      )
      if (!goal || !hasTarget(goal)) continue
      map.set(type.id, {
        logged: getWeeklyWorkoutTotal(type.id, weekWorkouts, weekDates),
        target: Math.round(goal.target_value ?? 0),
      })
    }
    return map
  }, [workoutTypes, goals, weekWorkouts, weekDates])

  if (!settings.showWorkoutMetrics || workoutTypes.length === 0) {
    return null
  }

  const logWorkout = async (category: WorkoutCategory) => {
    const raw = inputs[category]?.trim()
    const minutes = raw ? parseInt(raw, 10) : NaN
    if (!Number.isFinite(minutes) || minutes <= 0) return

    setSavingCategory(category)
    try {
      await onAddWorkout(category, minutes)
      setInputs((prev) => ({ ...prev, [category]: '' }))
    } finally {
      setSavingCategory(null)
    }
  }

  return (
    <Card title="Workouts">
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
        Logged time adds to today&apos;s totals.
      </p>
      <ul className="space-y-2">
        {workoutTypes.map((type) => {
          const logged = totals[type.id] ?? 0
          const inputValue = inputs[type.id] ?? ''
          const isSaving = savingCategory === type.id
          const weeklyGoal = weeklyGoalByType.get(type.id)

          return (
            <li
              key={type.id}
              className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-2.5"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: type.color }}
                    />
                    <span className="truncate text-sm font-medium text-zinc-200">{type.label}</span>
                  </div>
                  {weeklyGoal && weeklyGoal.target > 0 && (
                    <p className="mt-0.5 pl-[18px] text-[10px] tabular-nums text-zinc-600">
                      {weeklyGoal.logged} / {weeklyGoal.target} min this week
                    </p>
                  )}
                </div>
                <span className="shrink-0 pt-0.5 text-xs tabular-nums text-zinc-400">
                  {logged > 0 ? formatDuration(logged) : '0m'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="relative min-w-0 flex-1">
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    placeholder="Add min"
                    disabled={disabled || isSaving}
                    value={inputValue}
                    onChange={(e) =>
                      setInputs((prev) => ({ ...prev, [type.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void logWorkout(type.id)
                    }}
                    className={cn(
                      'w-full rounded-lg border border-zinc-700/60 bg-zinc-900/80 py-1.5 pl-2.5 pr-9 text-sm text-zinc-100',
                      'placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                      '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                    )}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">
                    min
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={disabled || isSaving || !inputValue.trim()}
                  onClick={() => void logWorkout(type.id)}
                  className="shrink-0 px-2.5"
                  aria-label={`Add ${type.label} minutes`}
                >
                  <Plus size={14} />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
