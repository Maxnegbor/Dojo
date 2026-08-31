import type { Goal } from '@/types'
import { getFocusSettings } from '@/lib/focusStore'
import { getStaleDuplicateGoals } from '@/lib/goals'
import { withDuplicateWeightGoalsRetired } from '@/lib/weightGoal'

/**
 * Collapse duplicate / orphan goals left by older saves so review & metrics stay in sync.
 * Returns the cleaned list plus rows that should be persisted as inactive.
 */
export function cleanupStaleGoals(goals: Goal[]): {
  goals: Goal[]
  toRetire: Goal[]
} {
  if (goals.length === 0) {
    return { goals: [], toRetire: [] }
  }

  const { goals: afterWeight, toRetire: weightRetire } =
    withDuplicateWeightGoalsRetired(goals)

  const stale = getStaleDuplicateGoals(afterWeight)
  const focusEnabled = getFocusSettings().focusGoalEnabled
  const disabledFocus = afterWeight.filter(
    (goal) =>
      goal.is_active &&
      goal.metric_key === 'focus' &&
      !focusEnabled &&
      !stale.some((entry) => entry.id === goal.id),
  )

  const toRetireMap = new Map<string, Goal>()
  for (const goal of weightRetire) {
    toRetireMap.set(goal.id, goal)
  }
  for (const goal of stale) {
    toRetireMap.set(goal.id, { ...goal, is_active: false })
  }
  for (const goal of disabledFocus) {
    toRetireMap.set(goal.id, { ...goal, is_active: false, target_value: null })
  }

  const toRetire = [...toRetireMap.values()]
  if (toRetire.length === 0) return { goals: afterWeight, toRetire }

  const retiredIds = new Set(toRetire.map((goal) => goal.id))
  return {
    goals: afterWeight.map((goal) => {
      const retired = toRetireMap.get(goal.id)
      return retiredIds.has(goal.id) && retired ? retired : goal
    }),
    toRetire,
  }
}
