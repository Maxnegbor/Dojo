import type { DailyLog, DailyHabits } from '@/types'
import { normalizeHabits } from '@/types'
import type { HabitRampConfig, HabitTypeDefinition } from '@/lib/habitTypes'
import { formatHabitDuration, habitLogPeriod } from '@/lib/habitTypes'
import { getLast7DayHabitConsistency } from '@/lib/habitStreaks'
import { formatDate } from '@/lib/utils'
import { storageGetItem, storageKeys, storageRemoveItem, storageSetItem } from '@/lib/userStorage'

const PROMPT_STORAGE_PREFIX = 'personal-os-habit-ramp-prompt'

export function getMaxRampLevel(ramp: HabitRampConfig): number {
  if (ramp.step_value <= 0) return 0
  return Math.ceil((ramp.target_value - ramp.start_value) / ramp.step_value)
}

export function isHabitRampEnabled(habit: HabitTypeDefinition): boolean {
  return habit.ramp?.enabled === true
}

export function capHabitRampValue(
  value: number,
  ramp: Pick<HabitRampConfig, 'start_value' | 'target_value'>,
): number {
  return Math.min(ramp.target_value, Math.max(ramp.start_value, value))
}

export function getHabitRampTarget(ramp: HabitRampConfig): number {
  const raw = ramp.start_value + ramp.level * ramp.step_value
  return capHabitRampValue(raw, ramp)
}

export function getHabitRampTargetForHabit(habit: HabitTypeDefinition): number | null {
  if (!habit.ramp?.enabled) return null
  return getHabitRampTarget(habit.ramp)
}

/** Level earned from the current streak (does not exceed max steps to target). */
export function getEligibleRampLevel(streak: number, ramp: HabitRampConfig): number {
  if (ramp.interval_streak_days <= 0) return ramp.level
  const fromStreak = Math.floor(streak / ramp.interval_streak_days)
  return Math.min(fromStreak, getMaxRampLevel(ramp))
}

export function formatHabitRampTarget(habit: HabitTypeDefinition): string | null {
  const target = getHabitRampTargetForHabit(habit)
  if (target == null || !habit.ramp) return null
  const unit = habit.ramp.unit.trim()
  return unit ? `${target} ${unit}` : String(target)
}

export function formatHabitRampCardLabel(habit: HabitTypeDefinition): string | null {
  if (!habit.ramp?.enabled) return null
  const current = getHabitRampTarget(habit.ramp)
  const unit = habit.ramp.unit.trim() || 'min'
  return `${current} ${unit} · level ${habit.ramp.level} · ${habit.ramp.start_value}→${habit.ramp.target_value} ${unit}`
}

export function getHabitTargetLabel(habit: HabitTypeDefinition): string | null {
  if (habit.ramp?.enabled) return formatHabitRampTarget(habit)
  return formatHabitDuration(habit)
}

export function formatHabitCardSubtitle(habit: HabitTypeDefinition): string {
  return habitLogPeriod(habit) === 'weekly' ? 'weekly' : 'daily'
}

export function normalizeHabitRamp(ramp: HabitRampConfig | undefined): HabitRampConfig | undefined {
  if (!ramp?.enabled) return undefined

  const start_value = Number(ramp.start_value)
  const target_value = Number(ramp.target_value)
  const step_value = Number(ramp.step_value)
  const interval_streak_days = Number(ramp.interval_streak_days ?? ramp.interval_days)
  const level = Number(ramp.level ?? 0)

  if (
    !Number.isFinite(start_value) ||
    !Number.isFinite(target_value) ||
    !Number.isFinite(step_value) ||
    !Number.isFinite(interval_streak_days) ||
    !Number.isFinite(level) ||
    start_value <= 0 ||
    target_value <= start_value ||
    step_value <= 0 ||
    interval_streak_days <= 0 ||
    level < 0
  ) {
    return undefined
  }

  const normalized: HabitRampConfig = {
    enabled: true,
    start_value,
    target_value,
    step_value,
    interval_streak_days: Math.round(interval_streak_days),
    level: Math.min(Math.max(0, Math.round(level)), getMaxRampLevel({
      enabled: true,
      start_value,
      target_value,
      step_value,
      interval_streak_days: Math.round(interval_streak_days),
      level: 0,
      unit: ramp.unit?.trim() || 'min',
    })),
    unit: ramp.unit?.trim() || 'min',
  }

  return normalized
}

export function applyRampLevelSync(
  habits: HabitTypeDefinition[],
  streakByHabit: Record<string, number>,
): { habits: HabitTypeDefinition[]; changed: boolean } {
  let changed = false
  const next = habits.map((habit) => {
    if (!habit.ramp?.enabled) return habit
    const eligible = getEligibleRampLevel(streakByHabit[habit.id] ?? 0, habit.ramp)
    if (eligible > habit.ramp.level) {
      changed = true
      return { ...habit, ramp: { ...habit.ramp, level: eligible } }
    }
    return habit
  })
  return { habits: next, changed }
}

export function decreaseHabitRampLevel(habit: HabitTypeDefinition): HabitTypeDefinition {
  if (!habit.ramp?.enabled || habit.ramp.level <= 0) return habit
  return { ...habit, ramp: { ...habit.ramp, level: habit.ramp.level - 1 } }
}

export function adjustHabitRampLevel(
  habit: HabitTypeDefinition,
  delta: number,
): HabitTypeDefinition {
  if (!habit.ramp?.enabled) return habit
  const maxLevel = getMaxRampLevel(habit.ramp)
  const nextLevel = Math.min(maxLevel, Math.max(0, habit.ramp.level + delta))
  if (nextLevel === habit.ramp.level) return habit
  return { ...habit, ramp: { ...habit.ramp, level: nextLevel } }
}

export function resetAllRampLevels(habits: HabitTypeDefinition[]): HabitTypeDefinition[] {
  return habits.map((habit) =>
    habit.ramp?.enabled ? { ...habit, ramp: { ...habit.ramp, level: 0 } } : habit,
  )
}

function promptStorageKey(habitId: string, failedDate: string): string {
  return `${PROMPT_STORAGE_PREFIX}-${failedDate}-${habitId}`
}

export function wasRampFailurePromptHandled(habitId: string, failedDate: string): boolean {
  try {
    return storageGetItem(promptStorageKey(habitId, failedDate)) != null
  } catch {
    return false
  }
}

export function dismissRampFailurePrompt(habitId: string, failedDate: string): void {
  try {
    storageSetItem(promptStorageKey(habitId, failedDate), 'kept')
  } catch {
    /* ignore */
  }
}

export function markRampFailureDecreased(habitId: string, failedDate: string): void {
  try {
    storageSetItem(promptStorageKey(habitId, failedDate), 'decreased')
  } catch {
    /* ignore */
  }
}

export function clearAllRampFailurePrompts(): void {
  try {
    storageKeys(PROMPT_STORAGE_PREFIX).forEach((key) => storageRemoveItem(key))
  } catch {
    /* ignore */
  }
}

export interface HabitRampFailurePrompt {
  habitId: string
  habitLabel: string
  failedDate: string
  currentLevel: number
  currentTarget: number
  decreasedTarget: number
  unit: string
  consistency7Days: number
}

function habitDoneOnLog(log: DailyLog | null | undefined, habitId: string): boolean {
  if (!log) return false
  return normalizeHabits(log.habits)[habitId] ?? false
}

export function getHabitRampFailurePrompts(
  habits: HabitTypeDefinition[],
  failedDate: string,
  failedLog: DailyLog | null | undefined,
  logs: DailyLog[],
  asOfDate: string,
  todayHabits?: DailyHabits,
): HabitRampFailurePrompt[] {
  const today = formatDate(new Date())
  if (failedDate >= today) return []

  return habits
    .filter((habit) => habit.ramp?.enabled && (habit.ramp.level ?? 0) > 0)
    .filter((habit) => !habitDoneOnLog(failedLog, habit.id))
    .filter((habit) => !wasRampFailurePromptHandled(habit.id, failedDate))
    .map((habit) => {
      const ramp = habit.ramp!
      const decreased = getHabitRampTarget({ ...ramp, level: ramp.level - 1 })
      return {
        habitId: habit.id,
        habitLabel: habit.label,
        failedDate,
        currentLevel: ramp.level,
        currentTarget: getHabitRampTarget(ramp),
        decreasedTarget: decreased,
        unit: ramp.unit.trim() || 'min',
        consistency7Days: getLast7DayHabitConsistency(logs, habit.id, asOfDate, todayHabits),
      }
    })
}

export function buildPreviewRampFailurePrompt(
  habit: HabitTypeDefinition,
  failedDate: string,
  logs: DailyLog[] = [],
  asOfDate?: string,
  todayHabits?: DailyHabits,
): HabitRampFailurePrompt | null {
  if (!habit.ramp?.enabled || habit.ramp.level <= 0) return null
  const ramp = habit.ramp
  const endDate = asOfDate ?? formatDate(new Date())
  return {
    habitId: habit.id,
    habitLabel: habit.label,
    failedDate,
    currentLevel: ramp.level,
    currentTarget: getHabitRampTarget(ramp),
    decreasedTarget: getHabitRampTarget({ ...ramp, level: ramp.level - 1 }),
    unit: ramp.unit.trim() || 'min',
    consistency7Days: getLast7DayHabitConsistency(logs, habit.id, endDate, todayHabits),
  }
}
