import type { ReactNode } from 'react'
import { OverviewComparison } from '@/components/overview/OverviewStatCard'
import { MonthlyFocusCalendar } from '@/components/overview/MonthlyFocusCalendar'
import { formatPeriodComparison, formatShortDate } from '@/lib/overviewPeriods'
import { cn, formatDuration } from '@/lib/utils'
import type { DailyLog } from '@/types'

interface MonthlyFocusOverviewProps {
  logs: DailyLog[]
  asOf: Date
  totalMinutes: number
  dailyAverage: number
  activeDays: number
  loggingRate: number
  activeFocusDays: number
  bestDay: { date: string; minutes: number } | null
  pctVsPrevious: number | null
  previousLabel: string
}

function StatCell({
  label,
  value,
  detail,
  accent,
}: {
  label: string
  value: string
  detail?: ReactNode
  accent?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col justify-center px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-base font-bold tabular-nums leading-tight',
          accent ? 'text-[var(--accent-400)]' : 'text-zinc-100',
        )}
      >
        {value}
      </p>
      {detail ? <div className="mt-0.5 text-[9px] text-zinc-500">{detail}</div> : null}
    </div>
  )
}

export function MonthlyFocusOverview({
  logs,
  asOf,
  totalMinutes,
  dailyAverage,
  activeDays,
  loggingRate,
  activeFocusDays,
  bestDay,
  pctVsPrevious,
  previousLabel,
}: MonthlyFocusOverviewProps) {
  const focusComparison = formatPeriodComparison(
    pctVsPrevious,
    previousLabel,
    totalMinutes > 0,
  )

  const stats = [
    {
      label: 'Total focus',
      value: formatDuration(totalMinutes),
      detail: totalMinutes > 0 ? <OverviewComparison {...focusComparison} /> : 'No focus logged',
      accent: totalMinutes > 0,
    },
    {
      label: 'Daily average',
      value: formatDuration(Math.round(dailyAverage)),
      detail: `${activeFocusDays} active days`,
    },
    {
      label: 'Best day',
      value: bestDay ? formatDuration(bestDay.minutes) : '—',
      detail: bestDay ? formatShortDate(bestDay.date) : 'No best day yet',
    },
    {
      label: 'Active days',
      value: String(activeDays),
      detail: `${Math.round(loggingRate)}% of month logged`,
    },
  ]

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950/40">
        <div className="grid grid-cols-2 divide-x divide-y divide-zinc-800/60">
          {stats.map((stat) => (
            <StatCell key={stat.label} {...stat} />
          ))}
        </div>
      </div>
      <MonthlyFocusCalendar compact logs={logs} viewMonth={asOf} />
    </div>
  )
}
