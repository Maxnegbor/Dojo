import { useEffect, useMemo, useState } from 'react'
import { parseISO } from 'date-fns'
import { Pencil, Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { WorkoutWeekEditModal } from '@/components/today/WorkoutWeekEditModal'
import { useSettings } from '@/context/SettingsContext'
import { getActiveGoalByMetricKey, hasTarget, normalizeGoal } from '@/lib/goals'
import { goalTargetPeriod } from '@/lib/goalPeriod'
import { getWeeklyWorkoutTotal } from '@/lib/metrics'
import { OUTCOME_GOALS_CHANGED } from '@/lib/outcomeGoals'
import { resolveWeeklyQuantityTarget } from '@/lib/pulseConfig'
import {
  DEFAULT_WORKOUT_UNIT,
  getHomeLogWorkoutTypes,
  WORKOUT_TYPES_CHANGED,
  workoutMetricKey,
} from '@/lib/workoutTypes'
import type { Goal, Workout, WorkoutCategory } from '@/types'
import { cn, formatDuration, getWeekDates } from '@/lib/utils'

interface WorkoutLogCardProps {
  date: string
  userId?: string | null
  goals: Goal[]
  weekWorkouts: Workout[]
  workouts: Workout[]
  disabled?: boolean
  onAddWorkout: (category: WorkoutCategory, minutes: number) => Promise<void>
  onWeekEdited?: () => void | Promise<void>
}

function formatVolume(amount: number, unit: string): string {
  const timed = unit === 'min' || unit === 'mins' || unit === 'minutes'
  if (timed) return formatDuration(amount)
  return `${Math.round(amount * 100) / 100} ${unit}`
}

export function WorkoutLogCard({
  date,
  userId,
  goals,
  weekWorkouts,
  workouts,
  disabled = false,
  onAddWorkout,
  onWeekEdited,
}: WorkoutLogCardProps) {
  const { settings } = useSettings()
  const [workoutTypes, setWorkoutTypes] = useState(() => getHomeLogWorkoutTypes())
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [savingCategory, setSavingCategory] = useState<string | null>(null)
  const [outcomeRevision, setOutcomeRevision] = useState(0)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    const syncTypes = () => setWorkoutTypes(getHomeLogWorkoutTypes())
    const syncOutcomes = () => setOutcomeRevision((n) => n + 1)
    window.addEventListener(WORKOUT_TYPES_CHANGED, syncTypes)
    window.addEventListener(OUTCOME_GOALS_CHANGED, syncOutcomes)
    window.addEventListener('user-storage-ready', syncTypes)
    window.addEventListener('user-storage-ready', syncOutcomes)
    return () => {
      window.removeEventListener(WORKOUT_TYPES_CHANGED, syncTypes)
      window.removeEventListener(OUTCOME_GOALS_CHANGED, syncOutcomes)
      window.removeEventListener('user-storage-ready', syncTypes)
      window.removeEventListener('user-storage-ready', syncOutcomes)
    }
  }, [])

  // Recurring weekly volume uses Settings → weekStartsOn (default Monday → Sunday).
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
      const metricKey = workoutMetricKey(type.id)
      const unit = type.unit || DEFAULT_WORKOUT_UNIT

      // Prefer outcome-goal weekly links (Goals page), then hybrid workout goals.
      let target = resolveWeeklyQuantityTarget(metricKey, goals)
      if (target == null) {
        const hybrid = getActiveGoalByMetricKey(goals, metricKey)
        if (hybrid && hasTarget(hybrid)) {
          const normalized = normalizeGoal(hybrid)
          if (goalTargetPeriod(normalized) === 'weekly' || metricKey.startsWith('workout_')) {
            target = normalized.target_value
          }
        }
      }

      const rounded = target != null ? Math.round(target) : 0
      if (rounded <= 0) continue

      map.set(type.id, {
        logged: getWeeklyWorkoutTotal(type.id, workoutsForWeek, weekDates),
        target: rounded,
        unit,
      })
    }
    return map
  }, [workoutTypes, goals, workoutsForWeek, weekDates, outcomeRevision])

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
    <>
      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            Workouts
            {userId ? (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                disabled={disabled}
                className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                aria-label="Edit this week’s workouts"
                title="Edit week"
              >
                <Pencil size={13} />
              </button>
            ) : null}
          </span>
        }
      >
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
                style={{ backgroundColor: 'rgb(24 24 27)' }}
              >
                {/* Weekly target progress — accent fills left → right behind content */}
                {hasWeeklyTarget ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-300 ease-out"
                    style={{
                      width: `${progressPct}%`,
                      backgroundColor:
                        'color-mix(in srgb, var(--accent-500) 55%, rgb(24 24 27))',
                    }}
                    role="progressbar"
                    aria-valuenow={Math.round(progressPct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${type.label} weekly progress`}
                  />
                ) : null}

                <div className="relative z-[1] flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent-500)]" />
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium text-zinc-100">
                        {type.label}
                      </span>
                      {hasWeeklyTarget ? (
                        <span className="block text-[10px] tabular-nums text-zinc-300/90">
                          {formatVolume(weeklyGoal.logged, weeklyGoal.unit || unit)}
                          {' / '}
                          {formatVolume(weeklyGoal.target, weeklyGoal.unit || unit)}
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
                          'w-full rounded-lg border border-zinc-700 bg-zinc-950/80 py-1.5 pl-2 pr-7 text-sm text-zinc-100',
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
                      className="h-[34px] shrink-0 border-zinc-700 bg-zinc-950 hover:bg-zinc-900 px-2.5"
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

      {editOpen && userId ? (
        <WorkoutWeekEditModal
          date={date}
          userId={userId}
          weekWorkouts={workoutsForWeek}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            await onWeekEdited?.()
          }}
        />
      ) : null}
    </>
  )
}
