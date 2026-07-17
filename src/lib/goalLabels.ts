import type { Goal } from '@/types'
import { goalTargetPeriod, goalTimeHorizonEndLabel } from '@/lib/goalPeriod'
import { isWeightGoal, weightGoalMode, weightGoalModeLabel } from '@/lib/weightGoal'

/** User-facing goal period label — never "average". */
export function goalProgressPeriodLabel(
  goal: Goal,
  asOfDate?: string,
  weekStartsOn: 0 | 1 = 1,
): string {
  if (isWeightGoal(goal)) {
    const mode = weightGoalModeLabel(weightGoalMode(goal))
    if (goal.period_start_date && goal.period_end_date) {
      const range = goalTimeHorizonEndLabel(goal, asOfDate ?? goal.period_start_date, weekStartsOn)
      return range ? `${mode} · ${range}` : `${mode} goal`
    }
    return `${mode} goal`
  }

  if (asOfDate) {
    const endLabel = goalTimeHorizonEndLabel(goal, asOfDate, weekStartsOn)
    if (endLabel) return endLabel
  }

  const period = goalTargetPeriod(goal)
  if (period === 'weekly') return 'Weekly goal'
  if (period === 'daily') return 'Daily goal'
  if (period === 'custom_duration' && goal.period_days) {
    if (goal.period_days === 30 || goal.period_days === 31) return 'Monthly goal'
    if (goal.period_days % 7 === 0 && goal.period_days >= 7) {
      const weeks = goal.period_days / 7
      return weeks === 1 ? 'Weekly goal' : `${weeks}-week goal`
    }
    return `${goal.period_days}-day goal`
  }
  if (period === 'custom_date') return 'Period goal'
  return 'Goal'
}

export function towardGoalLabel(goal: Goal): string {
  const period = goalTargetPeriod(goal)
  if (period === 'weekly') return 'toward weekly goal'
  if (period === 'custom_duration' && goal.period_days && (goal.period_days === 30 || goal.period_days === 31)) {
    return 'toward monthly goal'
  }
  return 'toward goal'
}
