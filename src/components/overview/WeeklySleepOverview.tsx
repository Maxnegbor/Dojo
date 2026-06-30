import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatGoalScheduleLabel } from '@/lib/goalPeriod'
import { hasTarget } from '@/lib/goals'
import { calculateProgress } from '@/lib/metrics'
import { formatShortDate } from '@/lib/overviewPeriods'
import {
  averageTime,
  formatMorningMinutes,
  formatTime12h,
  getMorningLog,
} from '@/lib/morningLog'
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
}: SleepStat & { compact?: boolean }) {
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

  const inRange = useMemo(
    () => logs.filter((l) => l.date >= rangeStart && l.date <= rangeEnd),
    [logs, rangeStart, rangeEnd],
  )

  const morningEntries = useMemo(
    () =>
      inRange
        .filter((l) => l.morning_log)
        .map((entry) => ({ log: entry, morning: getMorningLog(entry)! }))
        .sort((a, b) => b.log.date.localeCompare(a.log.date)),
    [inRange],
  )

  const sleepHourLogs = useMemo(
    () => inRange.filter((l) => l.sleep_hours != null && l.sleep_hours > 0),
    [inRange],
  )

  const stats = useMemo((): SleepStat[] => {
    const period = periodLabel.toLowerCase()

    if (morningEntries.length > 0) {
      const avgInBed =
        morningEntries.reduce((s, e) => s + e.morning.in_bed_minutes, 0) / morningEntries.length
      const avgAsleep =
        morningEntries.reduce((s, e) => s + e.morning.sleep_minutes, 0) / morningEntries.length
      const avgAlertness =
        morningEntries.reduce((s, e) => s + e.morning.alertness, 0) / morningEntries.length
      const latest = morningEntries[0]
      const avgBedtime = averageTime(morningEntries.map((e) => e.morning.bedtime))
      const avgWake = averageTime(morningEntries.map((e) => e.morning.wake_time))
      const mornings =
        morningEntries.length === 1 ? '1 morning logged' : `${morningEntries.length} mornings logged`

      return [
        {
          label: 'In bed',
          value: formatMorningMinutes(Math.round(avgInBed)),
          detail: `${mornings} · ${period}`,
        },
        {
          label: 'Asleep',
          value: formatMorningMinutes(Math.round(avgAsleep)),
          detail: `Alertness ${avgAlertness.toFixed(1)}/10`,
        },
        {
          label: 'Bedtime',
          value: formatTime12h(avgBedtime, use24h),
          detail: `Wake ${formatTime12h(avgWake, use24h)}`,
        },
        {
          label: 'Latest wake',
          value: formatTime12h(latest.morning.wake_time, use24h),
          detail: `In bed ${formatMorningMinutes(latest.morning.in_bed_minutes)} · ${formatShortDate(latest.log.date)}`,
          accent: true,
        },
      ]
    }

    if (sleepHourLogs.length > 0) {
      const avgSleep =
        sleepHourLogs.reduce((s, l) => s + (l.sleep_hours ?? 0), 0) / sleepHourLogs.length
      const latest = [...sleepHourLogs].sort((a, b) => b.date.localeCompare(a.date))[0]
      const nights =
        sleepHourLogs.length === 1 ? '1 night logged' : `${sleepHourLogs.length} nights logged`

      return [
        {
          label: 'Sleep',
          value: `${avgSleep.toFixed(1)}h`,
          detail: `${nights} · ${period}`,
        },
        {
          label: 'Latest night',
          value: `${(latest.sleep_hours ?? 0).toFixed(1)}h`,
          detail: formatShortDate(latest.date),
          accent: true,
        },
        {
          label: 'In bed',
          value: '—',
          detail: 'Use morning log for timing',
        },
        {
          label: 'Alertness',
          value: '—',
          detail: 'Use morning log for timing',
        },
      ]
    }

    return [
      { label: 'In bed', value: '—', detail: 'No sleep logged' },
      { label: 'Asleep', value: '—', detail: 'No sleep logged' },
      { label: 'Bedtime', value: '—', detail: 'No sleep logged' },
      { label: 'Latest wake', value: '—', detail: 'No sleep logged' },
    ]
  }, [morningEntries, sleepHourLogs, periodLabel, use24h])

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

  const loggedCount = morningEntries.length > 0 ? morningEntries.length : sleepHourLogs.length

  return (
    <Card className={cn('flex h-full flex-col', compact ? 'p-3' : 'p-4 sm:p-5')}>
      <div className={cn('flex items-baseline justify-between gap-2', compact ? 'mb-2' : 'mb-3')}>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Sleep</h3>
        {loggedCount > 0 && (
          <p className="truncate text-[10px] text-zinc-500">
            {loggedCount} {morningEntries.length > 0 ? 'morning' : 'night'}
            {loggedCount === 1 ? '' : 's'}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950/40">
        <div className="grid grid-cols-2 divide-x divide-y divide-zinc-800/60">
          {stats.map((stat) => (
            <SleepStatCell key={stat.label} {...stat} compact={compact} />
          ))}
        </div>
      </div>

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
