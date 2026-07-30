import type { ReactNode } from 'react'
import { OverviewComparison } from '@/components/overview/OverviewStatCard'
import { WorkoutGoalsProgressSection } from '@/components/overview/WorkoutGoalsProgressSection'
import { Card } from '@/components/ui/Card'
import { useSettings } from '@/context/SettingsContext'
import {
  formatWorkoutPeriodComparison,
  type OverviewPeriod,
  type OverviewPeriodStats,
  type WorkoutPeriodStat,
} from '@/lib/overviewPeriods'
import { cn } from '@/lib/utils'
import type { DailyLog, Goal, Workout } from '@/types'

interface PeriodWorkoutsOverviewProps {
  period: OverviewPeriod
  stats: OverviewPeriodStats
  previousLabel: string
  goals: Goal[]
  log: DailyLog | undefined
  weekLogs: DailyLog[]
  weekWorkouts: Workout[]
  date: string
  weekStartsOn: 0 | 1
}

function WorkoutStatCard({
  label,
  value,
  detail,
}: {
  label: ReactNode
  value: string
  detail?: ReactNode
}) {
  return (
    <Card className="p-2.5">
      {typeof label === 'string' ? (
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      ) : (
        <div className="flex items-center gap-1.5">{label}</div>
      )}
      <p className="mt-0.5 text-lg font-bold tabular-nums text-zinc-100">{value}</p>
      {detail ? <div className="mt-1 text-[10px] text-zinc-500">{detail}</div> : null}
    </Card>
  )
}

function WorkoutComparisonDetail({
  current,
  previous,
  previousLabel,
}: {
  current: number
  previous: number
  previousLabel: string
}) {
  const comparison = formatWorkoutPeriodComparison(current, previous, previousLabel)
  if (!comparison) return null
  return <OverviewComparison {...comparison} />
}

function workoutCategoryLabel(workout: WorkoutPeriodStat) {
  return (
    <>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent-500)]" />
      <span className="truncate text-xs font-medium text-zinc-200">{workout.label}</span>
    </>
  )
}

function weeklyAvg(minutes: number, weeks: number): number {
  return minutes / Math.max(1, weeks)
}

export function PeriodWorkoutsOverview({
  period,
  stats,
  previousLabel,
  ...goalProps
}: PeriodWorkoutsOverviewProps) {
  const { settings } = useSettings()

  if (period === 'week' && settings.showWorkoutMetrics) {
    return <WorkoutGoalsProgressSection compact {...goalProps} />
  }

  const hasWorkouts = stats.workoutTotalMinutes > 0 || stats.workoutStats.length > 0
  if (!hasWorkouts) return null

  const totalWeeklyAvg = stats.workoutWeeklyAvgMinutes
  const totalPreviousWeeklyAvg = stats.workoutPreviousWeeklyAvgMinutes
  const weeks = stats.workoutWeeksInPeriod
  const previousWeeks = stats.workoutPreviousWeeksInPeriod

  const categoryStats = stats.workoutStats.map((workout) => ({
    ...workout,
    weeklyAvg: weeklyAvg(workout.minutes, weeks),
    previousWeeklyAvg: weeklyAvg(workout.previousMinutes, previousWeeks),
  }))

  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Workouts
      </h3>
      <div
        className={cn(
          'grid gap-2',
          categoryStats.length >= 3
            ? 'grid-cols-2 xl:grid-cols-4'
            : 'grid-cols-2 sm:grid-cols-3',
        )}
      >
        <WorkoutStatCard
          label="Weekly workout time"
          value={`${Math.round(totalWeeklyAvg)}m`}
          detail={
            <WorkoutComparisonDetail
              current={totalWeeklyAvg}
              previous={totalPreviousWeeklyAvg}
              previousLabel={previousLabel}
            />
          }
        />
        {categoryStats.map((workout) => (
          <WorkoutStatCard
            key={workout.id}
            label={workoutCategoryLabel(workout)}
            value={`${Math.round(workout.weeklyAvg)}m`}
            detail={
              <WorkoutComparisonDetail
                current={workout.weeklyAvg}
                previous={workout.previousWeeklyAvg}
                previousLabel={previousLabel}
              />
            }
          />
        ))}
      </div>
    </section>
  )
}
