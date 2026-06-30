import { normalizeGoal, goalLogPeriod } from '@/lib/goals'
import { getFocusSettings, saveFocusSettings } from '@/lib/focusStore'
import { localStore } from '@/lib/localStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { FocusTimerSettings, Goal, GoalPeriod } from '@/types'
import { generateId, formatDuration } from '@/lib/utils'

export interface FocusGoalFormValues {
  period: GoalPeriod
  amount: number
  unit: 'hours' | 'minutes'
}

export function focusGoalTargetMinutes(settings: FocusTimerSettings): number {
  if (settings.focusGoalUnit === 'hours') {
    return settings.focusGoalAmount * 60
  }
  return settings.focusGoalAmount
}

export function formatFocusGoalTarget(minutes: number): string {
  return formatDuration(minutes)
}

export function goalToFocusGoalFormValues(goal: Goal): FocusGoalFormValues {
  const minutes = goal.target_value ?? 60
  if (minutes >= 60 && minutes % 60 === 0) {
    return { period: goalLogPeriod(goal), amount: minutes / 60, unit: 'hours' }
  }
  return { period: goalLogPeriod(goal), amount: minutes, unit: 'minutes' }
}

export function clearFocusGoalInSettings(): FocusTimerSettings {
  const next: FocusTimerSettings = { ...getFocusSettings(), focusGoalEnabled: false }
  saveFocusSettings(next)
  return next
}

function buildFocusGoal(userId: string, settings: FocusTimerSettings, existing?: Goal): Goal {
  return normalizeGoal({
    id: existing?.id ?? generateId(),
    user_id: userId,
    metric_key: 'focus',
    name: 'Focus',
    target_value: focusGoalTargetMinutes(settings),
    log_period: settings.focusGoalPeriod,
    goal_weight_start: null,
    goal_weight_target: null,
    unit: 'min',
    is_active: true,
    created_at: existing?.created_at ?? new Date().toISOString(),
  })
}

export async function saveFocusGoal(
  userId: string,
  settings: FocusTimerSettings,
  config: {
    period: GoalPeriod
    amount: number
    unit: 'hours' | 'minutes'
  },
): Promise<{ settings: FocusTimerSettings; goal: Goal }> {
  const next: FocusTimerSettings = {
    ...settings,
    focusGoalEnabled: true,
    focusGoalPeriod: config.period,
    focusGoalAmount: config.amount,
    focusGoalUnit: config.unit,
  }

  if (isSupabaseConfigured) {
    const { fetchGoals, upsertGoal } = await import('@/lib/supabase')
    const goals = await fetchGoals(userId)
    const existing = goals.find((g) => g.metric_key === 'focus')
    const goal = buildFocusGoal(userId, next, existing)
    await upsertGoal(goal)
    return { settings: next, goal }
  }

  const goals = localStore.getGoals()
  const existing = goals.find((g) => g.metric_key === 'focus')
  const goal = buildFocusGoal(userId, next, existing)
  localStore.upsertGoal(goal)
  return { settings: next, goal }
}

export async function syncFocusGoalFromSettings(
  userId: string,
  settings: FocusTimerSettings,
): Promise<void> {
  if (isSupabaseConfigured) {
    const { fetchGoals, upsertGoal } = await import('@/lib/supabase')
    const goals = await fetchGoals(userId)
    const existing = goals.find((g) => g.metric_key === 'focus')

    if (!settings.focusGoalEnabled) {
      if (existing?.is_active) {
        await upsertGoal({ ...existing, is_active: false, target_value: null })
      }
      return
    }

    await upsertGoal(buildFocusGoal(userId, settings, existing))
    return
  }

  const goals = localStore.getGoals()
  const existing = goals.find((g) => g.metric_key === 'focus')

  if (!settings.focusGoalEnabled) {
    if (existing?.is_active) {
      localStore.upsertGoal({ ...existing, is_active: false, target_value: null })
    }
    return
  }

  localStore.upsertGoal(buildFocusGoal(userId, settings, existing))
}
