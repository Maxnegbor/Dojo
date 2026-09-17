import {
  cacheHabitifyJournal,
  getHabitifyApiKey,
  getHabitifyHabitCatalog,
  getHabitifyJournalCache,
  isHabitifyCatalogFresh,
  markHabitifyCatalogFetched,
  saveHabitifyHabitCatalog,
  type HabitifyHabitSummary,
  type HabitifyJournalCacheEntry,
} from '@/lib/habitifyStore'

const API_BASE = 'https://api.habitify.me/v2'
const REQUEST_TIMEOUT_MS = 8_000
const MAX_ATTEMPTS = 3
const RETRYABLE_STATUS = new Set([0, 408, 425, 429, 500, 502, 503, 504])

export type HabitifyJournalStatus = 'completed' | 'skipped' | 'failed' | 'inprogress'

export interface HabitifyJournalEntry {
  id: string
  name: string
  status: HabitifyJournalStatus
  colorHex: string | null
  icon: string | null
  type: 'good' | 'bad'
  streakLength: number | null
  progressCurrent: number | null
  progressTarget: number | null
  progressUnit: string | null
}

interface HabitifyJournalEntryRaw {
  id?: string
  name?: string
  status?: string
  colorHex?: string | null
  icon?: string | null
  type?: string
  currentStreak?: { length?: number } | null
  progress?: {
    current?: number
    target?: number
    unit?: string
  } | null
}

interface HabitifyListResponse<T> {
  data?: T[]
  pagination?: { total?: number; limit?: number; offset?: number }
}

export class HabitifyApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'HabitifyApiError'
    this.status = status
  }
}

const inflight = new Map<string, Promise<unknown>>()

function coalesce<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>
  const pending = run().finally(() => {
    if (inflight.get(key) === pending) inflight.delete(key)
  })
  inflight.set(key, pending)
  return pending
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function authHeaders(apiKey: string, hasBody: boolean): HeadersInit {
  const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    Accept: 'application/json',
  }
  if (hasBody) headers['Content-Type'] = 'application/json'
  return headers
}

function normalizeStatus(raw: unknown): HabitifyJournalStatus {
  if (raw === 'completed' || raw === 'skipped' || raw === 'failed' || raw === 'inprogress') {
    return raw
  }
  return 'inprogress'
}

function normalizeJournalEntry(raw: HabitifyJournalEntryRaw): HabitifyJournalEntry | null {
  if (!raw?.id || typeof raw.name !== 'string') return null
  return {
    id: String(raw.id),
    name: raw.name,
    status: normalizeStatus(raw.status),
    colorHex: typeof raw.colorHex === 'string' ? raw.colorHex : null,
    icon: typeof raw.icon === 'string' ? raw.icon : null,
    type: raw.type === 'bad' ? 'bad' : 'good',
    streakLength:
      typeof raw.currentStreak?.length === 'number' ? raw.currentStreak.length : null,
    progressCurrent:
      typeof raw.progress?.current === 'number' ? raw.progress.current : null,
    progressTarget:
      typeof raw.progress?.target === 'number' ? raw.progress.target : null,
    progressUnit: typeof raw.progress?.unit === 'string' ? raw.progress.unit : null,
  }
}

export function journalEntriesFromCache(date: string): HabitifyJournalEntry[] {
  return getHabitifyJournalCache(date).map(cacheToJournalEntry)
}

function cacheToJournalEntry(entry: HabitifyJournalCacheEntry): HabitifyJournalEntry {
  return {
    id: entry.id,
    name: entry.name,
    status: entry.status,
    colorHex: null,
    icon: null,
    type: entry.type,
    streakLength: null,
    progressCurrent: entry.progressCurrent,
    progressTarget: entry.progressTarget,
    progressUnit: null,
  }
}

function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get('Retry-After')
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 12_000)
  }
  const date = Date.parse(raw)
  if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), 12_000)
  return null
}

function backoffMs(attempt: number, retryAfterMs?: number | null): number {
  if (retryAfterMs != null && retryAfterMs > 0) return retryAfterMs
  const base = Math.min(8_000, 350 * 2 ** attempt)
  return base + Math.random() * 250
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status)
}

function describeHabitifyError(status: number, detail: string): string {
  if (status === 401 || status === 403) {
    return 'Invalid Habitify API key. Generate a new V2 key in Habitify → Settings → API Credentials.'
  }
  if (status === 429) {
    return 'Habitify is rate-limiting requests. Wait a moment and try again.'
  }
  if (status === 0 || status === 408) {
    return 'Could not reach Habitify. Check your connection and try again.'
  }
  if (status >= 500) {
    return 'Habitify is having trouble right now. Try again in a moment.'
  }
  const cleaned = detail.trim()
  if (!cleaned || /^request failed$/i.test(cleaned) || cleaned === 'OK' || cleaned === 'error') {
    return status
      ? `Habitify request failed (${status}). Try again.`
      : 'Could not load Habitify habits. Try again.'
  }
  return cleaned
}

async function readErrorDetail(res: Response): Promise<string> {
  const fallback = res.statusText || 'Request failed'
  try {
    const text = await res.text()
    if (!text) return fallback
    try {
      const body = JSON.parse(text) as {
        message?: string
        error?: string
        error_description?: string
      }
      return body.message || body.error_description || body.error || fallback
    } catch {
      return text.slice(0, 180) || fallback
    }
  } catch {
    return fallback
  }
}

async function habitifyFetch<T>(
  path: string,
  init?: RequestInit & { apiKey?: string },
): Promise<T> {
  const apiKey = init?.apiKey ?? getHabitifyApiKey()
  if (!apiKey) throw new HabitifyApiError('Habitify is not connected', 401)

  const { apiKey: _apiKey, ...requestInit } = init ?? {}
  const method = (requestInit.method ?? 'GET').toUpperCase()
  const hasBody = requestInit.body != null && requestInit.body !== ''
  let lastError: HabitifyApiError | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const timeout = new AbortController()
    const timer = window.setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
    const onCallerAbort = () => timeout.abort()
    requestInit.signal?.addEventListener('abort', onCallerAbort)

    let res: Response
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...requestInit,
        method,
        cache: 'no-store',
        signal: timeout.signal,
        headers: {
          ...authHeaders(apiKey, hasBody),
          ...(requestInit.headers ?? {}),
        },
      })
    } catch (err) {
      const aborted =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError')
      if (requestInit.signal?.aborted) {
        throw new HabitifyApiError('Habitify request cancelled', 0)
      }
      lastError = new HabitifyApiError(
        aborted
          ? 'Habitify timed out. Check your connection and try again.'
          : 'Could not reach Habitify. Check your connection and try again.',
        0,
      )
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt))
        continue
      }
      throw lastError
    } finally {
      window.clearTimeout(timer)
      requestInit.signal?.removeEventListener('abort', onCallerAbort)
    }

    if (res.ok) {
      if (res.status === 204) return undefined as T
      const text = await res.text()
      if (!text || text === 'null') return undefined as T
      try {
        return JSON.parse(text) as T
      } catch {
        throw new HabitifyApiError('Habitify returned an invalid response. Try again.', res.status)
      }
    }

    const detail = await readErrorDetail(res)
    lastError = new HabitifyApiError(describeHabitifyError(res.status, detail), res.status)
    if (isRetryableStatus(res.status) && attempt < MAX_ATTEMPTS - 1) {
      await sleep(backoffMs(attempt, parseRetryAfterMs(res)))
      continue
    }
    throw lastError
  }

  throw lastError ?? new HabitifyApiError('Could not load Habitify habits. Try again.', 0)
}

/** Validate a key by listing habits. */
export async function verifyHabitifyApiKey(apiKey: string): Promise<void> {
  await habitifyFetch<HabitifyListResponse<unknown>>('/habits?limit=1', {
    apiKey: apiKey.trim(),
    method: 'GET',
  })
}

export async function fetchHabitifyJournal(
  date: string,
  options?: { force?: boolean },
): Promise<HabitifyJournalEntry[]> {
  if (options?.force) return loadHabitifyJournal(date)
  return coalesce(`journal:${date}`, () => loadHabitifyJournal(date))
}

async function loadHabitifyJournal(date: string): Promise<HabitifyJournalEntry[]> {
  const params = new URLSearchParams({ date })
  const page = await habitifyFetch<HabitifyListResponse<HabitifyJournalEntryRaw>>(
    `/habits/journal?${params.toString()}`,
  )
  const entries: HabitifyJournalEntry[] = []
  for (const row of page?.data ?? []) {
    const entry = normalizeJournalEntry(row)
    if (entry) entries.push(entry)
  }

  const statusRank: Record<HabitifyJournalStatus, number> = {
    inprogress: 0,
    failed: 1,
    skipped: 2,
    completed: 3,
  }

  const sorted = entries.sort((a, b) => {
    const sr = statusRank[a.status] - statusRank[b.status]
    if (sr !== 0) return sr
    return a.name.localeCompare(b.name)
  })
  cacheHabitifyJournal(date, sorted.map(journalToCache))
  return sorted
}

function journalToCache(entry: HabitifyJournalEntry): HabitifyJournalCacheEntry {
  return {
    id: entry.id,
    name: entry.name,
    status: entry.status,
    type: entry.type,
    progressCurrent: entry.progressCurrent,
    progressTarget: entry.progressTarget,
  }
}

export async function fetchHabitifyHabits(
  options?: { force?: boolean },
): Promise<HabitifyHabitSummary[]> {
  if (options?.force) return loadHabitifyHabits(true)
  return coalesce('habits', () => loadHabitifyHabits(false))
}

async function loadHabitifyHabits(force: boolean): Promise<HabitifyHabitSummary[]> {
  if (!force && isHabitifyCatalogFresh()) {
    return getHabitifyHabitCatalog()
  }

  const habits: HabitifyHabitSummary[] = []
  const seen = new Set<string>()
  const limit = 100
  let offset = 0

  while (offset <= 1000) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    const page = await habitifyFetch<HabitifyListResponse<HabitifyJournalEntryRaw>>(
      `/habits?${params.toString()}`,
    )
    const rows = page?.data ?? []
    for (const row of rows) {
      if (!row?.id) continue
      const id = String(row.id)
      if (seen.has(id)) continue
      const name = typeof row.name === 'string' ? row.name.trim() : ''
      if (!name) continue
      seen.add(id)
      habits.push({
        id,
        name,
        type: row.type === 'bad' ? 'bad' : 'good',
      })
    }
    if (rows.length < limit) break
    offset += limit
  }

  markHabitifyCatalogFetched()
  return saveHabitifyHabitCatalog(habits)
}

async function postLogAction(
  habitId: string,
  action: 'complete' | 'failed' | 'skipped' | 'undo',
  targetDate: string,
): Promise<void> {
  await habitifyFetch<unknown>(
    `/habits/${encodeURIComponent(habitId)}/logs/${action}`,
    {
      method: 'POST',
      body: JSON.stringify({ targetDate }),
    },
  )
}

export async function completeHabitifyHabit(
  habitId: string,
  targetDate: string,
): Promise<void> {
  await postLogAction(habitId, 'complete', targetDate)
}

export async function undoHabitifyHabit(habitId: string, targetDate: string): Promise<void> {
  await postLogAction(habitId, 'undo', targetDate)
}

export async function skipHabitifyHabit(habitId: string, targetDate: string): Promise<void> {
  await postLogAction(habitId, 'skipped', targetDate)
}
