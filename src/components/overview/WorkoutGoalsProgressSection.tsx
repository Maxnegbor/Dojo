import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { GoalProgressWithPace } from '@/components/ui/GoalProgressWithPace'
import { useSettings } from '@/context/SettingsContext'
import { goalTimeHorizonEndLabel } from '@/lib/goalPeriod'
import { hasTarget } from '@/lib/goals'
import { calculateProgress } from '@/lib/metrics'
import {
  getWorkoutTypes,
  workoutMetricKey,
  type WorkoutTypeDefinition,
} from '@/lib/workoutTypes'
import { getWeekDates } from '@/lib/utils'
import type { DailyLog, Goal, Workout } from '@/types'

interface WorkoutGoalsProgressSectionProps {
  goals: Goal[]
  log: DailyLog | undefined
  weekLogs: DailyLog[]
  weekWorkouts: Workout[]
  date: string
  weekStartsOn: 0 | 1
  compact?: boolean
  hideTitle?: boolean
}

function WorkoutGoalProgressCard({
  type,
  goal,
  compact,
  ...ctx
}: WorkoutGoalsProgressSectionProps & {
  type: WorkoutTypeDefinition
  goal: Goal
}) {
  const weekDates = getWeekDates(new Date(ctx.date), ctx.weekStartsOn)
  const progress = calculateProgress(
    goal,
    ctx.log,
    ctx.weekWorkouts,
    ctx.date,
    weekDates,
    ctx.weekLogs,
    undefined,
    ctx.weekStartsOn,
  )

  const endLabel = goalTimeHorizonEndLabel(goal, ctx.date, ctx.weekStartsOn)

  return (
    <Card className={compact ? 'p-2.5' : undefined}>
      <div className={compact ? 'mb-1 flex items-center gap-1.5' : 'mb-2 flex items-start gap-2'}>
        <span
          className={
            compact
              ? 'h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent-500)]'
              : 'mt-1 h-3 w-3 shrink-0 rounded-full bg-[var(--accent-500)]'
          }
        />
        <div className="min-w-0">
          <h3 className={compact ? 'truncate text-xs font-medium text-zinc-200' : 'text-sm font-medium text-zinc-200'}>
            {type.label}
          </h3>
          {!compact && endLabel && (
            <p className="text-[10px] text-zinc-500">
              {endLabel} · {goal.target_value} min
            </p>
          )}
        </div>
      </div>
      <GoalProgressWithPace
        goal={goal}
        asOfDate={ctx.date}
        weekStartsOn={ctx.weekStartsOn}
        size={compact ? 'sm' : 'md'}
      >
        <ProgressBar
          size={compact ? 'sm' : 'md'}
          percent={Math.min(100, progress.percent)}
          onTrack={progress.onTrack}
          label={progress.label}
        />
      </GoalProgressWithPace>
    </Card>
  )
}

export function WorkoutGoalsProgressSection({
  compact = false,
  hideTitle = false,
  ...props
}: WorkoutGoalsProgressSectionProps) {
  const { goals } = props
  const { settings } = useSettings()

  if (!settings.showWorkoutMetrics) return null

  const workoutGoals = getWorkoutTypes()
    .map((type) => ({
      type,
      goal: goals.find((g) => g.is_active && g.metric_key === workoutMetricKey(type.id)),
    }))
    .filter(({ goal }) => goal && hasTarget(goal)) as Array<{
    type: WorkoutTypeDefinition
    goal: Goal
  }>

  if (workoutGoals.length === 0) return null

  return (
    <section>
      {!hideTitle && (
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Workout Goals
        </h3>
      )}
      <div
        className={
          compact
            ? 'grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-4'
            : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'
        }
      >
        {workoutGoals.map(({ type, goal }) => (
          <WorkoutGoalProgressCard
            key={type.id}
            type={type}
            goal={goal}
            compact={compact}
            {...props}
          />
        ))}
      </div>
    </section>
  )
}
