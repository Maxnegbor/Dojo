import { parseISO } from 'date-fns'
import {
  defaultUnitForMetric,
  hasTarget,
  metricLabel,
  normalizeGoal,
} from '@/lib/goals'
import { getFocusSettings } from '@/lib/focusStore'
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
const MIGRATION_KEY = 'personal-os-outcome-goals-migrated-v1'
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
  return {
    id: typeof obj.id === 'string' && obj.id ? obj.id : newId(),
    metric_key,
    role: normalizeRole(obj.role),
    target_value,
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
    comparator: partial.comparator ?? 'gte',
    period: partial.period ?? 'weekly',
  }
}

/** Seed OutcomeGoals from hybrid Goal rows that have targets (once). */
export function migrateOutcomeGoalsFromHybridGoals(hybridGoals: Goal[]): boolean {
  if (storageGetItem(MIGRATION_KEY) === '1') return false
  if (getOutcomeGoals().length > 0) {
    storageSetItem(MIGRATION_KEY, '1')
    return false
  }

  const seeded: OutcomeGoal[] = []
  for (const raw of hybridGoals) {
    const goal = normalizeGoal(raw)
    if (!goal.is_active || !hasTarget(goal)) continue

    let target_value = goal.target_value
    let comparator: OutcomeGoalComparator = 'gte'
    let period: OutcomeGoalLinkPeriod =
      goal.log_period === 'weekly' || goal.target_period === 'weekly' ? 'weekly' : 'daily'

    if (isWeightGoal(goal) && goal.goal_weight_target != null) {
      target_value = goal.goal_weight_target
      const start = goal.goal_weight_start ?? goal.goal_weight_target
      comparator = goal.goal_weight_target < start ? 'lte' : 'gte'
      period = 'by_deadline'
    }

    if (target_value == null || target_value <= 0) continue

    const now = goal.created_at || new Date().toISOString()
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
          comparator,
          period,
        }),
      ],
      created_at: now,
      updated_at: now,
    })
  }

  if (seeded.length > 0) saveOutcomeGoals(seeded)
  storageSetItem(MIGRATION_KEY, '1')
  return seeded.length > 0
}

export async function runOutcomeGoalsMigration(userId: string): Promise<void> {
  if (!userId) return
  if (storageGetItem(MIGRATION_KEY) === '1') return

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
  hit: boolean
  percent: number
  display: string
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
  const hit = compareValues(current, target, link.comparator)
  const percent =
    target > 0
      ? Math.min(
          100,
          Math.round(
            (link.comparator === 'lte'
              ? target > 0
                ? Math.max(0, 1 - Math.abs(current - target) / Math.max(target, 1)) * 100
                : 0
              : (current / target) * 100),
          ),
        )
      : 0
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
    hit,
    percent: link.comparator === 'lte' ? (hit ? 100 : Math.min(99, percent)) : percent,
    display: `${currentLabel} / ${targetLabel} (${cmp})`,
  }
}

export interface OutcomeGoalProgress {
  goal: OutcomeGoal
  primary: OutcomeLinkProgress | null
  outcomes: OutcomeLinkProgress[]
  processes: OutcomeLinkProgress[]
  onTrack: boolean
}

export function computeOutcomeGoalProgress(
  goal: OutcomeGoal,
  logs: DailyLog[],
  workouts: Workout[],
  hybridGoals: Goal[],
  asOf: Date = new Date(),
  weekStartsOn: 0 | 1 = 1,
): OutcomeGoalProgress {
  const metrics = goal.links.map((link) =>
    computeLinkProgress(link, logs, workouts, hybridGoals, asOf, weekStartsOn, goal.deadline),
  )
  const primary = metrics[0] ?? null
  const onTrack = metrics.length > 0 && metrics.every((entry) => entry.hit)

  return {
    goal,
    primary,
    outcomes: metrics,
    processes: metrics.slice(1),
    onTrack,
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
