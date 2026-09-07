import { storageGetItem, storageRemoveItem, storageSetItem } from '@/lib/userStorage'

const CREDENTIALS_KEY = 'personal-os-whoop-credentials'
const TOKENS_KEY = 'personal-os-whoop-tokens'
const PROFILE_KEY = 'personal-os-whoop-profile'
const DAYS_KEY = 'personal-os-whoop-days'
const HOME_COLLAPSED_KEY = 'personal-os-whoop-home-collapsed'

export const WHOOP_CHANGED = 'personal-os-whoop-changed'
export const WHOOP_DAYS_CHANGED = 'personal-os-whoop-days-changed'

export const WHOOP_OAUTH_STATE_KEY = 'personal-os-whoop-oauth-state'
export const WHOOP_OAUTH_RESULT_KEY = 'personal-os-whoop-oauth-result'

export const WHOOP_CATEGORY_ID = 'whoop'

export const WHOOP_METRIC_RECOVERY = 'whoop_recovery'
export const WHOOP_METRIC_SLEEP = 'whoop_sleep'
export const WHOOP_METRIC_STRAIN = 'whoop_strain'

export const WHOOP_PULSE_METRICS = [
  WHOOP_METRIC_RECOVERY,
  WHOOP_METRIC_SLEEP,
  WHOOP_METRIC_STRAIN,
] as const

export type WhoopPulseMetricKey = (typeof WHOOP_PULSE_METRICS)[number]

export const WHOOP_SCOPES = [
  'offline',
  'read:profile',
  'read:recovery',
  'read:cycles',
  'read:sleep',
  'read:workout',
  'read:body_measurement',
].join(' ')

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
  spo2: number | null
  skinTempC: number | null
  strain: number | null
  kilojoule: number | null
  sleepPerformance: number | null
  sleepEfficiency: number | null
  sleepConsistency: number | null
  sleepMinutes: number | null
  inBedMinutes: number | null
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
    spo2: num(obj.spo2),
    skinTempC: num(obj.skinTempC),
    strain: num(obj.strain),
    kilojoule: num(obj.kilojoule),
    sleepPerformance: num(obj.sleepPerformance),
    sleepEfficiency: num(obj.sleepEfficiency),
    sleepConsistency: num(obj.sleepConsistency),
    sleepMinutes: num(obj.sleepMinutes),
    inBedMinutes: num(obj.inBedMinutes),
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
  return (
    key === WHOOP_METRIC_RECOVERY || key === WHOOP_METRIC_SLEEP || key === WHOOP_METRIC_STRAIN
  )
}

export function getWhoopPulseValue(metricKey: string, date: string): number | null {
  const day = getWhoopDay(date)
  if (!day) return null
  if (metricKey === WHOOP_METRIC_RECOVERY) return day.recoveryScore
  if (metricKey === WHOOP_METRIC_SLEEP) return day.sleepPerformance
  if (metricKey === WHOOP_METRIC_STRAIN) return day.strain
  return null
}

export function formatWhoopPulseDetail(metricKey: string, date: string): string {
  const day = getWhoopDay(date)
  if (!day) return 'Not synced'
  if (metricKey === WHOOP_METRIC_RECOVERY) {
    return day.recoveryScore == null ? 'Pending' : `${Math.round(day.recoveryScore)}% recovery`
  }
  if (metricKey === WHOOP_METRIC_SLEEP) {
    if (day.sleepPerformance == null) return 'Pending'
    const hours =
      day.sleepMinutes != null ? `${(day.sleepMinutes / 60).toFixed(1)}h` : null
    return hours
      ? `${Math.round(day.sleepPerformance)}% · ${hours}`
      : `${Math.round(day.sleepPerformance)}% sleep`
  }
  if (metricKey === WHOOP_METRIC_STRAIN) {
    return day.strain == null ? 'Pending' : day.strain.toFixed(1)
  }
  return 'Not synced'
}

export function getWhoopPulseRate(metricKey: string, date: string, target: number | null): number {
  const value = getWhoopPulseValue(metricKey, date)
  if (value == null || target == null || target <= 0) return 0
  return Math.min(100, (value / target) * 100)
}

export function isWhoopHomeCollapsed(): boolean {
  try {
    return storageGetItem(HOME_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function setWhoopHomeCollapsed(collapsed: boolean) {
  if (collapsed) storageSetItem(HOME_COLLAPSED_KEY, '1')
  else storageRemoveItem(HOME_COLLAPSED_KEY)
}
