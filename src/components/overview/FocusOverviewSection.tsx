import { MonthlyFocusOverview } from '@/components/overview/MonthlyFocusOverview'
import { WeeklyFocusOverview } from '@/components/overview/WeeklyFocusOverview'
import { YearlyFocusOverview } from '@/components/overview/YearlyFocusOverview'
import { Card } from '@/components/ui/Card'
import type { OverviewPeriod } from '@/lib/overviewPeriods'
import type { DailyLog, Goal, Workout } from '@/types'

interface FocusOverviewSectionProps {
  period: OverviewPeriod
  allLogs: DailyLog[]
  asOf: Date
  isCurrentPeriod: boolean
  weekStartsOn: 0 | 1
  goals: Goal[]
  log: DailyLog | undefined
  weekLogs: DailyLog[]
  weekWorkouts: Workout[]
  date: string
  totalMinutes: number
  dailyAverage: number
  activeDays: number
  loggingRate: number
  activeFocusDays: number
  bestDay: { date: string; minutes: number } | null
  pctVsPrevious: number | null
  dailyAveragePctVsPrevious: number | null
  previousLabel: string
  monthlyFocus?: { label: string; minutes: number }[]
  bestHabitStreak?: { label: string; days: number } | null
  weeksInPeriod?: number
}

export function FocusOverviewSection({
  period,
  allLogs,
  asOf,
  isCurrentPeriod,
  weekStartsOn: _weekStartsOn,
  goals: _goals,
  log: _log,
  weekLogs: _weekLogs,
  weekWorkouts: _weekWorkouts,
  date: _date,
  totalMinutes,
  dailyAverage,
  activeDays,
  loggingRate,
  activeFocusDays,
  bestDay,
  pctVsPrevious,
  dailyAveragePctVsPrevious,
  previousLabel,
  monthlyFocus = [],
  bestHabitStreak = null,
  weeksInPeriod = 1,
}: FocusOverviewSectionProps) {
  const emptyLabel =
    period === 'week'
      ? 'No focus logged this week yet.'
      : period === 'month'
        ? 'No focus logged this month yet.'
        : 'No focus logged this year yet.'

  if (totalMinutes <= 0) {
    return (
      <p className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-500">
        {emptyLabel}
      </p>
    )
  }

  const bestMonth = monthlyFocus.reduce(
    (best, bucket) => (bucket.minutes > (best?.minutes ?? 0) ? bucket : best),
    null as (typeof monthlyFocus)[0] | null,
  )

  const chartMonthLimit = isCurrentPeriod ? new Date().getMonth() : 11
  const chartData = monthlyFocus
    .filter((_, index) => index <= chartMonthLimit)
    .map((bucket) => ({
      ...bucket,
      hours: Math.round((bucket.minutes / 60) * 10) / 10,
    }))

  return (
    <Card className="flex w-full max-w-md flex-col p-3 sm:max-w-lg sm:p-4">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Focus
      </h3>
      {period === 'week' && (
        <WeeklyFocusOverview
          totalMinutes={totalMinutes}
          dailyAverage={dailyAverage}
          dailyAveragePctVsPrevious={dailyAveragePctVsPrevious}
          previousLabel={previousLabel}
        />
      )}
      {period === 'month' && (
        <MonthlyFocusOverview
          logs={allLogs}
          asOf={asOf}
          totalMinutes={totalMinutes}
          dailyAverage={dailyAverage}
          activeDays={activeDays}
          loggingRate={loggingRate}
          activeFocusDays={activeFocusDays}
          bestDay={bestDay}
          pctVsPrevious={pctVsPrevious}
          previousLabel={previousLabel}
        />
      )}
      {period === 'year' && (
        <YearlyFocusOverview
          totalMinutes={totalMinutes}
          focusPerWeek={totalMinutes / weeksInPeriod}
          activeDays={activeDays}
          loggingRate={loggingRate}
          bestMonth={bestMonth}
          bestHabitStreak={bestHabitStreak}
          chartData={chartData}
          showChart={monthlyFocus.some((b) => b.minutes > 0)}
        />
      )}
    </Card>
  )
}
