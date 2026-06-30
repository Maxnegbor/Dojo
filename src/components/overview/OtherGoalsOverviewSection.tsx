import { GoalProgressOverview } from '@/components/overview/GoalProgressOverview'
import type { DailyLog, Goal, Workout } from '@/types'

interface OtherGoalsOverviewSectionProps {
  goals: Goal[]
  log: DailyLog | undefined
  weekLogs: DailyLog[]
  weekWorkouts: Workout[]
  date: string
  weekStartsOn: 0 | 1
  stepsTotal?: number
  stepsLabel?: string
}

export function OtherGoalsOverviewSection({
  goals,
  log,
  weekLogs,
  weekWorkouts,
  date,
  weekStartsOn,
  stepsTotal = 0,
  stepsLabel = 'this week',
}: OtherGoalsOverviewSectionProps) {
  const goalProps = { goals, log, weekLogs, weekWorkouts, date, weekStartsOn }

  return (
    <div className="space-y-5">
      {stepsTotal > 0 && (
        <p className="text-[10px] text-zinc-500">
          {stepsTotal.toLocaleString()} steps {stepsLabel}
        </p>
      )}

      <GoalProgressOverview excludeWorkouts excludeSleep excludeWeight {...goalProps} />
    </div>
  )
}
