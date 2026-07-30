import { FitnessOverviewSection } from '@/components/overview/FitnessOverviewSection'
import { HabitOverview } from '@/components/overview/HabitOverview'
import { FocusOverviewSection } from '@/components/overview/FocusOverviewSection'
import { MetricCategoryOverviewSection } from '@/components/overview/MetricCategoryOverviewSection'
import { WeeklySleepOverview } from '@/components/overview/WeeklySleepOverview'
import { useSettings } from '@/context/SettingsContext'
import {
  isBuiltinOverviewCategory,
  type OverviewCategory,
} from '@/lib/overviewCategories'
import { computeOverviewPeriodStats, type PeriodRange } from '@/lib/overviewPeriods'
import type { DailyLog, Goal, Workout } from '@/types'

interface YearlyOverviewPanelProps {
  category: OverviewCategory
  logs: DailyLog[]
  allLogs: DailyLog[]
  workouts: Workout[]
  goals: Goal[]
  log: DailyLog | undefined
  weekLogs: DailyLog[]
  weekWorkouts: Workout[]
  date: string
  weekStartsOn: 0 | 1
  asOf: Date
  range: PeriodRange
  isCurrentPeriod: boolean
}

export function YearlyOverviewPanel(props: YearlyOverviewPanelProps) {
  const { category, allLogs, workouts, weekStartsOn, asOf, range, isCurrentPeriod } = props
  const { settings } = useSettings()
  const { stats, previous } = computeOverviewPeriodStats(
    'year',
    allLogs,
    workouts,
    weekStartsOn,
    asOf,
  )

  const weeksInYear = Math.max(1, Math.ceil(range.dates.length / 7))

  const goalProps = {
    goals: props.goals,
    log: props.log,
    weekLogs: props.weekLogs,
    weekWorkouts: props.weekWorkouts,
    date: props.date,
    weekStartsOn,
  }

  const focusProps = {
    ...goalProps,
    period: 'year' as const,
    allLogs,
    asOf,
    isCurrentPeriod,
    rangeStart: range.start,
    rangeEnd: range.end,
    totalMinutes: stats.focus.total,
    dailyAverage: stats.focus.dailyAverage,
    activeDays: stats.activeDays,
    loggingRate: stats.loggingRate,
    activeFocusDays: stats.focus.activeDays,
    bestDay: stats.focus.bestDay,
    pctVsPrevious: stats.focus.pctVsPrevious,
    dailyAveragePctVsPrevious: stats.focus.dailyAveragePctVsPrevious,
    previousLabel: previous?.label ?? 'last year',
    monthlyFocus: stats.monthlyFocus,
    bestHabitStreak: stats.bestHabitStreak,
    weeksInPeriod: weeksInYear,
    labelStats: stats.focus.labelStats,
  }

  if (category === 'fitness') {
    return (
      <FitnessOverviewSection
        period="year"
        stats={stats}
        previousLabel={previous?.label ?? 'last year'}
        allLogs={allLogs}
        workouts={workouts}
        asOf={asOf}
        {...goalProps}
      />
    )
  }

  if (category === 'sleep') {
    return (
      <WeeklySleepOverview
        compact
        logs={allLogs}
        rangeStart={range.start}
        rangeEnd={range.end}
        periodLabel={range.label}
        timeFormat={settings.timeFormat}
        goals={props.goals}
        log={props.log}
        weekLogs={props.weekLogs}
        date={props.date}
        weekStartsOn={weekStartsOn}
      />
    )
  }

  if (category === 'habits') {
    if (stats.habits.length === 0) {
      return (
        <p className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-500">
          No habits tracked this year yet.
        </p>
      )
    }
    return (
      <HabitOverview
        habits={stats.habits}
        summary={stats.habitSummary!}
        period="year"
      />
    )
  }

  if (category === 'focus') {
    return <FocusOverviewSection {...focusProps} />
  }

  if (!isBuiltinOverviewCategory(category)) {
    return <MetricCategoryOverviewSection categoryId={category} {...goalProps} />
  }

  return (
    <p className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-500">
      Nothing to show for this category yet.
    </p>
  )
}
