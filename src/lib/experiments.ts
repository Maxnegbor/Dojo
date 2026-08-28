import { addDays, parseISO } from 'date-fns'
import { getMetricValue } from '@/lib/metrics'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { addDaysToDateString, formatDate, generateId } from '@/lib/utils'
import type {
  DailyLog,
  Experiment,
  ExperimentAdherenceEntry,
  ExperimentArm,
  ExperimentConfounder,
  ExperimentConfounderLog,
  ExperimentConfounderLogSurface,
  ExperimentDuration,
  ExperimentProtocol,
  ExperimentScheduleDay,
  ExperimentStatus,
  MetricKey,
  Workout,
} from '@/types'

const STORAGE_KEY = 'personal-os-experiments'
export const EXPERIMENTS_CHANGED = 'personal-os-experiments-changed'

export const EXPERIMENT_PROTOCOLS: {
  id: ExperimentProtocol
  label: string
  description: string
}[] = [
  {
    id: 'randomized_crossover',
    label: 'Randomized crossover',
    description: 'Balanced mix of intervention and control days, shuffled at random.',
  },
  {
    id: 'randomized_ab',
    label: 'Randomized A/B',
    description: 'Each day independently assigned to intervention or control.',
  },
  {
    id: 'abab',
    label: 'ABAB',
    description: 'Four phases: intervention → control → intervention → control.',
  },
  {
    id: 'before_after',
    label: 'Before / after',
    description: 'Baseline (control) first half, then intervention second half.',
  },
  {
    id: 'repeated_crossover',
    label: 'Repeated crossover',
    description: 'Alternate intervention and control every day.',
  },
]

function notifyChanged() {
  window.dispatchEvent(new Event(EXPERIMENTS_CHANGED))
}

function isArm(value: unknown): value is ExperimentArm {
  return value === 'A' || value === 'B'
}

function isProtocol(value: unknown): value is ExperimentProtocol {
  return (
    value === 'randomized_crossover' ||
    value === 'randomized_ab' ||
    value === 'abab' ||
    value === 'before_after' ||
    value === 'repeated_crossover'
  )
}

function isStatus(value: unknown): value is ExperimentStatus {
  return value === 'draft' || value === 'running' || value === 'completed'
}

function normalizeDuration(raw: unknown): ExperimentDuration {
  if (!raw || typeof raw !== 'object') return { mode: 'observations', observations: 14 }
  const obj = raw as Record<string, unknown>
  if (obj.mode === 'end_date') {
    const end =
      typeof obj.end_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.end_date)
        ? obj.end_date
        : formatDate(addDays(new Date(), 13))
    return { mode: 'end_date', end_date: end }
  }
  const observations = Math.max(2, Math.round(Number(obj.observations) || 14))
  return { mode: 'observations', observations }
}

function normalizeSchedule(raw: unknown): ExperimentScheduleDay[] {
  if (!Array.isArray(raw)) return []
  const out: ExperimentScheduleDay[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    if (typeof obj.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date)) continue
    if (!isArm(obj.arm)) continue
    out.push({ date: obj.date, arm: obj.arm })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

function normalizeAdherence(raw: unknown): ExperimentAdherenceEntry[] {
  if (!Array.isArray(raw)) return []
  const out: ExperimentAdherenceEntry[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    if (typeof obj.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date)) continue
    out.push({ date: obj.date, followed: Boolean(obj.followed) })
  }
  return out
}

function normalizeConfounders(raw: unknown): ExperimentConfounder[] {
  if (!Array.isArray(raw)) return []
  const out: ExperimentConfounder[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim()) {
      const label = entry.trim()
      const id = generateId()
      out.push({ id, label })
      continue
    }
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    const label = typeof obj.label === 'string' ? obj.label.trim() : ''
    if (!label) continue
    const id =
      typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : generateId()
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, label })
  }
  return out
}

function normalizeConfounderLogs(raw: unknown): ExperimentConfounderLog[] {
  if (!Array.isArray(raw)) return []
  const out: ExperimentConfounderLog[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    if (typeof obj.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date)) continue
    const ticks: Record<string, boolean> = {}
    if (obj.ticks && typeof obj.ticks === 'object') {
      for (const [key, value] of Object.entries(obj.ticks as Record<string, unknown>)) {
        if (value) ticks[key] = true
      }
    }
    out.push({ date: obj.date, ticks })
  }
  return out
}

const ALL_SURFACES: ExperimentConfounderLogSurface[] = ['home_log', 'shutdown', 'morning']

function normalizeConfounderSurfaces(raw: unknown): ExperimentConfounderLogSurface[] {
  if (!Array.isArray(raw)) return ['home_log', 'shutdown']
  const out: ExperimentConfounderLogSurface[] = []
  for (const value of raw) {
    if (
      (value === 'home_log' || value === 'shutdown' || value === 'morning') &&
      !out.includes(value)
    ) {
      out.push(value)
    }
  }
  return out.length > 0 ? out : ['home_log', 'shutdown']
}

export function normalizeExperiment(raw: unknown): Experiment | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.id !== 'string' || !obj.id) return null
  const protocol = isProtocol(obj.protocol) ? obj.protocol : 'randomized_crossover'
  const status = isStatus(obj.status) ? obj.status : 'draft'
  const primary =
    typeof obj.primary_metric_key === 'string' && obj.primary_metric_key
      ? (obj.primary_metric_key as MetricKey)
      : null
  if (!primary) return null

  const secondary = Array.isArray(obj.secondary_metric_keys)
    ? obj.secondary_metric_keys.filter((k): k is MetricKey => typeof k === 'string' && k.length > 0)
    : []

  const priorDayMetrics = Array.isArray(obj.metric_associate_prior_day)
    ? obj.metric_associate_prior_day.filter(
        (k): k is MetricKey => typeof k === 'string' && k.length > 0,
      )
    : []

  const start =
    typeof obj.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.start_date)
      ? obj.start_date
      : formatDate(new Date())
  const now = new Date().toISOString()

  return {
    id: obj.id,
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'Untitled experiment',
    cause: typeof obj.cause === 'string' ? obj.cause.trim() : '',
    effect: typeof obj.effect === 'string' ? obj.effect.trim() : '',
    intervention: typeof obj.intervention === 'string' ? obj.intervention.trim() : '',
    control: typeof obj.control === 'string' ? obj.control.trim() : '',
    primary_metric_key: primary,
    secondary_metric_keys: secondary,
    metric_associate_prior_day: priorDayMetrics,
    confounders: normalizeConfounders(obj.confounders),
    confounder_logs: normalizeConfounderLogs(obj.confounder_logs),
    confounder_log_surfaces: normalizeConfounderSurfaces(obj.confounder_log_surfaces),
    protocol,
    duration: normalizeDuration(obj.duration),
    start_date: start,
    status,
    schedule: normalizeSchedule(obj.schedule),
    adherence: normalizeAdherence(obj.adherence),
    created_at: typeof obj.created_at === 'string' ? obj.created_at : now,
    updated_at: typeof obj.updated_at === 'string' ? obj.updated_at : now,
  }
}

export function getExperiments(): Experiment[] {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeExperiment)
      .filter((e): e is Experiment => e != null)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  } catch {
    return []
  }
}

export function saveExperiments(experiments: Experiment[]): void {
  storageSetItem(STORAGE_KEY, JSON.stringify(experiments))
  notifyChanged()
}

export function upsertExperiment(experiment: Experiment): Experiment {
  const normalized = normalizeExperiment({
    ...experiment,
    updated_at: new Date().toISOString(),
  })
  if (!normalized) throw new Error('Invalid experiment')
  const existing = getExperiments()
  const idx = existing.findIndex((e) => e.id === normalized.id)
  const next =
    idx >= 0
      ? existing.map((e, i) => (i === idx ? normalized : e))
      : [...existing, normalized]
  saveExperiments(next)
  return normalized
}

export function deleteExperiment(id: string): void {
  saveExperiments(getExperiments().filter((e) => e.id !== id))
}

export function createEmptyExperiment(partial?: Partial<Experiment>): Experiment {
  const now = new Date().toISOString()
  const start = partial?.start_date ?? formatDate(new Date())
  const duration = partial?.duration ?? { mode: 'observations', observations: 14 }
  const protocol = partial?.protocol ?? 'randomized_crossover'
  const schedule =
    partial?.schedule ??
    generateExperimentSchedule({
      protocol,
      duration,
      startDate: start,
    })
  return {
    id: partial?.id ?? generateId(),
    title: partial?.title?.trim() || 'New experiment',
    cause: partial?.cause ?? '',
    effect: partial?.effect ?? '',
    intervention: partial?.intervention ?? '',
    control: partial?.control ?? '',
    primary_metric_key: partial?.primary_metric_key ?? ('custom:outcome' as MetricKey),
    secondary_metric_keys: partial?.secondary_metric_keys ?? [],
    metric_associate_prior_day: partial?.metric_associate_prior_day ?? [],
    confounders: partial?.confounders ?? [],
    confounder_logs: partial?.confounder_logs ?? [],
    confounder_log_surfaces: partial?.confounder_log_surfaces ?? ['home_log', 'shutdown'],
    protocol,
    duration,
    start_date: start,
    status: partial?.status ?? 'draft',
    schedule,
    adherence: partial?.adherence ?? [],
    created_at: partial?.created_at ?? now,
    updated_at: now,
  }
}

export function experimentQuestionLabel(experiment: Pick<Experiment, 'cause' | 'effect'>): string {
  const cause = experiment.cause.trim() || '…'
  const effect = experiment.effect.trim() || '…'
  return `Does ${cause} cause ${effect}?`
}

/** Prefer custom title; fall back to the Does ___ cause ___? question. */
export function experimentDisplayTitle(
  experiment: Pick<Experiment, 'title' | 'cause' | 'effect'>,
): string {
  const title = experiment.title?.trim()
  if (title && title !== 'New experiment' && title !== 'Untitled experiment') return title
  return experimentQuestionLabel(experiment)
}

export function protocolLabel(protocol: ExperimentProtocol): string {
  return EXPERIMENT_PROTOCOLS.find((p) => p.id === protocol)?.label ?? protocol
}

export function armLabel(
  arm: ExperimentArm,
  experiment: Pick<Experiment, 'intervention' | 'control'>,
): string {
  if (arm === 'A') return experiment.intervention.trim() || 'Intervention'
  return experiment.control.trim() || 'Control'
}

/** Inclusive day count for a duration config. */
export function resolveExperimentDayCount(
  duration: ExperimentDuration,
  startDate: string,
): number {
  if (duration.mode === 'end_date' && duration.end_date) {
    const start = parseISO(`${startDate}T12:00:00`)
    const end = parseISO(`${duration.end_date}T12:00:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 14
    return (
      Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    )
  }
  return Math.max(2, Math.round(duration.observations || 14))
}

function datesFromStart(startDate: string, count: number): string[] {
  const start = parseISO(`${startDate}T12:00:00`)
  const dates: string[] = []
  for (let i = 0; i < count; i++) {
    dates.push(formatDate(addDays(start, i)))
  }
  return dates
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Build day → arm assignments. A = intervention, B = control.
 * Default lifestyle protocol: randomized crossover (balanced shuffle).
 */
export function generateExperimentSchedule(opts: {
  protocol: ExperimentProtocol
  duration: ExperimentDuration
  startDate: string
}): ExperimentScheduleDay[] {
  const count = resolveExperimentDayCount(opts.duration, opts.startDate)
  const dates = datesFromStart(opts.startDate, count)
  const arms: ExperimentArm[] = new Array(count)

  switch (opts.protocol) {
    case 'before_after': {
      const mid = Math.floor(count / 2)
      for (let i = 0; i < count; i++) arms[i] = i < mid ? 'B' : 'A'
      break
    }
    case 'abab': {
      const q = Math.max(1, Math.floor(count / 4))
      for (let i = 0; i < count; i++) {
        const phase = Math.min(3, Math.floor(i / q))
        arms[i] = phase % 2 === 0 ? 'A' : 'B'
      }
      break
    }
    case 'repeated_crossover': {
      for (let i = 0; i < count; i++) arms[i] = i % 2 === 0 ? 'A' : 'B'
      break
    }
    case 'randomized_ab': {
      for (let i = 0; i < count; i++) arms[i] = Math.random() < 0.5 ? 'A' : 'B'
      break
    }
    case 'randomized_crossover':
    default: {
      const aCount = Math.ceil(count / 2)
      for (let i = 0; i < count; i++) arms[i] = i < aCount ? 'A' : 'B'
      shuffleInPlace(arms)
      break
    }
  }

  return dates.map((date, i) => ({ date, arm: arms[i]! }))
}

export function todayArm(
  experiment: Experiment,
  today: string = formatDate(new Date()),
): ExperimentScheduleDay | null {
  return experiment.schedule.find((d) => d.date === today) ?? null
}

export function isExperimentScheduledDay(experiment: Experiment, date: string): boolean {
  return experiment.schedule.some((d) => d.date === date)
}

/** null = not answered yet */
export function getAdherenceForDate(experiment: Experiment, date: string): boolean | null {
  const entry = experiment.adherence.find((e) => e.date === date)
  return entry ? entry.followed : null
}

export function experimentNeedsAdherencePrompt(experiment: Experiment, date: string): boolean {
  if (experiment.status !== 'running') return false
  if (!isExperimentScheduledDay(experiment, date)) return false
  return getAdherenceForDate(experiment, date) === null
}

/** Running experiments on this date that need the daily log step (adherence and/or confounders). */
export function experimentsNeedingDailyLogStep(
  surface: ExperimentConfounderLogSurface,
  date: string = formatDate(new Date()),
): Experiment[] {
  return getExperiments().filter((experiment) => {
    if (experiment.status !== 'running') return false
    if (!isExperimentScheduledDay(experiment, date)) return false
    const needsAdherence = experimentNeedsAdherencePrompt(experiment, date)
    const needsConfounders =
      experiment.confounders.length > 0 &&
      experiment.confounder_log_surfaces.includes(surface)
    return needsAdherence || needsConfounders
  })
}

export function setExperimentAdherence(
  experiment: Experiment,
  date: string,
  followed: boolean,
): Experiment {
  const rest = experiment.adherence.filter((e) => e.date !== date)
  return {
    ...experiment,
    adherence: [...rest, { date, followed }],
    updated_at: new Date().toISOString(),
  }
}

export function getConfounderTicksForDate(
  experiment: Experiment,
  date: string,
): Record<string, boolean> {
  return experiment.confounder_logs.find((e) => e.date === date)?.ticks ?? {}
}

export function setExperimentConfounderTick(
  experiment: Experiment,
  date: string,
  confounderId: string,
  present: boolean,
): Experiment {
  const existing = experiment.confounder_logs.find((e) => e.date === date)
  const ticks = { ...(existing?.ticks ?? {}) }
  if (present) ticks[confounderId] = true
  else delete ticks[confounderId]
  const rest = experiment.confounder_logs.filter((e) => e.date !== date)
  const nextLogs =
    Object.keys(ticks).length === 0 ? rest : [...rest, { date, ticks }]
  return {
    ...experiment,
    confounder_logs: nextLogs,
    updated_at: new Date().toISOString(),
  }
}

export function dayHasControlledConfounder(
  experiment: Experiment,
  date: string,
  controlIds: string[],
): boolean {
  if (controlIds.length === 0) return false
  const ticks = getConfounderTicksForDate(experiment, date)
  return controlIds.some((id) => ticks[id])
}

export function experimentsNeedingConfounderLog(
  surface: ExperimentConfounderLogSurface,
  date: string = formatDate(new Date()),
): Experiment[] {
  return experimentsNeedingDailyLogStep(surface, date).filter(
    (experiment) =>
      experiment.confounders.length > 0 &&
      experiment.confounder_log_surfaces.includes(surface),
  )
}

export function createConfounder(label: string): ExperimentConfounder {
  return { id: generateId(), label: label.trim() }
}

/** True when a reading logged on date D should be credited to the prior schedule day's arm. */
export function metricAssociatesPriorDay(
  experiment: Pick<Experiment, 'metric_associate_prior_day'>,
  metricKey: MetricKey,
): boolean {
  return experiment.metric_associate_prior_day.includes(metricKey)
}

/** Calendar date to read the metric for a given schedule day (may be the next day). */
export function logDateForScheduleDay(
  scheduleDate: string,
  metricKey: MetricKey,
  experiment: Pick<Experiment, 'metric_associate_prior_day'>,
): string {
  if (metricAssociatesPriorDay(experiment, metricKey)) {
    return addDaysToDateString(scheduleDate, 1)
  }
  return scheduleDate
}

export interface ExperimentArmStats {
  arm: ExperimentArm
  n: number
  mean: number | null
  values: number[]
}

export interface ExperimentResults {
  metricKey: MetricKey
  armA: ExperimentArmStats
  armB: ExperimentArmStats
  delta: number | null
  /** Enough readings on both arms to show a comparison. */
  ready: boolean
  /** Days dropped because a controlled confounder was present. */
  excludedConfounderDays: number
  /** Days dropped because the day was not marked completed. */
  excludedUnconfirmedDays: number
}

function readingForDate(
  metricKey: MetricKey,
  date: string,
  logs: DailyLog[],
  workouts: Workout[],
): number | null {
  const log = logs.find((l) => l.date === date)
  if (metricKey.startsWith('custom:')) {
    const value = log?.custom_metrics?.[metricKey]
    if (value == null || !Number.isFinite(value)) return null
    return value
  }
  if (metricKey === 'weight') {
    if (log?.weight == null || !Number.isFinite(log.weight)) return null
    return log.weight
  }
  const value = getMetricValue(metricKey, log, workouts, date)
  // Treat exact 0 with no log as missing for sparse metrics
  if (!log && !metricKey.startsWith('workout_') && value === 0) return null
  if (metricKey.startsWith('workout_') && value === 0) {
    const hasWorkout = workouts.some((w) => (w.date ?? '').slice(0, 10) === date)
    if (!hasWorkout) return null
  }
  return value
}

export function computeExperimentResults(
  experiment: Experiment,
  logs: DailyLog[],
  workouts: Workout[],
  metricKey: MetricKey = experiment.primary_metric_key,
  /** Confounder ids to exclude from the analysis when present that day. */
  controlConfounderIds: string[] = [],
): ExperimentResults {
  const valuesA: number[] = []
  const valuesB: number[] = []
  let excludedConfounderDays = 0
  let excludedUnconfirmedDays = 0

  for (const day of experiment.schedule) {
    if (dayHasControlledConfounder(experiment, day.date, controlConfounderIds)) {
      excludedConfounderDays++
      continue
    }
    if (getAdherenceForDate(experiment, day.date) !== true) {
      excludedUnconfirmedDays++
      continue
    }
    const logDate = logDateForScheduleDay(day.date, metricKey, experiment)
    const value = readingForDate(metricKey, logDate, logs, workouts)
    if (value == null || !Number.isFinite(value)) continue
    if (day.arm === 'A') valuesA.push(value)
    else valuesB.push(value)
  }

  const mean = (values: number[]) =>
    values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length

  const meanA = mean(valuesA)
  const meanB = mean(valuesB)
  const delta = meanA != null && meanB != null ? meanA - meanB : null

  return {
    metricKey,
    armA: { arm: 'A', n: valuesA.length, mean: meanA, values: valuesA },
    armB: { arm: 'B', n: valuesB.length, mean: meanB, values: valuesB },
    delta,
    ready: valuesA.length > 0 && valuesB.length > 0,
    excludedConfounderDays,
    excludedUnconfirmedDays,
  }
}

export function formatProtocolShort(protocol: ExperimentProtocol): string {
  switch (protocol) {
    case 'randomized_crossover':
      return 'Crossover'
    case 'randomized_ab':
      return 'A/B'
    case 'abab':
      return 'ABAB'
    case 'before_after':
      return 'Before/after'
    case 'repeated_crossover':
      return 'Repeat ×'
    default:
      return protocol
  }
}

void ALL_SURFACES
