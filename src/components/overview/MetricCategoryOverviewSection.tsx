import { GoalProgressOverview } from '@/components/overview/GoalProgressOverview'
import type { DailyLog, Goal, Workout } from '@/types'

interface MetricCategoryOverviewSectionProps {
  categoryId: string
  goals: Goal[]
  log: DailyLog | undefined
  weekLogs: DailyLog[]
  weekWorkouts: Workout[]
  date: string
  weekStartsOn: 0 | 1
}

/** Overview content for one Metrics goal category (replaces the old Goals catch-all). */
export function MetricCategoryOverviewSection({
  categoryId,
  ...goalProps
}: MetricCategoryOverviewSectionProps) {
  return (
    <GoalProgressOverview
      categoryId={categoryId}
      excludeWorkouts
      excludeSleep
      excludeWeight
      {...goalProps}
    />
  )
}
