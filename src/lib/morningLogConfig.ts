import { addDays, parseISO } from 'date-fns'
import { getLogValueForGoal } from '@/lib/dailyLog'
import {
  getDailyLogGoals,
  getActiveGoals,
  goalLogWhen,
  goalMorningDay,
} from '@/lib/goals'
import {
  getDailyLogHabitTypes,
  habitLogPeriod,
  habitLogWhen,
  habitMorningDay,
  getHabitTypes,
} from '@/lib/habitTypes'
import {
  getMetricLibraryCategories,
  KIND_CATEGORY_FALLBACK,
  KIND_CATEGORY_LABELS,
  resolveLibraryCategoryId,
  UNGROUPED_CATEGORY_ID,
} from '@/lib/metricLibrary'
import {
  getEnabledSleepMetrics,
  getSleepMetricValue,
  isMorningSleepLogComplete,
  normalizeSleepMetricsConfig,
  type SleepMetricDefinition,
  type SleepMetricsConfig,
} from '@/lib/sleepMetrics'
import { isMorningLogSubmitted } from '@/lib/morningLog'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import {
  getWorkoutTypes,
  getDailyLogWorkoutTypes,
  workoutLogPeriod,
  workoutLogWhen,
  workoutMetricKey,
  workoutMorningDay,
} from '@/lib/workoutTypes'
import { getActiveWeightGoal, isWeightGoal, isWeightLoggedDaily } from '@/lib/weightGoal'
import type { DailyLog, Goal, MetricKey, Workout } from '@/types'
import { formatDate } from '@/lib/utils'

const GOALS_STORAGE_KEY = 'personal-os-morning-log-goals'
const YESTERDAY_STORAGE_KEY = 'personal-os-morning-log-yesterday'
const SLEEP_STORAGE_KEY = 'personal-os-morning-log-sleep'
const SLEEP_MIGRATION_KEY = 'personal-os-morning-log-sleep-migrated'
const ASK_IN_MIGRATION_KEY = 'personal-os-ask-in-to-morning-v1'

export const MORNING_LOG_GOALS_CHANGED = 'personal-os-morning-log-goals-changed'
export const MORNING_LOG_YESTERDAY_CHANGED = 'personal-os-morning-log-yesterday-changed'
export const MORNING_LOG_SLEEP_CHANGED = 'personal-os-morning-log-sleep-changed'

export type MorningLogItemKind = 'sleep' | 'habit' | 'goal' | 'workout' | 'weight'

export interface MorningLogItem {
  id: string
  kind: MorningLogItemKind
  label: string
  unit: string
  badge: string
  metricKey?: MetricKey
  sleepFieldId?: string
  goal?: Goal
  supportsYesterday: boolean
  /** Metrics library category for the add-menu grouping. */
  categoryId?: string | null
}

export type MorningLogMetricSection = 'habit' | 'goal' | 'workout' | 'weight'

export interface MorningLogMetricCandidate {
  key: MetricKey
  section: MorningLogMetricSection
  label: string
  unit: string
  badge: string
  goal?: Goal
}

export function isHabitMorningLogKey(key: MetricKey): boolean {
  return key.startsWith('habit_')
}

export function habitIdFromMorningLogKey(key: MetricKey): string {
  return key.replace(/^habit_/, '')
}

export function habitMorningLogKey(habitId: string): MetricKey {
  return `habit_${habitId}` as MetricKey
}

export function isWorkoutMorningLogKey(key: MetricKey): boolean {
  return key.startsWith('workout_')
}

export function workoutCategoryFromMorningLogKey(key: MetricKey): string {
  return key.replace(/^workout_/, '')
}

/** Goals and track-only metrics that can be prompted in the morning log (excluding auto-tracked). */
export function getMorningLogGoalCandidates(goals: Goal[]): Goal[] {
  const active = getActiveGoals(goals)
  const daily = getDailyLogGoals(active).filter((g) => g.metric_key !== 'focus')
  const weightGoal = getActiveWeightGoal(active)
  const byKey = new Map<string, Goal>()
  for (const goal of daily) {
    byKey.set(goal.metric_key, goal)
  }
  // Prefer the weight goal with start/target when both a track-only and goal exist.
  // Weekly weight is shutdown-only — never offer it for the morning log.
  if (weightGoal && isWeightLoggedDaily(weightGoal)) {
    byKey.set(weightGoal.metric_key, weightGoal)
  }
  return [...byKey.values()]
}

export function getMorningLogMetricCandidates(
  goals: Goal[],
  options?: { showWorkouts?: boolean },
): MorningLogMetricCandidate[] {
  const showWorkouts = options?.showWorkouts ?? true
  const candidates: MorningLogMetricCandidate[] = []

  for (const habit of getDailyLogHabitTypes()) {
    candidates.push({
      key: habitMorningLogKey(habit.id),
      section: 'habit',
      label: habit.label,
      unit: '',
      badge: 'Habit',
    })
  }

  for (const goal of getMorningLogGoalCandidates(goals)) {
    if (goal.metric_key.startsWith('workout_')) continue
    candidates.push({
      key: goal.metric_key,
      section: isWeightGoal(goal) ? 'weight' : 'goal',
      label: goal.name,
      unit: goal.unit,
      badge: isWeightGoal(goal) ? 'Weight' : 'Goal',
      goal,
    })
  }

  if (showWorkouts) {
    for (const workout of getWorkoutTypes()) {
      const key = workoutMetricKey(workout.id)
      const goal = goals.find((g) => g.metric_key === key)
      candidates.push({
        key,
        section: 'workout',
        label: workout.label,
        unit: 'min',
        badge: 'Workout',
        goal,
      })
    }
  }

  return candidates
}

function readStringList(storageKey: string): string[] {
  try {
    const raw = storageGetItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

function saveStringList(storageKey: string, values: string[], eventName: string) {
  storageSetItem(storageKey, JSON.stringify(values))
  window.dispatchEvent(new Event(eventName))
}

export function getMorningLogSleepFieldIds(): string[] {
  const stored = readStringList(SLEEP_STORAGE_KEY)
  if (stored.length > 0) return stored

  if (!storageGetItem(SLEEP_MIGRATION_KEY)) {
    const legacy = getEnabledSleepMetrics(getSleepMetricsConfigFromStorage()).filter(
      (metric) => metric.id !== 'in_bed',
    )
    if (legacy.length > 0) {
      saveMorningLogSleepFieldIds(legacy.map((metric) => metric.id))
      storageSetItem(SLEEP_MIGRATION_KEY, '1')
      return legacy.map((metric) => metric.id)
    }
    storageSetItem(SLEEP_MIGRATION_KEY, '1')
  }

  return []
}

function getSleepMetricsConfigFromStorage(): SleepMetricsConfig {
  try {
    const raw = storageGetItem('personal-os-sleep-metrics-config')
    if (raw) return normalizeSleepMetricsConfig(JSON.parse(raw))
  } catch {
    /* ignore */
  }
  return { enabledIds: [], customMetrics: [], targets: {} }
}

export function saveMorningLogSleepFieldIds(ids: string[]) {
  saveStringList(SLEEP_STORAGE_KEY, ids, MORNING_LOG_SLEEP_CHANGED)
}

/** Sleep fields assigned to morning log that are still enabled on Metrics. */
export function getEffectiveMorningLogSleepFieldIds(config: SleepMetricsConfig): string[] {
  const enabled = new Set(getEnabledSleepMetrics(config).map((metric) => metric.id))
  return getMorningLogSleepFieldIds().filter((id) => enabled.has(id))
}

export function getMorningLogSleepMetrics(config: SleepMetricsConfig): SleepMetricDefinition[] {
  const ids = getEffectiveMorningLogSleepFieldIds(config)
  if (ids.length === 0) return []

  const byId = new Map(getEnabledSleepMetrics(config).map((metric) => [metric.id, metric]))
  return ids
    .map((id) => byId.get(id))
    .filter((metric): metric is SleepMetricDefinition => metric != null)
}

export function getMorningLogSleepConfig(config: SleepMetricsConfig): SleepMetricsConfig {
  return { ...config, enabledIds: getEffectiveMorningLogSleepFieldIds(config) }
}

/** Drop morning-log sleep/goal assignments that no longer exist on Metrics. */
export function pruneMorningLogAssignments(goals: Goal[], sleepConfig: SleepMetricsConfig) {
  migrateAskInToMorningLog(goals)
  const effectiveSleep = getEffectiveMorningLogSleepFieldIds(sleepConfig)
  const storedSleep = getMorningLogSleepFieldIds()
  if (
    effectiveSleep.length !== storedSleep.length ||
    effectiveSleep.some((id, index) => id !== storedSleep[index])
  ) {
    saveMorningLogSleepFieldIds(effectiveSleep)
  }

  const validKeys = new Set(
    getTrackedMorningLogItems(goals, sleepConfig)
      .map((item) => item.metricKey)
      .filter((key): key is MetricKey => key != null),
  )
  for (const candidate of getMorningLogMetricCandidates(goals)) {
    validKeys.add(candidate.key)
  }

  const storedGoals = getMorningLogGoalKeys()
  const nextGoals = storedGoals.filter((key) => validKeys.has(key))
  if (
    nextGoals.length !== storedGoals.length ||
    nextGoals.some((key, index) => key !== storedGoals[index])
  ) {
    saveMorningLogGoalKeys(nextGoals)
  }

  const storedYesterday = getMorningLogYesterdayKeys()
  const nextYesterday = storedYesterday.filter((key) => validKeys.has(key))
  if (
    nextYesterday.length !== storedYesterday.length ||
    nextYesterday.some((key, index) => key !== storedYesterday[index])
  ) {
    saveMorningLogYesterdayKeys(nextYesterday)
  }
}

export function removeSleepFieldFromMorningLog(fieldId: string) {
  const next = getMorningLogSleepFieldIds().filter((id) => id !== fieldId)
  if (next.length !== getMorningLogSleepFieldIds().length) {
    saveMorningLogSleepFieldIds(next)
  }
}

export function getTrackedMorningLogItems(
  goals: Goal[],
  sleepConfig: SleepMetricsConfig,
  options?: { showWorkouts?: boolean },
): MorningLogItem[] {
  const showWorkouts = options?.showWorkouts ?? true
  const items: MorningLogItem[] = []

  for (const habit of getDailyLogHabitTypes()) {
    items.push({
      id: habitMorningLogKey(habit.id),
      kind: 'habit',
      label: habit.label,
      unit: '',
      badge: 'Habit',
      metricKey: habitMorningLogKey(habit.id),
      supportsYesterday: true,
      categoryId: habit.category_id,
    })
  }

  for (const metric of getEnabledSleepMetrics(sleepConfig)) {
    items.push({
      id: `sleep:${metric.id}`,
      kind: 'sleep',
      label: metric.label,
      unit:
        metric.id === 'bedtime' || metric.id === 'wake_time'
          ? 'Time of day'
          : metric.id === 'sleep_duration'
            ? 'hrs:min'
            : metric.unit,
      badge: metric.source === 'custom' ? 'Custom' : metric.source === 'preset' ? 'Preset' : 'Sleep',
      sleepFieldId: metric.id,
      supportsYesterday: false,
      categoryId: sleepConfig.categories?.[metric.id],
    })
  }

  const sleepGoal = getActiveGoals(goals).find((goal) => goal.metric_key === 'sleep')
  if (sleepGoal) {
    items.push({
      id: sleepGoal.metric_key,
      kind: 'goal',
      label: sleepGoal.name,
      unit: sleepGoal.unit,
      badge: 'Goal',
      metricKey: sleepGoal.metric_key,
      goal: sleepGoal,
      supportsYesterday: true,
      categoryId: sleepGoal.category_id,
    })
  }

  const weightGoal = getActiveWeightGoal(goals)
  if (weightGoal && isWeightLoggedDaily(weightGoal)) {
    items.push({
      id: weightGoal.metric_key,
      kind: 'weight',
      label: weightGoal.name,
      unit: weightGoal.unit,
      badge: 'Weight',
      metricKey: weightGoal.metric_key,
      goal: weightGoal,
      supportsYesterday: true,
      categoryId: weightGoal.category_id,
    })
  }

  if (showWorkouts) {
    for (const workout of getDailyLogWorkoutTypes()) {
      const key = workoutMetricKey(workout.id)
      const goal = goals.find((entry) => entry.metric_key === key)
      items.push({
        id: key,
        kind: 'workout',
        label: workout.label,
        unit: workout.unit || 'min',
        badge: 'Workout',
        metricKey: key,
        goal,
        supportsYesterday: true,
        categoryId: workout.category_id,
      })
    }
  }

  for (const goal of getMorningLogGoalCandidates(goals)) {
    if (goal.metric_key === 'sleep' || goal.metric_key === 'weight' || isWeightGoal(goal)) continue
    if (goal.metric_key.startsWith('workout_')) continue
    items.push({
      id: goal.metric_key,
      kind: 'goal',
      label: goal.name,
      unit: goal.unit,
      badge: 'Goal',
      metricKey: goal.metric_key,
      goal,
      supportsYesterday: true,
      categoryId: goal.category_id,
    })
  }

  return items
}

export function getConfiguredMorningLogItems(
  goals: Goal[],
  sleepConfig: SleepMetricsConfig,
): MorningLogItem[] {
  migrateAskInToMorningLog(goals)
  const tracked = getTrackedMorningLogItems(goals, sleepConfig)
  const trackedById = new Map(tracked.map((item) => [item.id, item]))
  const configured: MorningLogItem[] = []
  const seen = new Set<string>()

  for (const sleepFieldId of getEffectiveMorningLogSleepFieldIds(sleepConfig)) {
    const item = trackedById.get(`sleep:${sleepFieldId}`)
    if (item && !seen.has(item.id)) {
      configured.push(item)
      seen.add(item.id)
    }
  }

  for (const key of getMorningLogGoalKeys()) {
    const item = trackedById.get(key)
    if (item && !seen.has(item.id)) {
      configured.push(item)
      seen.add(item.id)
    }
  }

  return configured
}

export function getAddableMorningLogItems(
  goals: Goal[],
  sleepConfig: SleepMetricsConfig,
  options?: { showWorkouts?: boolean },
): MorningLogItem[] {
  const configuredIds = new Set(getConfiguredMorningLogItems(goals, sleepConfig).map((item) => item.id))
  return getTrackedMorningLogItems(goals, sleepConfig, options).filter((item) => !configuredIds.has(item.id))
}

export interface MorningLogPickerCategory {
  id: string
  label: string
  items: MorningLogItem[]
}

function morningLogItemCategoryId(item: MorningLogItem): string {
  const stored = resolveLibraryCategoryId(item.categoryId ?? item.goal?.category_id)
  if (stored !== UNGROUPED_CATEGORY_ID) return stored
  if (item.kind === 'habit') return KIND_CATEGORY_FALLBACK.habit
  if (item.kind === 'sleep') return KIND_CATEGORY_FALLBACK.sleep
  if (item.kind === 'workout') return KIND_CATEGORY_FALLBACK.workout
  if (item.kind === 'weight') return KIND_CATEGORY_FALLBACK.weight
  return stored
}

/** One-shot: former Ask in = Morning assignments become morning-log fields. */
export function migrateAskInToMorningLog(goals: Goal[] = []) {
  if (storageGetItem(ASK_IN_MIGRATION_KEY) === '1') return
  storageSetItem(ASK_IN_MIGRATION_KEY, '1')

  const keys = new Set(readMetricKeyList(GOALS_STORAGE_KEY))
  const yesterday = new Set(readMetricKeyList(YESTERDAY_STORAGE_KEY))

  for (const habit of getHabitTypes()) {
    if (habitLogPeriod(habit) !== 'daily' || habitLogWhen(habit) !== 'morning') continue
    const key = habitMorningLogKey(habit.id)
    keys.add(key)
    if (habitMorningDay(habit) === 'yesterday') yesterday.add(key)
  }

  for (const workout of getWorkoutTypes()) {
    if (workoutLogPeriod(workout) !== 'daily' || workoutLogWhen(workout) !== 'morning') continue
    const key = workoutMetricKey(workout.id)
    keys.add(key)
    if (workoutMorningDay(workout) === 'yesterday') yesterday.add(key)
  }

  for (const goal of getDailyLogGoals(goals)) {
    if (goalLogWhen(goal) !== 'morning') continue
    keys.add(goal.metric_key)
    if (goalMorningDay(goal) === 'yesterday') yesterday.add(goal.metric_key)
  }

  saveStringList(GOALS_STORAGE_KEY, [...keys], MORNING_LOG_GOALS_CHANGED)
  saveStringList(YESTERDAY_STORAGE_KEY, [...yesterday], MORNING_LOG_YESTERDAY_CHANGED)
}

export function groupMorningLogItemsByCategory(items: MorningLogItem[]): MorningLogPickerCategory[] {
  if (items.length === 0) return []

  const labels = new Map<string, string>(Object.entries(KIND_CATEGORY_LABELS))
  for (const category of getMetricLibraryCategories()) {
    labels.set(category.id, category.label)
  }

  const grouped = new Map<string, MorningLogItem[]>()
  for (const item of items) {
    const categoryId = morningLogItemCategoryId(item)
    const list = grouped.get(categoryId) ?? []
    list.push(item)
    grouped.set(categoryId, list)
  }

  const order = getMetricLibraryCategories().map((category) => category.id)
  const seen = new Set<string>()
  const categories: MorningLogPickerCategory[] = []

  const push = (id: string) => {
    if (seen.has(id)) return
    const categoryItems = grouped.get(id)
    if (!categoryItems?.length) return
    seen.add(id)
    categories.push({
      id,
      label: labels.get(id) ?? id,
      items: categoryItems,
    })
  }

  for (const id of order) push(id)
  for (const id of grouped.keys()) push(id)

  return categories
}

function readMetricKeyList(storageKey: string): MetricKey[] {
  try {
    const raw = storageGetItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((k): k is MetricKey => typeof k === 'string' && k.length > 0)
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

export function getMorningLogGoalKeys(): MetricKey[] {
  return readMetricKeyList(GOALS_STORAGE_KEY)
}

export function getMorningLogYesterdayKeys(): MetricKey[] {
  return readMetricKeyList(YESTERDAY_STORAGE_KEY)
}

export function saveMorningLogGoalKeys(keys: MetricKey[]) {
  storageSetItem(GOALS_STORAGE_KEY, JSON.stringify(keys))
  window.dispatchEvent(new Event(MORNING_LOG_GOALS_CHANGED))
}

export function saveMorningLogYesterdayKeys(keys: MetricKey[]) {
  storageSetItem(YESTERDAY_STORAGE_KEY, JSON.stringify(keys))
  window.dispatchEvent(new Event(MORNING_LOG_YESTERDAY_CHANGED))
}

export function toggleMorningLogGoalKey(key: MetricKey, enabled: boolean) {
  const current = new Set(getMorningLogGoalKeys())
  if (enabled) current.add(key)
  else current.delete(key)
  saveMorningLogGoalKeys([...current])

  if (!enabled) {
    const yesterday = getMorningLogYesterdayKeys().filter((k) => k !== key)
    if (yesterday.length !== getMorningLogYesterdayKeys().length) {
      saveMorningLogYesterdayKeys(yesterday)
    }
  }
}

export function isMorningLogYesterdayKey(key: MetricKey, _goals: Goal[] = []): boolean {
  return getMorningLogYesterdayKeys().includes(key)
}

export function getEnabledMorningLogGoals(goals: Goal[]): Goal[] {
  const enabled = new Set(getMorningLogGoalKeys())
  return getMorningLogGoalCandidates(goals).filter((g) => enabled.has(g.metric_key))
}

export function getEnabledMorningLogMetrics(
  goals: Goal[],
  options?: { showWorkouts?: boolean },
): MorningLogMetricCandidate[] {
  migrateAskInToMorningLog(goals)
  const enabledKeys = new Set(getMorningLogGoalKeys())
  const seen = new Set<string>()
  return getMorningLogMetricCandidates(goals, options).filter((metric) => {
    if (!enabledKeys.has(metric.key) || seen.has(metric.key)) return false
    seen.add(metric.key)
    return true
  })
}

export function getEnabledMorningLogMetricsForToday(
  goals: Goal[],
  options?: { showWorkouts?: boolean },
): MorningLogMetricCandidate[] {
  return getEnabledMorningLogMetrics(goals, options).filter(
    (m) => !isMorningLogYesterdayKey(m.key, goals),
  )
}

export function getEnabledMorningLogMetricsForYesterday(
  goals: Goal[],
  options?: { showWorkouts?: boolean },
): MorningLogMetricCandidate[] {
  return getEnabledMorningLogMetrics(goals, options).filter((m) =>
    isMorningLogYesterdayKey(m.key, goals),
  )
}

/** @deprecated Use getEnabledMorningLogMetricsForToday */
export function getEnabledMorningLogGoalsForToday(goals: Goal[]): Goal[] {
  return getEnabledMorningLogGoals(goals).filter(
    (g) => !isMorningLogYesterdayKey(g.metric_key, goals),
  )
}

/** @deprecated Use getEnabledMorningLogMetricsForYesterday */
export function getEnabledMorningLogGoalsForYesterday(goals: Goal[]): Goal[] {
  return getEnabledMorningLogGoals(goals).filter((g) =>
    isMorningLogYesterdayKey(g.metric_key, goals),
  )
}

export function hasMorningLogFieldsConfigured(goals: Goal[] = []): boolean {
  migrateAskInToMorningLog(goals)
  const sleepConfig = getSleepMetricsConfigFromStorage()
  return (
    getEffectiveMorningLogSleepFieldIds(sleepConfig).length > 0 ||
    getMorningLogGoalKeys().length > 0
  )
}

export function getWorkoutMinutesForDate(
  workouts: Workout[],
  category: string,
  date: string,
): number | null {
  const total = workouts
    .filter((w) => w.category === category && w.date === date)
    .reduce((sum, w) => sum + w.duration_minutes, 0)
  return total > 0 ? total : null
}

export function getMorningLogHabitValue(
  log: DailyLog | undefined,
  habitId: string,
): boolean {
  return log?.habits?.[habitId] ?? false
}

export function isMorningLogMetricComplete(
  key: MetricKey,
  log: DailyLog | undefined,
  workouts: Workout[],
  goals: Goal[],
  date: string,
): boolean {
  if (isHabitMorningLogKey(key)) {
    return true
  }
  if (isWorkoutMorningLogKey(key)) {
    return getWorkoutMinutesForDate(workouts, workoutCategoryFromMorningLogKey(key), date) != null
  }
  const goal = goals.find((entry) => entry.metric_key === key)
  if (!goal || !log) return false
  return getLogValueForGoal(log, goal) != null
}

export function isMorningLogComplete(
  log: DailyLog | undefined,
  sleepConfig: SleepMetricsConfig,
  goals: Goal[],
  yesterdayLog?: DailyLog | null,
  date?: string,
  todayWorkouts: Workout[] = [],
  yesterdayWorkouts: Workout[] = [],
  requireTypedReminder = false,
): boolean {
  if (date && isMorningLogSubmitted(date)) return true
  // Typed reminder can only be completed by submitting the morning log modal.
  if (requireTypedReminder) return false
  if (!log) return false

  if (!isMorningSleepLogComplete(log, getMorningLogSleepConfig(sleepConfig))) return false

  const todayDate = date ?? log.date
  const yesterdayDate = todayDate ? getMorningLogYesterdayDate(todayDate) : null

  for (const metric of getEnabledMorningLogMetricsForToday(goals)) {
    if (!isMorningLogMetricComplete(metric.key, log, todayWorkouts, goals, todayDate)) {
      return false
    }
  }

  for (const metric of getEnabledMorningLogMetricsForYesterday(goals)) {
    if (
      !yesterdayDate ||
      !yesterdayLog ||
      !isMorningLogMetricComplete(
        metric.key,
        yesterdayLog,
        yesterdayWorkouts,
        goals,
        yesterdayDate,
      )
    ) {
      return false
    }
  }

  return true
}

function applyGoalValuesToLog(
  log: DailyLog,
  goalValues: Record<string, number | null>,
  goals: Goal[],
): Partial<DailyLog> {
  const updates: Partial<DailyLog> = {
    custom_metrics: { ...(log.custom_metrics ?? {}) },
  }

  for (const goal of goals) {
    if (!(goal.metric_key in goalValues)) continue
    const value = goalValues[goal.metric_key] ?? null
    if (goal.metric_key.startsWith('custom:')) {
      updates.custom_metrics![goal.metric_key] = value
    } else if (goal.metric_key === 'sleep') {
      // Skip null so an empty morning-log sleep goal does not clear duration from sleep fields.
      if (value != null) updates.sleep_hours = value
    } else if (goal.metric_key === 'steps') {
      updates.steps = value
    } else if (goal.metric_key === 'screen_time') {
      updates.screen_time_minutes = value
    } else if (goal.metric_key === 'weight') {
      updates.weight = value
    }
  }

  return updates
}

function filterNumericGoalValues(
  goalValues: Record<string, number | null>,
  metrics: MorningLogMetricCandidate[],
): Record<string, number | null> {
  const filtered: Record<string, number | null> = {}
  for (const metric of metrics) {
    if (metric.section === 'habit') continue
    if (metric.section === 'workout') {
      if (metric.key in goalValues) filtered[metric.key] = goalValues[metric.key] ?? null
      continue
    }
    if (metric.key in goalValues) filtered[metric.key] = goalValues[metric.key] ?? null
  }
  return filtered
}

export function buildMorningLogGoalUpdates(
  log: DailyLog,
  goalValues: Record<string, number | null>,
  goals: Goal[],
): Partial<DailyLog> {
  const enabled = getEnabledMorningLogMetricsForToday(goals).filter(
    (m) => m.section === 'goal' || m.section === 'weight',
  )
  const enabledGoals = enabled
    .map((m) => m.goal)
    .filter((g): g is Goal => g != null)
  const filtered = filterNumericGoalValues(goalValues, enabled)
  return applyGoalValuesToLog(log, filtered, enabledGoals)
}

export function buildMorningLogYesterdayGoalUpdates(
  log: DailyLog,
  goalValues: Record<string, number | null>,
  goals: Goal[],
): Partial<DailyLog> {
  const enabled = getEnabledMorningLogMetricsForYesterday(goals).filter(
    (m) => m.section === 'goal' || m.section === 'weight',
  )
  const enabledGoals = enabled
    .map((m) => m.goal)
    .filter((g): g is Goal => g != null)
  const filtered = filterNumericGoalValues(goalValues, enabled)
  return applyGoalValuesToLog(log, filtered, enabledGoals)
}

export function buildMorningLogHabitUpdates(
  log: DailyLog,
  habitValues: Record<string, boolean>,
  goals: Goal[],
): Partial<DailyLog> {
  const enabled = getEnabledMorningLogMetricsForToday(goals).filter((m) => m.section === 'habit')
  if (enabled.length === 0) return {}

  const habits = { ...(log.habits ?? {}) }
  for (const metric of enabled) {
    const habitId = habitIdFromMorningLogKey(metric.key)
    if (habitId in habitValues) habits[habitId] = habitValues[habitId]
  }
  return { habits }
}

export function buildMorningLogYesterdayHabitUpdates(
  log: DailyLog,
  habitValues: Record<string, boolean>,
  goals: Goal[],
): Partial<DailyLog> {
  const enabled = getEnabledMorningLogMetricsForYesterday(goals).filter((m) => m.section === 'habit')
  if (enabled.length === 0) return {}

  const habits = { ...(log.habits ?? {}) }
  for (const metric of enabled) {
    const habitId = habitIdFromMorningLogKey(metric.key)
    if (habitId in habitValues) habits[habitId] = habitValues[habitId]
  }
  return { habits }
}

export function getMorningLogWorkoutValuesFromList(
  workouts: Workout[],
  date: string,
  goals: Goal[],
  mode: 'today' | 'yesterday' | 'all' = 'all',
): Record<string, number | null> {
  const enabled =
    mode === 'today'
      ? getEnabledMorningLogMetricsForToday(goals)
      : mode === 'yesterday'
        ? getEnabledMorningLogMetricsForYesterday(goals)
        : getEnabledMorningLogMetrics(goals)

  const values: Record<string, number | null> = {}
  for (const metric of enabled) {
    if (metric.section !== 'workout') continue
    const category = workoutCategoryFromMorningLogKey(metric.key)
    values[metric.key] = getWorkoutMinutesForDate(workouts, category, date)
  }
  return values
}

export function getMorningLogGoalValuesFromLog(
  log: DailyLog | undefined,
  goals: Goal[],
): Record<string, number | null> {
  const values: Record<string, number | null> = {}
  for (const metric of getEnabledMorningLogMetricsForToday(goals)) {
    if (metric.section === 'habit' || metric.section === 'workout') continue
    const goal = metric.goal
    if (!goal) continue
    values[metric.key] = log ? getLogValueForGoal(log, goal) : null
  }
  return values
}

export function getMorningLogYesterdayGoalValuesFromLog(
  log: DailyLog | undefined,
  goals: Goal[],
): Record<string, number | null> {
  const values: Record<string, number | null> = {}
  for (const metric of getEnabledMorningLogMetricsForYesterday(goals)) {
    if (metric.section === 'habit' || metric.section === 'workout') continue
    const goal = metric.goal
    if (!goal) continue
    values[metric.key] = log ? getLogValueForGoal(log, goal) : null
  }
  return values
}

export function getMorningLogHabitValuesFromLog(
  log: DailyLog | undefined,
  goals: Goal[],
): Record<string, boolean> {
  const values: Record<string, boolean> = {}
  for (const metric of getEnabledMorningLogMetricsForToday(goals)) {
    if (metric.section !== 'habit') continue
    const habitId = habitIdFromMorningLogKey(metric.key)
    values[habitId] = getMorningLogHabitValue(log, habitId)
  }
  return values
}

export function getMorningLogYesterdayHabitValuesFromLog(
  log: DailyLog | undefined,
  goals: Goal[],
): Record<string, boolean> {
  const values: Record<string, boolean> = {}
  for (const metric of getEnabledMorningLogMetricsForYesterday(goals)) {
    if (metric.section !== 'habit') continue
    const habitId = habitIdFromMorningLogKey(metric.key)
    values[habitId] = getMorningLogHabitValue(log, habitId)
  }
  return values
}

export interface MorningLogWorkoutSaveEntry {
  category: string
  duration_minutes: number
}

export function getMorningLogWorkoutSaveEntries(
  goalValues: Record<string, number | null>,
  goals: Goal[],
  mode: 'today' | 'yesterday',
): MorningLogWorkoutSaveEntry[] {
  const enabled =
    mode === 'today'
      ? getEnabledMorningLogMetricsForToday(goals)
      : getEnabledMorningLogMetricsForYesterday(goals)

  const entries: MorningLogWorkoutSaveEntry[] = []
  for (const metric of enabled) {
    if (metric.section !== 'workout') continue
    const raw = goalValues[metric.key]
    if (raw == null || Number.isNaN(raw) || raw <= 0) continue
    entries.push({
      category: workoutCategoryFromMorningLogKey(metric.key),
      duration_minutes: raw,
    })
  }
  return entries
}

export function getMorningLogYesterdayDate(forDate: string): string {
  return formatDate(addDays(parseISO(`${forDate}T12:00:00`), -1))
}

export async function saveMorningLogWorkoutsForDate(
  userId: string,
  date: string,
  entries: MorningLogWorkoutSaveEntry[],
): Promise<void> {
  if (entries.length === 0) return

  const categories = new Set(entries.map((entry) => entry.category))
  const { isSupabaseConfigured } = await import('@/lib/supabase')
  const { localStore } = await import('@/lib/localStore')

  if (isSupabaseConfigured) {
    const { getOrCreateDailyLog, addWorkout, supabase } = await import('@/lib/supabase')
    const log = await getOrCreateDailyLog(userId, date)

    for (const category of categories) {
      if (supabase) {
        const { data: existing } = await supabase
          .from('workouts')
          .select('id')
          .eq('user_id', userId)
          .eq('date', date)
          .eq('category', category)
        for (const row of existing ?? []) {
          await supabase.from('workouts').delete().eq('id', row.id)
        }
      }
    }

    for (const entry of entries) {
      await addWorkout({
        user_id: userId,
        daily_log_id: log.id,
        date,
        category: entry.category,
        duration_minutes: entry.duration_minutes,
        notes: '',
      })
    }
    return
  }

  localStore.setUserId(userId)
  const log = localStore.getOrCreateDailyLog(date)
  const existing = localStore.getWorkouts(date, date)
  const kept = existing.filter((workout) => !categories.has(workout.category))

  localStore.removeWorkoutsForDate(date)
  for (const workout of kept) {
    localStore.addWorkout({
      user_id: workout.user_id,
      daily_log_id: workout.daily_log_id,
      date: workout.date,
      category: workout.category,
      duration_minutes: workout.duration_minutes,
      notes: workout.notes,
    })
  }
  for (const entry of entries) {
    localStore.addWorkout({
      user_id: userId,
      daily_log_id: log.id,
      date,
      category: entry.category,
      duration_minutes: entry.duration_minutes,
      notes: '',
    })
  }
}

/** Used by overview / pulse — unchanged sleep-only helper re-exported for clarity. */
export { getSleepMetricValue }
