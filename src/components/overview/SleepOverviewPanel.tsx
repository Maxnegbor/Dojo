import { useMemo } from 'react'
import { OverviewSection, OverviewStatCard } from '@/components/overview/OverviewStatCard'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { formatShortDate } from '@/lib/overviewPeriods'
import {
  averageBedtime,
  averageTime,
  formatTime12h,
  getMorningLog,
} from '@/lib/morningLog'
import {
  formatSleepMetricDisplay,
  getEnabledSleepMetrics,
  getSleepMetricValue,
  type SleepMetricDefinition,
} from '@/lib/sleepMetrics'
import type { DailyLog } from '@/types'

interface SleepOverviewPanelProps {
  logs: DailyLog[]
  rangeStart: string
  rangeEnd: string
  periodLabel: string
  timeFormat: '12h' | '24h'
  embedded?: boolean
}

function buildMetricCard(
  metric: SleepMetricDefinition,
  inRange: DailyLog[],
  periodLabel: string,
  use24h: boolean,
) {
  const period = periodLabel.toLowerCase()

  if (metric.id === 'bedtime') {
    const times = inRange
      .map((entry) => getMorningLog(entry)?.bedtime)
      .filter((time): time is string => !!time)
    if (times.length === 0) {
      return (
        <OverviewStatCard key={metric.id} label={metric.label} value="—" detail="No sleep logged" />
      )
    }
    return (
      <OverviewStatCard
        key={metric.id}
        label={metric.label}
        value={formatTime12h(averageBedtime(times), use24h)}
        detail={`${times.length} ${times.length === 1 ? 'night' : 'nights'} · ${period}`}
      />
    )
  }

  if (metric.id === 'wake_time') {
    const times = inRange
      .map((entry) => getMorningLog(entry)?.wake_time)
      .filter((time): time is string => !!time)
    if (times.length === 0) {
      return (
        <OverviewStatCard key={metric.id} label={metric.label} value="—" detail="No sleep logged" />
      )
    }
    return (
      <OverviewStatCard
        key={metric.id}
        label={metric.label}
        value={formatTime12h(averageTime(times), use24h)}
        detail={`${times.length} ${times.length === 1 ? 'night' : 'nights'} · ${period}`}
      />
    )
  }

  const samples = inRange
    .map((entry) => ({
      date: entry.date,
      value: getSleepMetricValue(entry, metric),
    }))
    .filter((sample): sample is { date: string; value: number } => sample.value != null)

  if (samples.length === 0) {
    return (
      <OverviewStatCard key={metric.id} label={metric.label} value="—" detail="No sleep logged" />
    )
  }

  const avg = samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length
  const latest = [...samples].sort((a, b) => b.date.localeCompare(a.date))[0]
  return (
    <OverviewStatCard
      key={metric.id}
      label={metric.label}
      value={formatSleepMetricDisplay(metric, avg, use24h)}
      detail={`${samples.length} logged · latest ${formatShortDate(latest.date)}`}
      accent={metric.unit === 'percent'}
    />
  )
}

export function SleepOverviewPanel({
  logs,
  rangeStart,
  rangeEnd,
  periodLabel,
  timeFormat,
  embedded = false,
}: SleepOverviewPanelProps) {
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()
  const enabledMetrics = useMemo(
    () => getEnabledSleepMetrics(sleepMetricsConfig),
    [sleepMetricsConfig],
  )

  const inRange = useMemo(
    () => logs.filter((l) => l.date >= rangeStart && l.date <= rangeEnd),
    [logs, rangeStart, rangeEnd],
  )

  const use24h = timeFormat === '24h'
  const gridClass =
    enabledMetrics.length <= 1
      ? 'grid gap-3 grid-cols-1'
      : enabledMetrics.length === 3
        ? 'grid gap-3 grid-cols-1 sm:grid-cols-3'
        : 'grid gap-3 grid-cols-2 lg:grid-cols-4'

  const content =
    enabledMetrics.length === 0 ? (
      <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-4 text-sm text-zinc-500">
        No sleep metrics selected. Enable them in Settings → Sleep to track here.
      </p>
    ) : (
      <div className={gridClass}>
        {enabledMetrics.map((metric) =>
          buildMetricCard(metric, inRange, periodLabel, use24h),
        )}
      </div>
    )

  if (embedded) return content

  return <OverviewSection title="Sleep">{content}</OverviewSection>
}
