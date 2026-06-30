import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import type { HabitPeriodStat, HabitPeriodSummary, OverviewPeriod } from '@/lib/overviewPeriods'
import { cn } from '@/lib/utils'

interface HabitOverviewProps {
  habits: HabitPeriodStat[]
  summary: HabitPeriodSummary
  period: OverviewPeriod
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

function periodPerfectLabel(period: OverviewPeriod): string {
  if (period === 'week') return 'All habits done'
  if (period === 'month') return 'Perfect days'
  return 'Perfect days'
}

export function HabitOverview({ habits, summary, period }: HabitOverviewProps) {
  const stats = [
    {
      label: 'Avg consistency',
      value: `${Math.round(summary.avgRate)}%`,
      detail: `${habits.length} habits tracked`,
      accent: summary.avgRate >= 70,
    },
    {
      label: 'Check-offs',
      value: String(summary.totalCompletions),
      detail: `of ${summary.possibleCompletions} possible`,
    },
    {
      label: 'Best streak',
      value: summary.bestStreak ? `${summary.bestStreak.days}d` : '—',
      detail: summary.bestStreak?.label ?? 'No active streak',
    },
    {
      label: periodPerfectLabel(period),
      value: String(summary.perfectDays),
      detail: `of ${summary.periodDays} days`,
    },
  ]

  return (
    <Card className="flex w-full max-w-md flex-col p-3 sm:max-w-lg sm:p-4">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Habits
      </h3>

      <div className="space-y-2">
        <div className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950/40">
          <div className="grid grid-cols-2 divide-x divide-y divide-zinc-800/60">
            {stats.map((stat) => (
              <StatCell key={stat.label} {...stat} />
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950/40">
          <div className="divide-y divide-zinc-800/60">
            {habits.map((habit) => (
              <div
                key={habit.id}
                className="flex items-center justify-between gap-3 px-2.5 py-1.5"
              >
                <span className="min-w-0 truncate text-[11px] text-zinc-300">{habit.label}</span>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-zinc-100">
                    {Math.round(habit.rate)}%
                  </p>
                  <p className="text-[9px] tabular-nums text-zinc-500">
                    {habit.completed}/{habit.totalDays}
                    {habit.streak > 0 ? ` · ${habit.streak}d streak` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}
