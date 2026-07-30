import type { DailyLog, Goal, Workout } from '@/types'
import type { PulseConfig } from '@/lib/pulseConfig'
import type { SleepMetricsConfig } from '@/lib/sleepMetrics'
import { computePulseSeries, pulseScoreLabel, type DayPulse } from '@/lib/pulse'
import { getPreviousWeekDates } from '@/lib/weightGoal'
import { weekDateRangeLabel } from '@/lib/weeklyShutdown'

export interface WeeklyPulseWeekSummary {
  weekDates: string[]
  weekLabel: string
  /** Short label for comparison row, e.g. "This week" / "1 wk ago". */
  shortLabel: string
  averageScore: number
  daysLogged: number
  series: DayPulse[]
}

export interface WeeklyPulseReview {
  current: WeeklyPulseWeekSummary
  previous: WeeklyPulseWeekSummary[]
}

function averageWeekScore(series: DayPulse[]): { average: number; daysLogged: number } {
  if (series.length === 0) return { average: 0, daysLogged: 0 }
  const sum = series.reduce((total, day) => total + day.score, 0)
  const daysLogged = series.filter((day) => day.score > 0).length
  return {
    average: Math.round(sum / series.length),
    daysLogged,
  }
}

function summarizeWeek(
  weekDates: string[],
  logs: DailyLog[],
  goals: Goal[],
  workouts: Workout[],
  pulseConfig: PulseConfig,
  sleepMetricsConfig: SleepMetricsConfig,
  shortLabel: string,
  asOfDate: string,
): WeeklyPulseWeekSummary {
  const lastDay = weekDates[weekDates.length - 1] ?? asOfDate
  const series = computePulseSeries(
    weekDates,
    logs,
    goals,
    workouts,
    asOfDate,
    null,
    pulseConfig,
    sleepMetricsConfig,
  )
  const { average, daysLogged } = averageWeekScore(series)
  return {
    weekDates,
    weekLabel: weekDateRangeLabel(weekDates),
    shortLabel,
    averageScore: average,
    daysLogged,
    series,
  }
}

/** Current week pulse average + the three weeks before it. */
export function buildWeeklyPulseReview(
  weekDates: string[],
  logs: DailyLog[],
  goals: Goal[],
  workouts: Workout[],
  weekStartsOn: 0 | 1,
  pulseConfig: PulseConfig,
  sleepMetricsConfig: SleepMetricsConfig,
  options?: { useDevDummyHistory?: boolean },
): WeeklyPulseReview | null {
  if (weekDates.length === 0) return null

  const asOfDate = weekDates[weekDates.length - 1]
  const previousDates: string[][] = []
  let cursor = weekDates
  for (let i = 0; i < 3; i++) {
    cursor = getPreviousWeekDates(cursor, weekStartsOn)
    if (cursor.length === 0) break
    previousDates.push(cursor)
  }

  const shortLabels = ['1 wk ago', '2 wks ago', '3 wks ago']
  const previous = previousDates.map((dates, index) =>
    summarizeWeek(
      dates,
      logs,
      goals,
      workouts,
      pulseConfig,
      sleepMetricsConfig,
      shortLabels[index] ?? `${index + 1} wks ago`,
      asOfDate,
    ),
  )

  const review: WeeklyPulseReview = {
    current: summarizeWeek(
      weekDates,
      logs,
      goals,
      workouts,
      pulseConfig,
      sleepMetricsConfig,
      'This week',
      asOfDate,
    ),
    previous,
  }

  if (options?.useDevDummyHistory) {
    return applyDevDummyWeeklyPulseHistory(review)
  }

  return review
}

/** Stable demo scores for weekly shutdown pulse UI testing in dev mode. */
const DEV_DUMMY_PREVIOUS_SCORES = [72, 58, 41] as const
const DEV_DUMMY_CURRENT_SCORE = 64

function applyDevDummyWeeklyPulseHistory(review: WeeklyPulseReview): WeeklyPulseReview {
  const previous = review.previous.map((week, index) => {
    const score = DEV_DUMMY_PREVIOUS_SCORES[index] ?? 50
    if (week.averageScore > 0) return week
    return {
      ...week,
      averageScore: score,
      daysLogged: Math.max(week.daysLogged, 5),
    }
  })

  const current =
    review.current.averageScore > 0
      ? review.current
      : {
          ...review.current,
          averageScore: DEV_DUMMY_CURRENT_SCORE,
          daysLogged: Math.max(review.current.daysLogged, 5),
        }

  return { current, previous }
}

export function weeklyPulseDeltaLabel(current: number, previous: number): string | null {
  if (previous <= 0 && current <= 0) return null
  const delta = current - previous
  if (delta === 0) return 'Same as last week'
  if (delta > 0) return `+${delta} vs last week`
  return `${delta} vs last week`
}

export { pulseScoreLabel }
