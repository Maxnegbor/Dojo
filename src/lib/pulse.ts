import type { CSSProperties } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { getLogValueForGoal } from '@/lib/dailyLog'
import { getDraft, mergeDraftWithLog } from '@/lib/dailyLogDraft'
import { getDailyLogHabitTypes, type HabitTypeDefinition } from '@/lib/habitTypes'
import { getHabitStreak } from '@/lib/habitStreaks'
import { hasTarget } from '@/lib/goals'
import {
  computeExerciseRate,
  getPulseCustomMetricGoals,
  getPulseFormulaForDate,
  type PulseConfig,
  type PulseFormula,
} from '@/lib/pulseConfig'
import {
  computeSleepPulseRate,
  getPulseSleepMetrics,
  getSleepMetricsConfig,
  type SleepMetricsConfig,
} from '@/lib/sleepMetrics'
import type { DailyLog, Goal, Workout } from '@/types'
import { normalizeHabits } from '@/types'
import { formatDate, getWeekDates } from '@/lib/utils'

export interface DayPulse {
  date: string
  score: number
  habitRate: number
  focusRate: number
  sleepRate: number
  exerciseRate: number
  /** Completion % for custom metrics with pulse weight. */
  metricRates: Record<string, number>
}

export interface PulseInsight {
  id: string
  tone: 'rise' | 'pattern' | 'streak' | 'tip'
  title: string
  body: string
}

function logForDate(
  date: string,
  logs: DailyLog[],
  today: string,
  todayLog: DailyLog | null,
  workouts: Workout[],
): DailyLog | undefined {
  if (date === today && todayLog) {
    const merged = mergeDraftWithLog(
      todayLog,
      getDraft(date),
      workouts.filter((w) => w.date === date),
    )
    return {
      ...todayLog,
      habits: normalizeHabits(merged.habits),
      focus_minutes: merged.focus_minutes ?? todayLog.focus_minutes,
      sleep_hours: merged.sleep_hours ?? todayLog.sleep_hours,
      steps: merged.steps ?? todayLog.steps,
      screen_time_minutes: merged.screen_time_minutes ?? todayLog.screen_time_minutes,
      custom_metrics: { ...todayLog.custom_metrics, ...merged.custom_metrics },
      sleep_metrics: { ...todayLog.sleep_metrics, ...merged.sleep_metrics },
    }
  }
  return logs.find((l) => l.date === date)
}

function computeCustomMetricRate(log: DailyLog | undefined, goal: Goal): number {
  const target = goal.target_value ?? 0
  if (target <= 0) return 0
  const value = log ? getLogValueForGoal(log, goal) : null
  if (value == null || value <= 0) return 0
  return Math.min(100, (value / target) * 100)
}

export function computeDayPulse(
  date: string,
  log: DailyLog | undefined,
  habits: HabitTypeDefinition[],
  goals: Goal[],
  workouts: Workout[],
  formula: PulseFormula | null,
  sleepMetricsConfig?: SleepMetricsConfig,
): DayPulse {
  const empty: DayPulse = {
    date,
    score: 0,
    habitRate: 0,
    focusRate: 0,
    sleepRate: 0,
    exerciseRate: 0,
    metricRates: {},
  }

  if (!formula) return empty

  const { weights } = formula
  const metricWeights = formula.metricWeights ?? {}
  let habitRate = 0
  let focusRate = 0
  let sleepRate = 0
  let exerciseRate = 0
  const metricRates: Record<string, number> = {}
  const parts: { weight: number; value: number }[] = []

  if (weights.habits > 0 && habits.length > 0) {
    const h = normalizeHabits(log?.habits)
    const done = habits.filter((habit) => h[habit.id]).length
    habitRate = (done / habits.length) * 100
    parts.push({ weight: weights.habits, value: habitRate })
  }

  if (weights.focus > 0) {
    const focusGoal = goals.find((g) => g.metric_key === 'focus' && hasTarget(g))
    if (focusGoal) {
      const mins = log?.focus_minutes ?? 0
      const target = focusGoal.target_value ?? 1
      focusRate = Math.min(100, (mins / target) * 100)
      parts.push({ weight: weights.focus, value: focusRate })
    }
  }

  if (weights.sleep > 0) {
    const sleepConfig = sleepMetricsConfig ?? getSleepMetricsConfig()
    const sleepGoal = goals.find((g) => g.metric_key === 'sleep' && hasTarget(g))
    const legacyHours = sleepGoal?.target_value ?? null
    const pulseMetrics = getPulseSleepMetrics(sleepConfig)
    sleepRate =
      pulseMetrics.length > 0
        ? computeSleepPulseRate(log, sleepConfig, legacyHours)
        : legacyHours != null && legacyHours > 0 && log?.sleep_hours != null
          ? Math.min(100, (log.sleep_hours / legacyHours) * 100)
          : 0
    parts.push({ weight: weights.sleep, value: sleepRate })
  }

  if (weights.exercise > 0) {
    const hasWorkoutGoal = goals.some(
      (g) => g.is_active && g.metric_key.startsWith('workout_') && hasTarget(g),
    )
    if (hasWorkoutGoal) {
      exerciseRate = computeExerciseRate(date, workouts, formula.exerciseDailyMinutes)
      parts.push({ weight: weights.exercise, value: exerciseRate })
    }
  }

  const customGoalsByKey = new Map(
    getPulseCustomMetricGoals(goals).map((g) => [g.metric_key as string, g]),
  )
  for (const [key, weight] of Object.entries(metricWeights)) {
    if (weight <= 0) continue
    const goal = customGoalsByKey.get(key)
    if (!goal) continue
    const rate = computeCustomMetricRate(log, goal)
    metricRates[key] = rate
    parts.push({ weight, value: rate })
  }

  if (parts.length === 0) {
    return { ...empty, habitRate, focusRate, sleepRate, exerciseRate, metricRates }
  }

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0)
  const score = Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight)

  return { date, score, habitRate, focusRate, sleepRate, exerciseRate, metricRates }
}

export function computePulseSeries(
  dates: string[],
  logs: DailyLog[],
  goals: Goal[],
  workouts: Workout[],
  today: string,
  todayLog: DailyLog | null,
  pulseConfig: PulseConfig,
  sleepMetricsConfig?: SleepMetricsConfig,
): DayPulse[] {
  const habits = getDailyLogHabitTypes()
  const sleepConfig = sleepMetricsConfig ?? getSleepMetricsConfig()
  return dates.map((date) => {
    const formula = getPulseFormulaForDate(pulseConfig, date)
    const log = logForDate(date, logs, today, todayLog, workouts)
    return computeDayPulse(date, log, habits, goals, workouts, formula, sleepConfig)
  })
}

export function generatePulseInsights(
  series: DayPulse[],
  logs: DailyLog[],
  goals: Goal[],
  workouts: Workout[],
  today: string,
  todayLog: DailyLog | null,
): PulseInsight[] {
  const insights: PulseInsight[] = []
  const habits = getDailyLogHabitTypes()
  const recent = series.filter((d) => d.date <= today && d.score > 0)
  if (recent.length === 0) {
    return [
      {
        id: 'empty',
        tone: 'tip',
        title: 'Your pulse is waiting',
        body: 'Configure Pulse to choose what counts, then log habits, focus, sleep, or workouts on Home.',
      },
    ]
  }

  const todayPulse = series.find((d) => d.date === today)
  const weekDates = getWeekDates(parseISO(today + 'T12:00:00'))
  const weekSeries = series.filter((d) => weekDates.includes(d.date) && d.score > 0)

  if (todayPulse && todayPulse.score >= 70) {
    insights.push({
      id: 'today-strong',
      tone: 'rise',
      title: 'Strong pulse today',
      body: `You're at ${todayPulse.score}% life rhythm — one of your fuller days this week.`,
    })
  }

  if (weekSeries.length >= 2) {
    const best = weekSeries.reduce((a, b) => (b.score > a.score ? b : a))
    const bestLabel = format(parseISO(best.date + 'T12:00:00'), 'EEEE')
    insights.push({
      id: 'best-day',
      tone: 'pattern',
      title: `${bestLabel} hits different`,
      body: `Your peak day this week scored ${best.score}% — notice what you did the night before.`,
    })
  }

  const last7 = recent.slice(-7)
  if (last7.length >= 3) {
    const firstHalf = last7.slice(0, Math.floor(last7.length / 2))
    const secondHalf = last7.slice(Math.floor(last7.length / 2))
    const avg = (arr: DayPulse[]) => arr.reduce((s, d) => s + d.score, 0) / arr.length
    const delta = avg(secondHalf) - avg(firstHalf)
    if (delta >= 8) {
      insights.push({
        id: 'rising-wave',
        tone: 'rise',
        title: 'Rising wave',
        body: `Your rhythm climbed ${Math.round(delta)} points over the last few days. Momentum is building.`,
      })
    } else if (delta <= -8) {
      insights.push({
        id: 'ebb',
        tone: 'tip',
        title: 'Gentle ebb',
        body: `Pulse dipped ${Math.abs(Math.round(delta))} pts lately — a soft week, not a failure. One habit tomorrow resets the tide.`,
      })
    }
  }

  if (habits.length >= 2) {
    const todayHabits = todayLog
      ? normalizeHabits(
          mergeDraftWithLog(todayLog, getDraft(today), []).habits,
        )
      : undefined
    const streaks = habits
      .map((h) => getHabitStreak(logs, h.id, today, todayHabits))
      .filter((s) => s > 0)
    if (streaks.length > 0) {
      const longest = Math.max(...streaks)
      const habit = habits.find(
        (h) => getHabitStreak(logs, h.id, today, todayHabits) === longest,
      )
      if (habit && longest >= 3) {
        insights.push({
          id: 'streak-fire',
          tone: 'streak',
          title: `${habit.label} is glowing`,
          body: `${longest}-day streak — this habit is becoming part of your identity, not your to-do list.`,
        })
      }
    }
  }

  const focusGoal = goals.find((g) => g.metric_key === 'focus' && hasTarget(g))
  if (focusGoal && habits.length > 0) {
    const focusDays = recent.filter((d) => {
      const log = logForDate(d.date, logs, today, todayLog, workouts)
      return (log?.focus_minutes ?? 0) >= (focusGoal.target_value ?? 0) * 0.5
    })
    const otherDays = recent.filter((d) => !focusDays.some((f) => f.date === d.date))
    if (focusDays.length >= 2 && otherDays.length >= 2) {
      const avgFocus = focusDays.reduce((s, d) => s + d.habitRate, 0) / focusDays.length
      const avgOther = otherDays.reduce((s, d) => s + d.habitRate, 0) / otherDays.length
      const diff = avgFocus - avgOther
      if (diff >= 10) {
        insights.push({
          id: 'focus-habit-link',
          tone: 'pattern',
          title: 'Focus fuels habits',
          body: `On deeper focus days, habit completion runs ${Math.round(diff)}% higher. Your brain likes the runway.`,
        })
      }
    }
  }

  const sleepLogs = recent
    .map((d) => {
      const log = logForDate(d.date, logs, today, todayLog, workouts)
      return { date: d.date, sleep: log?.sleep_hours ?? null, score: d.score }
    })
    .filter((d) => d.sleep != null && d.sleep > 0)

  if (sleepLogs.length >= 4) {
    const wellRested = sleepLogs.filter((d) => (d.sleep ?? 0) >= 7)
    const short = sleepLogs.filter((d) => (d.sleep ?? 0) < 7)
    if (wellRested.length >= 2 && short.length >= 2) {
      const avgRest = wellRested.reduce((s, d) => s + d.score, 0) / wellRested.length
      const avgShort = short.reduce((s, d) => s + d.score, 0) / short.length
      if (avgRest - avgShort >= 12) {
        insights.push({
          id: 'sleep-lift',
          tone: 'pattern',
          title: 'Sleep is your multiplier',
          body: `7+ hour nights correlate with ${Math.round(avgRest - avgShort)}% higher pulse scores. Rest is performance.`,
        })
      }
    }
  }

  if (insights.length === 0) {
    insights.push({
      id: 'keep-going',
      tone: 'tip',
      title: 'Patterns forming',
      body: 'Keep logging for a few more days — Pulse learns your unique rhythm and surfaces what actually moves the needle.',
    })
  }

  return insights.slice(0, 4)
}

export function pulseLoadRange(today: string, days = 35): { start: string; end: string } {
  const startDate = addDays(parseISO(today + 'T12:00:00'), -(days - 1))
  return { start: formatDate(startDate), end: today }
}

export function pulseScoreLabel(score: number): string {
  if (score >= 100) return 'Radiant'
  if (score >= 70) return 'Strong'
  if (score >= 50) return 'Steady'
  if (score >= 25) return 'Quiet'
  if (score > 0) return 'Faint'
  return 'Dormant'
}

export type PulseScoreTier =
  | 'dormant'
  | 'faint'
  | 'quiet'
  | 'steady'
  | 'strong'
  | 'radiant'

export function pulseScoreTier(score: number): PulseScoreTier {
  if (score >= 100) return 'radiant'
  if (score >= 70) return 'strong'
  if (score >= 50) return 'steady'
  if (score >= 25) return 'quiet'
  if (score > 0) return 'faint'
  return 'dormant'
}

export const PULSE_PREVIEW_LEVELS = [
  { label: 'Dormant', score: 0 },
  { label: 'Faint', score: 15 },
  { label: 'Quiet', score: 35 },
  { label: 'Steady', score: 64 },
  { label: 'Strong', score: 77 },
  { label: 'Radiant', score: 100 },
] as const

export function previewPulseBreakdown(score: number): Pick<
  DayPulse,
  'habitRate' | 'focusRate' | 'sleepRate' | 'exerciseRate' | 'metricRates'
> {
  if (score <= 0) {
    return { habitRate: 0, focusRate: 0, sleepRate: 0, exerciseRate: 0, metricRates: {} }
  }
  return {
    habitRate: Math.min(100, Math.round(score * 1.05)),
    focusRate: Math.min(100, Math.round(score * 0.85)),
    sleepRate: Math.min(100, Math.round(score * 0.7)),
    exerciseRate: Math.min(100, Math.round(score * 0.6)),
    metricRates: {},
  }
}

export const PULSE_CORE_PX = 96

/** Scale factor for the compact pulse meter on Home. */
export const PULSE_COMPACT_SCALE = 0.5

/** Inline pulse in the Home header. */
export const PULSE_HEADER_SCALE = 1.0
/** Smaller meter on the Pulse page — less reserved glow space than the home header. */
export const PULSE_PAGE_SCALE = 1.1

export function pulseCorePx(scale = 1): number {
  return PULSE_CORE_PX * scale
}

/** Fraction of one pulse cycle when the score outline hits minimum thickness (matches CSS keyframe %). */
export const PULSE_OUTLINE_THIN_SYNC = 0.035

/** Ring i launches at (i/3 + PULSE_OUTLINE_THIN_SYNC) through the cycle; negative delay pre-positions the ripple. */
export function pulseRingAnimationDelay(ringIndex: number, duration: number): number {
  return (ringIndex / 3 + PULSE_OUTLINE_THIN_SYNC - 1) * duration
}

export interface PulseMeterVisuals {
  animationDuration: number
  ringStartScale: number
  ringExpandEnd: number
  ringFadeAt: number
  borderOpacity: number
  coreGlowPx: number
  glowMix: number
  glowSpreadPercent: number
  glowBlobPx: number
  glowBlurPx: number
  ringArenaPx: number
  meterZonePx: number
  ringBorderPx: number
  coreBorderPx: number
  coreBorderPeakPx: number
  accentLightness: number
}

/** Maps score fraction [0,1] → animation intensity [0,1]. Low scores stay 1:1; 30+ gains compress so mid/high scores ramp slowly. */
export function pulseIntensityT(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  const knee = 0.3
  if (x <= knee) return x

  const u = (x - knee) / (1 - knee)
  const maxI = 0.78
  const ramp = Math.pow(u, 1.9)
  return knee + (maxI - knee) * ramp
}

/** Higher score → faster pulse, brighter accent, stronger glow — not a larger footprint. */
export function pulseMeterVisuals(score: number, scale = 1): PulseMeterVisuals {
  const t = Math.max(0, Math.min(100, score)) / 100
  const i = pulseIntensityT(t)
  // Fixed arena / zone so score (and radiant burst at 100) never resizes the meter.
  const ringArenaPx = 224 * scale
  const ringExpandEnd = 1 + i * 0.45
  const maxRingExpandEnd = 1 + pulseIntensityT(1) * 0.45
  const glowBleedPx = (24 + pulseIntensityT(1) * 40) * scale
  const meterZonePx = ringArenaPx * maxRingExpandEnd + glowBleedPx * 2
  const coreBorderPx = (2.5 + t * 0.5) * scale
  const coreBorderPeakPx = coreBorderPx + (2 + i * 2.5) * scale
  const corePx = pulseCorePx(scale)
  const ringStartOuterPx = corePx + 2 * coreBorderPx
  return {
    animationDuration: (5.4 - i * 3.6) * 2.25,
    ringStartScale: ringStartOuterPx / ringArenaPx,
    ringExpandEnd,
    ringFadeAt: 0.28 + i * 0.72,
    borderOpacity: 0.18 + i * 0.5,
    coreGlowPx: (16 + i * 52) * scale,
    glowMix: 10 + i * 58,
    glowSpreadPercent: 62 + i * 38,
    glowBlobPx: meterZonePx * 0.94,
    glowBlurPx: (10 + i * 22) * scale,
    ringArenaPx,
    meterZonePx,
    ringBorderPx: (2 + i * 2.5) * scale,
    coreBorderPx,
    coreBorderPeakPx,
    accentLightness: i * 42,
  }
}

/** Compact ring styling for calendar day cells — brighter glow and border at higher scores. */
export function pulseCalendarCellVisuals(score: number): {
  ringStyle: CSSProperties
  scoreColor: string
} {
  const t = Math.max(0, Math.min(100, score)) / 100
  const i = pulseIntensityT(t)
  const accentLightness = i * 42
  const accent = `color-mix(in srgb, var(--accent-500) ${100 - accentLightness}%, white ${accentLightness}%)`
  const scoreColor = `color-mix(in srgb, var(--accent-300) ${100 - accentLightness * 0.7}%, white ${accentLightness * 0.7}%)`
  const borderOpacity = 0.14 + i * 0.62
  const glowPx = 3 + i * 12

  if (score <= 0) {
    return {
      ringStyle: {
        borderColor: 'color-mix(in srgb, var(--accent-500) 10%, rgb(63 63 70))',
        borderWidth: '1px',
        boxShadow: 'none',
      },
      scoreColor: 'rgb(113 113 122)',
    }
  }

  return {
    ringStyle: {
      borderColor: `color-mix(in srgb, ${accent} ${borderOpacity * 100}%, transparent)`,
      borderWidth: `${1 + i * 1.5}px`,
      boxShadow: `0 0 ${glowPx}px color-mix(in srgb, ${accent} ${Math.round(borderOpacity * 55 + 12)}%, transparent)`,
    },
    scoreColor,
  }
}

export function buildWavePath(
  series: DayPulse[],
  width: number,
  height: number,
  padding = 12,
): string {
  if (series.length === 0) return ''

  const innerW = width - padding * 2
  const innerH = height - padding * 2
  const maxScore = Math.max(...series.map((d) => d.score), 1)

  const points = series.map((d, i) => {
    const x = padding + (i / Math.max(series.length - 1, 1)) * innerW
    const y = padding + innerH - (d.score / maxScore) * innerH
    return { x, y }
  })

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y} L ${points[0].x + 1} ${points[0].y}`
  }

  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const cx = (prev.x + curr.x) / 2
    path += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`
  }
  return path
}
