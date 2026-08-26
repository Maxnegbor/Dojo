import { addDays, parseISO } from 'date-fns'
import {
  defaultUnitForMetric,
  hasTarget,
  metricLabel,
  normalizeGoal,
} from '@/lib/goals'
import { getFocusSettings } from '@/lib/focusStore'
import { getWeekStartsBefore } from '@/lib/goalTargetSnapshots'
import { getHabitTypes } from '@/lib/habitTypes'
import {
  KIND_CATEGORY_LABELS,
  getMetricLibraryCategories,
  resolveLibraryCategoryId,
} from '@/lib/metricLibrary'
import { getEnabledMetricsSections } from '@/lib/metricsSections'
import { getMetricValue } from '@/lib/metrics'
import {
  formatSleepMetricDisplay,
  getEnabledSleepMetrics,
  getSleepMetricDefinition,
  getSleepMetricValue,
  getSleepMetricsConfig,
  isClockSleepMetric,
  sleepLibraryMetricKey,
  sleepMetricDisplayUnit,
  sleepMetricIdFromLibraryKey,
} from '@/lib/sleepMetrics'
import { formatMetricAmount, formatGoalTargetLabel } from '@/lib/timedMetrics'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { getWeekDates, formatDate } from '@/lib/utils'
import { isWeightGoal } from '@/lib/weightGoal'
import { getWorkoutTypes, workoutMetricKey } from '@/lib/workoutTypes'
import type {
  DailyLog,
  Goal,
  MetricKey,
  OutcomeGoal,
  OutcomeGoalComparator,
  OutcomeGoalLink,
  OutcomeGoalLinkPeriod,
  OutcomeGoalLinkRole,
  OutcomeGoalRecurrence,
  Workout,
} from '@/types'

const STORAGE_KEY = 'personal-os-outcome-goals'
/** v2: merge missing hybrid targets even when some outcome goals already exist. */
const MIGRATION_KEY = 'personal-os-outcome-goals-migrated-v2'
export const OUTCOME_GOALS_CHANGED = 'personal-os-outcome-goals-changed'

function newId(): string {
  return crypto.randomUUID()
}

function normalizeComparator(value: unknown): OutcomeGoalComparator {
  if (value === 'lte' || value === 'eq') return value
  return 'gte'
}

function normalizeRole(value: unknown): OutcomeGoalLinkRole {
  return value === 'process' ? 'process' : 'outcome'
}

function normalizeLinkPeriod(value: unknown): OutcomeGoalLinkPeriod {
  if (value === 'daily' || value === 'by_deadline') return value
  return 'weekly'
}

function normalizeRecurrence(raw: Record<string, unknown>): {
  recurrence: OutcomeGoalRecurrence
  recurrence_days?: number
} {
  const daysRaw =
    typeof raw.recurrence_days === 'number'
      ? raw.recurrence_days
      : typeof raw.recurrence_days === 'string'
        ? Number(raw.recurrence_days)
        : NaN
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.round(daysRaw) : undefined

  if (raw.recurrence === 'daily' || raw.recurrence === 'weekly') {
    return { recurrence: raw.recurrence }
  }
  if (raw.recurrence === 'every_14') {
    return { recurrence: 'every_14', recurrence_days: 14 }
  }
  if (raw.recurrence === 'custom') {
    return { recurrence: 'custom', recurrence_days: days ?? 30 }
  }

  // Migrate legacy review → recurrence
  if (raw.review === 'monthly') return { recurrence: 'custom', recurrence_days: 30 }
  return { recurrence: 'weekly' }
}

export function formatOutcomeGoalRecurrence(goal: Pick<OutcomeGoal, 'recurrence' | 'recurrence_days'>): string {
  if (goal.recurrence === 'daily') return 'Daily'
  if (goal.recurrence === 'weekly') return 'Weekly'
  if (goal.recurrence === 'every_14') return 'Every 14 days'
  const days = goal.recurrence_days && goal.recurrence_days > 0 ? goal.recurrence_days : 30
  return `Every ${days} days`
}

export function normalizeOutcomeGoalLink(raw: unknown): OutcomeGoalLink | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const metric_key = typeof obj.metric_key === 'string' ? (obj.metric_key as MetricKey) : null
  const target_value =
    typeof obj.target_value === 'number'
      ? obj.target_value
      : typeof obj.target_value === 'string'
        ? Number(obj.target_value)
        : NaN
  if (!metric_key || !Number.isFinite(target_value) || target_value <= 0) return null

  const startRaw =
    typeof obj.start_value === 'number'
      ? obj.start_value
      : typeof obj.start_value === 'string'
        ? Number(obj.start_value)
        : null
  const start_value =
    startRaw != null && Number.isFinite(startRaw) ? startRaw : null

  return {
    id: typeof obj.id === 'string' && obj.id ? obj.id : newId(),
    metric_key,
    role: normalizeRole(obj.role),
    target_value,
    start_value,
    comparator: normalizeComparator(obj.comparator),
    period: normalizeLinkPeriod(obj.period),
  }
}

export function normalizeOutcomeGoal(raw: unknown): OutcomeGoal | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const title = typeof obj.title === 'string' ? obj.title.trim() : ''
  if (!title) return null
  const linksRaw = Array.isArray(obj.links) ? obj.links : []
  const links = linksRaw
    .map(normalizeOutcomeGoalLink)
    .filter((link): link is OutcomeGoalLink => link != null)
  const now = new Date().toISOString()
  const { recurrence, recurrence_days } = normalizeRecurrence(obj)
  return {
    id: typeof obj.id === 'string' && obj.id ? obj.id : newId(),
    title,
    start_date:
      typeof obj.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.start_date)
        ? obj.start_date
        : undefined,
    deadline:
      typeof obj.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.deadline)
        ? obj.deadline
        : undefined,
    recurrence,
    recurrence_days,
    is_active: obj.is_active !== false,
    links,
    created_at: typeof obj.created_at === 'string' ? obj.created_at : now,
    updated_at: typeof obj.updated_at === 'string' ? obj.updated_at : now,
  }
}

export function normalizeOutcomeGoals(raw: unknown): OutcomeGoal[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(normalizeOutcomeGoal)
    .filter((goal): goal is OutcomeGoal => goal != null)
}

export function getOutcomeGoals(): OutcomeGoal[] {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return []
    return normalizeOutcomeGoals(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

export function getActiveOutcomeGoals(): OutcomeGoal[] {
  return getOutcomeGoals().filter((goal) => goal.is_active)
}

export function saveOutcomeGoals(goals: OutcomeGoal[]): OutcomeGoal[] {
  const normalized = normalizeOutcomeGoals(goals)
  storageSetItem(STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new Event(OUTCOME_GOALS_CHANGED))
  return normalized
}

export function upsertOutcomeGoal(goal: OutcomeGoal): OutcomeGoal {
  const normalized = normalizeOutcomeGoal({
    ...goal,
    updated_at: new Date().toISOString(),
  })
  if (!normalized) throw new Error('Invalid goal')
  const existing = getOutcomeGoals()
  const idx = existing.findIndex((entry) => entry.id === normalized.id)
  const next =
    idx >= 0
      ? existing.map((entry, i) => (i === idx ? normalized : entry))
      : [...existing, normalized]
  saveOutcomeGoals(next)
  return normalized
}

export function deleteOutcomeGoal(id: string): void {
  saveOutcomeGoals(getOutcomeGoals().filter((goal) => goal.id !== id))
}

export function createEmptyOutcomeGoal(partial?: Partial<OutcomeGoal>): OutcomeGoal {
  const now = new Date().toISOString()
  const recurrence = partial?.recurrence ?? 'weekly'
  return {
    id: newId(),
    title: partial?.title?.trim() || 'New goal',
    start_date: partial?.start_date,
    deadline: partial?.deadline,
    recurrence,
    recurrence_days:
      recurrence === 'every_14'
        ? 14
        : recurrence === 'custom'
          ? partial?.recurrence_days && partial.recurrence_days > 0
            ? Math.round(partial.recurrence_days)
            : 30
          : undefined,
    is_active: partial?.is_active ?? true,
    links: partial?.links ?? [],
    created_at: partial?.created_at ?? now,
    updated_at: now,
  }
}

export function createOutcomeGoalLink(
  partial: Partial<OutcomeGoalLink> & { metric_key: MetricKey },
): OutcomeGoalLink {
  return {
    id: partial.id ?? newId(),
    metric_key: partial.metric_key,
    role: partial.role ?? 'outcome',
    target_value: partial.target_value ?? 1,
    start_value:
      partial.start_value != null && Number.isFinite(partial.start_value)
        ? partial.start_value
        : null,
    comparator: partial.comparator ?? 'gte',
    period: partial.period ?? 'weekly',
  }
}

/**
 * Ensure hybrid Goal rows with targets appear as OutcomeGoals on /goals.
 * Merges missing metrics instead of one-shot empty skips.
 * After the first successful pass, keeps syncing workout_* targets so exercise
 * goals stay visible when created after migration (e.g. onboarding).
 */
export function migrateOutcomeGoalsFromHybridGoals(hybridGoals: Goal[]): boolean {
  const alreadyMigrated = storageGetItem(MIGRATION_KEY) === '1'
  const coveredKeys = new Set(
    getOutcomeGoals().flatMap((goal) => goal.links.map((link) => link.metric_key as string)),
  )

  const seeded: OutcomeGoal[] = []
  for (const raw of hybridGoals) {
    const goal = normalizeGoal(raw)
    if (!goal.is_active || !hasTarget(goal)) continue
    if (coveredKeys.has(goal.metric_key)) continue
    // After initial migration, only keep healing exercise volume targets.
    if (alreadyMigrated && !goal.metric_key.startsWith('workout_')) continue

    let target_value = goal.target_value
    let comparator: OutcomeGoalComparator = 'gte'
    let period: OutcomeGoalLinkPeriod =
      goal.log_period === 'weekly' || goal.target_period === 'weekly' ? 'weekly' : 'daily'

    // Workout volume targets are weekly by default even when logging is daily.
    if (goal.metric_key.startsWith('workout_') && goal.target_period !== 'daily') {
      period = 'weekly'
    }

    if (isWeightGoal(goal) && goal.goal_weight_target != null) {
      target_value = goal.goal_weight_target
      const start = goal.goal_weight_start ?? goal.goal_weight_target
      comparator = goal.goal_weight_target < start ? 'lte' : 'gte'
      period = 'by_deadline'
    }

    if (target_value == null || target_value <= 0) continue

    const now = goal.created_at || new Date().toISOString()
    const start_value =
      isWeightGoal(goal) && goal.goal_weight_start != null ? goal.goal_weight_start : null
    seeded.push({
      id: newId(),
      title: goal.name,
      deadline: goal.period_end_date,
      recurrence: 'weekly',
      is_active: true,
      links: [
        createOutcomeGoalLink({
          metric_key: goal.metric_key,
          role: 'outcome',
          target_value,
          start_value,
          comparator,
          period,
        }),
      ],
      created_at: now,
      updated_at: now,
    })
    coveredKeys.add(goal.metric_key)
  }

  if (seeded.length > 0) {
    saveOutcomeGoals([...getOutcomeGoals(), ...seeded])
  }

  // Only mark complete once we've actually seen hybrid goals (or finished seeding).
  // Avoids locking migration when Auth runs before onboarding creates workout targets.
  if (hybridGoals.length > 0 || seeded.length > 0) {
    storageSetItem(MIGRATION_KEY, '1')
  }

  return seeded.length > 0
}

export async function runOutcomeGoalsMigration(userId: string): Promise<void> {
  if (!userId) return

  const { isSupabaseConfigured } = await import('@/lib/supabase')
  let hybrid: Goal[] = []
  if (isSupabaseConfigured) {
    const { fetchGoals } = await import('@/lib/supabase')
    hybrid = await fetchGoals(userId)
  } else {
    const { localStore } = await import('@/lib/localStore')
    localStore.setUserId(userId)
    hybrid = localStore.getGoals()
  }
  migrateOutcomeGoalsFromHybridGoals(hybrid)
}

function habitIdFromKey(metricKey: MetricKey): string | null {
  if (!metricKey.startsWith('habit_')) return null
  return metricKey.slice('habit_'.length)
}

function compareValues(
  current: number,
  target: number,
  comparator: OutcomeGoalComparator,
): boolean {
  if (comparator === 'lte') return current <= target
  if (comparator === 'eq') return Math.abs(current - target) < 0.0001
  return current >= target
}

function logsByDate(logs: DailyLog[]): Map<string, DailyLog> {
  const map = new Map<string, DailyLog>()
  for (const log of logs) map.set(log.date, log)
  return map
}

function periodDates(
  link: OutcomeGoalLink,
  asOf: Date,
  weekStartsOn: 0 | 1,
  deadline?: string,
): string[] {
  const asOfStr = formatDate(asOf)
  if (link.period === 'daily') return [asOfStr]
  if (link.period === 'by_deadline') {
    // Use last 90 days of values for latest reading, or week if no deadline window.
    const week = getWeekDates(asOf, weekStartsOn)
    if (!deadline) return week
    return week
  }
  return getWeekDates(asOf, weekStartsOn)
}

export function resolveLinkCurrentValue(
  link: OutcomeGoalLink,
  logs: DailyLog[],
  workouts: Workout[],
  asOf: Date,
  weekStartsOn: 0 | 1,
  deadline?: string,
): number {
  const dates = periodDates(link, asOf, weekStartsOn, deadline)
  const byDate = logsByDate(logs)
  const habitId = habitIdFromKey(link.metric_key)
  const sleepId = sleepMetricIdFromLibraryKey(link.metric_key)

  if (sleepId) {
    const metric = getSleepMetricDefinition(getSleepMetricsConfig(), sleepId)
    if (!metric) return 0
    if (link.period === 'daily') {
      return getSleepMetricValue(byDate.get(dates[0]), metric) ?? 0
    }
    if (link.period === 'by_deadline' || isClockSleepMetric(metric)) {
      const asOfStr = formatDate(asOf)
      const sorted = [...logs]
        .filter((log) => log.date <= asOfStr)
        .sort((a, b) => b.date.localeCompare(a.date))
      for (const log of sorted) {
        const value = getSleepMetricValue(log, metric)
        if (value != null) return value
      }
      return 0
    }
    return dates.reduce((sum, date) => sum + (getSleepMetricValue(byDate.get(date), metric) ?? 0), 0)
  }

  if (habitId) {
    return dates.reduce((sum, date) => {
      const log = byDate.get(date)
      return sum + (log?.habits?.[habitId] ? 1 : 0)
    }, 0)
  }

  if (link.period === 'daily') {
    const date = dates[0]
    return getMetricValue(link.metric_key, byDate.get(date), workouts, date)
  }

  if (link.period === 'by_deadline' || link.metric_key === 'weight') {
    // Latest non-zero / non-null weight (or metric) in available logs up to asOf.
    const asOfStr = formatDate(asOf)
    const sorted = [...logs]
      .filter((log) => log.date <= asOfStr)
      .sort((a, b) => b.date.localeCompare(a.date))
    for (const log of sorted) {
      const value = getMetricValue(link.metric_key, log, workouts, log.date)
      if (value > 0) return value
    }
    return 0
  }

  // weekly sum
  return dates.reduce((sum, date) => {
    return sum + getMetricValue(link.metric_key, byDate.get(date), workouts, date)
  }, 0)
}

export interface OutcomeLinkProgress {
  link: OutcomeGoalLink
  label: string
  unit: string
  current: number
  target: number
  /** Baseline when progress is measured start → target. */
  start: number | null
  /** True when the target comparison is already met. */
  hit: boolean
  /**
   * On pace vs time: percent ≥ time elapsed at last log (when a deadline exists).
   * Falls back to `hit` when pace cannot be assessed.
   */
  onPace: boolean
  percent: number
  display: string
}

/** Resolve optional start baseline from the link, or weight hybrid start. */
export function resolveLinkStartValue(
  link: OutcomeGoalLink,
  hybridGoals: Goal[],
): number | null {
  if (link.start_value != null && Number.isFinite(link.start_value)) return link.start_value
  if (link.metric_key === 'weight') {
    const hybrid = hybridGoals.find((goal) => goal.metric_key === 'weight' && goal.is_active)
    if (hybrid?.goal_weight_start != null && Number.isFinite(hybrid.goal_weight_start)) {
      return hybrid.goal_weight_start
    }
  }
  return null
}

/** Progress 0–100 from start→target when a start is set; otherwise from 0→target. */
export function computeLinkProgressPercent(
  current: number,
  target: number,
  comparator: OutcomeGoalComparator,
  start: number | null,
): number {
  if (!(target > 0) && start == null) return 0

  if (start != null && Number.isFinite(start) && Math.abs(target - start) > 1e-9) {
    const span = target - start
    const traveled = current - start
    // Works for bulk (start < target) and cut (start > target).
    const raw = (traveled / span) * 100
    return Math.min(100, Math.max(0, Math.round(raw)))
  }

  if (comparator === 'lte') {
    if (!(target > 0)) return 0
    return Math.min(
      100,
      Math.round(Math.max(0, 1 - Math.abs(current - target) / Math.max(target, 1)) * 100),
    )
  }

  if (!(target > 0)) return 0
  return Math.min(100, Math.round((current / target) * 100))
}

export function computeLinkProgress(
  link: OutcomeGoalLink,
  logs: DailyLog[],
  workouts: Workout[],
  hybridGoals: Goal[],
  asOf: Date,
  weekStartsOn: 0 | 1,
  deadline?: string,
): OutcomeLinkProgress {
  const current = resolveLinkCurrentValue(link, logs, workouts, asOf, weekStartsOn, deadline)
  const target = link.target_value
  const start = resolveLinkStartValue(link, hybridGoals)
  const hit = compareValues(current, target, link.comparator)
  const percent = computeLinkProgressPercent(current, target, link.comparator, start)
  const sleepId = sleepMetricIdFromLibraryKey(link.metric_key)
  const sleepMetric = sleepId
    ? getSleepMetricDefinition(getSleepMetricsConfig(), sleepId)
    : undefined
  const hybrid = hybridGoals.find((goal) => goal.metric_key === link.metric_key && goal.is_active)
  const unit =
    (sleepMetric ? sleepMetricDisplayUnit(sleepMetric) : null) ||
    hybrid?.unit ||
    defaultUnitForMetric(link.metric_key)
  const label = sleepMetric?.label || hybrid?.name || metricLabel(link.metric_key)
  const cmp =
    link.comparator === 'lte' ? '≤' : link.comparator === 'eq' ? '=' : '≥'
  const currentLabel = sleepMetric
    ? formatSleepMetricDisplay(sleepMetric, current)
    : formatMetricAmount(current, unit, link.metric_key)
  const targetLabel = sleepMetric
    ? formatSleepMetricDisplay(sleepMetric, target)
    : formatGoalTargetLabel(target, unit, link.metric_key)
  return {
    link,
    label,
    unit,
    current,
    target,
    start,
    hit,
    onPace: hit,
    percent: link.comparator === 'lte' && start == null ? (hit ? 100 : Math.min(99, percent)) : percent,
    display: `${currentLabel} / ${targetLabel} (${cmp})`,
  }
}

/** True when this metric has a real reading on `date` (counts as a log for pace). */
function linkHasReadingOnDate(
  link: OutcomeGoalLink,
  log: DailyLog | undefined,
  workouts: Workout[],
  date: string,
): boolean {
  const habitId = habitIdFromKey(link.metric_key)
  if (habitId) return Boolean(log?.habits?.[habitId])

  const sleepId = sleepMetricIdFromLibraryKey(link.metric_key)
  if (sleepId) {
    const metric = getSleepMetricDefinition(getSleepMetricsConfig(), sleepId)
    if (!metric) return false
    return getSleepMetricValue(log, metric) != null
  }

  if (link.metric_key === 'weight') {
    return log?.weight != null && Number.isFinite(log.weight)
  }

  if (link.metric_key.startsWith('custom:')) {
    const value = log?.custom_metrics?.[link.metric_key]
    return value != null && Number.isFinite(value)
  }

  if (link.metric_key.startsWith('workout_')) {
    return getMetricValue(link.metric_key, log, workouts, date) > 0
  }

  return getMetricValue(link.metric_key, log, workouts, date) > 0
}

/**
 * Most recent date (≤ asOf) where any linked metric has a reading.
 * Pace / on-track is frozen at this date until the next log.
 */
export function findLastOutcomeGoalLogDate(
  goal: OutcomeGoal,
  logs: DailyLog[],
  workouts: Workout[],
  asOf: Date = new Date(),
): string | null {
  if (goal.links.length === 0) return null
  const asOfStr = formatDate(asOf)
  const byDate = logsByDate(logs)
  const dates = new Set<string>()
  for (const log of logs) {
    if (log.date <= asOfStr) dates.add(log.date)
  }
  for (const workout of workouts) {
    const day = (workout.date ?? '').slice(0, 10)
    if (day && day <= asOfStr) dates.add(day)
  }
  const sorted = [...dates].sort((a, b) => b.localeCompare(a))
  for (const date of sorted) {
    const log = byDate.get(date)
    for (const link of goal.links) {
      if (linkHasReadingOnDate(link, log, workouts, date)) return date
    }
  }
  return null
}

export interface OutcomeGoalProgress {
  goal: OutcomeGoal
  primary: OutcomeLinkProgress | null
  outcomes: OutcomeLinkProgress[]
  processes: OutcomeLinkProgress[]
  onTrack: boolean
  /** Date the on-track pace was assessed against; null if no linked log yet. */
  assessedAt: string | null
  /** Time elapsed % (start → deadline) at `assessedAt`, when a deadline exists. */
  timePercent: number | null
}

export function computeOutcomeGoalProgress(
  goal: OutcomeGoal,
  logs: DailyLog[],
  workouts: Workout[],
  hybridGoals: Goal[],
  asOf: Date = new Date(),
  weekStartsOn: 0 | 1 = 1,
): OutcomeGoalProgress {
  const raw = goal.links.map((link) =>
    computeLinkProgress(link, logs, workouts, hybridGoals, asOf, weekStartsOn, goal.deadline),
  )

  const assessedAt = findLastOutcomeGoalLogDate(goal, logs, workouts, asOf)
  const deadlineAtLog =
    goal.deadline && assessedAt
      ? computeOutcomeGoalDeadlineProgress(goal, parseISO(`${assessedAt}T12:00:00`))
      : null
  const timePercent = deadlineAtLog ? deadlineAtLog.elapsedPercent : null

  const metrics = raw.map((entry) => {
    const onPace =
      timePercent != null ? entry.percent >= timePercent : entry.hit
    return { ...entry, onPace }
  })

  const onTrack =
    metrics.length > 0 &&
    (goal.deadline
      ? assessedAt != null && timePercent != null && metrics.every((entry) => entry.onPace)
      : metrics.every((entry) => entry.hit))

  return {
    goal,
    primary: metrics[0] ?? null,
    outcomes: metrics,
    processes: metrics.slice(1),
    onTrack,
    assessedAt,
    timePercent,
  }
}

export interface GoalMetricOption {
  key: MetricKey
  label: string
  unit: string
  categoryId: string
  categoryLabel: string
}

function libraryCategoryLabel(categoryId: string): string {
  const resolved = resolveLibraryCategoryId(categoryId)
  const fromLibrary = getMetricLibraryCategories().find((c) => c.id === resolved)
  if (fromLibrary) return fromLibrary.label
  return KIND_CATEGORY_LABELS[resolved] ?? resolved
}

export function defaultPeriodForMetric(metricKey: MetricKey): OutcomeGoalLinkPeriod {
  if (sleepMetricIdFromLibraryKey(metricKey)) return 'daily'
  if (metricKey === 'weight') return 'by_deadline'
  if (metricKey === 'focus') return 'daily'
  return 'weekly'
}

export function defaultTargetForMetric(metricKey: MetricKey): number {
  const sleepId = sleepMetricIdFromLibraryKey(metricKey)
  if (sleepId) {
    const metric = getSleepMetricDefinition(getSleepMetricsConfig(), sleepId)
    if (!metric) return 1
    if (metric.id === 'sleep_duration' || metric.id === 'in_bed') return 7 * 60
    if (isClockSleepMetric(metric)) return 23 * 60
    if (metric.unit === 'score10') return 7
    if (metric.unit === 'percent') return 80
  }
  if (metricKey === 'focus') {
    const focus = getFocusSettings()
    if (focus.focusGoalUnit === 'hours') return Math.max(1, focus.focusGoalAmount) * 60
    return Math.max(1, focus.focusGoalAmount)
  }
  return 1
}

function isFocusMetricAvailable(hybridGoals: Goal[]): boolean {
  if (hybridGoals.some((g) => g.is_active && g.metric_key === 'focus')) return true
  if (getFocusSettings().focusGoalEnabled) return true
  return getEnabledMetricsSections().includes('focus')
}

export function listMetricOptionsForGoals(hybridGoals: Goal[]): GoalMetricOption[] {
  const options: GoalMetricOption[] = []
  const seen = new Set<string>()

  const push = (key: MetricKey, label: string, unit: string, categoryId?: string | null) => {
    if (seen.has(key)) return
    seen.add(key)
    const resolved = resolveLibraryCategoryId(categoryId)
    options.push({
      key,
      label,
      unit,
      categoryId: resolved,
      categoryLabel: libraryCategoryLabel(resolved),
    })
  }

  for (const habit of getHabitTypes()) {
    push(
      `habit_${habit.id}` as MetricKey,
      habit.label,
      habit.duration_unit || 'days',
      habit.category_id,
    )
  }

  const sleepConfig = getSleepMetricsConfig()
  const sleepMetrics = getEnabledSleepMetrics(sleepConfig)
  for (const metric of sleepMetrics) {
    push(
      sleepLibraryMetricKey(metric.id),
      metric.label,
      sleepMetricDisplayUnit(metric),
      sleepConfig.categories?.[metric.id],
    )
  }

  for (const type of getWorkoutTypes()) {
    push(workoutMetricKey(type.id), type.label, type.unit || 'min', type.category_id)
  }

  if (isFocusMetricAvailable(hybridGoals)) {
    const focusGoal = hybridGoals.find((g) => g.is_active && g.metric_key === 'focus')
    push(
      'focus',
      focusGoal?.name || 'Focus',
      focusGoal?.unit || 'min',
      focusGoal?.category_id ?? 'focus',
    )
  }

  for (const goal of hybridGoals.filter((g) => g.is_active)) {
    if (goal.metric_key === 'sleep' && sleepMetrics.length > 0) continue
    if (goal.metric_key === 'focus') continue
    push(
      goal.metric_key,
      goal.name || metricLabel(goal.metric_key),
      goal.unit || defaultUnitForMetric(goal.metric_key),
      goal.category_id,
    )
  }

  return options.sort(
    (a, b) =>
      a.categoryLabel.localeCompare(b.categoryLabel) || a.label.localeCompare(b.label),
  )
}

export function formatDeadlineLabel(deadline?: string): string | null {
  if (!deadline) return null
  try {
    return parseISO(`${deadline}T12:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return deadline
  }
}

export interface OutcomeGoalPeriodSnapshot {
  start: string
  end: string
  label: string
  isCurrent: boolean
  onTrack: boolean
  outcomes: OutcomeLinkProgress[]
  hitCount: number
  metricCount: number
}

export interface OutcomeGoalDeadlineProgress {
  start: string
  end: string
  totalDays: number
  elapsedDays: number
  remainingDays: number
  elapsedPercent: number
}

export interface OutcomeGoalDetailStats {
  periods: OutcomeGoalPeriodSnapshot[]
  /** Completed (past) periods that were fully on track. */
  hitCount: number
  periodCount: number
  hitRate: number
  currentStreak: number
  deadline: OutcomeGoalDeadlineProgress | null
}

function recurrenceSpanDays(goal: OutcomeGoal): number {
  if (goal.recurrence === 'daily') return 1
  if (goal.recurrence === 'weekly') return 7
  if (goal.recurrence === 'every_14') return 14
  return goal.recurrence_days && goal.recurrence_days > 0 ? Math.round(goal.recurrence_days) : 30
}

function formatPeriodLabel(start: string, end: string, recurrence: OutcomeGoalRecurrence): string {
  const startDate = parseISO(`${start}T12:00:00`)
  const endDate = parseISO(`${end}T12:00:00`)
  if (recurrence === 'daily' || start === end) {
    return startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  const sameMonth = startDate.getMonth() === endDate.getMonth()
  const startLabel = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endLabel = endDate.toLocaleDateString(undefined, {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
  })
  return `${startLabel} – ${endLabel}`
}

/** Newest-first recurrence windows for history (includes the current period). */
export function listOutcomeGoalPeriods(
  goal: OutcomeGoal,
  asOf: Date,
  weekStartsOn: 0 | 1,
  count = 12,
): Array<{ start: string; end: string; isCurrent: boolean }> {
  const asOfStr = formatDate(asOf)
  const periods: Array<{ start: string; end: string; isCurrent: boolean }> = []

  if (goal.recurrence === 'weekly') {
    const starts = getWeekStartsBefore(asOf, weekStartsOn, count)
    for (let i = starts.length - 1; i >= 0; i--) {
      const start = starts[i]!
      const week = getWeekDates(parseISO(`${start}T12:00:00`), weekStartsOn)
      const end = week[week.length - 1]!
      periods.push({ start, end, isCurrent: asOfStr >= start && asOfStr <= end })
    }
    return periods
  }

  if (goal.recurrence === 'daily') {
    for (let i = 0; i < count; i++) {
      const day = formatDate(addDays(asOf, -i))
      periods.push({ start: day, end: day, isCurrent: i === 0 })
    }
    return periods
  }

  const span = recurrenceSpanDays(goal)
  let end = asOfStr
  for (let i = 0; i < count; i++) {
    const start = formatDate(addDays(parseISO(`${end}T12:00:00`), -(span - 1)))
    periods.push({ start, end, isCurrent: i === 0 })
    end = formatDate(addDays(parseISO(`${start}T12:00:00`), -1))
  }
  return periods
}

export function resolveOutcomeGoalStartDate(goal: OutcomeGoal): string {
  if (goal.start_date && /^\d{4}-\d{2}-\d{2}$/.test(goal.start_date)) return goal.start_date
  return goal.created_at.slice(0, 10)
}

export function computeOutcomeGoalDeadlineProgress(
  goal: OutcomeGoal,
  asOf: Date = new Date(),
): OutcomeGoalDeadlineProgress | null {
  if (!goal.deadline) return null
  const start = resolveOutcomeGoalStartDate(goal)
  const end = goal.deadline
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null
  if (end < start) return null

  const asOfStr = formatDate(asOf)
  const totalDays =
    Math.round(
      (parseISO(`${end}T12:00:00`).getTime() - parseISO(`${start}T12:00:00`).getTime()) /
        86_400_000,
    ) + 1
  if (totalDays <= 0) return null

  const clamped = asOfStr < start ? start : asOfStr > end ? end : asOfStr
  const elapsedDays =
    Math.round(
      (parseISO(`${clamped}T12:00:00`).getTime() - parseISO(`${start}T12:00:00`).getTime()) /
        86_400_000,
    ) + 1
  const remainingDays = Math.max(0, totalDays - elapsedDays)
  const elapsedPercent = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100))

  return {
    start,
    end,
    totalDays,
    elapsedDays: Math.min(totalDays, Math.max(0, elapsedDays)),
    remainingDays,
    elapsedPercent,
  }
}

export function computeOutcomeGoalDetailStats(
  goal: OutcomeGoal,
  logs: DailyLog[],
  workouts: Workout[],
  hybridGoals: Goal[],
  asOf: Date = new Date(),
  weekStartsOn: 0 | 1 = 1,
  periodCount = 12,
): OutcomeGoalDetailStats {
  const windows = listOutcomeGoalPeriods(goal, asOf, weekStartsOn, periodCount)
  const periods: OutcomeGoalPeriodSnapshot[] = windows.map((window) => {
    const asOfDate = parseISO(`${window.end}T12:00:00`)
    const progress = computeOutcomeGoalProgress(
      goal,
      logs,
      workouts,
      hybridGoals,
      asOfDate,
      weekStartsOn,
    )
    const hitCount = progress.outcomes.filter((entry) => entry.onPace).length
    return {
      start: window.start,
      end: window.end,
      label: formatPeriodLabel(window.start, window.end, goal.recurrence),
      isCurrent: window.isCurrent,
      onTrack: progress.onTrack,
      outcomes: progress.outcomes,
      hitCount,
      metricCount: progress.outcomes.length,
    }
  })

  const completed = periods.filter((period) => !period.isCurrent)
  const hitCount = completed.filter((period) => period.onTrack && period.metricCount > 0).length
  const scored = completed.filter((period) => period.metricCount > 0)
  const periodCountScored = scored.length
  const hitRate =
    periodCountScored > 0 ? Math.round((hitCount / periodCountScored) * 100) : 0

  let currentStreak = 0
  for (const period of periods) {
    if (period.isCurrent) continue
    if (period.metricCount === 0) continue
    if (!period.onTrack) break
    currentStreak++
  }

  const assessedAt = findLastOutcomeGoalLogDate(goal, logs, workouts, asOf)
  const deadlineAsOf = assessedAt ? parseISO(`${assessedAt}T12:00:00`) : asOf

  return {
    periods,
    hitCount,
    periodCount: periodCountScored,
    hitRate,
    currentStreak,
    deadline: computeOutcomeGoalDeadlineProgress(goal, deadlineAsOf),
  }
}

