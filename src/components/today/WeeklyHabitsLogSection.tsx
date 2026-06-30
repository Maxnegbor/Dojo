import { useCallback, useEffect, useState } from 'react'
import { parseISO } from 'date-fns'
import { HabitLogRow } from '@/components/today/HabitLogRow'
import { useHabitCompleteAnimation } from '@/hooks/useHabitCompleteAnimation'
import { getHabitTargetLabel } from '@/lib/habitRamp'
import {
  habitWeeklyLogKey,
  useWeeklyLogHabitTypes,
  type HabitTypeDefinition,
} from '@/lib/habitTypes'
import { playHabitCheckSound } from '@/lib/timerSound'
import { getWeeklyLog, setWeeklyLogValue } from '@/lib/weeklyLogStore'
import { getWeeklyShutdownWeekKey } from '@/lib/weeklyShutdown'
import { getWeekDates } from '@/lib/utils'

interface WeeklyHabitsLogSectionProps {
  date: string
  weekStartsOn: 0 | 1
  disabled?: boolean
  compact?: boolean
}

export function WeeklyHabitsLogSection({
  date,
  weekStartsOn,
  disabled = false,
  compact = false,
}: WeeklyHabitsLogSectionProps) {
  const weeklyHabits = useWeeklyLogHabitTypes()
  const weekDates = getWeekDates(parseISO(`${date}T12:00:00`), weekStartsOn)
  const weekKey = getWeeklyShutdownWeekKey(weekDates)
  const { getPhase, startComplete, clearPhase } = useHabitCompleteAnimation()

  const readDoneState = useCallback(() => {
    const stored = getWeeklyLog(weekKey)
    const next: Record<string, boolean> = {}
    for (const habit of weeklyHabits) {
      next[habit.id] = stored[habitWeeklyLogKey(habit.id)] === 1
    }
    return next
  }, [weekKey, weeklyHabits])

  const [doneByHabit, setDoneByHabit] = useState(readDoneState)

  useEffect(() => {
    setDoneByHabit(readDoneState())
  }, [readDoneState])

  if (weeklyHabits.length === 0) return null

  const toggleWeeklyHabit = (habitId: string) => {
    if (disabled) return
    const key = habitWeeklyLogKey(habitId)
    const done = doneByHabit[habitId] ?? false
    if (!done) {
      playHabitCheckSound()
      startComplete(habitId)
    } else {
      clearPhase(habitId)
    }
    const nextDone = !done
    setDoneByHabit((prev) => ({ ...prev, [habitId]: nextDone }))
    setWeeklyLogValue(weekKey, key, nextDone ? 1 : 0)
  }

  const renderRow = (habit: HabitTypeDefinition) => (
    <HabitLogRow
      habit={habit}
      done={doneByHabit[habit.id] ?? false}
      phase={getPhase(habit.id)}
      targetLabel={getHabitTargetLabel(habit)}
      streak={0}
      disabled={disabled}
      onToggle={() => toggleWeeklyHabit(habit.id)}
    />
  )

  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Weekly habits
      </p>
      {compact ? (
        <div className="grid grid-cols-2 gap-1.5">
          {weeklyHabits.map((habit) => (
            <div key={habit.id}>{renderRow(habit)}</div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {weeklyHabits.map((habit) => (
            <div key={habit.id}>{renderRow(habit)}</div>
          ))}
        </div>
      )}
    </div>
  )
}
