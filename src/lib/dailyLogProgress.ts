import type { DailyLog, Goal, Workout } from '@/types'
import type { WeekStartDay } from '@/types'
import { goalLogPeriod } from '@/lib/goals'
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

export function filterShutdownProgressDeltas(
  deltas: ProgressDelta[],
  focusMinutes: number,
): ProgressDelta[] {
  const fromGoals = deltas.filter((d) => {
    if (d.todayContribution > 0) return true
    if (d.percentAfter > 0) return true
    if (d.goal.metric_key.startsWith('custom:') && d.after > 0) return true
    if (isWeightGoal(d.goal) && (d.todayContribution > 0 || d.percentAfter !== d.percentBefore)) return true
    if (d.goal.metric_key === 'focus' && focusMinutes > 0) return true
    return false
  })

  const enriched = fromGoals.map((d) => {
    if (d.goal.metric_key === 'focus' && focusMinutes > 0) {
      const target = d.target ?? 0
      const percentAfter =
        goalLogPeriod(d.goal) === 'daily' && target > 0
          ? Math.min(100, (focusMinutes / target) * 100)
          : d.percentAfter
      return {
        ...d,
        after: goalLogPeriod(d.goal) === 'daily' ? focusMinutes : d.after,
        todayContribution: focusMinutes,
        percentAfter,
      }
    }
    if (d.goal.metric_key.startsWith('custom:') && d.after > 0 && d.todayContribution === 0) {
      return { ...d, todayContribution: d.after }
    }
    return d
  })

  const hasFocusGoal = enriched.some((d) => d.goal.metric_key === 'focus')
  if (focusMinutes > 0 && !hasFocusGoal) {
    enriched.push({
      goal: {
        id: '__focus_summary__',
        user_id: '',
        metric_key: 'focus',
        name: 'Focus',
        target_value: focusMinutes,
        log_period: 'daily',
        goal_weight_start: null,
        goal_weight_target: null,
        unit: 'min',
        is_active: true,
        created_at: '',
      },
      before: 0,
      after: focusMinutes,
      todayContribution: focusMinutes,
      target: focusMinutes,
      percentBefore: 0,
      percentAfter: 100,
      isWeekly: false,
      unit: 'min',
      name: 'Focus',
    })
  }

  return enriched
}
