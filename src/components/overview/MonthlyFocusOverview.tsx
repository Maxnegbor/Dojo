import type { ReactNode } from 'react'
import { OverviewComparison } from '@/components/overview/OverviewStatCard'
import { MonthlyFocusCalendar } from '@/components/overview/MonthlyFocusCalendar'
import { formatPeriodComparison } from '@/lib/overviewPeriods'
import { cn, formatDuration } from '@/lib/utils'
import type { DailyLog } from '@/types'

interface MonthlyFocusOverviewProps {
  logs: DailyLog[]
  asOf: Date
  totalMinutes: number
  dailyAverage: number
  activeFocusDays: number
  pctVsPrevious: number | null
  previousLabel: string
  avgFocusScoreLabel?: string
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
  activeFocusDays,
  pctVsPrevious,
  previousLabel,
  avgFocusScoreLabel,
}: MonthlyFocusOverviewProps) {
  const focusComparison = formatPeriodComparison(
    pctVsPrevious,
    previousLabel,
    totalMinutes > 0,
  )

  const stats = [
    {
      label: 'Month total',
      value: formatDuration(totalMinutes),
      detail: totalMinutes > 0 ? <OverviewComparison {...focusComparison} /> : 'No focus logged',
      accent: totalMinutes > 0,
    },
    {
      label: 'Daily average',
      value: formatDuration(Math.round(dailyAverage)),
      detail: `${activeFocusDays} active days`,
      accent: dailyAverage > 0,
    },
    ...(avgFocusScoreLabel
      ? [
          {
            label: 'Avg focus score',
            value: avgFocusScoreLabel,
            detail: 'Subjective 1–10',
            accent: avgFocusScoreLabel !== '—',
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950/40">
        <div
          className={cn(
            'grid divide-x divide-zinc-800/60',
            stats.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
          )}
        >
          {stats.map((stat) => (
            <StatCell key={stat.label} {...stat} />
          ))}
        </div>
      </div>
      <MonthlyFocusCalendar compact logs={logs} viewMonth={asOf} />
    </div>
  )
}
