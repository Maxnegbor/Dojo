import { parseISO } from 'date-fns'
import { PeriodWorkoutsOverview } from '@/components/overview/PeriodWorkoutsOverview'
import { WeightProgressCard } from '@/components/overview/GoalProgressOverview'
import { WorkoutGoalsWeeklyProgressGrid } from '@/components/overview/WorkoutGoalsWeeklyProgressGrid'
import { Card } from '@/components/ui/Card'
import { useSettings } from '@/context/SettingsContext'
import { getActiveGoalByMetricKey, hasTarget } from '@/lib/goals'
import { getWeeklyWorkoutTotal } from '@/lib/metrics'
import type { OverviewPeriod, OverviewPeriodStats } from '@/lib/overviewPeriods'
import { getActiveWeightGoal } from '@/lib/weightGoal'
import {
  DEFAULT_WORKOUT_UNIT,
  getWorkoutTypes,
  workoutMetricKey,
} from '@/lib/workoutTypes'
import { cn, getWeekDates } from '@/lib/utils'
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

function WeeklyWorkoutTargets({
  goals,
  workouts,
  date,
  weekStartsOn,
}: {
  goals: Goal[]
  workouts: Workout[]
  date: string
  weekStartsOn: 0 | 1
}) {
  const weekDates = getWeekDates(parseISO(`${date}T12:00:00`), weekStartsOn)
  const rows = getWorkoutTypes()
    .map((type) => {
      const goal = getActiveGoalByMetricKey(goals, workoutMetricKey(type.id))
      if (!goal || !hasTarget(goal) || (goal.target_value ?? 0) <= 0) return null
      const logged = getWeeklyWorkoutTotal(type.id, workouts, weekDates)
      const target = Math.round(goal.target_value ?? 0)
      const unit = goal.unit || type.unit || DEFAULT_WORKOUT_UNIT
      const percent = target > 0 ? Math.min(100, (logged / target) * 100) : 0
      return { type, logged, target, unit, percent, complete: logged >= target }
    })
    .filter((row): row is NonNullable<typeof row> => row != null)

  if (rows.length === 0) return null

  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Weekly targets
      </h3>
      <ul className="space-y-1.5">
        {rows.map(({ type, logged, target, unit, percent, complete }) => (
          <li key={type.id}>
            <Card
              className={cn(
                'relative overflow-hidden p-3',
                complete && 'ring-1 ring-[var(--accent-ring)]',
              )}
            >
              {percent > 0 && (
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 bg-[var(--accent-500)]/25 transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                  aria-hidden
                />
              )}
              <div className="relative z-[1] flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent-500)]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">{type.label}</p>
                    <p className="text-[10px] tabular-nums text-zinc-400">
                      {logged} / {target} {unit}
                    </p>
                  </div>
                </div>
                <p
                  className={cn(
                    'shrink-0 text-sm font-semibold tabular-nums',
                    complete ? 'text-[var(--accent-300)]' : 'text-zinc-300',
                  )}
                >
                  {Math.round(percent)}%
                </p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
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

      {period === 'week' && settings.showWorkoutMetrics && hasWorkoutGoals ? (
        <WeeklyWorkoutTargets
          goals={goals}
          workouts={workouts}
          date={date}
          weekStartsOn={weekStartsOn}
        />
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
