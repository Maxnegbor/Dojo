import { addDays, format, parseISO } from 'date-fns'
import { getDraft, mergeDraftWithLog } from '@/lib/dailyLogDraft'
import { getDailyLogHabitTypes, type HabitTypeDefinition } from '@/lib/habitTypes'
import { getHabitStreak, getHabitCompletionRate } from '@/lib/habitStreaks'
import { hasTarget } from '@/lib/goals'
import { calculateProgress } from '@/lib/metrics'
import type { DailyLog, Goal, Workout } from '@/types'
import { normalizeHabits } from '@/types'
import { formatDate, getWeekDates } from '@/lib/utils'

export interface DayPulse {
  date: string
  score: number
  habitRate: number
  focusRate: number
  metricRate: number
}

export interface PulseInsight {
  id: string
  tone: 'rise' | 'pattern' | 'streak' | 'tip'
  title: string
  body: string
}

export interface HabitStar {
  id: string
  label: string
  streak: number
  weekRate: number
  angle: number
  orbit: number
}

export interface WeekdayRhythm {
  label: string
  avgScore: number
  samples: number
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
    }
  }
  return logs.find((l) => l.date === date)
}

export function computeDayPulse(
  date: string,
  log: DailyLog | undefined,
  habits: HabitTypeDefinition[],
  goals: Goal[],
  workouts: Workout[],
  allLogs: DailyLog[] = [],
  weekStartsOn: 0 | 1 = 1,
): DayPulse {
  let habitRate = 0
  let focusRate = 0
  let metricRate = 0
  const parts: { weight: number; value: number }[] = []

  if (habits.length > 0) {
    const h = normalizeHabits(log?.habits)
    const done = habits.filter((habit) => h[habit.id]).length
    habitRate = (done / habits.length) * 100
    parts.push({ weight: 0.45, value: habitRate })
  }

  const focusGoal = goals.find((g) => g.metric_key === 'focus' && hasTarget(g))
  if (focusGoal) {
    const mins = log?.focus_minutes ?? 0
    const target = focusGoal.target_value ?? 1
    focusRate = Math.min(100, (mins / target) * 100)
    parts.push({ weight: 0.25, value: focusRate })
  }

  const metricGoals = goals.filter(
    (g) =>
      g.metric_key !== 'focus' &&
      !g.metric_key.startsWith('workout_') &&
      !g.metric_key.startsWith('custom:') &&
      hasTarget(g) &&
      g.metric_key !== 'weight',
  )
  if (metricGoals.length > 0) {
    const weekDates = getWeekDates(parseISO(date + 'T12:00:00'), weekStartsOn)
    const rates = metricGoals.map((goal) => {
      const progress = calculateProgress(goal, log, workouts, date, weekDates, allLogs, undefined, weekStartsOn)
      return progress.hasTarget ? Math.min(100, progress.percent) : 0
    })
    metricRate = rates.reduce((s, v) => s + v, 0) / rates.length
    parts.push({ weight: 0.3, value: metricRate })
  }

  if (parts.length === 0) {
    const logged =
      !!log &&
      (log.sleep_hours != null ||
        log.focus_minutes != null ||
        log.steps != null ||
        Object.keys(normalizeHabits(log.habits)).some((k) => normalizeHabits(log.habits)[k]))
    return {
      date,
      score: logged ? 55 : 0,
      habitRate: 0,
      focusRate: 0,
      metricRate: logged ? 55 : 0,
    }
  }

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0)
  const score = Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight)

  return { date, score, habitRate, focusRate, metricRate }
}

export function computePulseSeries(
  dates: string[],
  logs: DailyLog[],
  goals: Goal[],
  workouts: Workout[],
  today: string,
  todayLog: DailyLog | null,
  weekStartsOn: 0 | 1 = 1,
): DayPulse[] {
  const habits = getDailyLogHabitTypes()
  return dates.map((date) => {
    const log = logForDate(date, logs, today, todayLog, workouts)
    const dayWorkouts = workouts.filter((w) => w.date === date)
    return computeDayPulse(date, log, habits, goals, dayWorkouts, logs, weekStartsOn)
  })
}

export function buildHabitConstellation(
  logs: DailyLog[],
  weekDates: string[],
  today: string,
  todayLog: DailyLog | null,
): HabitStar[] {
  const habits = getDailyLogHabitTypes()
  const todayHabits = todayLog
    ? normalizeHabits(
        mergeDraftWithLog(todayLog, getDraft(today), []).habits,
      )
    : undefined

  return habits.map((habit, index) => {
    const streak = getHabitStreak(logs, habit.id, today, todayHabits)
    const weekRate = getHabitCompletionRate(logs, habit.id, weekDates, {
      asOfDate: today,
      todayHabits,
    })
    const angle = (index / Math.max(habits.length, 1)) * Math.PI * 2 - Math.PI / 2
    const orbit = 0.35 + (weekRate / 100) * 0.55
    return {
      id: habit.id,
      label: habit.label,
      streak,
      weekRate,
      angle,
      orbit,
    }
  })
}

export function computeWeekdayRhythm(
  series: DayPulse[],
  weekStartsOn: 0 | 1,
): WeekdayRhythm[] {
  const labels =
    weekStartsOn === 0
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const buckets = labels.map((label) => ({ label, total: 0, count: 0 }))

  for (const day of series) {
    if (day.score <= 0) continue
    const dow = parseISO(day.date + 'T12:00:00').getDay()
    const idx =
      weekStartsOn === 0
        ? dow
        : dow === 0
          ? 6
          : dow - 1
    buckets[idx].total += day.score
    buckets[idx].count++
  }

  return buckets.map((b) => ({
    label: b.label,
    avgScore: b.count > 0 ? Math.round(b.total / b.count) : 0,
    samples: b.count,
  }))
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
        body: 'Log habits, focus, or metrics on Today — this page turns your rhythm into patterns.',
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
  if (score >= 85) return 'Radiant'
  if (score >= 70) return 'Strong'
  if (score >= 50) return 'Steady'
  if (score >= 25) return 'Quiet'
  if (score > 0) return 'Faint'
  return 'Dormant'
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
