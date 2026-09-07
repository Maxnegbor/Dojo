import { addDays, parseISO } from 'date-fns'
import { formatDate } from '@/lib/utils'
import {
  cacheWhoopDay,
  getWhoopCredentials,
  getWhoopTokens,
  saveWhoopProfile,
  saveWhoopTokens,
  WHOOP_DATA_SCOPES,
  WHOOP_SCOPES,
  whoopRedirectUri,
  type WhoopCredentials,
  type WhoopDaySnapshot,
  type WhoopProfile,
  type WhoopTokens,
  type WhoopWorkoutSummary,
} from '@/lib/whoopStore'

const TOKEN_URL = '/api/whoop/token'
const API_BASE = '/api/whoop/proxy'

const TOKEN_SKEW_MS = 60_000

export class WhoopApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'WhoopApiError'
    this.status = status
  }
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

interface CollectionResponse<T> {
  records?: T[]
  next_token?: string | null
}

interface WhoopProfileRaw {
  user_id?: number
  email?: string
  first_name?: string
  last_name?: string
}

interface WhoopRecoveryRaw {
  cycle_id?: number
  sleep_id?: string
  score_state?: string
  score?: {
    recovery_score?: number
    resting_heart_rate?: number
    hrv_rmssd_milli?: number
  } | null
}

interface WhoopCycleRaw {
  id?: number
  start?: string
  end?: string | null
  timezone_offset?: string
  score_state?: string
  score?: {
    strain?: number
    kilojoule?: number
  } | null
}

interface WhoopSleepRaw {
  id?: string
  cycle_id?: number
  start?: string
  end?: string | null
  timezone_offset?: string
  nap?: boolean
  score_state?: string
  score?: {
    sleep_performance_percentage?: number
    sleep_efficiency_percentage?: number
    sleep_consistency_percentage?: number
    stage_summary?: {
      total_in_bed_time_milli?: number
      total_awake_time_milli?: number
      total_light_sleep_time_milli?: number
      total_slow_wave_sleep_time_milli?: number
      total_rem_sleep_time_milli?: number
    } | null
  } | null
}

interface WhoopWorkoutRaw {
  id?: string
  start?: string
  end?: string | null
  timezone_offset?: string
  sport_name?: string
  score?: { strain?: number } | null
}

let refreshInFlight: Promise<WhoopTokens> | null = null

function nestedMessage(value: unknown, depth = 0): string | null {
  if (depth > 4) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  for (const key of ['error_description', 'message', 'error', 'detail']) {
    const inner = nestedMessage(obj[key], depth + 1)
    if (inner) return inner
  }
  return null
}

function errorMessage(payload: unknown, fallback: string, status: number): string {
  const extracted = nestedMessage(payload)
  if (extracted) return extracted
  if (status === 401) return 'WHOOP authorization expired. Reconnect in Settings → Integrations.'
  if (status === 403) {
    return 'WHOOP denied access. In the WHOOP Developer Dashboard, enable recovery, sleep, cycle, workout, and profile scopes, then reconnect.'
  }
  if (status === 429) return 'WHOOP rate limit hit. Wait a moment and try again.'
  return status ? `${fallback} (${status})` : fallback
}

function missingWhoopDataScopes(scope: string): string[] {
  const granted = new Set(scope.split(/[\s+]+/).filter(Boolean))
  if (granted.size === 0) return []
  return WHOOP_DATA_SCOPES.filter((item) => !granted.has(item))
}

async function postToken(params: URLSearchParams): Promise<WhoopTokens> {
  let res: Response
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
  } catch {
    throw new WhoopApiError('Could not reach WHOOP. Check your connection and try again.', 0)
  }

  const text = await res.text()
  let payload: TokenResponse | null = null
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as TokenResponse
    } catch {
      payload = { error_description: text.trim() }
    }
  }

  if (!res.ok) {
    throw new WhoopApiError(
      errorMessage(payload, 'WHOOP token request failed', res.status),
      res.status,
    )
  }

  const accessToken = payload?.access_token?.trim()
  const refreshToken = payload?.refresh_token?.trim()
  const expiresIn = typeof payload?.expires_in === 'number' ? payload.expires_in : 3600
  if (!accessToken || !refreshToken) {
    throw new WhoopApiError('WHOOP did not return refresh tokens. Include the offline scope.', 502)
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
    scope: typeof payload?.scope === 'string' ? payload.scope : WHOOP_SCOPES,
  }
}

export function createWhoopOAuthState(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

export function buildWhoopAuthorizeUrl(input: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: WHOOP_SCOPES,
    state: input.state,
  })
  return `https://api.prod.whoop.com/oauth/oauth2/auth?${params.toString().replace(/\+/g, '%20')}`
}

export async function exchangeWhoopCode(input: {
  code: string
  credentials?: WhoopCredentials
  redirectUri?: string
}): Promise<WhoopTokens> {
  const credentials = input.credentials ?? getWhoopCredentials()
  if (!credentials) throw new WhoopApiError('WHOOP app credentials are missing', 401)
  const tokens = await postToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: input.redirectUri ?? whoopRedirectUri(),
    }),
  )
  const missing = missingWhoopDataScopes(tokens.scope)
  if (missing.length > 0) {
    throw new WhoopApiError(
      `WHOOP did not grant ${missing.join(', ')}. Edit your app in the WHOOP Developer Dashboard, enable those scopes, add the redirect URL from Settings, then reconnect.`,
      403,
    )
  }
  return saveWhoopTokens(tokens)
}

async function refreshWhoopTokens(): Promise<WhoopTokens> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    const credentials = getWhoopCredentials()
    const tokens = getWhoopTokens()
    if (!credentials || !tokens) {
      throw new WhoopApiError('WHOOP is not connected', 401)
    }
    const next = await postToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        scope: 'offline',
      }),
    )
    return saveWhoopTokens(next)
  })()
  try {
    return await refreshInFlight
  } finally {
    refreshInFlight = null
  }
}

async function validAccessToken(): Promise<string> {
  const tokens = getWhoopTokens()
  if (!tokens) throw new WhoopApiError('WHOOP is not connected', 401)
  if (tokens.expiresAt - TOKEN_SKEW_MS > Date.now()) return tokens.accessToken
  const refreshed = await refreshWhoopTokens()
  return refreshed.accessToken
}

function whoopProxyUrl(path: string): string {
  const [pathname, qs = ''] = path.replace(/^\//, '').split('?')
  const params = new URLSearchParams(qs)
  params.set('path', pathname)
  return `${API_BASE}?${params.toString()}`
}

async function whoopFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const run = async (accessToken: string) => {
    let res: Response
    try {
      res = await fetch(whoopProxyUrl(path), {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          ...(init?.headers ?? {}),
        },
      })
    } catch {
      throw new WhoopApiError('Could not reach WHOOP. Check your connection and try again.', 0)
    }
    return res
  }

  let accessToken = await validAccessToken()
  let res = await run(accessToken)
  if (res.status === 401) {
    accessToken = (await refreshWhoopTokens()).accessToken
    res = await run(accessToken)
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let payload: unknown = null
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      payload = text.trim()
    }
  }

  if (!res.ok) {
    throw new WhoopApiError(errorMessage(payload, 'WHOOP request failed', res.status), res.status)
  }
  return (payload ?? undefined) as T
}

export async function revokeWhoopAccess(): Promise<void> {
  try {
    await whoopFetch('v2/user/access', { method: 'DELETE' })
  } catch (err) {
    if (err instanceof WhoopApiError && (err.status === 401 || err.status === 404)) return
    throw err
  }
}

export async function fetchWhoopProfile(): Promise<WhoopProfile> {
  const raw = await whoopFetch<WhoopProfileRaw>('v2/user/profile/basic')
  const profile: WhoopProfile = {
    userId: raw.user_id ?? 0,
    firstName: raw.first_name?.trim() || 'WHOOP',
    lastName: raw.last_name?.trim() || '',
    email: typeof raw.email === 'string' ? raw.email : null,
  }
  return saveWhoopProfile(profile)
}

function collectionPath(path: string, start: string, end: string): string {
  const params = new URLSearchParams({
    limit: '25',
    start,
    end,
  })
  return `${path}?${params.toString()}`
}

async function fetchCollection<T>(path: string, start: string, end: string): Promise<T[]> {
  const records: T[] = []
  let nextPath: string | null = collectionPath(path, start, end)
  while (nextPath) {
    const page: CollectionResponse<T> = await whoopFetch(nextPath)
    records.push(...(page.records ?? []))
    const token: string | null | undefined = page.next_token
    nextPath = token
      ? `${collectionPath(path, start, end)}&nextToken=${encodeURIComponent(token)}`
      : null
    if (records.length > 80) break
  }
  return records
}

function localDateFromWhoop(iso: string | null | undefined, tzOffset?: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  if (tzOffset && /^[+-]\d{2}:\d{2}$/.test(tzOffset)) {
    return new Date(date.getTime() + parseOffsetMs(tzOffset)).toISOString().slice(0, 10)
  }
  return formatDate(date)
}

function parseOffsetMs(offset: string): number {
  const sign = offset.startsWith('-') ? -1 : 1
  const [hours, minutes] = offset.slice(1).split(':').map(Number)
  return sign * ((hours || 0) * 60 + (minutes || 0)) * 60 * 1000
}

function milliToMinutes(ms: number | null | undefined): number | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null
  return Math.round(ms / 60000)
}

function clockMinutesFromWhoop(iso: string | null | undefined, tzOffset?: string | null): number | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  if (tzOffset && /^[+-]\d{2}:\d{2}$/.test(tzOffset)) {
    const local = new Date(date.getTime() + parseOffsetMs(tzOffset))
    return local.getUTCHours() * 60 + local.getUTCMinutes()
  }
  return date.getHours() * 60 + date.getMinutes()
}

function sleepMinutesFrom(sleep: WhoopSleepRaw): number | null {
  const stages = sleep.score?.stage_summary
  if (!stages) return null
  const light = stages.total_light_sleep_time_milli ?? 0
  const sws = stages.total_slow_wave_sleep_time_milli ?? 0
  const rem = stages.total_rem_sleep_time_milli ?? 0
  const total = light + sws + rem
  return total > 0 ? milliToMinutes(total) : milliToMinutes(stages.total_in_bed_time_milli)
}

function emptyDay(date: string): WhoopDaySnapshot {
  return {
    date,
    recoveryScore: null,
    restingHr: null,
    hrvMs: null,
    strain: null,
    kilojoule: null,
    sleepPerformance: null,
    sleepEfficiency: null,
    sleepConsistency: null,
    sleepMinutes: null,
    inBedMinutes: null,
    bedtimeMinutes: null,
    wakeMinutes: null,
    lightSleepMinutes: null,
    swsMinutes: null,
    remMinutes: null,
    awakeMinutes: null,
    workouts: [],
    fetchedAt: Date.now(),
  }
}

function pickCycleForDate(cycles: WhoopCycleRaw[], date: string): WhoopCycleRaw | null {
  const dated = cycles
    .map((cycle) => {
      const startDate = localDateFromWhoop(cycle.start, cycle.timezone_offset)
      const endDate = localDateFromWhoop(cycle.end, cycle.timezone_offset)
      const startMs = cycle.start ? new Date(cycle.start).getTime() : 0
      return { cycle, startDate, endDate, startMs }
    })
    .filter((row) => Number.isFinite(row.startMs))

  const startedToday = dated
    .filter((row) => row.startDate === date)
    .sort((a, b) => b.startMs - a.startMs)
  const startedTodayScored = startedToday.find((row) => row.cycle.score?.strain != null)
  if (startedTodayScored) return startedTodayScored.cycle
  if (startedToday[0]) return startedToday[0].cycle

  const covering = dated
    .filter((row) => {
      if (!row.startDate || row.startDate > date) return false
      if (!row.endDate) return true
      return row.endDate > date
    })
    .sort((a, b) => b.startMs - a.startMs)
  const coveringScored = covering.find((row) => row.cycle.score?.strain != null)
  return coveringScored?.cycle ?? covering[0]?.cycle ?? null
}

export async function syncWhoopDay(date: string): Promise<WhoopDaySnapshot> {
  const dayStart = parseISO(`${date}T00:00:00`)
  const start = addDays(dayStart, -1).toISOString()
  const end = addDays(dayStart, 2).toISOString()

  const [recoveries, sleeps, cycles, workouts] = await Promise.all([
    fetchCollection<WhoopRecoveryRaw>('v2/recovery', start, end),
    fetchCollection<WhoopSleepRaw>('v2/activity/sleep', start, end),
    fetchCollection<WhoopCycleRaw>('v2/cycle', start, end),
    fetchCollection<WhoopWorkoutRaw>('v2/activity/workout', start, end),
  ])

  const day = emptyDay(date)

  const mainSleeps = sleeps.filter((sleep) => sleep.nap !== true)
  const sleepForDay =
    mainSleeps.find((sleep) => localDateFromWhoop(sleep.end, sleep.timezone_offset) === date) ??
    mainSleeps.find((sleep) => localDateFromWhoop(sleep.start, sleep.timezone_offset) === date)

  if (sleepForDay) {
    day.sleepPerformance = sleepForDay.score?.sleep_performance_percentage ?? null
    day.sleepEfficiency = sleepForDay.score?.sleep_efficiency_percentage ?? null
    day.sleepConsistency = sleepForDay.score?.sleep_consistency_percentage ?? null
    day.sleepMinutes = sleepMinutesFrom(sleepForDay)
    day.inBedMinutes = milliToMinutes(sleepForDay.score?.stage_summary?.total_in_bed_time_milli)
    day.bedtimeMinutes = clockMinutesFromWhoop(sleepForDay.start, sleepForDay.timezone_offset)
    day.wakeMinutes = clockMinutesFromWhoop(sleepForDay.end, sleepForDay.timezone_offset)
    day.lightSleepMinutes = milliToMinutes(sleepForDay.score?.stage_summary?.total_light_sleep_time_milli)
    day.swsMinutes = milliToMinutes(sleepForDay.score?.stage_summary?.total_slow_wave_sleep_time_milli)
    day.remMinutes = milliToMinutes(sleepForDay.score?.stage_summary?.total_rem_sleep_time_milli)
    day.awakeMinutes = milliToMinutes(sleepForDay.score?.stage_summary?.total_awake_time_milli)
    const recovery =
      recoveries.find((row) => row.sleep_id && row.sleep_id === sleepForDay.id) ??
      recoveries.find((row) => row.cycle_id != null && row.cycle_id === sleepForDay.cycle_id)
    if (recovery?.score) {
      day.recoveryScore = recovery.score.recovery_score ?? null
      day.restingHr = recovery.score.resting_heart_rate ?? null
      day.hrvMs = recovery.score.hrv_rmssd_milli ?? null
    }
  }

  const cycleForDay = pickCycleForDate(cycles, date)

  day.workouts = workouts
    .map((workout): WhoopWorkoutSummary | null => {
      if (!workout.id || !workout.start) return null
      const local =
        localDateFromWhoop(workout.start, workout.timezone_offset) ??
        localDateFromWhoop(workout.start)
      if (local !== date) return null
      return {
        id: workout.id,
        sportName: workout.sport_name?.trim() || 'Workout',
        strain: workout.score?.strain ?? null,
        start: workout.start,
        end: workout.end ?? null,
      }
    })
    .filter((row): row is WhoopWorkoutSummary => row != null)

  if (cycleForDay?.score?.strain != null) {
    day.strain = cycleForDay.score.strain
  } else {
    const workoutStrain = day.workouts
      .map((workout) => workout.strain)
      .filter((value): value is number => value != null)
    if (workoutStrain.length > 0) {
      day.strain = workoutStrain.reduce((sum, value) => sum + value, 0)
    }
  }
  day.kilojoule = cycleForDay?.score?.kilojoule ?? null

  cacheWhoopDay(day)
  return day
}
