import { format, parseISO, startOfMonth } from 'date-fns'
import type { DailyLog, Goal, Workout } from '@/types'
import type { PulseConfig } from '@/lib/pulseConfig'
import type { SleepMetricsConfig } from '@/lib/sleepMetrics'
import {
  computePulseSeries,
  pulseScoreLabel,
  type DayPulse,
} from '@/lib/pulse'
import type { OverviewPeriod, PeriodRange } from '@/lib/overviewPeriods'

export interface OverviewPulsePoint {
  /** Sort / identity key (date or yyyy-MM). */
  key: string
  score: number
  label: string
}

export interface OverviewPulseHistory {
  averageScore: number
  previousAverage: number | null
  daysLogged: number
  daysInPeriod: number
  series: DayPulse[]
  chartPoints: OverviewPulsePoint[]
  label: string
}

function averageScore(series: DayPulse[]): { average: number; daysLogged: number } {
  if (series.length === 0) return { average: 0, daysLogged: 0 }
  const daysLogged = series.filter((day) => day.score > 0).length
  const sum = series.reduce((total, day) => total + day.score, 0)
  return {
    average: Math.round(sum / series.length),
    daysLogged,
  }
}

function chartPointsForPeriod(
  period: OverviewPeriod,
  series: DayPulse[],
): OverviewPulsePoint[] {
  if (series.length === 0) return []

  if (period === 'year') {
    const byMonth = new Map<string, number[]>()
    for (const day of series) {
      const monthKey = format(parseISO(`${day.date}T12:00:00`), 'yyyy-MM')
      const bucket = byMonth.get(monthKey) ?? []
      bucket.push(day.score)
      byMonth.set(monthKey, bucket)
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, scores]) => {
        const avg = Math.round(scores.reduce((s, n) => s + n, 0) / scores.length)
        return {
          key,
          score: avg,
          label: format(startOfMonth(parseISO(`${key}-01T12:00:00`)), 'MMM'),
        }
      })
  }

  return series.map((day) => ({
    key: day.date,
    score: day.score,
    label: format(parseISO(`${day.date}T12:00:00`), period === 'week' ? 'EEE' : 'd'),
  }))
}

export function buildOverviewPulseHistory(
  period: OverviewPeriod,
  range: PeriodRange,
  previousRange: PeriodRange | null | undefined,
  logs: DailyLog[],
  goals: Goal[],
  workouts: Workout[],
  today: string,
  todayLog: DailyLog | null | undefined,
  pulseConfig: PulseConfig,
  sleepMetricsConfig: SleepMetricsConfig,
): OverviewPulseHistory {
  const series = computePulseSeries(
    range.dates,
    logs,
    goals,
    workouts,
    today,
    todayLog ?? null,
    pulseConfig,
    sleepMetricsConfig,
  )
  const { average, daysLogged } = averageScore(series)

  let previousAverage: number | null = null
  if (previousRange && previousRange.dates.length > 0) {
    const prevSeries = computePulseSeries(
      previousRange.dates,
      logs,
      goals,
      workouts,
      today,
      todayLog ?? null,
      pulseConfig,
      sleepMetricsConfig,
    )
    previousAverage = averageScore(prevSeries).average
  }

  const periodWord = period === 'week' ? 'week' : period === 'month' ? 'month' : 'year'

  return {
    averageScore: average,
    previousAverage,
    daysLogged,
    daysInPeriod: range.dates.length,
    series,
    chartPoints: chartPointsForPeriod(period, series),
    label: `Pulse · ${periodWord}`,
  }
}

export { pulseScoreLabel }
