import type { ReactNode } from 'react'
import { FocusWeekChart, type FocusWeekDayBucket } from '@/components/overview/FocusWeekChart'
import { OverviewComparison } from '@/components/overview/OverviewStatCard'
import { formatPeriodComparison } from '@/lib/overviewPeriods'
import { cn, formatDuration } from '@/lib/utils'

interface WeeklyFocusOverviewProps {
  totalMinutes: number
  pctVsPrevious: number | null
  previousLabel: string
  weekDays: FocusWeekDayBucket[]
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
          accent ? 'text-indigo-400' : 'text-zinc-100',
        )}
      >
        {value}
      </p>
      {detail ? <div className="mt-0.5 text-[9px] text-zinc-500">{detail}</div> : null}
    </div>
  )
}

export function WeeklyFocusOverview({
  totalMinutes,
  pctVsPrevious,
  previousLabel,
  weekDays,
  avgFocusScoreLabel,
}: WeeklyFocusOverviewProps) {
  const totalComparison = formatPeriodComparison(
    pctVsPrevious,
    previousLabel,
    totalMinutes > 0,
  )

  const stats = [
    {
      label: 'Week total',
      value: formatDuration(totalMinutes),
      detail:
        totalMinutes > 0 ? (
          <span className="text-[9px]">
            <OverviewComparison {...totalComparison} />
          </span>
        ) : (
          'No focus logged'
        ),
      accent: totalMinutes > 0,
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
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950/40">
        <div
          className={cn(
            'grid divide-x divide-zinc-800/60',
            avgFocusScoreLabel ? 'grid-cols-2' : 'grid-cols-1',
          )}
        >
          {stats.map((stat) => (
            <StatCell key={stat.label} {...stat} />
          ))}
        </div>
      </div>
      <FocusWeekChart days={weekDays} />
    </div>
  )
}
