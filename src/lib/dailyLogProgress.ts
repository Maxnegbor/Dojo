import type { DailyLog, Goal, Workout } from '@/types'
import type { WeekStartDay } from '@/types'
import { hasTarget } from '@/lib/goals'
import { isWeightGoal } from '@/lib/weightGoal'
import { getPreviousWeekDates } from '@/lib/weightGoal'
import { flushDraftToStore, setDraft, type DailyLogDraft } from '@/lib/dailyLogDraft'
import { localStore } from '@/lib/localStore'
import { calculateProgressDeltas, type ProgressDelta } from '@/lib/metrics'
import { isSupabaseConfigured } from '@/lib/supabase'
import { getWeekDates } from '@/lib/utils'

export async function flushDailyLogAndGetProgressDeltas(
  date: string,
  userId: string,
  goals: Goal[],
  logBefore: DailyLog,
  weekStartsOn: WeekStartDay,
  draft?: DailyLogDraft,
): Promise<ProgressDelta[]> {
  if (draft) setDraft(date, draft)

  const weekDates = getWeekDates(new Date(date + 'T12:00:00'), weekStartsOn)
  const prevWeekDates = getPreviousWeekDates(weekDates, weekStartsOn)
  const weekStart = prevWeekDates[0] ?? weekDates[0]
  const weekEnd = weekDates[weekDates.length - 1]
  const allLogsBefore = localStore.getDailyLogs(weekStart, weekEnd)

  let workoutsBeforeWeek: Workout[]
  if (isSupabaseConfigured) {
    const { fetchWorkouts } = await import('@/lib/supabase')
    workoutsBeforeWeek = await fetchWorkouts(userId, weekDates[0], weekEnd)
  } else {
    workoutsBeforeWeek = localStore.getWorkouts(weekDates[0], weekEnd)
  }

  await flushDraftToStore(date, userId)

  const logAfter = localStore.getOrCreateDailyLog(date)
  const allLogsAfter = localStore.getDailyLogs(weekStart, weekEnd)

  let workoutsAfterWeek: Workout[]
  if (isSupabaseConfigured) {
    const { fetchWorkouts } = await import('@/lib/supabase')
    workoutsAfterWeek = await fetchWorkouts(userId, weekStart, weekEnd)
  } else {
    workoutsAfterWeek = localStore.getWorkouts(weekStart, weekEnd)
  }

  const activeGoals = goals.filter((g) => g.is_active)

  return calculateProgressDeltas(
    activeGoals,
    logBefore,
    logAfter,
    workoutsBeforeWeek,
    workoutsAfterWeek,
    date,
    allLogsBefore,
    allLogsAfter,
    weekStartsOn,
  )
}

/** True when shutdown saved new progress for this goal today. */
export function deltaHasProgressToday(delta: ProgressDelta): boolean {
  if (isWeightGoal(delta.goal)) {
    return Math.abs(delta.percentAfter - delta.percentBefore) > 0.01
  }
  if (delta.usesWeekAverage) {
    return (
      Math.abs(delta.todayContribution) > 0.001 ||
      Math.abs(delta.after - delta.before) > 0.001 ||
      Math.abs(delta.percentAfter - delta.percentBefore) > 0.01
    )
  }
  return (
    delta.todayContribution > 0.001 ||
    delta.after > delta.before + 0.001 ||
    delta.percentAfter > delta.percentBefore + 0.01
  )
}

export function filterShutdownProgressDeltas(
  deltas: ProgressDelta[],
  focusMinutes: number,
): { deltas: ProgressDelta[]; untrackedFocusMinutes: number | null } {
  const fromGoals = deltas.filter(
    (d) => !isWeightGoal(d.goal) && d.goal.is_active && hasTarget(d.goal),
  )

  const enriched = fromGoals

  const hasActiveFocusGoal = enriched.some(
    (d) => d.goal.metric_key === 'focus' && d.goal.is_active && hasTarget(d.goal),
  )
  const untrackedFocusMinutes =
    focusMinutes > 0 && !hasActiveFocusGoal ? focusMinutes : null

  return { deltas: enriched, untrackedFocusMinutes }
}
