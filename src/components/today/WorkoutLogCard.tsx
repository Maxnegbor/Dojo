import { useEffect, useMemo, useState } from 'react'
import { parseISO } from 'date-fns'
import { Check, Pencil, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { WorkoutWeekEditModal } from '@/components/today/WorkoutWeekEditModal'
import { useSettings } from '@/context/SettingsContext'
import { getActiveGoalByMetricKey, hasTarget, normalizeGoal } from '@/lib/goals'
import { goalTargetPeriod } from '@/lib/goalPeriod'
import { getWeeklyWorkoutTotal } from '@/lib/metrics'
import { OUTCOME_GOALS_CHANGED } from '@/lib/outcomeGoals'
import { resolveWeeklyQuantityTarget } from '@/lib/pulseConfig'
import { syncWhoopWorkoutsForDates } from '@/lib/whoopApi'
import {
  isWhoopConnected,
  WHOOP_CHANGED,
  WHOOP_DAYS_CHANGED,
} from '@/lib/whoopStore'
import {
  listWhoopWorkoutSuggestions,
  markWhoopWorkoutHandled,
  WHOOP_WORKOUT_IMPORT_CHANGED,
  whoopWorkoutNote,
  type WhoopWorkoutSuggestion,
} from '@/lib/whoopWorkoutDetect'
import {
  DEFAULT_WORKOUT_UNIT,
  getWorkoutTypes,
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
  onAddWorkout: (
    category: WorkoutCategory,
    minutes: number,
    extras?: { date?: string; notes?: string },
  ) => Promise<void>
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
  const [workoutTypes, setWorkoutTypes] = useState(() => getWorkoutTypes())
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [savingCategory, setSavingCategory] = useState<string | null>(null)
  const [outcomeRevision, setOutcomeRevision] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [whoopConnected, setWhoopConnected] = useState(() => isWhoopConnected())
  const [whoopRevision, setWhoopRevision] = useState(0)
  const [pendingWhoopId, setPendingWhoopId] = useState<string | null>(null)

  useEffect(() => {
    const syncTypes = () => setWorkoutTypes(getWorkoutTypes())
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

  useEffect(() => {
    const syncWhoop = () => {
      setWhoopConnected(isWhoopConnected())
      setWhoopRevision((n) => n + 1)
    }
    window.addEventListener(WHOOP_CHANGED, syncWhoop)
    window.addEventListener(WHOOP_DAYS_CHANGED, syncWhoop)
    window.addEventListener(WHOOP_WORKOUT_IMPORT_CHANGED, syncWhoop)
    window.addEventListener('user-storage-ready', syncWhoop)
    return () => {
      window.removeEventListener(WHOOP_CHANGED, syncWhoop)
      window.removeEventListener(WHOOP_DAYS_CHANGED, syncWhoop)
      window.removeEventListener(WHOOP_WORKOUT_IMPORT_CHANGED, syncWhoop)
      window.removeEventListener('user-storage-ready', syncWhoop)
    }
  }, [])

  // Recurring weekly volume uses Settings → weekStartsOn (default Monday → Sunday).
  const weekDates = useMemo(
    () => getWeekDates(parseISO(`${date}T12:00:00`), settings.weekStartsOn),
    [date, settings.weekStartsOn],
  )

  useEffect(() => {
    if (!whoopConnected) return
    let cancelled = false
    void syncWhoopWorkoutsForDates(weekDates)
      .then(() => {
        if (!cancelled) setWhoopRevision((n) => n + 1)
      })
      .catch(() => {
        /* keep cached workouts */
      })
    return () => {
      cancelled = true
    }
  }, [whoopConnected, weekDates])

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

  const whoopSuggestions = useMemo(
    () => (whoopConnected ? listWhoopWorkoutSuggestions(weekDates, workoutsForWeek) : []),
    [whoopConnected, weekDates, workoutsForWeek, whoopRevision, workoutTypes],
  )

  const suggestionsByType = useMemo(() => {
    const map = new Map<string, WhoopWorkoutSuggestion[]>()
    for (const suggestion of whoopSuggestions) {
      const list = map.get(suggestion.category) ?? []
      list.push(suggestion)
      map.set(suggestion.category, list)
    }
    return map
  }, [whoopSuggestions])

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

  if (workoutTypes.length === 0) {
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

  const acceptWhoopSuggestion = async (suggestion: WhoopWorkoutSuggestion) => {
    if (disabled || pendingWhoopId) return
    setPendingWhoopId(suggestion.whoopId)
    try {
      await onAddWorkout(suggestion.category, suggestion.minutes, {
        date: suggestion.date,
        notes: whoopWorkoutNote(suggestion.whoopId),
      })
      markWhoopWorkoutHandled(suggestion.whoopId, 'accepted')
    } finally {
      setPendingWhoopId(null)
    }
  }

  const dismissWhoopSuggestion = (suggestion: WhoopWorkoutSuggestion) => {
    if (disabled || pendingWhoopId) return
    markWhoopWorkoutHandled(suggestion.whoopId, 'dismissed')
  }

  return (
    <>
      <Card className="home-workout-card relative w-full shrink-0 overflow-visible">
        {userId ? (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            disabled={disabled}
            className="workout-edit-action absolute -right-2 -top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-md bg-zinc-800 text-zinc-200 shadow-sm transition-colors hover:bg-zinc-700 disabled:opacity-50"
            aria-label="Edit this week’s workouts"
            title="Edit week"
          >
            <Pencil size={13} />
          </button>
        ) : null}
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

            return (
              <li
                key={type.id}
                className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2.5 py-2"
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                      <span className="break-words text-sm font-medium text-zinc-100">
                        {type.label}
                      </span>
                      {hasWeeklyTarget ? (
                        <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                          {formatVolume(weeklyGoal.logged, weeklyGoal.unit || unit)}
                          {' / '}
                          {formatVolume(weeklyGoal.target, weeklyGoal.unit || unit)}
                        </span>
                      ) : null}
                    </div>
                    {hasWeeklyTarget ? (
                      <div
                        className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-800"
                        role="progressbar"
                        aria-valuenow={Math.round(progressPct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${type.label} weekly progress`}
                      >
                        <div
                          className="h-full rounded-full bg-[var(--accent-500)] transition-[width] duration-300 ease-out"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <div className="relative w-14">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        aria-label={`Add ${type.label} ${unit}`}
                        title="Press Enter to add"
                        enterKeyHint="done"
                        disabled={disabled || isSaving}
                        value={inputValue}
                        onChange={(e) =>
                          setInputs((prev) => ({ ...prev, [type.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void logWorkout(type.id)
                        }}
                        className={cn(
                          'w-full rounded-md border border-zinc-700 bg-zinc-950 py-1 pl-1.5 pr-6 text-xs text-zinc-100',
                          'placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]',
                          'disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-500',
                          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                        )}
                      />
                      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-zinc-500">
                        {unit}
                      </span>
                    </div>
                  </div>
                </div>
                {(suggestionsByType.get(type.id) ?? []).map((suggestion) => (
                  <div
                    key={suggestion.whoopId}
                    className="mt-1.5 flex items-center gap-1.5 text-[10px] leading-tight text-zinc-500"
                  >
                    <span className="min-w-0 truncate">WHOOP · {suggestion.sportName}</span>
                    <span className="shrink-0 tabular-nums text-zinc-300">
                      {formatDuration(suggestion.minutes)}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        disabled={disabled || pendingWhoopId != null}
                        onClick={() => void acceptWhoopSuggestion(suggestion)}
                        className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-emerald-400 disabled:opacity-40"
                        aria-label={`Add ${suggestion.sportName} ${formatDuration(suggestion.minutes)} to ${type.label}`}
                        title="Add to this week"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={disabled || pendingWhoopId != null}
                        onClick={() => dismissWhoopSuggestion(suggestion)}
                        className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
                        aria-label={`Dismiss ${suggestion.sportName} detection`}
                        title="Dismiss"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  </div>
                ))}
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
