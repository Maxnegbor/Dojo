import { storageGetItem, storageRemoveItem, storageSetItem } from '@/lib/userStorage'

const CREDENTIALS_KEY = 'personal-os-whoop-credentials'
const TOKENS_KEY = 'personal-os-whoop-tokens'
const PROFILE_KEY = 'personal-os-whoop-profile'
const DAYS_KEY = 'personal-os-whoop-days'

export const WHOOP_CHANGED = 'personal-os-whoop-changed'
export const WHOOP_DAYS_CHANGED = 'personal-os-whoop-days-changed'

export const WHOOP_OAUTH_STATE_KEY = 'personal-os-whoop-oauth-state'
export const WHOOP_OAUTH_RESULT_KEY = 'personal-os-whoop-oauth-result'

export const WHOOP_CATEGORY_ID = 'whoop'

export const WHOOP_METRIC_RECOVERY = 'whoop_recovery'
export const WHOOP_METRIC_SLEEP = 'whoop_sleep'
export const WHOOP_METRIC_STRAIN = 'whoop_strain'

export type WhoopMetricGroupId = 'recovery' | 'sleep' | 'strain'
export type WhoopMetricScoring = 'higher' | 'lower' | 'near'

export const WHOOP_METRIC_GROUPS: { id: WhoopMetricGroupId; label: string }[] = [
  { id: 'recovery', label: 'Recovery' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'strain', label: 'Strain' },
]

export interface WhoopMetricDefinition {
  key: `whoop_${string}`
  label: string
  group: WhoopMetricGroupId
  unit: string
  description: string
  defaultTarget: number
  scoring: WhoopMetricScoring
  /** Minutes of slack that still counts as a full hit for `near` scoring. */
  nearWindow?: number
}

export const WHOOP_METRICS: WhoopMetricDefinition[] = [
  {
    key: WHOOP_METRIC_RECOVERY,
    label: 'Recovery score',
    group: 'recovery',
    unit: '%',
    description: 'Recovery score vs your daily target (green is 67+)',
    defaultTarget: 67,
    scoring: 'higher',
  },
  {
    key: 'whoop_hrv',
    label: 'HRV',
    group: 'recovery',
    unit: 'ms',
    description: 'Heart rate variability (RMSSD)',
    defaultTarget: 50,
    scoring: 'higher',
  },
  {
    key: 'whoop_rhr',
    label: 'Resting HR',
    group: 'recovery',
    unit: 'bpm',
    description: 'Resting heart rate — lower is better',
    defaultTarget: 55,
    scoring: 'lower',
  },
  {
    key: WHOOP_METRIC_SLEEP,
    label: 'Sleep performance',
    group: 'sleep',
    unit: '%',
    description: 'Sleep performance vs your daily target',
    defaultTarget: 85,
    scoring: 'higher',
  },
  {
    key: 'whoop_sleep_efficiency',
    label: 'Sleep efficiency',
    group: 'sleep',
    unit: '%',
    description: 'Percent of time in bed spent asleep',
    defaultTarget: 90,
    scoring: 'higher',
  },
  {
    key: 'whoop_sleep_consistency',
    label: 'Sleep consistency',
    group: 'sleep',
    unit: '%',
    description: 'How regular bedtime and wake time have been',
    defaultTarget: 75,
    scoring: 'higher',
  },
  {
    key: 'whoop_asleep',
    label: 'Asleep',
    group: 'sleep',
    unit: 'min',
    description: 'Time actually asleep',
    defaultTarget: 450,
    scoring: 'higher',
  },
  {
    key: 'whoop_in_bed',
    label: 'Time in bed',
    group: 'sleep',
    unit: 'min',
    description: 'Time from bedtime to wake',
    defaultTarget: 480,
    scoring: 'higher',
  },
  {
    key: 'whoop_bedtime',
    label: 'Bedtime',
    group: 'sleep',
    unit: 'min',
    description: 'Usual bedtime — closest to this time scores highest',
    defaultTarget: 1380,
    scoring: 'near',
    nearWindow: 90,
  },
  {
    key: 'whoop_wake',
    label: 'Wake time',
    group: 'sleep',
    unit: 'min',
    description: 'Usual wake time — closest to this time scores highest',
    defaultTarget: 420,
    scoring: 'near',
    nearWindow: 90,
  },
  {
    key: 'whoop_light',
    label: 'Light sleep',
    group: 'sleep',
    unit: 'min',
    description: 'Light sleep duration',
    defaultTarget: 240,
    scoring: 'higher',
  },
  {
    key: 'whoop_sws',
    label: 'SWS',
    group: 'sleep',
    unit: 'min',
    description: 'Slow-wave (deep) sleep',
    defaultTarget: 90,
    scoring: 'higher',
  },
  {
    key: 'whoop_rem',
    label: 'REM',
    group: 'sleep',
    unit: 'min',
    description: 'REM sleep duration',
    defaultTarget: 90,
    scoring: 'higher',
  },
  {
    key: 'whoop_awake',
    label: 'Awake',
    group: 'sleep',
    unit: 'min',
    description: 'Time awake in bed — lower is better',
    defaultTarget: 30,
    scoring: 'lower',
  },
  {
    key: WHOOP_METRIC_STRAIN,
    label: 'Day strain',
    group: 'strain',
    unit: 'strain',
    description: 'Day strain vs your daily target',
    defaultTarget: 12,
    scoring: 'higher',
  },
  {
    key: 'whoop_kilojoule',
    label: 'Energy',
    group: 'strain',
    unit: 'kJ',
    description: 'Kilojoules expended',
    defaultTarget: 8000,
    scoring: 'higher',
  },
  {
    key: 'whoop_workout_strain',
    label: 'Workout strain',
    group: 'strain',
    unit: 'strain',
    description: 'Total strain from workouts today',
    defaultTarget: 8,
    scoring: 'higher',
  },
]

export const WHOOP_PULSE_METRICS = WHOOP_METRICS.map((metric) => metric.key)

export type WhoopPulseMetricKey = (typeof WHOOP_METRICS)[number]['key']

const WHOOP_METRIC_BY_KEY = new Map(WHOOP_METRICS.map((metric) => [metric.key, metric]))

export function getWhoopMetric(key: string): WhoopMetricDefinition | undefined {
  return WHOOP_METRIC_BY_KEY.get(key as WhoopPulseMetricKey)
}

export function isWhoopClockMetric(key: string): boolean {
  return key === 'whoop_bedtime' || key === 'whoop_wake'
}

/** HH:mm for a native time input. */
export function whoopClockMinutesToTimeValue(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return ''
  const wrap = ((Math.round(minutes) % 1440) + 1440) % 1440
  const hours = Math.floor(wrap / 60)
  const mins = wrap % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/** Parse HH:mm from a time input. Midnight is stored as 1440 so Pulse targets stay > 0. */
export function whoopClockTimeValueToMinutes(raw: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim())
  if (!match) return null
  const hours = Number(match[1])
  const mins = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) {
    return null
  }
  const minutes = hours * 60 + mins
  return minutes === 0 ? 1440 : minutes
}

export const WHOOP_DATA_SCOPES = [
  'read:profile',
  'read:recovery',
  'read:cycles',
  'read:sleep',
  'read:workout',
] as const

export const WHOOP_SCOPES = ['offline', ...WHOOP_DATA_SCOPES, 'read:body_measurement'].join(' ')

export interface WhoopCredentials {
  clientId: string
  clientSecret: string
}

export interface WhoopTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scope: string
}

export interface WhoopProfile {
  userId: number
  firstName: string
  lastName: string
  email: string | null
}

export interface WhoopWorkoutSummary {
  id: string
  sportName: string
  strain: number | null
  start: string
  end: string | null
}

export interface WhoopDaySnapshot {
  date: string
  recoveryScore: number | null
  restingHr: number | null
  hrvMs: number | null
  strain: number | null
  kilojoule: number | null
  sleepPerformance: number | null
  sleepEfficiency: number | null
  sleepConsistency: number | null
  sleepMinutes: number | null
  inBedMinutes: number | null
  bedtimeMinutes: number | null
  wakeMinutes: number | null
  lightSleepMinutes: number | null
  swsMinutes: number | null
  remMinutes: number | null
  awakeMinutes: number | null
  workouts: WhoopWorkoutSummary[]
  fetchedAt: number
}

const DAY_CACHE_DAYS = 45

function notifyChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(WHOOP_CHANGED))
}

function notifyDaysChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(WHOOP_DAYS_CHANGED))
}

function normalizeCredentials(raw: unknown): WhoopCredentials | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as { clientId?: unknown; clientSecret?: unknown }
  const clientId = typeof obj.clientId === 'string' ? obj.clientId.trim() : ''
  const clientSecret = typeof obj.clientSecret === 'string' ? obj.clientSecret.trim() : ''
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

function normalizeTokens(raw: unknown): WhoopTokens | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const accessToken = typeof obj.accessToken === 'string' ? obj.accessToken.trim() : ''
  const refreshToken = typeof obj.refreshToken === 'string' ? obj.refreshToken.trim() : ''
  const expiresAt = typeof obj.expiresAt === 'number' ? obj.expiresAt : Number(obj.expiresAt)
  if (!accessToken || !refreshToken || !Number.isFinite(expiresAt)) return null
  return {
    accessToken,
    refreshToken,
    expiresAt,
    scope: typeof obj.scope === 'string' ? obj.scope : '',
  }
}

function normalizeProfile(raw: unknown): WhoopProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const userId = typeof obj.userId === 'number' ? obj.userId : Number(obj.userId)
  const firstName = typeof obj.firstName === 'string' ? obj.firstName.trim() : ''
  const lastName = typeof obj.lastName === 'string' ? obj.lastName.trim() : ''
  if (!Number.isFinite(userId) || !firstName) return null
  return {
    userId,
    firstName,
    lastName,
    email: typeof obj.email === 'string' ? obj.email : null,
  }
}

function normalizeWorkout(raw: unknown): WhoopWorkoutSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id : ''
  const sportName = typeof obj.sportName === 'string' ? obj.sportName.trim() : ''
  const start = typeof obj.start === 'string' ? obj.start : ''
  if (!id || !start) return null
  return {
    id,
    sportName: sportName || 'Workout',
    strain: typeof obj.strain === 'number' && Number.isFinite(obj.strain) ? obj.strain : null,
    start,
    end: typeof obj.end === 'string' ? obj.end : null,
  }
}

function normalizeDay(raw: unknown): WhoopDaySnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const date = typeof obj.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.date) ? obj.date : ''
  if (!date) return null
  const num = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null
  return {
    date,
    recoveryScore: num(obj.recoveryScore),
    restingHr: num(obj.restingHr),
    hrvMs: num(obj.hrvMs),
    strain: num(obj.strain),
    kilojoule: num(obj.kilojoule),
    sleepPerformance: num(obj.sleepPerformance),
    sleepEfficiency: num(obj.sleepEfficiency),
    sleepConsistency: num(obj.sleepConsistency),
    sleepMinutes: num(obj.sleepMinutes),
    inBedMinutes: num(obj.inBedMinutes),
    bedtimeMinutes: num(obj.bedtimeMinutes),
    wakeMinutes: num(obj.wakeMinutes),
    lightSleepMinutes: num(obj.lightSleepMinutes),
    swsMinutes: num(obj.swsMinutes),
    remMinutes: num(obj.remMinutes),
    awakeMinutes: num(obj.awakeMinutes),
    workouts: Array.isArray(obj.workouts)
      ? obj.workouts.map(normalizeWorkout).filter((w): w is WhoopWorkoutSummary => w != null)
      : [],
    fetchedAt: typeof obj.fetchedAt === 'number' ? obj.fetchedAt : 0,
  }
}

export function whoopRedirectUri(origin = window.location.origin): string {
  return `${origin.replace(/\/$/, '')}/whoop/callback`
}

export function getWhoopCredentials(): WhoopCredentials | null {
  try {
    const raw = storageGetItem(CREDENTIALS_KEY)
    if (!raw) return null
    return normalizeCredentials(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function saveWhoopCredentials(config: WhoopCredentials): WhoopCredentials {
  const next = normalizeCredentials(config)
  if (!next) {
    throw new Error('Enter your WHOOP client ID and client secret')
  }
  storageSetItem(CREDENTIALS_KEY, JSON.stringify(next))
  notifyChanged()
  return next
}

export function getWhoopTokens(): WhoopTokens | null {
  try {
    const raw = storageGetItem(TOKENS_KEY)
    if (!raw) return null
    return normalizeTokens(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function saveWhoopTokens(tokens: WhoopTokens): WhoopTokens {
  const next = normalizeTokens(tokens)
  if (!next) throw new Error('Invalid WHOOP tokens')
  storageSetItem(TOKENS_KEY, JSON.stringify(next))
  notifyChanged()
  return next
}

export function getWhoopProfile(): WhoopProfile | null {
  try {
    const raw = storageGetItem(PROFILE_KEY)
    if (!raw) return null
    return normalizeProfile(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function saveWhoopProfile(profile: WhoopProfile): WhoopProfile {
  const next = normalizeProfile(profile)
  if (!next) throw new Error('Invalid WHOOP profile')
  storageSetItem(PROFILE_KEY, JSON.stringify(next))
  notifyChanged()
  return next
}

function readDayCache(): Record<string, WhoopDaySnapshot> {
  try {
    const raw = storageGetItem(DAYS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, WhoopDaySnapshot> = {}
    for (const [date, value] of Object.entries(parsed as Record<string, unknown>)) {
      const day = normalizeDay({ ...(value as object), date })
      if (day) out[date] = day
    }
    return out
  } catch {
    return {}
  }
}

function pruneDayCache(cache: Record<string, WhoopDaySnapshot>): Record<string, WhoopDaySnapshot> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - DAY_CACHE_DAYS)
  const minDate = cutoff.toISOString().slice(0, 10)
  const next: Record<string, WhoopDaySnapshot> = {}
  for (const [date, day] of Object.entries(cache)) {
    if (date >= minDate) next[date] = day
  }
  return next
}

export function getWhoopDay(date: string): WhoopDaySnapshot | null {
  return readDayCache()[date] ?? null
}

export function cacheWhoopDay(day: WhoopDaySnapshot): void {
  const normalized = normalizeDay(day)
  if (!normalized) return
  const cache = pruneDayCache(readDayCache())
  cache[normalized.date] = normalized
  storageSetItem(DAYS_KEY, JSON.stringify(cache))
  notifyDaysChanged()
}

export function isWhoopConnected(): boolean {
  return getWhoopTokens() != null
}

export function clearWhoopTokens() {
  storageRemoveItem(TOKENS_KEY)
  storageRemoveItem(PROFILE_KEY)
  storageRemoveItem(DAYS_KEY)
  notifyChanged()
  notifyDaysChanged()
}

export function clearWhoopConfig() {
  storageRemoveItem(CREDENTIALS_KEY)
  clearWhoopTokens()
}

export function whoopDisplayName(profile = getWhoopProfile()): string | null {
  if (!profile) return null
  return [profile.firstName, profile.lastName].filter(Boolean).join(' ') || null
}

export function isWhoopPulseMetric(key: string): key is WhoopPulseMetricKey {
  return WHOOP_METRIC_BY_KEY.has(key as WhoopPulseMetricKey)
}

function whoopValueFromDay(metricKey: string, day: WhoopDaySnapshot): number | null {
  switch (metricKey) {
    case WHOOP_METRIC_RECOVERY:
      return day.recoveryScore
    case 'whoop_hrv':
      return day.hrvMs
    case 'whoop_rhr':
      return day.restingHr
    case WHOOP_METRIC_SLEEP:
      return day.sleepPerformance
    case 'whoop_sleep_efficiency':
      return day.sleepEfficiency
    case 'whoop_sleep_consistency':
      return day.sleepConsistency
    case 'whoop_asleep':
      return day.sleepMinutes
    case 'whoop_in_bed':
      return day.inBedMinutes
    case 'whoop_bedtime':
      return day.bedtimeMinutes
    case 'whoop_wake':
      return day.wakeMinutes
    case 'whoop_light':
      return day.lightSleepMinutes
    case 'whoop_sws':
      return day.swsMinutes
    case 'whoop_rem':
      return day.remMinutes
    case 'whoop_awake':
      return day.awakeMinutes
    case WHOOP_METRIC_STRAIN:
      return day.strain
    case 'whoop_kilojoule':
      return day.kilojoule
    case 'whoop_workout_strain': {
      const strains = day.workouts
        .map((workout) => workout.strain)
        .filter((value): value is number => value != null)
      if (strains.length === 0) return null
      return strains.reduce((sum, value) => sum + value, 0)
    }
    default:
      return null
  }
}

export function getWhoopPulseValue(metricKey: string, date: string): number | null {
  const day = getWhoopDay(date)
  if (!day) return null
  return whoopValueFromDay(metricKey, day)
}

function formatClockMinutes(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440
  const hours = Math.floor(wrapped / 60)
  const mins = wrapped % 60
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(mins).padStart(2, '0')} ${period}`
}

function formatDurationMinutes(minutes: number): string {
  const hours = minutes / 60
  if (hours >= 1 && minutes % 60 === 0) return `${hours}h`
  if (hours >= 1) return `${hours.toFixed(1)}h`
  return `${Math.round(minutes)}m`
}

function formatWhoopAmount(metric: WhoopMetricDefinition, value: number): string {
  if (isWhoopClockMetric(metric.key)) {
    return formatClockMinutes(value)
  }
  if (metric.unit === 'min') return formatDurationMinutes(value)
  if (metric.unit === '%') return `${Math.round(value)}%`
  if (metric.unit === 'ms') return `${Math.round(value)} ms`
  if (metric.unit === 'bpm') return `${Math.round(value)} bpm`
  if (metric.unit === 'kJ') return `${Math.round(value)} kJ`
  if (metric.unit === 'strain') {
    return Number.isInteger(value) ? String(value) : value.toFixed(1)
  }
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function formatWhoopPulseDetail(metricKey: string, date: string): string {
  const metric = getWhoopMetric(metricKey)
  const day = getWhoopDay(date)
  if (!metric) return 'Not synced'
  if (!day) return 'Not synced'
  const value = whoopValueFromDay(metricKey, day)
  if (value == null) return 'Pending'
  return formatWhoopAmount(metric, value)
}

function circularMinuteDelta(a: number, b: number): number {
  const wrap = (n: number) => ((n % 1440) + 1440) % 1440
  const delta = Math.abs(wrap(a) - wrap(b))
  return Math.min(delta, 1440 - delta)
}

export function getWhoopPulseRate(metricKey: string, date: string, target: number | null): number {
  const metric = getWhoopMetric(metricKey)
  const value = getWhoopPulseValue(metricKey, date)
  if (value == null || target == null || target <= 0) return 0
  if (!metric) return Math.min(100, (value / target) * 100)

  if (metric.scoring === 'lower') {
    if (value <= 0) return 0
    return Math.min(100, (target / value) * 100)
  }

  if (metric.scoring === 'near') {
    const window = metric.nearWindow ?? 90
    if (window <= 0) return 0
    const delta = isWhoopClockMetric(metric.key)
        ? circularMinuteDelta(value, target)
        : Math.abs(value - target)
    return Math.max(0, Math.min(100, (1 - delta / window) * 100))
  }

  return Math.min(100, (value / target) * 100)
}
