import { useCallback, useMemo, useState } from 'react'
import { GoalMetricInput } from '@/components/ui/GoalMetricInput'
import { WeightStepper } from '@/components/ui/WeightStepper'
import { HabitLogRow } from '@/components/today/HabitLogRow'
import { useSettings } from '@/context/SettingsContext'
import { useHabitCompleteAnimation } from '@/hooks/useHabitCompleteAnimation'
import { getHabitTargetLabel } from '@/lib/habitRamp'
import {
  getWeeklyLogHabitTypes,
  habitWeeklyLogKey,
  type HabitTypeDefinition,
} from '@/lib/habitTypes'
import { getWeeklyShutdownLogGoals } from '@/lib/trackedLogsNet'
import { playHabitCheckSound } from '@/lib/timerSound'
import { resolvePriorWeeklyWeight } from '@/lib/weightAutofill'
import { getActiveWeightGoal, isWeightGoal } from '@/lib/weightGoal'
import { getWeeklyLog, setWeeklyLog } from '@/lib/weeklyLogStore'
import { getWeeklyShutdownWeekKey } from '@/lib/weeklyShutdown'
import type { Goal } from '@/types'
import { parseHrsMinToMinutes, usesTimedMetricInput } from '@/lib/timedMetrics'

export interface WeeklyLogDraft {
  weightKg: number | null
  weeklyValues: Record<string, string>
}

export function readWeeklyLogDraft(weekDates: string[], goals: Goal[]): WeeklyLogDraft {
  const weekKey = getWeeklyShutdownWeekKey(weekDates)
  const stored = getWeeklyLog(weekKey)
  const weeklyValues: Record<string, string> = {}
  for (const goal of getWeeklyShutdownLogGoals(goals)) {
    if (isWeightGoal(goal)) continue
    const value = stored[goal.metric_key]
    if (value != null) weeklyValues[goal.metric_key] = String(value)
  }
  for (const habit of getWeeklyLogHabitTypes()) {
    const key = habitWeeklyLogKey(habit.id)
    const value = stored[key]
    weeklyValues[key] = value != null ? String(value) : '0'
  }
  const storedWeight = stored.weight
  return {
    weightKg:
      storedWeight != null
        ? storedWeight
        : resolvePriorWeeklyWeight(weekDates, 1) ?? null,
    weeklyValues,
  }
}

function persistWeeklyLogDraft(weekDates: string[], goals: Goal[], draft: WeeklyLogDraft) {
  const weekKey = getWeeklyShutdownWeekKey(weekDates)
  const weeklyLogGoals = getWeeklyShutdownLogGoals(goals)
  const weightGoal = getActiveWeightGoal(weeklyLogGoals)
  const otherWeeklyGoals = weeklyLogGoals.filter((goal) => !isWeightGoal(goal))
  const toSave: Record<string, number | null> = {}
  if (weightGoal && draft.weightKg != null) {
    toSave.weight = draft.weightKg
  }
  for (const goal of otherWeeklyGoals) {
    const raw = draft.weeklyValues[goal.metric_key]?.trim()
    if (!raw) {
      toSave[goal.metric_key] = null
      continue
    }
    if (usesTimedMetricInput(goal.unit, goal.metric_key)) {
      toSave[goal.metric_key] = parseHrsMinToMinutes(raw)
      continue
    }
    toSave[goal.metric_key] = parseFloat(raw)
  }
  for (const habit of getWeeklyLogHabitTypes()) {
    const key = habitWeeklyLogKey(habit.id)
    const raw = draft.weeklyValues[key]?.trim()
    toSave[key] = raw === '1' ? 1 : 0
  }
  setWeeklyLog(weekKey, toSave)
}

export function useWeeklyLogDraft(weekDates: string[], goals: Goal[]) {
  const { settings } = useSettings()
  const weeklyLogGoals = useMemo(() => getWeeklyShutdownLogGoals(goals), [goals])
  const weightGoal = useMemo(() => getActiveWeightGoal(weeklyLogGoals), [weeklyLogGoals])
  const otherWeeklyGoals = useMemo(
    () => weeklyLogGoals.filter((goal) => !isWeightGoal(goal)),
    [weeklyLogGoals],
  )
  const weeklyLogHabits = useMemo(() => getWeeklyLogHabitTypes(), [])
  const { getPhase, startComplete, clearPhase } = useHabitCompleteAnimation()

  const [weightKg, setWeightKg] = useState<number | null>(() => {
    const stored = getWeeklyLog(getWeeklyShutdownWeekKey(weekDates)).weight
    if (stored != null) return stored
    return resolvePriorWeeklyWeight(weekDates, settings.weekStartsOn)
  })
  const [weeklyValues, setWeeklyValues] = useState<Record<string, string>>(() => {
    return readWeeklyLogDraft(weekDates, goals).weeklyValues
  })

  const isHabitDone = (habitId: string) => weeklyValues[habitWeeklyLogKey(habitId)] === '1'

  const toggleWeeklyHabit = (habitId: string) => {
    const key = habitWeeklyLogKey(habitId)
    const done = isHabitDone(habitId)
    if (!done) {
      playHabitCheckSound()
      startComplete(habitId)
    } else {
      clearPhase(habitId)
    }
    setWeeklyValues((prev) => ({
      ...prev,
      [key]: done ? '0' : '1',
    }))
  }

  const persist = useCallback(() => {
    persistWeeklyLogDraft(weekDates, goals, { weightKg, weeklyValues })
  }, [weekDates, goals, weightKg, weeklyValues])

  const weightComplete = !weightGoal || weightKg != null
  const otherWeeklyGoalsComplete =
    otherWeeklyGoals.length === 0 ||
    otherWeeklyGoals.every((goal) => {
      const raw = weeklyValues[goal.metric_key]?.trim()
      if (raw == null || raw === '') return false
      if (usesTimedMetricInput(goal.unit, goal.metric_key)) {
        return parseHrsMinToMinutes(raw) != null
      }
      return !Number.isNaN(parseFloat(raw))
    })

  return {
    weeklyLogGoals,
    weightGoal,
    otherWeeklyGoals,
    weeklyLogHabits,
    weightKg,
    setWeightKg,
    weeklyValues,
    setWeeklyValues,
    isHabitDone,
    toggleWeeklyHabit,
    getPhase,
    persist,
    inputsComplete: weightComplete && otherWeeklyGoalsComplete,
    hasItems: weeklyLogHabits.length > 0 || weeklyLogGoals.length > 0,
  }
}

interface WeeklyLogFieldsProps {
  draft: ReturnType<typeof useWeeklyLogDraft>
  heading?: string
  description?: string
}

export function WeeklyLogFields({ draft, heading, description }: WeeklyLogFieldsProps) {
  const { settings } = useSettings()
  const {
    weeklyLogGoals,
    weightGoal,
    otherWeeklyGoals,
    weeklyLogHabits,
    weightKg,
    setWeightKg,
    weeklyValues,
    setWeeklyValues,
    toggleWeeklyHabit,
    getPhase,
    isHabitDone,
  } = draft

  const renderWeeklyHabitRow = (habit: HabitTypeDefinition) => (
    <HabitLogRow
      habit={habit}
      done={isHabitDone(habit.id)}
      phase={getPhase(habit.id)}
      targetLabel={getHabitTargetLabel(habit)}
      streak={0}
      disabled={false}
      onToggle={() => toggleWeeklyHabit(habit.id)}
    />
  )

  if (!draft.hasItems) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-3 text-xs text-zinc-500">
        No weekly log items this week. Weight and other weekly metrics show up here.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {weeklyLogHabits.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Weekly habits
          </p>
          <div className="space-y-1">
            {weeklyLogHabits.map((habit) => (
              <div key={habit.id}>{renderWeeklyHabitRow(habit)}</div>
            ))}
          </div>
        </section>
      )}

      {weeklyLogGoals.length > 0 && (
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
          {heading ? (
            <h3 className="mb-1 text-sm font-semibold text-[var(--accent-300)]">{heading}</h3>
          ) : null}
          {description ? <p className="mb-4 text-xs text-zinc-500">{description}</p> : null}
          <div className="space-y-4">
            {weightGoal && (
              <WeightStepper
                label={weightGoal.name}
                valueKg={weightKg}
                unit={settings.weightUnit}
                onChange={setWeightKg}
              />
            )}

            {otherWeeklyGoals.map((goal) => (
              <GoalMetricInput
                key={goal.id}
                label={goal.name}
                unit={goal.unit}
                metricKey={goal.metric_key}
                value={
                  weeklyValues[goal.metric_key]
                    ? usesTimedMetricInput(goal.unit, goal.metric_key)
                      ? parseHrsMinToMinutes(weeklyValues[goal.metric_key]!)
                      : parseFloat(weeklyValues[goal.metric_key]!)
                    : null
                }
                onChange={(value) =>
                  setWeeklyValues((prev) => ({
                    ...prev,
                    [goal.metric_key]: value != null ? String(value) : '',
                  }))
                }
                placeholder="0"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
