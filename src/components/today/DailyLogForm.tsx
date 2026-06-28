import { useCallback, useEffect, useMemo, useState } from 'react'
import { Brain, Moon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MetricInput } from '@/components/ui/MetricInput'
import { WeightStepper } from '@/components/ui/WeightStepper'
import { HabitStreakBadge } from '@/components/today/HabitStreakBadge'
import type { DailyLog, Goal, Workout, WorkoutCategory } from '@/types'
import { getDailyLogGoals } from '@/lib/goals'
import { getDailyLogHabitTypes } from '@/lib/habitTypes'
import { getWorkoutTypes } from '@/lib/workoutTypes'
import { getHabitStreak } from '@/lib/habitStreaks'
import {
  draftFromLog,
  flushDraftToStore,
  getDraft,
  mergeDraftWithLog,
  setDraft,
  type DailyLogDraft,
  type WorkoutDrafts,
} from '@/lib/dailyLogDraft'
import { isLogEditable } from '@/lib/devFlags'
import { applyWeightAutofill } from '@/lib/weightAutofill'
import { useSettings } from '@/context/SettingsContext'
import { cn, formatDate } from '@/lib/utils'

interface DailyLogFormProps {
  log: DailyLog
  goals: Goal[]
  workouts: Workout[]
  streakLogs?: DailyLog[]
  embedded?: boolean
  userId?: string
  onSaved?: () => void
}

export function DailyLogForm({
  log,
  goals,
  workouts,
  streakLogs = [],
  embedded = false,
  userId,
  onSaved,
}: DailyLogFormProps) {
  const { settings } = useSettings()
  const today = formatDate(new Date())
  const isEditableDay = isLogEditable(log.date, today)
  const isPastDay = log.date < today
  const needsManualSave = isPastDay && isEditableDay

  const dailyGoals = useMemo(() => getDailyLogGoals(goals), [goals])
  const dailyHabits = useMemo(() => getDailyLogHabitTypes(), [])
  const workoutTypes = useMemo(() => getWorkoutTypes(), [])
  const hasDailyLogItems =
    dailyGoals.some((g) => !g.metric_key.startsWith('workout_')) ||
    dailyHabits.length > 0 ||
    workoutTypes.length > 0

  const buildDraft = useCallback((): DailyLogDraft => {
    if (!isEditableDay) {
      return draftFromLog(log, workouts)
    }
    const base = mergeDraftWithLog(log, getDraft(log.date), workouts)
    if (log.date >= today) {
      return applyWeightAutofill(base, log.date, streakLogs)
    }
    return base
  }, [log, workouts, today, isEditableDay, streakLogs])

  const [draft, setDraftState] = useState<DailyLogDraft>(buildDraft)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  const habitStreaks = useMemo(() => {
    return dailyHabits.reduce(
      (acc, habit) => {
        acc[habit.id] = getHabitStreak(streakLogs, habit.id, log.date, draft.habits)
        return acc
      },
      {} as Record<string, number>,
    )
  }, [dailyHabits, streakLogs, log.date, draft.habits])

  useEffect(() => {
    const next = buildDraft()
    setDraftState(next)
    if (isEditableDay && log.date >= today) {
      const stored = getDraft(log.date)
      const hadWeight = log.weight != null || stored?.weight != null
      if (!hadWeight && next.weight != null) {
        setDraft(log.date, next)
      }
    }
  }, [buildDraft, isEditableDay, log.date, log.weight, today])

  const updateDraft = useCallback(
    (patch: Partial<DailyLogDraft>) => {
      setDraftState((prev) => {
        const next = { ...prev, ...patch }
        if (isEditableDay) setDraft(log.date, next)
        return next
      })
    },
    [log.date, isEditableDay],
  )

  const savePastDay = async () => {
    if (!userId || !needsManualSave) return
    setSaving(true)
    try {
      await flushDraftToStore(log.date, userId)
      setSavedFlash(true)
      onSaved?.()
      window.setTimeout(() => setSavedFlash(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const workoutDrafts: WorkoutDrafts = draft.workouts ?? {}

  const toggleWorkout = (category: WorkoutCategory) => {
    const next = { ...workoutDrafts }
    if (category in next) delete next[category]
    else next[category] = null
    updateDraft({ workouts: next })
  }

  const setWorkoutDuration = (category: WorkoutCategory, raw: string) => {
    updateDraft({
      workouts: {
        ...workoutDrafts,
        [category]: raw ? parseInt(raw, 10) : null,
      },
    })
  }

  const toggleHabit = (habitId: string) => {
    const current = draft.habits?.[habitId] ?? false
    updateDraft({
      habits: {
        ...(draft.habits ?? {}),
        [habitId]: !current,
      },
    })
  }

  const renderGoalInput = (goal: Goal) => {
    const key = goal.metric_key

    if (key === 'focus') {
      const minutes = log.focus_minutes ?? 0
      return (
        <div
          key={goal.id}
          className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2.5"
        >
          <div>
            <p className="text-xs font-medium text-zinc-300">{goal.name}</p>
            <p className="text-[10px] text-zinc-500">Tracked by focus timer</p>
          </div>
          <span className="flex items-center gap-1 text-sm tabular-nums text-[var(--accent-300)]">
            <Brain size={14} />
            {minutes} {goal.unit}
          </span>
        </div>
      )
    }

    if (key === 'sleep') {
      return (
        <MetricInput
          key={goal.id}
          label={goal.name}
          unit={goal.unit}
          step="0.5"
          value={draft.sleep_hours ?? ''}
          disabled={!isEditableDay}
          onChange={(e) =>
            updateDraft({ sleep_hours: e.target.value ? parseFloat(e.target.value) : null })
          }
        />
      )
    }

    if (key === 'weight') {
      return (
        <WeightStepper
          key={goal.id}
          label={goal.name}
          valueKg={draft.weight ?? null}
          unit={settings.weightUnit}
          disabled={!isEditableDay}
          onChange={(weight) => updateDraft({ weight })}
        />
      )
    }

    if (key === 'steps') {
      return (
        <MetricInput
          key={goal.id}
          label={goal.name}
          unit={goal.unit}
          value={draft.steps ?? ''}
          disabled={!isEditableDay}
          onChange={(e) =>
            updateDraft({ steps: e.target.value ? parseInt(e.target.value, 10) : null })
          }
        />
      )
    }

    if (key === 'screen_time') {
      return (
        <MetricInput
          key={goal.id}
          label={goal.name}
          unit={goal.unit}
          value={draft.screen_time_minutes ?? ''}
          disabled={!isEditableDay}
          onChange={(e) =>
            updateDraft({
              screen_time_minutes: e.target.value ? parseInt(e.target.value, 10) : null,
            })
          }
        />
      )
    }

    if (key.startsWith('custom:')) {
      return (
        <MetricInput
          key={goal.id}
          label={goal.name}
          unit={goal.unit}
          disabled={!isEditableDay}
          value={draft.custom_metrics?.[key] ?? ''}
          onChange={(e) =>
            updateDraft({
              custom_metrics: {
                ...(draft.custom_metrics ?? {}),
                [key]: e.target.value ? parseFloat(e.target.value) : null,
              },
            })
          }
        />
      )
    }

    return null
  }

  const scalarGoals = dailyGoals.filter((g) => !g.metric_key.startsWith('workout_'))
  const gridGoals = scalarGoals.filter((g) => g.metric_key !== 'focus')

  const formBody = (
    <div className="space-y-4">
      {!hasDailyLogItems ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          Nothing to log today yet. Add metrics on the Metrics page to start tracking.
        </p>
      ) : (
        <>
          {dailyHabits.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Habits
              </p>
              <div className="flex flex-wrap gap-2">
                {dailyHabits.map((habit) => {
                  const done = draft.habits?.[habit.id] ?? false
                  return (
                    <button
                      key={habit.id}
                      type="button"
                      disabled={!isEditableDay}
                      onClick={() => toggleHabit(habit.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                        done
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-zinc-800/80 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                        !isEditableDay && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      {habit.label}
                      <HabitStreakBadge streak={habitStreaks[habit.id] ?? 0} variant="circle" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {scalarGoals.some((g) => g.metric_key === 'focus') && (
            <div className="space-y-2">
              {scalarGoals
                .filter((g) => g.metric_key === 'focus')
                .map(renderGoalInput)}
            </div>
          )}

          {gridGoals.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {gridGoals.map(renderGoalInput)}
            </div>
          )}

          {workoutTypes.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Workouts
              </p>
              <div className="flex items-start gap-1">
                {workoutTypes.map((type) => {
                  const selected = type.id in workoutDrafts
                  return (
                    <button
                      key={type.id}
                      type="button"
                      disabled={!isEditableDay}
                      onClick={() => toggleWorkout(type.id)}
                      className={cn(
                        'flex min-w-0 flex-1 flex-col self-start overflow-hidden rounded-md transition-colors',
                        !selected && 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
                        !isEditableDay && 'cursor-not-allowed opacity-60',
                      )}
                      style={
                        selected
                          ? { backgroundColor: type.color, color: '#fff' }
                          : undefined
                      }
                    >
                      <span className="px-1.5 py-1.5 text-[10px] font-medium">{type.label}</span>
                      {selected && (
                        <div
                          className="mx-1 mb-1.5 flex items-center gap-0.5 rounded bg-black/25 px-1.5 py-1"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            placeholder="0"
                            disabled={!isEditableDay}
                            value={workoutDrafts[type.id] ?? ''}
                            onChange={(e) => setWorkoutDuration(type.id, e.target.value)}
                            className={cn(
                              'min-w-0 flex-1 bg-transparent text-center text-xs font-medium text-white',
                              'placeholder:text-white/40 focus:outline-none',
                              '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                            )}
                          />
                          <span className="shrink-0 text-[10px] text-white/60">min</span>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )

  if (embedded) {
    return formBody
  }

  return (
    <Card
      title="Daily Log"
      action={
        needsManualSave ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={savePastDay}
            disabled={saving}
            className={savedFlash ? 'border-emerald-500/50 text-emerald-400' : undefined}
          >
            {savedFlash ? 'Saved' : saving ? 'Saving…' : 'Save'}
          </Button>
        ) : isEditableDay && hasDailyLogItems ? (
          <span className="flex items-center gap-1 text-[10px] text-zinc-500">
            <Moon size={10} /> Auto-saves at shutdown
          </span>
        ) : null
      }
    >
      {formBody}
    </Card>
  )
}

export function getDailyLogDraftForDate(
  log: DailyLog,
  workouts: Workout[],
  streakLogs: DailyLog[] = [],
): DailyLogDraft {
  const today = formatDate(new Date())
  const base = mergeDraftWithLog(log, getDraft(log.date), workouts)
  if (log.date >= today && isLogEditable(log.date, today)) {
    return applyWeightAutofill(base, log.date, streakLogs)
  }
  if (log.date < today && isLogEditable(log.date, today)) {
    return base
  }
  return draftFromLog(log, workouts)
}
