import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { formatGoalScheduleLabel } from '@/lib/goalPeriod'
import { hasTarget } from '@/lib/goals'
import { calculateProgress } from '@/lib/metrics'
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
import { cn, getWeekDates } from '@/lib/utils'
import type { DailyLog, Goal } from '@/types'

interface WeeklySleepOverviewProps {
  logs: DailyLog[]
  rangeStart: string
  rangeEnd: string
  periodLabel: string
  timeFormat: '12h' | '24h'
  goals: Goal[]
  log: DailyLog | undefined
  weekLogs: DailyLog[]
  date: string
  weekStartsOn: 0 | 1
  compact?: boolean
  showGoalProgress?: boolean
}

interface SleepStat {
  id: string
  label: string
  value: string
  detail: string
  accent?: boolean
}

function SleepStatCell({
  label,
  value,
  detail,
  accent,
  compact,
}: Omit<SleepStat, 'id'> & { compact?: boolean }) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col justify-center',
        compact ? 'px-2.5 py-2' : 'px-4 py-3 sm:px-5 sm:py-4',
      )}
    >
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-bold tabular-nums leading-tight',
          compact ? 'text-lg' : 'mt-1 text-xl sm:text-2xl',
          accent ? 'text-[var(--accent-400)]' : 'text-zinc-100',
        )}
      >
        {value}
      </p>
      <p className={cn('leading-snug text-zinc-500', compact ? 'text-[10px]' : 'mt-1 text-[11px]')}>
        {detail}
      </p>
    </div>
  )
}

function emptyStat(metric: SleepMetricDefinition): SleepStat {
  return {
    id: metric.id,
    label: metric.label,
    value: '—',
    detail: 'No sleep logged',
  }
}

function buildMetricStat(
  metric: SleepMetricDefinition,
  inRange: DailyLog[],
  period: string,
  use24h: boolean,
): SleepStat {
  if (metric.id === 'bedtime') {
    const times = inRange
      .map((entry) => getMorningLog(entry)?.bedtime)
      .filter((time): time is string => !!time)
    if (times.length === 0) return emptyStat(metric)
    return {
      id: metric.id,
      label: metric.label,
      value: formatTime12h(averageBedtime(times), use24h),
      detail: `${times.length} ${times.length === 1 ? 'night' : 'nights'} · ${period}`,
    }
  }

  if (metric.id === 'wake_time') {
    const times = inRange
      .map((entry) => getMorningLog(entry)?.wake_time)
      .filter((time): time is string => !!time)
    if (times.length === 0) return emptyStat(metric)
    return {
      id: metric.id,
      label: metric.label,
      value: formatTime12h(averageTime(times), use24h),
      detail: `${times.length} ${times.length === 1 ? 'night' : 'nights'} · ${period}`,
    }
  }

  const samples = inRange
    .map((entry) => ({
      date: entry.date,
      value: getSleepMetricValue(entry, metric),
    }))
    .filter((sample): sample is { date: string; value: number } => sample.value != null)

  if (samples.length === 0) return emptyStat(metric)

  const avg = samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length
  const latest = [...samples].sort((a, b) => b.date.localeCompare(a.date))[0]
  return {
    id: metric.id,
    label: metric.label,
    value: formatSleepMetricDisplay(metric, avg, use24h),
    detail: `${samples.length} logged · latest ${formatShortDate(latest.date)}`,
    accent: metric.unit === 'percent',
  }
}

export function WeeklySleepOverview({
  logs,
  rangeStart,
  rangeEnd,
  periodLabel,
  timeFormat,
  goals,
  log,
  weekLogs,
  date,
  weekStartsOn,
  compact = false,
  showGoalProgress = false,
}: WeeklySleepOverviewProps) {
  const use24h = timeFormat === '24h'
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()
  const enabledMetrics = useMemo(
    () => getEnabledSleepMetrics(sleepMetricsConfig),
    [sleepMetricsConfig],
  )

  const inRange = useMemo(
    () => logs.filter((l) => l.date >= rangeStart && l.date <= rangeEnd),
    [logs, rangeStart, rangeEnd],
  )

  const stats = useMemo((): SleepStat[] => {
    const period = periodLabel.toLowerCase()
    return enabledMetrics.map((metric) => buildMetricStat(metric, inRange, period, use24h))
  }, [enabledMetrics, inRange, periodLabel, use24h])

  const sleepGoal = goals.find((g) => g.is_active && g.metric_key === 'sleep' && hasTarget(g))
  const weekDates = getWeekDates(new Date(date), weekStartsOn)
  const sleepProgress = sleepGoal
    ? calculateProgress(
        sleepGoal,
        log,
        [],
        date,
        weekDates,
        weekLogs,
        undefined,
        weekStartsOn,
      )
    : null

  const loggedCount = useMemo(() => {
    if (enabledMetrics.length === 0) return 0
    return inRange.filter((entry) =>
      enabledMetrics.some((metric) => {
        if (metric.id === 'bedtime') return Boolean(getMorningLog(entry)?.bedtime)
        if (metric.id === 'wake_time') return Boolean(getMorningLog(entry)?.wake_time)
        return getSleepMetricValue(entry, metric) != null
      }),
    ).length
  }, [enabledMetrics, inRange])

  const gridCols =
    stats.length <= 1 ? 'grid-cols-1' : stats.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'

  return (
    <Card className={cn('flex h-full flex-col', compact ? 'p-3' : 'p-4 sm:p-5')}>
      <div className={cn('flex items-baseline justify-between gap-2', compact ? 'mb-2' : 'mb-3')}>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Sleep</h3>
        {loggedCount > 0 && (
          <p className="truncate text-[10px] text-zinc-500">
            {loggedCount} night{loggedCount === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {stats.length === 0 ? (
        <p
          className={cn(
            'rounded-lg border border-dashed border-zinc-800 px-3 py-4 text-zinc-500',
            compact ? 'text-[11px]' : 'text-sm',
          )}
        >
          No sleep metrics selected. Enable them in Settings → Sleep to track here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950/40">
          <div className={cn('grid divide-x divide-y divide-zinc-800/60', gridCols)}>
            {stats.map((stat) => (
              <SleepStatCell key={stat.id} {...stat} compact={compact} />
            ))}
          </div>
        </div>
      )}

      {showGoalProgress && sleepGoal && sleepProgress && (
        <div
          className={cn(
            'rounded-lg border border-zinc-800/80 bg-zinc-950/30',
            compact ? 'mt-2 px-2.5 py-2' : 'mt-3 px-4 py-3',
          )}
        >
          <div className={compact ? 'mb-1' : 'mb-2'}>
            <h4 className={cn('font-medium text-zinc-200', compact ? 'text-xs' : 'text-sm')}>
              {sleepGoal.name}
            </h4>
            {!compact && (
              <p className="text-[10px] text-zinc-500">
                {formatGoalScheduleLabel(sleepGoal, date)} · {sleepGoal.target_value}h
              </p>
            )}
          </div>
          <ProgressBar
            size={compact ? 'sm' : 'md'}
            percent={Math.min(100, sleepProgress.percent)}
            onTrack={sleepProgress.onTrack}
            label={sleepProgress.label}
          />
        </div>
      )}
    </Card>
  )
}
