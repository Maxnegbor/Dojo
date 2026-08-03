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

  const width = 320
  const height = 40
  const padding = 6
  const linePath = buildWavePath(waveSeries, width, height, padding)
  const baseline = height - padding
  const areaPath =
    waveSeries.length > 0 && linePath
      ? `${linePath} L ${padding + ((waveSeries.length - 1) / Math.max(waveSeries.length - 1, 1)) * (width - padding * 2)} ${baseline} L ${padding} ${baseline} Z`
      : ''

  const comparison = deltaLabel(history.averageScore, history.previousAverage)
  const periodNoun = period === 'week' ? 'week' : period === 'month' ? 'month' : 'year'

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900 px-3.5 py-3',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Pulse history
          </p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-2xl font-bold tabular-nums leading-none text-zinc-50">
              {history.averageScore}
              <span className="text-base font-semibold text-zinc-500">%</span>
            </p>
            <p className="text-sm text-zinc-400">{pulseScoreLabel(history.averageScore)}</p>
          </div>
          <p className="mt-1 text-[10px] text-zinc-500">
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
        <p className="mt-2 text-[11px] text-zinc-500">
          Log a few days to see your {periodNoun}ly pulse.
        </p>
      ) : (
        <div className="mt-2.5">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-10 w-full"
            preserveAspectRatio="none"
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
                strokeWidth="2"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
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
              return (
                <circle
                  key={day.date}
                  cx={x}
                  cy={y}
                  r={isToday ? 3 : 1.75}
                  className={isToday ? 'fill-[var(--accent-400)]' : 'fill-zinc-600'}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>
          <div className="mt-0.5 flex justify-between text-[9px] text-zinc-600">
            <span>{points[0]?.label}</span>
            <span>{points[points.length - 1]?.label}</span>
          </div>
        </div>
      )}
    </section>
  )
}
