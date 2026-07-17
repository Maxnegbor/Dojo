import { useMemo } from 'react'
import { OverviewSection, OverviewStatCard } from '@/components/overview/OverviewStatCard'
import { formatShortDate } from '@/lib/overviewPeriods'
import {
  averageBedtime,
  averageTime,
  formatMorningMinutes,
  formatTime12h,
  getMorningLog,
} from '@/lib/morningLog'
import type { DailyLog } from '@/types'

interface SleepOverviewPanelProps {
  logs: DailyLog[]
  rangeStart: string
  rangeEnd: string
  periodLabel: string
  timeFormat: '12h' | '24h'
  embedded?: boolean
}

export function SleepOverviewPanel({
  logs,
  rangeStart,
  rangeEnd,
  periodLabel,
  timeFormat,
  embedded = false,
}: SleepOverviewPanelProps) {
  const inRange = useMemo(
    () => logs.filter((l) => l.date >= rangeStart && l.date <= rangeEnd),
    [logs, rangeStart, rangeEnd],
  )

  const morningEntries = useMemo(
    () =>
      inRange
        .filter((l) => l.morning_log)
        .map((log) => ({ log, morning: getMorningLog(log)! }))
        .sort((a, b) => b.log.date.localeCompare(a.log.date)),
    [inRange],
  )

  const sleepHourLogs = useMemo(
    () => inRange.filter((l) => l.sleep_hours != null && l.sleep_hours > 0),
    [inRange],
  )

  const use24h = timeFormat === '24h'
  const gridClass = 'grid gap-3 grid-cols-2 lg:grid-cols-4'

  const content = (() => {
    if (morningEntries.length > 0) {
      const avgInBed =
        morningEntries.reduce((s, e) => s + e.morning.in_bed_minutes, 0) / morningEntries.length
      const avgSleep =
        morningEntries.reduce((s, e) => s + e.morning.sleep_minutes, 0) / morningEntries.length
      const avgAlertness =
        morningEntries.reduce((s, e) => s + e.morning.alertness, 0) / morningEntries.length
      const latest = morningEntries[0]
      const avgBedtime = averageBedtime(morningEntries.map((e) => e.morning.bedtime))
      const avgWake = averageTime(morningEntries.map((e) => e.morning.wake_time))

      return (
        <div className={gridClass}>
          <OverviewStatCard
            label="Avg in bed"
            value={formatMorningMinutes(Math.round(avgInBed))}
            detail={`${morningEntries.length} mornings · ${periodLabel.toLowerCase()}`}
          />
          <OverviewStatCard
            label="Avg sleep"
            value={formatMorningMinutes(Math.round(avgSleep))}
            detail={`Alertness ${avgAlertness.toFixed(1)}/10`}
          />
          <OverviewStatCard
            label="Avg bedtime"
            value={formatTime12h(avgBedtime, use24h)}
            detail={`Wake ${formatTime12h(avgWake, use24h)} avg`}
          />
          <OverviewStatCard
            label="Latest morning"
            value={formatTime12h(latest.morning.wake_time, use24h)}
            detail={`In bed ${formatMorningMinutes(latest.morning.in_bed_minutes)} · ${formatShortDate(latest.log.date)}`}
            accent
          />
        </div>
      )
    }

    if (sleepHourLogs.length > 0) {
      const avgSleep =
        sleepHourLogs.reduce((s, l) => s + (l.sleep_hours ?? 0), 0) / sleepHourLogs.length
      const latest = [...sleepHourLogs].sort((a, b) => b.date.localeCompare(a.date))[0]

      return (
        <div className={gridClass}>
          <OverviewStatCard
            label="Avg sleep"
            value={`${avgSleep.toFixed(1)}h`}
            detail={`${sleepHourLogs.length} nights · ${periodLabel.toLowerCase()}`}
          />
          <OverviewStatCard
            label="Latest night"
            value={`${(latest.sleep_hours ?? 0).toFixed(1)}h`}
            detail={formatShortDate(latest.date)}
            accent
          />
          <OverviewStatCard label="In bed" value="—" detail="Log mornings for more detail" />
          <OverviewStatCard label="Alertness" value="—" detail="Log mornings for more detail" />
        </div>
      )
    }

    return (
      <div className={gridClass}>
        <OverviewStatCard label="Avg in bed" value="—" detail="No sleep logged" />
        <OverviewStatCard label="Avg sleep" value="—" detail="No sleep logged" />
        <OverviewStatCard label="Avg bedtime" value="—" detail="No sleep logged" />
        <OverviewStatCard label="Latest morning" value="—" detail="No sleep logged" />
      </div>
    )
  })()

  if (embedded) return content

  return <OverviewSection title="Sleep">{content}</OverviewSection>
}
