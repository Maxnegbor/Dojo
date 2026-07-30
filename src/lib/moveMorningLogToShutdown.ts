import {
  habitIdFromMorningLogKey,
  isHabitMorningLogKey,
  isWorkoutMorningLogKey,
  saveMorningLogGoalKeys,
  saveMorningLogSleepFieldIds,
  saveMorningLogYesterdayKeys,
  getMorningLogGoalKeys,
  getMorningLogSleepFieldIds,
  getMorningLogYesterdayKeys,
  workoutCategoryFromMorningLogKey,
  type MorningLogItem,
} from '@/lib/morningLogConfig'
import {
  getShutdownLogGoalKeys,
  getShutdownLogSleepFieldIds,
  saveShutdownLogGoalKeys,
  saveShutdownLogSleepFieldIds,
} from '@/lib/shutdownLogConfig'
import { getHabitTypes, saveHabitTypes } from '@/lib/habitTypes'
import { getWorkoutTypes, saveWorkoutTypes } from '@/lib/workoutTypes'
import { normalizeGoal, goalLogPeriod } from '@/lib/goals'
import type { Goal } from '@/types'

/**
 * Remove an item from the morning log and track it at daily shutdown instead.
 * Updates Ask-in (`log_when`) to shutdown for habits, workouts, and goals.
 * Returns an updated goal when the Metrics goal row needs persisting.
 */
export function moveMorningLogItemToShutdown(item: MorningLogItem): { updatedGoal?: Goal } {
  if (item.kind === 'sleep' && item.sleepFieldId) {
    const fieldId = item.sleepFieldId
    saveMorningLogSleepFieldIds(getMorningLogSleepFieldIds().filter((id) => id !== fieldId))
    const shutdownSleep = getShutdownLogSleepFieldIds()
    if (!shutdownSleep.includes(fieldId)) {
      saveShutdownLogSleepFieldIds([...shutdownSleep, fieldId])
    }
    return {}
  }

  if (item.kind === 'habit' && item.metricKey && isHabitMorningLogKey(item.metricKey)) {
    const habitId = habitIdFromMorningLogKey(item.metricKey)
    saveHabitTypes(
      getHabitTypes().map((habit) => {
        if (habit.id !== habitId) return habit
        const next = { ...habit, log_when: 'shutdown' as const }
        delete next.morning_day
        return next
      }),
    )
    clearMorningListKeys(item.metricKey)
    return {}
  }

  if (item.kind === 'workout' && item.metricKey && isWorkoutMorningLogKey(item.metricKey)) {
    const category = workoutCategoryFromMorningLogKey(item.metricKey)
    saveWorkoutTypes(
      getWorkoutTypes().map((type) => {
        if (type.id !== category) return type
        const next = { ...type, log_period: 'daily' as const, log_when: 'shutdown' as const }
        delete next.morning_day
        return next
      }),
    )
    clearMorningListKeys(item.metricKey)
    return {}
  }

  // Goals / weight / other metric keys
  if (item.metricKey) {
    clearMorningListKeys(item.metricKey)
    // Weekly weight returns to weekly shutdown — never daily shutdown.
    if (
      (item.kind === 'weight' || item.metricKey === 'weight') &&
      (!item.goal || goalLogPeriod(item.goal) === 'weekly')
    ) {
      saveShutdownLogGoalKeys(getShutdownLogGoalKeys().filter((key) => key !== item.metricKey))
      return {}
    }
    const shutdownGoals = getShutdownLogGoalKeys()
    if (!shutdownGoals.includes(item.metricKey)) {
      saveShutdownLogGoalKeys([...shutdownGoals, item.metricKey])
    }
  }

  if (item.goal) {
    const updatedGoal = normalizeGoal({
      ...item.goal,
      log_when: 'shutdown',
    })
    delete updatedGoal.morning_day
    return { updatedGoal }
  }

  return {}
}

function clearMorningListKeys(metricKey: NonNullable<MorningLogItem['metricKey']>) {
  saveMorningLogGoalKeys(getMorningLogGoalKeys().filter((key) => key !== metricKey))
  saveMorningLogYesterdayKeys(getMorningLogYesterdayKeys().filter((key) => key !== metricKey))
}
