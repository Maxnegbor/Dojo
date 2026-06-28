import { getDailyLogHabitTypes } from '@/lib/habitTypes'

export type WorkoutCategory = string

export type ScheduleBlockColor = 'blue' | 'rose' | 'amber'
export type ScheduleBlockState = 'grey' | ScheduleBlockColor

export type GoalPeriod = 'daily' | 'weekly'

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
  created_at: string
  updated_at: string
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
  /** @deprecated Use log_period */
  target_type?: GoalPeriod
  goal_weight_start: number | null
  goal_weight_target: number | null
  unit: string
  is_active: boolean
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
}

export type WeekStartDay = 0 | 1
export type TimeFormat = '12h' | '24h'
export type WeightUnit = 'kg' | 'lb'
export type AccentColor = 'indigo' | 'violet' | 'emerald' | 'rose' | 'amber'

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
  screen_time: 'min',
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
