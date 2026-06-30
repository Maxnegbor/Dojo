import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '@/components/ui/Card'
import { cn, formatDuration } from '@/lib/utils'

interface YearlyFocusOverviewProps {
  totalMinutes: number
  focusPerWeek: number
  activeDays: number
  loggingRate: number
  bestMonth: { label: string; minutes: number } | null
  bestHabitStreak: { label: string; days: number } | null
  chartData: Array<{ label: string; hours: number; minutes: number }>
  showChart: boolean
}

function StatCell({
  label,
  value,
  detail,
  accent,
}: {
  label: string
  value: string
  detail: string
  accent?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col justify-center px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-bold tabular-nums leading-tight',
          accent ? 'text-[var(--accent-400)]' : 'text-zinc-100',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-zinc-500">{detail}</p>
    </div>
  )
}

export function YearlyFocusOverview({
  totalMinutes,
  focusPerWeek,
  activeDays,
  loggingRate,
  bestMonth,
  bestHabitStreak,
  chartData,
  showChart,
}: YearlyFocusOverviewProps) {
  const stats = [
    {
      label: 'Total focus',
      value: formatDuration(totalMinutes),
      detail: `~${formatDuration(Math.round(focusPerWeek))} per week`,
      accent: totalMinutes > 0,
    },
    {
      label: 'Best month',
      value: bestMonth && bestMonth.minutes > 0 ? formatDuration(bestMonth.minutes) : '—',
      detail: bestMonth && bestMonth.minutes > 0 ? bestMonth.label : 'No best month yet',
    },
    {
      label: 'Active days',
      value: String(activeDays),
      detail: `${Math.round(loggingRate)}% of year logged`,
    },
    {
      label: 'Longest streak',
      value: bestHabitStreak ? `${bestHabitStreak.days}d` : '—',
      detail: bestHabitStreak?.label ?? 'No habit streak yet',
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

      {showChart && (
        <Card className="p-2">
          <p className="mb-1 px-1 text-[10px] uppercase tracking-wide text-zinc-500">
            Focus by month
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#71717a', fontSize: 9 }} width={28} unit="h" />
              <Tooltip
                contentStyle={{
                  background: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(value: number) => [`${value}h`, 'Focus']}
              />
              <Line
                type="monotone"
                dataKey="hours"
                stroke="var(--accent-500)"
                strokeWidth={2}
                dot={{ r: 2, fill: 'var(--accent-500)', strokeWidth: 0 }}
                activeDot={{ r: 4, fill: 'var(--accent-400)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  )
}
