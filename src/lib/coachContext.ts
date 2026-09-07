import { addDays, format, parseISO } from 'date-fns'
import { formatWorkoutPlanLabel, getWorkoutTypes, workoutMetricKey, DEFAULT_WORKOUT_UNIT } from '@/lib/workoutTypes'
import { getPlannedWorkoutsForDate } from '@/lib/exercisePlan'
import { getHabitifyJournalCache } from '@/lib/habitifyStore'
import { getWhoopDay } from '@/lib/whoopStore'
import { computePulseSeries } from '@/lib/pulse'
import { getPulseConfig, resolveWeeklyQuantityTarget } from '@/lib/pulseConfig'
import { getSleepMetricsConfig } from '@/lib/sleepMetrics'
import { computeOutcomeGoalProgress, getActiveOutcomeGoals } from '@/lib/outcomeGoals'
import { getWeeklyWorkoutTotal } from '@/lib/metrics'
import { getActiveGoalByMetricKey, hasTarget, normalizeGoal } from '@/lib/goals'
import { goalTargetPeriod } from '@/lib/goalPeriod'
import { getAppSettings } from '@/lib/settingsStore'
import type { PulseContributor } from '@/lib/pulseBreakdown'
import type { TodoistTask } from '@/lib/todoistApi'
import { formatDate, getWeekDates, parseTimeToMinutes } from '@/lib/utils'
import type { DailyLog, Goal, ScheduleBlock, Workout } from '@/types'
import type { OverviewPeriod, OverviewPeriodStats } from '@/lib/overviewPeriods'
import type { CoachKind, CoachSlot } from '@/lib/coachStore'

export type CoachTimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

export interface CoachSnapshot {
  date: string
  weekday: string
  reviewingPastDay: boolean
  slot: CoachKind | null
  timeOfDay: CoachTimeOfDay | null
  pulse: {
    score: number
    gaps: { label: string; detail: string; remainingPts: number }[]
    done: { label: string; detail: string }[]
  }
  schedule: { title: string; start: string; end: string; upcoming: boolean }[]
  workoutsLogged: { label: string; minutes: number }[]
  workoutsPlanned: { label: string; completed: boolean }[]
  workoutVolume: {
    label: string
    logged: number
    target: number
    unit: string
    remaining: number
    expectedByNow: number
    daysLeft: number
    onTrack: boolean
  }[]
  habitify: { name: string; status: string }[]
  todoist: { title: string; overdue: boolean }[]
  whoop: {
    recovery: number | null
    sleepPerformance: number | null
    sleepHours: number | null
    strain: number | null
    hrvMs: number | null
    restingHr: number | null
  } | null
  sleep: { hours: number | null; alertness: number | null } | null
  notes: string | null
  recentPulse: { date: string; score: number }[]
  outcomeGoals: { title: string; onTrack: boolean }[]
  period?: {
    kind: OverviewPeriod
    label: string
    sleepAvg: number | null
    focusMinutes: number
    workoutMinutes: number
    activeDays: number
    loggingRate: number
    bestHabit: string | null
  }
}

function timeOfDayFromHour(hour: number): CoachTimeOfDay {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

function cap<T>(items: T[], n: number): T[] {
  return items.slice(0, n)
}

function uniqueWorkouts(workouts: Workout[]): Workout[] {
  const seen = new Set<string>()
  const out: Workout[] = []
  for (const workout of workouts) {
    if (seen.has(workout.id)) continue
    seen.add(workout.id)
    out.push(workout)
  }
  return out
}

function buildWorkoutVolume(
  date: string,
  workouts: Workout[],
  goals: Goal[],
): CoachSnapshot['workoutVolume'] {
  const weekStartsOn = getAppSettings().weekStartsOn
  const weekDates = getWeekDates(parseISO(`${date}T12:00:00`), weekStartsOn)
  const dayIndex = Math.max(0, weekDates.indexOf(date))
  const daysElapsed = dayIndex + 1
  const daysLeft = Math.max(0, 7 - dayIndex)
  const out: CoachSnapshot['workoutVolume'] = []

  for (const type of getWorkoutTypes()) {
    const metricKey = workoutMetricKey(type.id)
    let target = resolveWeeklyQuantityTarget(metricKey, goals)
    if (target == null) {
      const hybrid = getActiveGoalByMetricKey(goals, metricKey)
      if (hybrid && hasTarget(hybrid)) {
        const normalized = normalizeGoal(hybrid)
        if (goalTargetPeriod(normalized) === 'weekly' || metricKey.startsWith('workout_')) {
          target = normalized.target_value
        }
      }
    }
    const roundedTarget = target != null ? Math.round(target) : 0
    if (roundedTarget <= 0) continue

    const logged = Math.round(getWeeklyWorkoutTotal(type.id, workouts, weekDates))
    const expectedByNow = Math.round((roundedTarget * daysElapsed) / 7)
    out.push({
      label: formatWorkoutPlanLabel(type.id),
      logged,
      target: roundedTarget,
      unit: type.unit || DEFAULT_WORKOUT_UNIT,
      remaining: Math.max(0, roundedTarget - logged),
      expectedByNow,
      daysLeft,
      onTrack: logged >= expectedByNow,
    })
  }

  return out
}

export function buildDayCoachSnapshot(input: {
  date: string
  log: DailyLog | undefined
  goals: Goal[]
  workouts: Workout[]
  logs: DailyLog[]
  blocks: ScheduleBlock[]
  contributors: PulseContributor[]
  pulseScore: number
  todoist: TodoistTask[]
  slot?: CoachSlot
  now?: Date
}): CoachSnapshot {
  const workouts = uniqueWorkouts(input.workouts)
  const now = input.now ?? new Date()
  const today = formatDate(now)
  const reviewingPastDay = input.date !== today
  const hour = now.getHours()
  const nowMinutes = hour * 60 + now.getMinutes()

  const gaps = input.contributors
    .filter((row) => row.scoreMax > 0 && row.rate < 100)
    .sort((a, b) => b.scoreMax - a.scoreMax - (b.scoreEarned - a.scoreEarned))
    .map((row) => ({
      label: row.label,
      detail: row.detail,
      remainingPts: Math.round((row.scoreMax - row.scoreEarned) * 10) / 10,
    }))

  const done = input.contributors
    .filter((row) => row.rate >= 100)
    .map((row) => ({ label: row.label, detail: row.detail }))

  const schedule = [...input.blocks]
    .sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time))
    .map((block) => ({
      title: block.title.trim() || 'Block',
      start: block.start_time,
      end: block.end_time,
      upcoming:
        !reviewingPastDay && parseTimeToMinutes(block.end_time) > nowMinutes,
    }))

  const dayWorkouts = workouts.filter((w) => w.date === input.date)
  const workoutsLogged = dayWorkouts.map((w) => ({
    label: formatWorkoutPlanLabel(w.category),
    minutes: w.duration_minutes,
  }))

  const workoutsPlanned = getPlannedWorkoutsForDate(input.date).map((plan) => ({
    label: formatWorkoutPlanLabel(plan.category, plan.subtype),
    completed: plan.completed,
  }))

  const habitify = getHabitifyJournalCache(input.date).map((entry) => ({
    name: entry.name,
    status: entry.status,
  }))

  const todoist = input.todoist.map((task) => ({
    title: task.content,
    overdue: Boolean(task.due?.date && task.due.date < today),
  }))

  const whoopDay = getWhoopDay(input.date)
  const whoop = whoopDay
    ? {
        recovery: whoopDay.recoveryScore,
        sleepPerformance: whoopDay.sleepPerformance,
        sleepHours:
          whoopDay.sleepMinutes != null
            ? Math.round((whoopDay.sleepMinutes / 60) * 10) / 10
            : null,
        strain: whoopDay.strain,
        hrvMs: whoopDay.hrvMs != null ? Math.round(whoopDay.hrvMs) : null,
        restingHr: whoopDay.restingHr,
      }
    : null

  const sleepHours =
    input.log?.sleep_hours ??
    (input.log?.morning_log ? input.log.morning_log.sleep_minutes / 60 : null)

  const sleep =
    sleepHours != null || input.log?.morning_log
      ? {
          hours: sleepHours,
          alertness: input.log?.morning_log?.alertness ?? null,
        }
      : null

  const notes = input.log?.notes?.trim() || null

  const dates: string[] = []
  const end = parseISO(`${input.date}T12:00:00`)
  for (let i = 13; i >= 0; i -= 1) {
    dates.push(formatDate(addDays(end, -i)))
  }
  const recentPulse = computePulseSeries(
    dates,
    input.logs,
    input.goals,
    workouts,
    today,
    input.date === today ? input.log ?? null : null,
    getPulseConfig(),
    getSleepMetricsConfig(),
  )
    .filter((day) => day.score > 0)
    .map((day) => ({ date: day.date, score: day.score }))

  const outcomeGoals = getActiveOutcomeGoals().map((goal) => {
    const progress = computeOutcomeGoalProgress(
      goal,
      input.logs,
      workouts,
      input.goals,
      now,
    )
    return { title: goal.title, onTrack: progress.onTrack }
  })

  return {
    date: input.date,
    weekday: format(parseISO(`${input.date}T12:00:00`), 'EEEE'),
    reviewingPastDay,
    slot: input.slot ?? null,
    timeOfDay: reviewingPastDay ? null : timeOfDayFromHour(hour),
    pulse: {
      score: input.pulseScore,
      gaps: cap(gaps, 8),
      done: cap(done, 8),
    },
    schedule: cap(schedule, 12),
    workoutsLogged: cap(workoutsLogged, 8),
    workoutsPlanned: cap(workoutsPlanned, 8),
    workoutVolume: cap(buildWorkoutVolume(input.date, workouts, input.goals), 8),
    habitify: cap(habitify, 12),
    todoist: cap(todoist, 10),
    whoop,
    sleep,
    notes,
    recentPulse: cap(recentPulse, 14),
    outcomeGoals: cap(outcomeGoals, 6),
  }
}

export function buildPeriodCoachSnapshot(input: {
  period: OverviewPeriod
  label: string
  stats: OverviewPeriodStats
  logs: DailyLog[]
  workouts: Workout[]
  goals: Goal[]
  asOf: Date
}): CoachSnapshot {
  const date = formatDate(input.asOf)
  const formulaDates: string[] = []
  const cursor = addDays(input.asOf, -13)
  for (let i = 0; i < 14; i += 1) {
    formulaDates.push(formatDate(addDays(cursor, i)))
  }

  const recentPulse = computePulseSeries(
    formulaDates,
    input.logs,
    input.goals,
    input.workouts,
    date,
    null,
    getPulseConfig(),
    getSleepMetricsConfig(),
  )
    .filter((day) => day.score > 0)
    .map((day) => ({ date: day.date, score: day.score }))

  const outcomeGoals = getActiveOutcomeGoals().map((goal) => {
    const progress = computeOutcomeGoalProgress(
      goal,
      input.logs,
      input.workouts,
      input.goals,
      input.asOf,
    )
    return { title: goal.title, onTrack: progress.onTrack }
  })

  return {
    date,
    weekday: format(input.asOf, 'EEEE'),
    reviewingPastDay: true,
    slot: 'insights',
    timeOfDay: null,
    pulse: { score: 0, gaps: [], done: [] },
    schedule: [],
    workoutsLogged: [],
    workoutsPlanned: [],
    workoutVolume: cap(buildWorkoutVolume(date, uniqueWorkouts(input.workouts), input.goals), 8),
    habitify: [],
    todoist: [],
    whoop: null,
    sleep: input.stats.sleepAvg != null ? { hours: input.stats.sleepAvg, alertness: null } : null,
    notes: null,
    recentPulse: cap(recentPulse, 14),
    outcomeGoals: cap(outcomeGoals, 8),
    period: {
      kind: input.period,
      label: input.label,
      sleepAvg: input.stats.sleepAvg,
      focusMinutes: input.stats.focus.total,
      workoutMinutes: input.stats.workoutTotalMinutes,
      activeDays: input.stats.activeDays,
      loggingRate: input.stats.loggingRate,
      bestHabit: input.stats.bestHabitStreak
        ? `${input.stats.bestHabitStreak.label} (${input.stats.bestHabitStreak.days}d)`
        : null,
    },
  }
}
