import { MonthlyFocusOverview } from '@/components/overview/MonthlyFocusOverview'
import { WeeklyFocusOverview } from '@/components/overview/WeeklyFocusOverview'
import { YearlyFocusOverview } from '@/components/overview/YearlyFocusOverview'
import { Card } from '@/components/ui/Card'
import {
  averageFocusScoreForRange,
  formatFocusScore,
  getFocusScoreSessions,
} from '@/lib/focusScores'
import { getFocusSettings } from '@/lib/focusStore'
import type { FocusLabelPeriodStat, OverviewPeriod } from '@/lib/overviewPeriods'
import { cn, formatDuration } from '@/lib/utils'
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
  rangeStart: string
  rangeEnd: string
  totalMinutes: number
  dailyAverage: number
  activeDays: number
  loggingRate: number
  activeFocusDays: number
  bestDay: { date: string; minutes: number } | null
  pctVsPrevious: number | null
  dailyAveragePctVsPrevious: number | null
  previousLabel: string
  labelStats?: FocusLabelPeriodStat[]
  monthlyFocus?: { label: string; minutes: number }[]
  bestHabitStreak?: { label: string; days: number } | null
  weeksInPeriod?: number
}

function FocusLabelBreakdown({
  labelStats,
  totalMinutes,
}: {
  labelStats: FocusLabelPeriodStat[]
  totalMinutes: number
}) {
  if (labelStats.length === 0) return null
  const labeledTotal = labelStats.reduce((sum, entry) => sum + entry.minutes, 0)

  return (
    <div className="mt-3 space-y-2 border-t border-zinc-800/80 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">By label</p>
      <ul className="space-y-1.5">
        {labelStats.map((entry) => {
          const pct =
            totalMinutes > 0 ? Math.round((entry.minutes / totalMinutes) * 100) : 0
          return (
            <li key={entry.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-zinc-200">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="truncate">{entry.label}</span>
                </span>
                <span className="shrink-0 tabular-nums text-zinc-400">
                  {formatDuration(entry.minutes)}
                  <span className="ml-1 text-zinc-600">· {pct}%</span>
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    backgroundColor: entry.color,
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
      {labeledTotal < totalMinutes && (
        <p className="text-[10px] text-zinc-600">
          {formatDuration(totalMinutes - labeledTotal)} unlabeled
        </p>
      )}
    </div>
  )
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
  rangeStart,
  rangeEnd,
  totalMinutes,
  dailyAverage,
  activeDays,
  loggingRate,
  activeFocusDays,
  bestDay,
  pctVsPrevious,
  dailyAveragePctVsPrevious,
  previousLabel,
  labelStats = [],
  monthlyFocus = [],
  bestHabitStreak = null,
  weeksInPeriod = 1,
}: FocusOverviewSectionProps) {
  const showFocusScore = getFocusSettings().promptFocusScore
  const avgFocusScore = showFocusScore
    ? averageFocusScoreForRange(rangeStart, rangeEnd, getFocusScoreSessions())
    : null

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

  const scoreLabel =
    avgFocusScore != null ? `${formatFocusScore(avgFocusScore)}/10` : '—'

  return (
    <Card className={cn('flex w-full max-w-md flex-col p-3 sm:max-w-lg sm:p-4')}>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Focus
      </h3>
      {period === 'week' && (
        <WeeklyFocusOverview
          totalMinutes={totalMinutes}
          dailyAverage={dailyAverage}
          dailyAveragePctVsPrevious={dailyAveragePctVsPrevious}
          previousLabel={previousLabel}
          avgFocusScoreLabel={showFocusScore ? scoreLabel : undefined}
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
          avgFocusScoreLabel={showFocusScore ? scoreLabel : undefined}
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
          avgFocusScoreLabel={showFocusScore ? scoreLabel : undefined}
        />
      )}
      <FocusLabelBreakdown labelStats={labelStats} totalMinutes={totalMinutes} />
    </Card>
  )
}
