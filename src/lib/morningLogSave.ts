import {
  buildMorningLogGoalUpdates,
  buildMorningLogHabitUpdates,
  buildMorningLogYesterdayGoalUpdates,
  buildMorningLogYesterdayHabitUpdates,
  getMorningLogSleepConfig,
  getMorningLogWorkoutSaveEntries,
  getMorningLogYesterdayDate,
  saveMorningLogWorkoutsForDate,
} from '@/lib/morningLogConfig'
import { clearDraft } from '@/lib/dailyLogDraft'
import { buildSleepLogUpdates, type SleepMetricsConfig } from '@/lib/sleepMetrics'
import { isSupabaseConfigured } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import type { MorningLogSavePayload } from '@/components/today/MorningLogModal'
import type { DailyLog, Goal } from '@/types'

export async function persistMorningLogPayload(options: {
  userId: string
  date: string
  log: DailyLog
  yesterdayLog?: DailyLog | null
  goals: Goal[]
  sleepMetricsConfig: SleepMetricsConfig
  payload: MorningLogSavePayload
}): Promise<void> {
  const { userId, date, log, yesterdayLog, goals, sleepMetricsConfig, payload } = options

  const sleepUpdates = buildSleepLogUpdates({
    morningLog: payload.morningLog,
    sleepMetrics: payload.sleepMetrics,
    config: getMorningLogSleepConfig(sleepMetricsConfig),
    existingSleepMetrics: log.sleep_metrics,
  })
  const goalUpdates = buildMorningLogGoalUpdates(log, payload.goalValues, goals)
  const habitUpdates = buildMorningLogHabitUpdates(log, payload.habitValues, goals)
  // Sleep last so an empty sleep goal field cannot wipe morning-log sleep hours.
  const updates = { ...goalUpdates, ...habitUpdates, ...sleepUpdates }

  const todayWorkoutEntries = getMorningLogWorkoutSaveEntries(payload.goalValues, goals, 'today')
  const yesterdayDate = getMorningLogYesterdayDate(date)
  const yesterdayWorkoutEntries = getMorningLogWorkoutSaveEntries(
    payload.yesterdayGoalValues,
    goals,
    'yesterday',
  )

  if (isSupabaseConfigured) {
    const { updateDailyLogForDate, getOrCreateDailyLog } = await import('@/lib/supabase')
    await updateDailyLogForDate(userId, date, updates)

    if (
      Object.keys(payload.yesterdayGoalValues).length > 0 ||
      Object.keys(payload.yesterdayHabitValues).length > 0
    ) {
      const baseYesterdayLog = yesterdayLog ?? (await getOrCreateDailyLog(userId, yesterdayDate))
      const yesterdayUpdates = {
        ...buildMorningLogYesterdayGoalUpdates(
          baseYesterdayLog,
          payload.yesterdayGoalValues,
          goals,
        ),
        ...buildMorningLogYesterdayHabitUpdates(
          baseYesterdayLog,
          payload.yesterdayHabitValues,
          goals,
        ),
      }
      await updateDailyLogForDate(userId, yesterdayDate, yesterdayUpdates)
    }

    if (todayWorkoutEntries.length > 0) {
      await saveMorningLogWorkoutsForDate(userId, date, todayWorkoutEntries)
    }
    if (yesterdayWorkoutEntries.length > 0) {
      await saveMorningLogWorkoutsForDate(userId, yesterdayDate, yesterdayWorkoutEntries)
    }
    clearDraft(date)
    return
  }

  localStore.updateDailyLog(date, updates)

  if (
    Object.keys(payload.yesterdayGoalValues).length > 0 ||
    Object.keys(payload.yesterdayHabitValues).length > 0
  ) {
    const baseYesterdayLog = yesterdayLog ?? localStore.getOrCreateDailyLog(yesterdayDate)
    const yesterdayUpdates = {
      ...buildMorningLogYesterdayGoalUpdates(
        baseYesterdayLog,
        payload.yesterdayGoalValues,
        goals,
      ),
      ...buildMorningLogYesterdayHabitUpdates(
        baseYesterdayLog,
        payload.yesterdayHabitValues,
        goals,
      ),
    }
    localStore.updateDailyLog(yesterdayDate, yesterdayUpdates)
  }

  if (todayWorkoutEntries.length > 0) {
    await saveMorningLogWorkoutsForDate(userId, date, todayWorkoutEntries)
  }
  if (yesterdayWorkoutEntries.length > 0) {
    await saveMorningLogWorkoutsForDate(userId, yesterdayDate, yesterdayWorkoutEntries)
  }
  clearDraft(date)
}
