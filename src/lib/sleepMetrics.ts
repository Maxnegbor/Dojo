import { slugifyWorkoutId } from '@/lib/workoutTypes'
import { formatMorningMinutes } from '@/lib/morningLog'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import type { DailyLog, MorningLog } from '@/types'

export type SleepMetricUnit = 'hours' | 'minutes' | 'percent' | 'score10'

export type SleepMetricSource = 'builtin' | 'custom' | 'preset'

export interface SleepMetricDefinition {
  id: string
  label: string
  unit: SleepMetricUnit
  source: SleepMetricSource
}

export const WEARABLE_SLEEP_PRESET_ID = 'wearable_sleep_score'

export const WEARABLE_SLEEP_PRESET: SleepMetricDefinition = {
  id: WEARABLE_SLEEP_PRESET_ID,
  label: 'Wearable sleep score',
  unit: 'percent',
  source: 'preset',
}

export const BUILTIN_SLEEP_METRICS: SleepMetricDefinition[] = [
  { id: 'sleep_duration', label: 'Sleep duration', unit: 'minutes', source: 'builtin' },
  { id: 'bedtime', label: 'Bedtime', unit: 'minutes', source: 'builtin' },
  { id: 'wake_time', label: 'Wake time', unit: 'minutes', source: 'builtin' },
  { id: 'alertness', label: 'Alertness', unit: 'score10', source: 'builtin' },
  { id: 'in_bed', label: 'In bed duration', unit: 'minutes', source: 'builtin' },
]

/** Morning-log field ids (not stored in sleep_metrics). */
export const MORNING_LOG_SLEEP_FIELD_IDS = new Set([
  'sleep_duration',
  'bedtime',
  'wake_time',
  'alertness',
  'in_bed',
])

export interface SleepMetricsConfig {
  enabledIds: string[]
  customMetrics: SleepMetricDefinition[]
  /** Target in the metric’s native logged unit (minutes, hours, %, or 1–10). */
  targets: Record<string, number>
}

export const SLEEP_METRICS_CHANGED = 'personal-os-sleep-metrics-changed'

const STORAGE_KEY = 'personal-os-sleep-metrics-config'

const DEFAULT_ENABLED_IDS: string[] = []

export const SLEEP_METRIC_UNIT_LABELS: Record<SleepMetricUnit, string> = {
  hours: 'Hours',
  minutes: 'Minutes',
  percent: 'Percent (%)',
  score10: 'Score (1–10)',
}

function normalizeMetric(raw: unknown, source: SleepMetricSource): SleepMetricDefinition | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Partial<SleepMetricDefinition>
  const id = typeof obj.id === 'string' ? slugifyWorkoutId(obj.id) : ''
  const label = typeof obj.label === 'string' ? obj.label.trim() : ''
  const unit = obj.unit
  if (!id || !label) return null
  if (unit !== 'hours' && unit !== 'minutes' && unit !== 'percent' && unit !== 'score10') {
    return null
  }
  return { id, label, unit, source }
}

function normalizeTargets(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key) continue
    const n = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(n) && n > 0) out[key] = n
  }
  return out
}

export function normalizeSleepMetricsConfig(raw: unknown): SleepMetricsConfig {
  if (!raw || typeof raw !== 'object') {
    return { enabledIds: [...DEFAULT_ENABLED_IDS], customMetrics: [], targets: {} }
  }

  const obj = raw as Partial<SleepMetricsConfig>
  const enabledIds = Array.isArray(obj.enabledIds)
    ? obj.enabledIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [...DEFAULT_ENABLED_IDS]

  const customMetrics = Array.isArray(obj.customMetrics)
    ? obj.customMetrics
        .map((m) => normalizeMetric(m, 'custom'))
        .filter((m): m is SleepMetricDefinition => m != null)
    : []

  const targets = normalizeTargets(obj.targets)
  const enabled = new Set(enabledIds)
  for (const key of Object.keys(targets)) {
    if (!enabled.has(key)) delete targets[key]
  }

  return {
    enabledIds,
    customMetrics,
    targets,
  }
}

export function getSleepMetricsConfig(): SleepMetricsConfig {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (raw) return normalizeSleepMetricsConfig(JSON.parse(raw))
  } catch {
    /* ignore */
  }
  return { enabledIds: [...DEFAULT_ENABLED_IDS], customMetrics: [], targets: {} }
}

export function saveSleepMetricsConfig(config: SleepMetricsConfig) {
  const next = normalizeSleepMetricsConfig(config)
  storageSetItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(SLEEP_METRICS_CHANGED))
}

export function getAllSleepMetricDefinitions(config: SleepMetricsConfig): SleepMetricDefinition[] {
  const byId = new Map<string, SleepMetricDefinition>()
  for (const metric of BUILTIN_SLEEP_METRICS) {
    byId.set(metric.id, metric)
  }
  byId.set(WEARABLE_SLEEP_PRESET_ID, WEARABLE_SLEEP_PRESET)
  for (const custom of config.customMetrics) {
    byId.set(custom.id, custom)
  }
  return Array.from(byId.values())
}

export function getAvailableSleepMetricTemplates(
  config: SleepMetricsConfig,
): SleepMetricDefinition[] {
  const enabled = new Set(config.enabledIds)
  return getAllSleepMetricDefinitions(config).filter((metric) => !enabled.has(metric.id))
}

export function getEnabledSleepMetrics(config: SleepMetricsConfig): SleepMetricDefinition[] {
  const all = getAllSleepMetricDefinitions(config)
  const byId = new Map(all.map((m) => [m.id, m]))
  return config.enabledIds
    .map((id) => byId.get(id))
    .filter((m): m is SleepMetricDefinition => m != null)
}

export function getSleepMetricDefinition(
  config: SleepMetricsConfig,
  id: string,
): SleepMetricDefinition | undefined {
  return getAllSleepMetricDefinitions(config).find((m) => m.id === id)
}

export function isSleepMetricEnabled(config: SleepMetricsConfig, id: string): boolean {
  return config.enabledIds.includes(id)
}

export function toggleSleepMetric(config: SleepMetricsConfig, id: string, enabled: boolean): SleepMetricsConfig {
  const enabledIds = new Set(config.enabledIds)
  if (enabled) enabledIds.add(id)
  else enabledIds.delete(id)
  const targets = { ...config.targets }
  if (!enabled) delete targets[id]
  return { ...config, enabledIds: Array.from(enabledIds), targets }
}

export function addCustomSleepMetric(
  config: SleepMetricsConfig,
  label: string,
  unit: SleepMetricUnit,
): SleepMetricsConfig {
  const trimmed = label.trim()
  if (!trimmed) return config

  let id = slugifyWorkoutId(trimmed)
  const existing = new Set(getAllSleepMetricDefinitions(config).map((m) => m.id))
  let n = 2
  while (existing.has(id)) {
    id = `${slugifyWorkoutId(trimmed)}_${n}`
    n++
  }

  const metric: SleepMetricDefinition = { id, label: trimmed, unit, source: 'custom' }
  return {
    enabledIds: [...config.enabledIds, id],
    customMetrics: [...config.customMetrics, metric],
    targets: { ...config.targets },
  }
}

export function removeCustomSleepMetric(config: SleepMetricsConfig, id: string): SleepMetricsConfig {
  const targets = { ...config.targets }
  delete targets[id]
  return {
    enabledIds: config.enabledIds.filter((entry) => entry !== id),
    customMetrics: config.customMetrics.filter((m) => m.id !== id),
    targets,
  }
}

/** Clock times are logged but not pulse-scored. */
export function sleepMetricSupportsTarget(metric: SleepMetricDefinition): boolean {
  return metric.id !== 'bedtime' && metric.id !== 'wake_time'
}

export function getSleepMetricTarget(config: SleepMetricsConfig, id: string): number | null {
  const value = config.targets?.[id]
  return typeof value === 'number' && value > 0 ? value : null
}

export function setSleepMetricTarget(
  config: SleepMetricsConfig,
  id: string,
  target: number | null,
): SleepMetricsConfig {
  const targets = { ...config.targets }
  if (target == null || !Number.isFinite(target) || target <= 0) delete targets[id]
  else targets[id] = target
  return { ...config, targets }
}

/** UI unit for target fields (duration metrics edited in hours). */
export function sleepMetricTargetInputUnit(metric: SleepMetricDefinition): string {
  if (metric.id === 'sleep_duration' || metric.id === 'in_bed') return 'hrs'
  return formatSleepMetricUnit(metric.unit)
}

/** Convert stored native target → value shown in the target input. */
export function sleepMetricTargetToInputValue(
  metric: SleepMetricDefinition,
  target: number | null,
): string {
  if (target == null || target <= 0) return ''
  if (metric.id === 'sleep_duration' || metric.id === 'in_bed') {
    const hours = target / 60
    return Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 100) / 100)
  }
  if (metric.unit === 'score10') {
    return Number.isInteger(target) ? String(target) : String(Math.round(target * 10) / 10)
  }
  return String(Math.round(target * 10) / 10)
}

/** Parse target input → native stored unit. */
export function sleepMetricTargetFromInputValue(
  metric: SleepMetricDefinition,
  raw: string,
): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = parseFloat(trimmed)
  if (!Number.isFinite(n) || n <= 0) return null
  if (metric.id === 'sleep_duration' || metric.id === 'in_bed') return n * 60
  return n
}

export function formatSleepMetricUnit(unit: SleepMetricUnit): string {
  switch (unit) {
    case 'hours':
      return 'hrs'
    case 'minutes':
      return 'min'
    case 'percent':
      return '%'
    case 'score10':
      return '/10'
  }
}

export function sleepMetricDisplayUnit(metric: Pick<SleepMetricDefinition, 'id' | 'unit'>): string {
  if (metric.id === 'sleep_duration' || metric.id === 'in_bed') return 'hrs:min'
  if (metric.id === 'bedtime' || metric.id === 'wake_time') return 'Time of day'
  return SLEEP_METRIC_UNIT_LABELS[metric.unit]
}

/** Numeric sleep metric values keyed by metric id. */
export type SleepMetricValues = Record<string, number | null>

/**
 * Fallback storage when the `sleep_metrics` DB column is missing.
 * Written into `daily_logs.custom_metrics` under this prefix.
 */
export const SLEEP_METRIC_CUSTOM_PREFIX = 'sm:'

export function sleepMetricCustomKey(metricId: string): string {
  return `${SLEEP_METRIC_CUSTOM_PREFIX}${metricId}`
}

export function isSleepMetricCustomKey(key: string): boolean {
  return key.startsWith(SLEEP_METRIC_CUSTOM_PREFIX)
}

export function encodeSleepMetricsAsCustom(
  sleepMetrics: SleepMetricValues | undefined | null,
  existingCustom: Record<string, number | null> = {},
): Record<string, number | null> {
  const next = { ...existingCustom }
  if (!sleepMetrics) return next
  for (const [id, value] of Object.entries(sleepMetrics)) {
    const key = sleepMetricCustomKey(id)
    if (value == null || (typeof value === 'number' && !Number.isFinite(value))) {
      delete next[key]
    } else {
      next[key] = value
    }
  }
  return next
}

export function sleepMetricsFromCustom(
  customMetrics: Record<string, number | null> | undefined | null,
): SleepMetricValues {
  if (!customMetrics) return {}
  const out: SleepMetricValues = {}
  for (const [key, value] of Object.entries(customMetrics)) {
    if (!isSleepMetricCustomKey(key)) continue
    out[key.slice(SLEEP_METRIC_CUSTOM_PREFIX.length)] = value
  }
  return out
}

/** Merge native sleep_metrics with custom_metrics fallback (`sm:` keys). */
export function resolveSleepMetrics(log: DailyLog | undefined): SleepMetricValues {
  if (!log) return {}
  return {
    ...sleepMetricsFromCustom(log.custom_metrics),
    ...(log.sleep_metrics ?? {}),
  }
}

export function getSleepMetricValues(log: DailyLog | undefined): SleepMetricValues {
  return resolveSleepMetrics(log)
}

export function getSleepMetricValue(
  log: DailyLog | undefined,
  metric: SleepMetricDefinition,
): number | null {
  if (!log) return null
  const metrics = resolveSleepMetrics(log)

  switch (metric.id) {
    case 'sleep_duration': {
      const fromMetrics = metrics.sleep_duration
      if (fromMetrics != null) return fromMetrics
      if (log.morning_log?.sleep_minutes != null && log.morning_log.sleep_minutes > 0) {
        return log.morning_log.sleep_minutes
      }
      if (log.sleep_hours != null) return log.sleep_hours * 60
      return null
    }
    case 'in_bed':
      return log.morning_log?.in_bed_minutes ?? metrics.in_bed ?? null
    case 'alertness':
      return log.morning_log?.alertness ?? metrics.alertness ?? null
    case 'bedtime':
    case 'wake_time':
      return metrics[metric.id] ?? null
    default:
      return metrics[metric.id] ?? null
  }
}

export function hasMorningLogFieldsEnabled(config: SleepMetricsConfig): boolean {
  return getEnabledSleepMetrics(config).some((m) =>
    ['sleep_duration', 'bedtime', 'wake_time', 'alertness'].includes(m.id),
  )
}

export function isMorningSleepLogComplete(
  log: DailyLog | undefined,
  config: SleepMetricsConfig,
): boolean {
  if (!log) return false

  const enabled = getEnabledSleepMetrics(config)
  if (enabled.length === 0) return true

  const loggable = enabled.filter((m) => m.id !== 'in_bed')
  if (loggable.length === 0) return true

  for (const metric of loggable) {
    if (metric.id === 'sleep_duration') {
      if (log.sleep_hours != null || getSleepMetricValue(log, metric) != null) continue
      return false
    }
    if (metric.id === 'alertness') {
      if (log.morning_log?.alertness != null || getSleepMetricValue(log, metric) != null) {
        continue
      }
      return false
    }
    if (metric.id === 'bedtime') {
      if (log.morning_log?.bedtime || getSleepMetricValue(log, metric) != null) continue
      return false
    }
    if (metric.id === 'wake_time') {
      if (log.morning_log?.wake_time || getSleepMetricValue(log, metric) != null) continue
      return false
    }
    if (getSleepMetricValue(log, metric) == null) return false
  }

  return true
}

export function buildSleepLogUpdates(input: {
  morningLog?: MorningLog | null
  sleepMetrics?: SleepMetricValues
  config: SleepMetricsConfig
  existingSleepMetrics?: SleepMetricValues
}): Partial<Pick<DailyLog, 'morning_log' | 'sleep_hours' | 'sleep_metrics'>> {
  const enabled = new Set(input.config.enabledIds)
  const sleepMetrics = {
    ...(input.existingSleepMetrics ?? {}),
    ...(input.sleepMetrics ?? {}),
  }

  if (input.morningLog) {
    if (enabled.has('sleep_duration')) {
      sleepMetrics.sleep_duration = input.morningLog.sleep_minutes
    }
    if (enabled.has('alertness')) {
      sleepMetrics.alertness = input.morningLog.alertness
    }
    if (enabled.has('in_bed')) {
      sleepMetrics.in_bed = input.morningLog.in_bed_minutes
    }
  }

  const updates: Partial<Pick<DailyLog, 'morning_log' | 'sleep_hours' | 'sleep_metrics'>> = {
    sleep_metrics: sanitizeSleepMetricValues(sleepMetrics),
  }

  if (input.morningLog !== undefined) {
    updates.morning_log = input.morningLog
  }

  const durationMinutes =
    (enabled.has('sleep_duration') && input.morningLog
      ? input.morningLog.sleep_minutes
      : null) ??
    (sleepMetrics.sleep_duration != null && sleepMetrics.sleep_duration > 0
      ? sleepMetrics.sleep_duration
      : null)

  if (durationMinutes != null && durationMinutes > 0) {
    updates.sleep_hours = durationMinutes / 60
  }

  return updates
}

function sanitizeSleepMetricValues(
  metrics: SleepMetricValues,
): SleepMetricValues {
  const sanitized: SleepMetricValues = {}
  for (const [key, value] of Object.entries(metrics)) {
    if (value == null) {
      sanitized[key] = null
      continue
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      sanitized[key] = value
    }
  }
  return sanitized
}

function morningLogHasData(morningLog: MorningLog | null | undefined): boolean {
  if (!morningLog) return false
  return (
    morningLog.sleep_minutes > 0 ||
    morningLog.alertness > 0 ||
    morningLog.in_bed_minutes > 0 ||
    Boolean(morningLog.bedtime) ||
    Boolean(morningLog.wake_time)
  )
}

export function buildEditLogDaySleepUpdates(
  log: DailyLog | null | undefined,
  sleepMetricValues: Record<string, number | null>,
  metrics: SleepMetricDefinition[],
): Pick<DailyLog, 'sleep_metrics' | 'morning_log' | 'sleep_hours'> {
  const sleep_metrics: SleepMetricValues = { ...(log?.sleep_metrics ?? {}) }
  for (const metric of metrics) {
    sleep_metrics[metric.id] = sleepMetricValues[metric.id] ?? null
  }

  let morning_log: MorningLog | null = log?.morning_log ? { ...log.morning_log } : null
  const metricIds = new Set(metrics.map((metric) => metric.id))

  if (metricIds.has('sleep_duration')) {
    const duration = sleepMetricValues.sleep_duration ?? null
    if (duration == null) {
      if (morning_log) {
        morning_log = { ...morning_log, sleep_minutes: 0 }
      }
    } else if (morning_log) {
      morning_log = { ...morning_log, sleep_minutes: duration }
    } else {
      morning_log = {
        bedtime: '',
        wake_time: '',
        alertness: sleepMetricValues.alertness ?? 0,
        in_bed_minutes: sleepMetricValues.in_bed ?? 0,
        sleep_minutes: duration,
      }
    }
  }

  if (metricIds.has('alertness')) {
    const alertness = sleepMetricValues.alertness ?? null
    if (alertness == null) {
      if (morning_log) morning_log = { ...morning_log, alertness: 0 }
    } else if (morning_log) {
      morning_log = { ...morning_log, alertness }
    } else {
      morning_log = {
        bedtime: '',
        wake_time: '',
        alertness,
        in_bed_minutes: sleepMetricValues.in_bed ?? 0,
        sleep_minutes: sleepMetricValues.sleep_duration ?? 0,
      }
    }
  }

  if (metricIds.has('in_bed')) {
    const inBed = sleepMetricValues.in_bed ?? null
    if (morning_log) {
      morning_log = { ...morning_log, in_bed_minutes: inBed ?? 0 }
    }
  }

  if (!morningLogHasData(morning_log)) {
    morning_log = null
  }

  let sleep_hours = log?.sleep_hours ?? null
  if (metricIds.has('sleep_duration')) {
    const duration = sleepMetricValues.sleep_duration ?? null
    sleep_hours = duration != null ? duration / 60 : null
  }

  return {
    sleep_metrics: sanitizeSleepMetricValues(sleep_metrics),
    morning_log,
    sleep_hours,
  }
}

export function getPulseSleepMetrics(config: SleepMetricsConfig): SleepMetricDefinition[] {
  return getEnabledSleepMetrics(config).filter(
    (m) => m.id !== 'bedtime' && m.id !== 'wake_time',
  )
}

export function metricRateForPulse(
  metric: SleepMetricDefinition,
  value: number,
  target: number | null,
): number | null {
  if (!Number.isFinite(value)) return null

  if (target != null && target > 0) {
    return Math.max(0, Math.min(100, (value / target) * 100))
  }

  // Without a target: percent and 1–10 scores still contribute; durations need a target.
  switch (metric.unit) {
    case 'percent':
      return Math.max(0, Math.min(100, value))
    case 'score10':
      return Math.max(0, Math.min(100, (value / 10) * 100))
    default:
      return null
  }
}

export function formatSleepMetricDisplay(
  metric: SleepMetricDefinition,
  value: number,
  use24h = false,
): string {
  if (metric.unit === 'percent') return `${Math.round(value)}%`
  if (metric.unit === 'score10') return `${value.toFixed(1)}/10`
  if (metric.unit === 'hours') return `${value.toFixed(1)}h`
  if (metric.id === 'sleep_duration' || metric.id === 'in_bed' || metric.unit === 'minutes') {
    return formatMorningMinutes(Math.round(value))
  }
  if (metric.id === 'bedtime' || metric.id === 'wake_time') {
    const h = Math.floor(value / 60) % 24
    const m = Math.round(value % 60)
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    if (use24h) return time
    const period = h >= 12 ? 'PM' : 'AM'
    const hour12 = h % 12 || 12
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`
  }
  return String(Math.round(value * 10) / 10)
}

/**
 * Average completion across enabled pulse sleep metrics.
 * @param legacySleepGoalTargetHours — fallback for sleep_duration / in_bed when config has no target
 */
export function computeSleepPulseRate(
  log: DailyLog | undefined,
  config: SleepMetricsConfig,
  legacySleepGoalTargetHours: number | null = null,
): number {
  const pulseMetrics = getPulseSleepMetrics(config)
  if (pulseMetrics.length === 0) return 0

  const rates: number[] = []
  for (const metric of pulseMetrics) {
    const value = getSleepMetricValue(log, metric)
    if (value == null) continue

    let target = getSleepMetricTarget(config, metric.id)
    if (
      target == null &&
      legacySleepGoalTargetHours != null &&
      legacySleepGoalTargetHours > 0 &&
      (metric.id === 'sleep_duration' || metric.id === 'in_bed')
    ) {
      target = legacySleepGoalTargetHours * 60
    }

    const rate = metricRateForPulse(metric, value, target)
    if (rate != null) rates.push(rate)
  }

  if (rates.length === 0) return 0
  return Math.round(rates.reduce((s, r) => s + r, 0) / rates.length)
}
