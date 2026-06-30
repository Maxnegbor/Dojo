import { addDays, parseISO } from 'date-fns'
import type { CompletedHabitSummary } from '@/components/today/GoalProgressModal'
import { filterShutdownProgressDeltas } from '@/lib/dailyLogProgress'
import { mergeDraftWithLog, usesAdditiveTodayDraft, type DailyLogDraft, type WorkoutDrafts } from '@/lib/dailyLogDraft'
import { getDailyLogHabitTypes } from '@/lib/habitTypes'
import { getWorkoutTypes } from '@/lib/workoutTypes'
import { getHabitStreaksForDate } from '@/lib/habitStreaks'
import { calculateProgressDeltas, type ProgressDelta } from '@/lib/metrics'
import type { DailyHabits, DailyLog, Goal, Workout } from '@/types'
import type { WeekStartDay } from '@/types'
import { defaultHabits, normalizeHabits } from '@/types'
import { formatDate } from '@/lib/utils'

export interface DailyShutdownMetricValues {
  sleep_hours: number | null
  steps: number | null
  screen_time_minutes: number | null
  focus_minutes: number
  habits: DailyHabits
  workouts: Record<string, number | null>
  custom_metrics: Record<string, number | null>
}

export interface DailyShutdownPreviewResult {
  deltas: ProgressDelta[]
  untrackedFocusMinutes: number | null
  completedHabits: CompletedHabitSummary[]
}

export const DEFAULT_SHUTDOWN_BEFORE: DailyShutdownMetricValues = {
  sleep_hours: 7,
  steps: 6000,
  screen_time_minutes: 180,
  focus_minutes: 30,
  habits: defaultHabits(),
  workouts: { zone2: 20 },
  custom_metrics: { 'custom:reading': 8 },
}

export const DEFAULT_SHUTDOWN_AFTER: DailyShutdownMetricValues = {
  sleep_hours: 8,
  steps: 12000,
  screen_time_minutes: 90,
  focus_minutes: 30,
  habits: defaultHabits(),
  workouts: { hiit: 20, zone2: 60 },
  custom_metrics: { 'custom:reading': 15 },
}

export function emptyWorkoutDurations(): Record<string, number | null> {
  return getWorkoutTypes().reduce<Record<string, number | null>>((acc, type) => {
    acc[type.id] = null
    return acc
  }, {})
}

export function durationMapFromWorkouts(workouts: Workout[], date: string): Record<string, number | null> {
  const map = emptyWorkoutDurations()
  for (const workout of workouts.filter((entry) => entry.date === date)) {
    map[workout.category] = (map[workout.category] ?? 0) + workout.duration_minutes
  }
  return map
}

export function durationMapFromDraft(draft: DailyLogDraft | null): Record<string, number | null> {
  const map = emptyWorkoutDurations()
  if (!draft) return map
  const workouts = draft.workouts ?? {}
  for (const [category, duration] of Object.entries(workouts)) {
    map[category] = duration ?? null
  }
  return map
}

export function mergeWorkoutDurationMaps(
  stored: Record<string, number | null>,
  additions: Record<string, number | null>,
): Record<string, number | null> {
  const map = emptyWorkoutDurations()
  for (const type of getWorkoutTypes()) {
    const total = (stored[type.id] ?? 0) + (additions[type.id] ?? 0)
    map[type.id] = total > 0 ? total : null
  }
  return map
}

export function buildPreviewWorkouts(
  date: string,
  userId: string,
  durations: Record<string, number | null>,
  keepOtherDates: Workout[] = [],
): Workout[] {
  const otherDays = keepOtherDates.filter((entry) => entry.date !== date)
  const todayEntries = Object.entries(durations)
    .filter(([, minutes]) => minutes != null && minutes > 0)
    .map(([category, duration_minutes]) => ({
      id: `preview-workout-${category}-${date}`,
      user_id: userId,
      daily_log_id: null,
      date,
      category,
      duration_minutes: duration_minutes!,
      notes: '',
      created_at: new Date().toISOString(),
    }))
  return [...otherDays, ...todayEntries]
}

function workoutsToDraft(workouts: Record<string, number | null>): WorkoutDrafts {
  const draft: WorkoutDrafts = {}
  for (const [category, minutes] of Object.entries(workouts)) {
    if (minutes != null && minutes > 0) draft[category] = minutes
  }
  return draft
}

export function dailyShutdownValuesToDraft(values: DailyShutdownMetricValues): DailyLogDraft {
  return {
    sleep_hours: values.sleep_hours,
    steps: values.steps,
    screen_time_minutes: values.screen_time_minutes,
    focus_minutes: values.focus_minutes,
    focusMode: 'additive',
    habits: normalizeHabits(values.habits),
    custom_metrics: values.custom_metrics,
    workouts: workoutsToDraft(values.workouts),
    workoutMode: 'additive',
  }
}

export function buildPreviewDailyLog(
  date: string,
  userId: string,
  values: DailyShutdownMetricValues,
  base?: DailyLog | null,
): DailyLog {
  const now = base?.created_at ?? new Date().toISOString()
  return {
    id: base?.id ?? 'dev-preview-log',
    user_id: userId,
    date,
    sleep_hours: values.sleep_hours,
    weight: base?.weight ?? null,
    steps: values.steps,
    screen_time_minutes: values.screen_time_minutes,
    focus_minutes: values.focus_minutes,
    notes: base?.notes ?? '',
    habits: normalizeHabits(values.habits),
    custom_metrics: values.custom_metrics,
    created_at: now,
    updated_at: now,
  }
}

export function focusAdditionFromDraft(draft: DailyLogDraft | null): number {
  if (!draft?.focus_minutes || draft.focus_minutes <= 0) return 0
  return draft.focus_minutes
}

function applyDraftToLog(log: DailyLog, draft: DailyLogDraft): DailyLog {
  const merged = mergeDraftWithLog(log, draft, [])
  const additive = usesAdditiveTodayDraft(log.date)
  const storedFocus = log.focus_minutes ?? 0
  const focusAddition = merged.focus_minutes ?? 0
  return {
    ...log,
    sleep_hours: merged.sleep_hours ?? null,
    steps: merged.steps ?? null,
    screen_time_minutes: merged.screen_time_minutes ?? null,
    focus_minutes: additive ? storedFocus + focusAddition : merged.focus_minutes ?? storedFocus,
    habits: normalizeHabits(merged.habits),
    custom_metrics: merged.custom_metrics ?? {},
  }
}

function replaceLogForDate(logs: DailyLog[], log: DailyLog): DailyLog[] {
  return [...logs.filter((entry) => entry.date !== log.date), log].sort((a, b) =>
    a.date.localeCompare(b.date),
  )
}

export function computeDailyShutdownPreview(
  date: string,
  goals: Goal[],
  logBefore: DailyLog,
  logAfter: DailyLog,
  weekStartsOn: WeekStartDay,
  existingLogs: DailyLog[],
  workoutsBefore: Workout[] = [],
  workoutsAfter: Workout[] = [],
): DailyShutdownPreviewResult {
  const allLogsBefore = replaceLogForDate(existingLogs, logBefore)
  const allLogsAfter = replaceLogForDate(existingLogs, logAfter)

  const deltas = calculateProgressDeltas(
    goals.filter((goal) => goal.is_active),
    logBefore,
    logAfter,
    workoutsBefore,
    workoutsAfter,
    date,
    allLogsBefore,
    allLogsAfter,
    weekStartsOn,
  )

  const { deltas: summary, untrackedFocusMinutes } = filterShutdownProgressDeltas(
    deltas,
    logAfter.focus_minutes ?? 0,
  )

  const streakLogs = getHabitStreaksForDate(allLogsAfter, date, logAfter.habits)
  const completedHabits = getDailyLogHabitTypes()
    .filter((habit) => normalizeHabits(logAfter.habits)[habit.id])
    .map((habit) => ({
      label: habit.label,
      streak: streakLogs[habit.id] ?? 0,
    }))

  return { deltas: summary, untrackedFocusMinutes, completedHabits }
}

export function computeDailyShutdownPreviewFromDraft(
  date: string,
  goals: Goal[],
  logBefore: DailyLog,
  draft: DailyLogDraft,
  weekStartsOn: WeekStartDay,
  existingLogs: DailyLog[],
  workoutsBefore: Workout[] = [],
  userId?: string,
): DailyShutdownPreviewResult {
  const logAfter = applyDraftToLog(logBefore, draft)
  const storedToday = durationMapFromWorkouts(workoutsBefore, date)
  const additions = durationMapFromDraft(draft)
  const afterTotals = mergeWorkoutDurationMaps(storedToday, additions)
  const workoutsAfter =
    userId != null
      ? buildPreviewWorkouts(date, userId, afterTotals, workoutsBefore)
      : workoutsBefore

  return computeDailyShutdownPreview(
    date,
    goals,
    logBefore,
    logAfter,
    weekStartsOn,
    existingLogs,
    workoutsBefore,
    workoutsAfter,
  )
}

export function loadTodayShutdownValues(
  log: DailyLog,
  draft: DailyLogDraft | null,
  workouts: Workout[],
  date: string,
): { before: DailyShutdownMetricValues; after: DailyShutdownMetricValues } {
  const storedWorkouts = durationMapFromWorkouts(workouts, date)
  const workoutAdditions = durationMapFromDraft(draft)
  const focusAddition = focusAdditionFromDraft(draft)
  const merged = mergeDraftWithLog(log, draft, workouts)

  const before: DailyShutdownMetricValues = {
    sleep_hours: log.sleep_hours,
    steps: log.steps,
    screen_time_minutes: log.screen_time_minutes,
    focus_minutes: log.focus_minutes ?? 0,
    habits: normalizeHabits(log.habits),
    workouts: storedWorkouts,
    custom_metrics: { ...(log.custom_metrics ?? {}) },
  }

  const after: DailyShutdownMetricValues = {
    sleep_hours: merged.sleep_hours ?? null,
    steps: merged.steps ?? null,
    screen_time_minutes: merged.screen_time_minutes ?? null,
    focus_minutes: focusAddition,
    habits: normalizeHabits(merged.habits),
    workouts: workoutAdditions,
    custom_metrics: { ...(merged.custom_metrics ?? {}) },
  }

  return { before, after }
}

export function getPreviewStreakLogs(existingLogs: DailyLog[], asOfDate: string): DailyLog[] {
  const start = formatDate(addDays(parseISO(asOfDate), -400))
  return existingLogs.filter((log) => log.date >= start && log.date <= asOfDate)
}
