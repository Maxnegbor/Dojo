import { getDailyLogHabitTypes } from '@/lib/habitTypes'

export type WorkoutCategory = string

export type ScheduleBlockColor = string
export type ScheduleBlockState = 'grey' | ScheduleBlockColor

export type GoalPeriod = 'daily' | 'weekly'

/** Target timeframe for a goal (extends daily/weekly with custom windows). */
export type GoalTargetPeriod = GoalPeriod | 'custom_duration' | 'custom_date'

export interface ScheduleBlock {
  id: string
  user_id: string
  date: string
  start_time: string
  end_time: string
  title: string
  activity_type: ScheduleBlockState
  color: string
  created_at: string
}

export type MetricKey =
  | 'sleep'
  | 'weight'
  | 'steps'
  | 'screen_time'
  | 'focus'
  | `workout_${string}`
  | `habit_${string}`
  | `custom:${string}`

export type HabitKey = string

export type DailyHabits = Record<string, boolean>

export function defaultHabits(): DailyHabits {
  return {}
}

export function normalizeHabits(habits?: Partial<DailyHabits>): DailyHabits {
  const result: DailyHabits = {}
  for (const type of getDailyLogHabitTypes()) {
    result[type.id] = habits?.[type.id] ?? false
  }
  return result
}

export interface DailyLog {
  id: string
  user_id: string
  date: string
  sleep_hours: number | null
  weight: number | null
  steps: number | null
  screen_time_minutes: number | null
  focus_minutes: number
  notes: string
  habits?: DailyHabits
  custom_metrics?: Record<string, number | null>
  sleep_metrics?: Record<string, number | null>
  morning_log?: MorningLog | null
  created_at: string
  updated_at: string
}

export interface MorningLog {
  bedtime: string
  wake_time: string
  alertness: number
  /** Wake − bedtime (minutes). */
  in_bed_minutes: number
  /** How long you actually slept (minutes). */
  sleep_minutes: number
}

export interface Workout {
  id: string
  user_id: string
  daily_log_id: string | null
  date: string
  category: WorkoutCategory
  duration_minutes: number
  notes: string
  created_at: string
}

export interface Goal {
  id: string
  user_id: string
  metric_key: MetricKey
  name: string
  /** Null = track only, no target. */
  target_value: number | null
  /** When this metric is logged: daily log vs weekly shutdown. */
  log_period: GoalPeriod
  /** Target timeframe; defaults to log_period for daily/weekly goals. */
  target_period?: GoalTargetPeriod
  /** Length of a custom_duration target (in days). */
  period_days?: number
  /** Inclusive start date (YYYY-MM-DD) for custom targets. */
  period_start_date?: string
  /** Inclusive end date (YYYY-MM-DD) for custom_date targets. */
  period_end_date?: string
  /** When true, custom targets restart after each period ends. */
  period_recurring?: boolean
  /** @deprecated Use log_period */
  target_type?: GoalPeriod
  goal_weight_start: number | null
  goal_weight_target: number | null
  unit: string
  is_active: boolean
  /** User-defined grouping for goals on Metrics / Overview. */
  category_id?: string | null
  /**
   * Where daily metrics are collected: Home card, morning log, or evening shutdown.
   * Ignored when log_period is weekly. Defaults to home.
   */
  log_when?: 'home' | 'morning' | 'shutdown'
  /** When log_when is morning: which calendar day the value applies to. */
  morning_day?: 'today' | 'yesterday'
  /** @deprecated Derived from log_period === 'daily' */
  show_in_daily_log?: boolean
  created_at: string
}

export interface Reminder {
  id: string
  user_id: string
  title: string
  due_date: string
  due_time: string | null
  completed: boolean
  rescheduled_from: string | null
  kind: 'note' | 'task'
  created_at: string
}

export interface FocusTimerSettings {
  focusMinutes: number
  breakMinutes: number
  iterations: number
  skipBreaks: boolean
  longBreakEnabled: boolean
  /** Take a long break every N completed focus cycles. */
  longBreakAfterCycles: number
  longBreakMinutes: number
  allowPause: boolean
  /** After each focus cycle, ask for a 1–10 subjective focus score. */
  promptFocusScore: boolean
  focusGoalEnabled: boolean
  focusGoalPeriod: GoalPeriod
  focusGoalAmount: number
  focusGoalUnit: 'hours' | 'minutes'
}

export type WeekStartDay = 0 | 1
export type TimeFormat = '12h' | '24h'
export type WeightUnit = 'kg' | 'lb'
export type AccentColor = 'indigo' | 'violet' | 'emerald' | 'rose' | 'amber'

export interface WeeklyShutdownCheckItem {
  id: string
  label: string
}

export interface WeeklyShutdownCheckGroup {
  id: string
  label: string
  items: WeeklyShutdownCheckItem[]
}

export type DailyCheckItem = WeeklyShutdownCheckItem
export type DailyCheckGroup = WeeklyShutdownCheckGroup

/** Built-in steps available for the daily shutdown flow. */
export type DailyShutdownStepId = 'wrap-up' | 'habits' | 'schedule' | 'checklist'

export interface AppSettings {
  weekStartsOn: WeekStartDay
  timeFormat: TimeFormat
  weightUnit: WeightUnit
  accentColor: AccentColor
  showFocusBadge: boolean
  /** First hour row on the schedule (0–23) */
  timelineStartHour: number
  /** Last schedulable boundary; blocks may end at this hour (1–24, 24 = midnight) */
  timelineEndHour: number
  timerSoundEnabled: boolean
  /** Show workout types and goals on the Metrics page and in daily log. */
  showWorkoutMetrics: boolean
  /** Show the weekly exercise planner card on Home. */
  showHomeWorkoutPlanner: boolean
  /**
   * When true, the weekly exercise plan editor asks for a start time per session.
   * Default off — duration-only planning.
   */
  exerciseWeekPlanIncludeTime: boolean
  /** Show the Pulse score meter on the Home header. */
  showHomePulse: boolean
  /**
   * When true, completed Home habits collapse behind an “N done” toggle.
   * When false, the toggle is removed and completed habits stay in the main list.
   */
  hideCompletedHabitsInToggle: boolean
  /** Show Focus in the sidebar and allow /focus. */
  showFocusPage: boolean
  /** Show a clean read-only agenda of today’s schedule beside the Focus timer. */
  showFocusSchedule: boolean
  /** @deprecated Pulse page removed from nav; kept for stored settings compatibility. */
  showPulsePage: boolean
  /** Checklist sections shown during weekly shutdown. */
  weeklyShutdownChecklist: WeeklyShutdownCheckGroup[]
  /** Optional checklist after morning log. */
  morningLogChecklist: DailyCheckGroup[]
  /** When true, blur-lock all screens until today's morning log is saved (no Home button). */
  requireMorningLog: boolean
  /** First calendar day morning logging applies (e.g. day after signup). */
  morningLogStartDate?: string
  /** Optional checklist after daily shutdown log. */
  dailyShutdownChecklist: DailyCheckGroup[]
  /**
   * Ordered preset steps for the daily shutdown modal.
   * Habits may still be skipped at runtime when nothing is pending.
   */
  dailyShutdownSteps: DailyShutdownStepId[]
  /** When true, blur-lock screens after the require time until shutdown is completed. */
  requireShutdown: boolean
  /** When to require shutdown: end of Home schedule hours, or a custom clock time. */
  shutdownRequireAt: 'schedule_end' | 'custom'
  /** HH:mm when shutdownRequireAt is custom. */
  shutdownCustomTime: string
  /**
   * Affirmation typed exactly before finishing morning log
   * (when requireTypedReminderMorning is on).
   */
  typedReminderMorningText: string
  /** Gate morning log finish behind typing typedReminderMorningText. */
  requireTypedReminderMorning: boolean
  /**
   * Affirmation typed exactly before finishing daily shutdown
   * (when requireTypedReminderShutdown is on).
   */
  typedReminderShutdownText: string
  /** Gate daily shutdown finish behind typing typedReminderShutdownText. */
  requireTypedReminderShutdown: boolean
  /** Temporary developer perspective — unlocks dev settings and test flows. */
  devMode: boolean
  /** Set true after completing first-run onboarding. */
  onboardingCompleted?: boolean
  /** First day the user joined — missed-log prompts skip dates before this. */
  memberSinceDate?: string
}

export interface DailyLogInput {
  sleep_hours?: number | null
  weight?: number | null
  steps?: number | null
  screen_time_minutes?: number | null
  focus_minutes?: number
  notes?: string
  habits?: DailyHabits
  custom_metrics?: Record<string, number | null>
  sleep_metrics?: Record<string, number | null>
  morning_log?: MorningLog | null
}

export const METRIC_LABELS: Record<string, string> = {
  sleep: 'Sleep',
  weight: 'Weight',
  steps: 'Steps',
  screen_time: 'Screen Time',
  focus: 'Focus',
  workout_hiit: 'HIIT',
  workout_zone2: 'Zone 2',
  workout_strength: 'Strength',
}

export const METRIC_UNITS: Record<string, string> = {
  sleep: 'hrs',
  weight: 'kg',
  steps: 'steps',
  screen_time: 'hrs:min',
  focus: 'min',
  workout_hiit: 'min/wk',
  workout_zone2: 'min/wk',
  workout_strength: 'min/wk',
}

export const WORKOUT_COLORS: Record<WorkoutCategory, string> = {
  hiit: '#ef4444',
  zone2: '#3b82f6',
  strength: '#eab308',
}

export const WORKOUT_BG: Record<WorkoutCategory, string> = {
  hiit: 'bg-red-600',
  zone2: 'bg-blue-600',
  strength: 'bg-yellow-500',
}

export const DEFAULT_FOCUS_SETTINGS: FocusTimerSettings = {
  focusMinutes: 25,
  breakMinutes: 5,
  iterations: 1,
  skipBreaks: false,
  longBreakEnabled: false,
  longBreakAfterCycles: 4,
  longBreakMinutes: 15,
  allowPause: false,
  promptFocusScore: false,
  focusGoalEnabled: false,
  focusGoalPeriod: 'daily',
  focusGoalAmount: 60,
  focusGoalUnit: 'minutes',
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  weekStartsOn: 1,
  timeFormat: '12h',
  weightUnit: 'kg',
  accentColor: 'amber',
  showFocusBadge: true,
  timelineStartHour: 6,
  timelineEndHour: 23,
  timerSoundEnabled: false,
  showWorkoutMetrics: false,
  showHomeWorkoutPlanner: true,
  exerciseWeekPlanIncludeTime: false,
  showHomePulse: true,
  hideCompletedHabitsInToggle: true,
  showFocusPage: true,
  showFocusSchedule: false,
  showPulsePage: true,
  weeklyShutdownChecklist: [],
  morningLogChecklist: [],
  requireMorningLog: false,
  dailyShutdownChecklist: [],
  dailyShutdownSteps: ['wrap-up', 'habits', 'schedule'],
  requireShutdown: false,
  shutdownRequireAt: 'schedule_end',
  shutdownCustomTime: '21:00',
  typedReminderMorningText: '',
  requireTypedReminderMorning: false,
  typedReminderShutdownText: '',
  requireTypedReminderShutdown: false,
  devMode: false,
}

export const ACCENT_LABELS: Record<AccentColor, string> = {
  indigo: 'Indigo',
  violet: 'Violet',
  emerald: 'Emerald',
  rose: 'Rose',
  amber: 'Amber',
}

export const ACCENT_SWATCHES: Record<AccentColor, string> = {
  indigo: '#6366f1',
  violet: '#8b5cf6',
  emerald: '#10b981',
  rose: '#f43f5e',
  amber: '#f59e0b',
}

export const WORKOUT_LABELS: Record<WorkoutCategory, string> = {
  hiit: 'HIIT',
  zone2: 'Zone 2',
  strength: 'Strength',
}

export const SCHEDULE_BLOCK_COLORS: ScheduleBlockColor[] = ['blue', 'rose', 'amber']

export const GREY_BLOCK_HEX = '#71717a'

export const BLOCK_COLOR_HEX: Record<ScheduleBlockState, string> = {
  grey: GREY_BLOCK_HEX,
  blue: '#3b82f6',
  rose: '#f43f5e',
  amber: '#f59e0b',
}

export const GREY_BLOCK_TITLE = 'New Block'

export const BLOCK_COLOR_DEFAULT_TITLES: Record<ScheduleBlockColor, string> = {
  blue: 'Deep Work',
  rose: 'Family',
  amber: 'Exercise',
}
