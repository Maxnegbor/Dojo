import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { GoalProgressWithPace } from '@/components/ui/GoalProgressWithPace'
import { useSettings } from '@/context/SettingsContext'
import { formatGoalScheduleLabel, goalTimeHorizonEndLabel } from '@/lib/goalPeriod'
import { formatFocusGoalTarget } from '@/lib/focusGoalSync'
import { formatGoalTargetLabel } from '@/lib/timedMetrics'
import {
  resolveGoalCategoryId,
} from '@/lib/goalCategories'
import { getVisibleGoalCategories } from '@/lib/metricsSections'
import { hasTarget } from '@/lib/goals'
import { calculateProgress } from '@/lib/metrics'
import { WorkoutGoalsProgressSection } from '@/components/overview/WorkoutGoalsProgressSection'
import {
  formatWeightDelta,
  formatWeightGoalDateRange,
  formatWeightGoalRange,
  getActiveWeightGoal,
  getWeightGoalProgress,
  isWeightGoal,
  weightGoalMode,
  weightGoalModeLabel,
} from '@/lib/weightGoal'
import { getWeekDates } from '@/lib/utils'
import type { DailyLog, Goal, Workout } from '@/types'

interface GoalProgressOverviewProps {
  goals: Goal[]
  log: DailyLog | undefined
  weekLogs: DailyLog[]
  weekWorkouts: Workout[]
  date: string
  weekStartsOn: 0 | 1
  /** Only show goals in this Metrics category. */
  categoryId?: string
  /** Hide workout goal cards (e.g. when shown elsewhere on the page). */
  excludeWorkouts?: boolean
  /** Hide sleep goal cards (e.g. when shown in the sleep overview). */
  excludeSleep?: boolean
  /** Hide weight goal cards (e.g. when shown in fitness). */
  excludeWeight?: boolean
  compact?: boolean
  hideTitle?: boolean
}

function GoalProgressCard({
  goal,
  compact,
  ...ctx
}: GoalProgressOverviewProps & { goal: Goal; compact?: boolean }) {
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
  const isTimerFocusGoal = goal.metric_key === 'focus'
  const endLabel = goalTimeHorizonEndLabel(goal, ctx.date, ctx.weekStartsOn)
  const scheduleLabel = endLabel ?? formatGoalScheduleLabel(goal, ctx.date)

  if (!hasTarget(goal)) {
    return (
      <Card className={compact ? 'p-2.5' : undefined}>
        <h3 className={compact ? 'text-xs font-medium text-zinc-200' : 'text-sm font-medium text-zinc-200'}>
          {goal.name}
        </h3>
        <p className="mt-0.5 text-[10px] text-zinc-500">{progress.label}</p>
      </Card>
    )
  }

  return (
    <Card className={compact ? 'p-3.5' : 'p-4'}>
      <div className={compact ? 'mb-1' : 'mb-2'}>
        <h3 className={compact ? 'text-xs font-medium text-zinc-200' : 'text-sm font-medium text-zinc-200'}>
          {goal.name}
        </h3>
        {!compact && (
          <p className="text-[10px] text-zinc-500">
            {scheduleLabel}
            {` · ${isTimerFocusGoal ? formatFocusGoalTarget(goal.target_value!) : formatGoalTargetLabel(goal.target_value!, goal.unit, goal.metric_key)}`}
          </p>
        )}
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

export function WeightProgressCard({
  goal,
  weekLogs,
  date,
  weekStartsOn,
  compact,
}: {
  goal: Goal
  weekLogs: DailyLog[]
  date: string
  weekStartsOn: 0 | 1
  compact?: boolean
}) {
  const { settings } = useSettings()
  const weekDates = getWeekDates(new Date(date), weekStartsOn)
  const progress = getWeightGoalProgress(goal, weekLogs, weekDates, weekStartsOn)
  const unit = settings.weightUnit
  const mode = weightGoalMode(goal)
  const range =
    goal.goal_weight_start != null && goal.goal_weight_target != null
      ? formatWeightGoalRange(goal.goal_weight_start, goal.goal_weight_target, unit)
      : null
  const dateRange = formatWeightGoalDateRange(goal)
  const barLabel = `${progress.detail} (${formatWeightDelta(progress.lastWeekAvg, progress.thisWeekAvg, unit)})`

  return (
    <Card className={compact ? 'p-3.5' : 'p-4'}>
      <div className={compact ? 'mb-1 min-w-0' : 'mb-3 min-w-0'}>
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {weightGoalModeLabel(mode)} goal
        </p>
        {range && (
          <p
            className={
              compact
                ? 'mt-0.5 text-sm font-semibold tabular-nums leading-tight text-zinc-100'
                : 'mt-1 text-lg font-semibold tabular-nums leading-tight text-zinc-100'
            }
          >
            {range}
          </p>
        )}
        {dateRange && (
          <p className="mt-0.5 text-[10px] text-zinc-500">{dateRange}</p>
        )}
      </div>
      <GoalProgressWithPace
        goal={goal}
        asOfDate={date}
        weekStartsOn={weekStartsOn}
        size={compact ? 'sm' : 'md'}
      >
        <ProgressBar
          size={compact ? 'sm' : 'md'}
          percent={Math.min(100, progress.percentAfter)}
          onTrack={progress.hit}
          label={barLabel}
        />
      </GoalProgressWithPace>
    </Card>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  )
}

export function GoalProgressOverview(props: GoalProgressOverviewProps) {
  const {
    goals,
    date,
    excludeWorkouts = false,
    excludeSleep = false,
    excludeWeight = false,
    categoryId,
    compact = false,
    hideTitle = false,
  } = props
  const { settings } = useSettings()
  const showWorkouts = settings.showWorkoutMetrics && !excludeWorkouts && !categoryId

  const metricGoals = goals.filter(
    (g) =>
      g.is_active &&
      !g.metric_key.startsWith('workout_') &&
      !isWeightGoal(g) &&
      g.metric_key !== 'focus' &&
      !(excludeSleep && g.metric_key === 'sleep') &&
      (!categoryId || resolveGoalCategoryId(g.category_id) === categoryId),
  )
  const goalCategories = categoryId
    ? getVisibleGoalCategories().filter((category) => category.id === categoryId)
    : getVisibleGoalCategories()
  const categorySections = goalCategories
    .map((category) => ({
      category,
      goals: metricGoals.filter(
        (g) =>
          hasTarget(g) &&
          resolveGoalCategoryId(g.category_id) === category.id,
      ),
    }))
    .filter(({ goals: sectionGoals }) => sectionGoals.length > 0)
  const activeWeightGoal =
    !categoryId && !excludeWeight ? getActiveWeightGoal(goals) : undefined
  const hasWorkoutGoals =
    showWorkouts &&
    goals.some((g) => g.is_active && g.metric_key.startsWith('workout_') && hasTarget(g))

  const hasProgress =
    categorySections.length > 0 ||
    !!activeWeightGoal ||
    hasWorkoutGoals

  const flatGoals = categorySections.flatMap(({ goals: sectionGoals }) => sectionGoals)

  if (!hasProgress) {
    if (compact) return null
    return (
      <p className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-500">
        {categoryId
          ? 'No targets in this category yet. Set them on the Metrics page.'
          : 'Set targets on the Metrics page to track progress here.'}
      </p>
    )
  }

  if (compact) {
    return (
      <section className="min-h-0">
        {!hideTitle && (
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Goals · this week
          </h3>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {!excludeWeight && activeWeightGoal ? (
            <WeightProgressCard
              goal={activeWeightGoal}
              weekLogs={props.weekLogs}
              date={date}
              weekStartsOn={props.weekStartsOn}
              compact
            />
          ) : null}
          {flatGoals.map((goal) => (
            <GoalProgressCard key={goal.id} goal={goal} compact {...props} />
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-8">
      {categorySections.map(({ category, goals: sectionGoals }) => (
        <Section key={category.id} title={category.label}>
          {sectionGoals.map((goal) => (
            <GoalProgressCard key={goal.id} goal={goal} {...props} />
          ))}
        </Section>
      ))}

      {!excludeWeight && activeWeightGoal ? (
        <section>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Weight Goal
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <WeightProgressCard
              goal={activeWeightGoal}
              weekLogs={props.weekLogs}
              date={date}
              weekStartsOn={props.weekStartsOn}
            />
          </div>
        </section>
      ) : null}

      {hasWorkoutGoals ? <WorkoutGoalsProgressSection {...props} /> : null}
    </div>
  )
}
