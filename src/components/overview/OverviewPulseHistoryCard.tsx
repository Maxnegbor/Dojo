import { buildWavePath } from '@/lib/pulse'
import {
  pulseScoreLabel,
  type OverviewPulseHistory,
} from '@/lib/overviewPulse'
import { OverviewComparison } from '@/components/overview/OverviewStatCard'
import type { OverviewPeriod } from '@/lib/overviewPeriods'
import { cn } from '@/lib/utils'

interface OverviewPulseHistoryCardProps {
  period: OverviewPeriod
  history: OverviewPulseHistory
  today: string
  className?: string
}

function deltaLabel(current: number, previous: number | null): {
  text: string
  positive: boolean | null
} | null {
  if (previous == null || (previous <= 0 && current <= 0)) return null
  if (previous <= 0) return { text: 'New vs last period', positive: true }
  const delta = current - previous
  if (delta === 0) return { text: 'Same as last period', positive: null }
  const sign = delta > 0 ? '+' : ''
  return {
    text: `${sign}${delta} vs last period`,
    positive: delta > 0,
  }
}

export function OverviewPulseHistoryCard({
  period,
  history,
  today,
  className,
}: OverviewPulseHistoryCardProps) {
  const points = history.chartPoints
  const waveSeries = points.map((point) => ({
    date: point.key,
    score: point.score,
    habitRate: 0,
    focusRate: 0,
    sleepRate: 0,
    exerciseRate: 0,
    metricRates: {},
  }))

  const width = 360
  const height = 112
  const padding = 14
  const linePath = buildWavePath(waveSeries, width, height, padding)
  const baseline = height - padding
  const areaPath =
    waveSeries.length > 0 && linePath
      ? `${linePath} L ${padding + ((waveSeries.length - 1) / Math.max(waveSeries.length - 1, 1)) * (width - padding * 2)} ${baseline} L ${padding} ${baseline} Z`
      : ''

  const comparison = deltaLabel(history.averageScore, history.previousAverage)
  const periodNoun = period === 'week' ? 'week' : period === 'month' ? 'month' : 'year'
  const chartHint =
    period === 'year'
      ? 'Monthly average pulse'
      : period === 'month'
        ? 'Daily pulse this month'
        : 'Daily pulse this week'

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900 p-4',
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Pulse history
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-3xl font-bold tabular-nums text-zinc-50">
              {history.averageScore}
              <span className="text-lg font-semibold text-zinc-500">%</span>
            </p>
            <p className="text-sm text-zinc-400">{pulseScoreLabel(history.averageScore)}</p>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Avg for this {periodNoun}
            {history.daysLogged > 0
              ? ` · ${history.daysLogged}/${history.daysInPeriod} days scored`
              : null}
          </p>
        </div>
        {comparison ? (
          <OverviewComparison text={comparison.text} positive={comparison.positive} />
        ) : null}
      </div>

      {points.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          Log a few days to see your {periodNoun}ly pulse.
        </p>
      ) : (
        <div>
          <p className="mb-2 text-[10px] text-zinc-600">{chartHint}</p>
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full min-w-[260px]"
              aria-hidden
            >
              <defs>
                <linearGradient id="overview-pulse-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-500)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--accent-500)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {areaPath ? <path d={areaPath} fill="url(#overview-pulse-fill)" /> : null}
              {linePath ? (
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--accent-400)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              ) : null}
              {waveSeries.map((day, i) => {
                const x =
                  padding + (i / Math.max(waveSeries.length - 1, 1)) * (width - padding * 2)
                const maxScore = Math.max(...waveSeries.map((d) => d.score), 1)
                const y =
                  padding +
                  (height - padding * 2) -
                  (day.score / maxScore) * (height - padding * 2)
                const isToday = day.date === today
                if (isToday) {
                  return (
                    <g key={day.date} transform={`translate(${x}, ${y})`}>
                      <circle cx={0} cy={0} r={5} className="fill-[var(--accent-400)]" />
                      <circle
                        cx={0}
                        cy={0}
                        r={9}
                        fill="none"
                        stroke="var(--accent-500)"
                        strokeWidth={1.5}
                      />
                    </g>
                  )
                }
                return <circle key={day.date} cx={x} cy={y} r={2.5} className="fill-zinc-600" />
              })}
            </svg>
            <div className="mt-1 flex justify-between px-1 text-[9px] text-zinc-600">
              <span>{points[0]?.label}</span>
              <span>{points[points.length - 1]?.label}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
