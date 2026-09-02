import {
  cacheHabitifyJournal,
  getHabitifyApiKey,
  getHabitifyHabitCatalog,
  saveHabitifyHabitCatalog,
  type HabitifyHabitSummary,
  type HabitifyJournalCacheEntry,
} from '@/lib/habitifyStore'

const API_BASE = 'https://api.habitify.me/v2'

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

function authHeaders(apiKey: string): HeadersInit {
  return {
    'X-API-Key': apiKey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
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

async function habitifyFetch<T>(
  path: string,
  init?: RequestInit & { apiKey?: string },
): Promise<T> {
  const apiKey = init?.apiKey ?? getHabitifyApiKey()
  if (!apiKey) throw new HabitifyApiError('Habitify is not connected', 401)

  const { apiKey: _apiKey, ...requestInit } = init ?? {}
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...requestInit,
      headers: {
        ...authHeaders(apiKey),
        ...(requestInit.headers ?? {}),
      },
    })
  } catch {
    throw new HabitifyApiError(
      'Could not reach Habitify. Check your connection and try again.',
      0,
    )
  }

  if (!res.ok) {
    let detail = res.statusText || 'Request failed'
    if (res.status === 401 || res.status === 403) {
      detail =
        'Invalid Habitify API key. Generate a new V2 key in Habitify → Settings → API Credentials.'
    } else {
      try {
        const body = (await res.json()) as {
          message?: string
          error?: string
          error_description?: string
        }
        detail = body.message || body.error_description || body.error || detail
      } catch {
        /* ignore */
      }
    }
    throw new HabitifyApiError(detail, res.status)
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text || text === 'null') return undefined as T
  return JSON.parse(text) as T
}

/** Validate a key by listing habits. */
export async function verifyHabitifyApiKey(apiKey: string): Promise<void> {
  await habitifyFetch<HabitifyListResponse<unknown>>('/habits?limit=1', {
    apiKey: apiKey.trim(),
    method: 'GET',
  })
}

export async function fetchHabitifyJournal(date: string): Promise<HabitifyJournalEntry[]> {
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

export async function fetchHabitifyHabits(): Promise<HabitifyHabitSummary[]> {
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

  if (habits.length === 0) return getHabitifyHabitCatalog()
  return saveHabitifyHabitCatalog([...getHabitifyHabitCatalog(), ...habits])
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
