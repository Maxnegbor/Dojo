import { PeriodWorkoutsOverview } from '@/components/overview/PeriodWorkoutsOverview'
import { WeightProgressCard } from '@/components/overview/GoalProgressOverview'
import { WorkoutGoalsProgressSection } from '@/components/overview/WorkoutGoalsProgressSection'
import { WorkoutGoalsWeeklyProgressGrid } from '@/components/overview/WorkoutGoalsWeeklyProgressGrid'
import { useSettings } from '@/context/SettingsContext'
import { hasTarget } from '@/lib/goals'
import type { OverviewPeriod, OverviewPeriodStats } from '@/lib/overviewPeriods'
import { getActiveWeightGoal } from '@/lib/weightGoal'
import type { DailyLog, Goal, Workout } from '@/types'

interface FitnessOverviewSectionProps {
  period: OverviewPeriod
  stats: OverviewPeriodStats
  previousLabel: string
  allLogs: DailyLog[]
  workouts: Workout[]
  asOf: Date
  goals: Goal[]
  log: DailyLog | undefined
  weekLogs: DailyLog[]
  weekWorkouts: Workout[]
  date: string
  weekStartsOn: 0 | 1
}

export function FitnessOverviewSection({
  period,
  stats,
  previousLabel,
  allLogs,
  workouts,
  asOf,
  goals,
  log,
  weekLogs,
  weekWorkouts,
  date,
  weekStartsOn,
}: FitnessOverviewSectionProps) {
  const { settings } = useSettings()
  const activeWeightGoal = getActiveWeightGoal(goals)
  const hasWorkoutGoals =
    settings.showWorkoutMetrics &&
    goals.some((g) => g.is_active && g.metric_key.startsWith('workout_') && hasTarget(g))
  const hasWorkoutStats =
    stats.workoutTotalMinutes > 0 || stats.workoutStats.length > 0

  const goalProps = { goals, log, weekLogs, weekWorkouts, date, weekStartsOn }

  if (!activeWeightGoal && !hasWorkoutGoals && !hasWorkoutStats) {
    return (
      <p className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-500">
        No fitness goals or workouts logged for this period yet.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {activeWeightGoal ? (
        <WeightProgressCard
          goal={activeWeightGoal}
          weekLogs={weekLogs}
          date={date}
          weekStartsOn={weekStartsOn}
          compact
        />
      ) : null}

      {period === 'week' && hasWorkoutGoals ? (
        <WorkoutGoalsProgressSection compact hideTitle {...goalProps} />
      ) : null}

      {period === 'month' && hasWorkoutGoals ? (
        <WorkoutGoalsWeeklyProgressGrid
          goals={goals}
          logs={allLogs}
          workouts={workouts}
          asOf={asOf}
          weekStartsOn={weekStartsOn}
          showProgressFill
        />
      ) : null}

      {period !== 'week' && hasWorkoutStats ? (
        <PeriodWorkoutsOverview
          period={period}
          stats={stats}
          previousLabel={previousLabel}
          {...goalProps}
        />
      ) : null}
    </div>
  )
}
