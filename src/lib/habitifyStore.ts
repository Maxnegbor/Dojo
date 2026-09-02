import { storageGetItem, storageRemoveItem, storageSetItem } from '@/lib/userStorage'
import type { MetricKey } from '@/types'

const STORAGE_KEY = 'personal-os-habitify'
const HOME_COLLAPSED_KEY = 'personal-os-habitify-home-collapsed'
const CATALOG_KEY = 'personal-os-habitify-habits'
const JOURNAL_KEY = 'personal-os-habitify-journal'
export const HABITIFY_CHANGED = 'personal-os-habitify-changed'
export const HABITIFY_JOURNAL_CHANGED = 'personal-os-habitify-journal-changed'
export const HABITIFY_METRIC_PREFIX = 'habitify_'
export const HABITIFY_CATEGORY_ID = 'habitify'

const JOURNAL_CACHE_DAYS = 120

export type HabitifyCachedStatus = 'completed' | 'skipped' | 'failed' | 'inprogress'

export interface HabitifyHabitSummary {
  id: string
  name: string
  type: 'good' | 'bad'
}

export interface HabitifyJournalCacheEntry {
  id: string
  name: string
  status: HabitifyCachedStatus
  type: 'good' | 'bad'
  progressCurrent: number | null
  progressTarget: number | null
}

export interface HabitifyConfig {
  apiKey: string
}

function normalizeConfig(raw: unknown): HabitifyConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const key = (raw as { apiKey?: unknown }).apiKey
  if (typeof key !== 'string') return null
  const trimmed = key.trim()
  if (!trimmed) return null
  return { apiKey: trimmed }
}

export function getHabitifyConfig(): HabitifyConfig | null {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return null
    return normalizeConfig(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function getHabitifyApiKey(): string | null {
  return getHabitifyConfig()?.apiKey ?? null
}

export function saveHabitifyConfig(config: HabitifyConfig): HabitifyConfig {
  const next = normalizeConfig(config)
  if (!next) {
    clearHabitifyConfig()
    throw new Error('Enter a valid Habitify API key')
  }
  storageSetItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(HABITIFY_CHANGED))
  return next
}

export function clearHabitifyConfig() {
  storageRemoveItem(STORAGE_KEY)
  storageRemoveItem(CATALOG_KEY)
  storageRemoveItem(JOURNAL_KEY)
  window.dispatchEvent(new Event(HABITIFY_CHANGED))
  window.dispatchEvent(new Event(HABITIFY_JOURNAL_CHANGED))
}

export function isHabitifyConnected(): boolean {
  return getHabitifyApiKey() != null
}

export function habitifyMetricKey(habitId: string): MetricKey {
  return `${HABITIFY_METRIC_PREFIX}${habitId}` as MetricKey
}

export function habitifyIdFromMetricKey(key: string): string | null {
  if (!key.startsWith(HABITIFY_METRIC_PREFIX)) return null
  const id = key.slice(HABITIFY_METRIC_PREFIX.length)
  return id || null
}

function normalizeSummary(raw: unknown): HabitifyHabitSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id : obj.id != null ? String(obj.id) : ''
  const name = typeof obj.name === 'string' ? obj.name.trim() : ''
  if (!id || !name) return null
  return {
    id,
    name,
    type: obj.type === 'bad' ? 'bad' : 'good',
  }
}

function normalizeJournalEntry(raw: unknown): HabitifyJournalCacheEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id : obj.id != null ? String(obj.id) : ''
  const name = typeof obj.name === 'string' ? obj.name.trim() : ''
  if (!id || !name) return null
  const status = obj.status
  return {
    id,
    name,
    status:
      status === 'completed' || status === 'skipped' || status === 'failed' || status === 'inprogress'
        ? status
        : 'inprogress',
    type: obj.type === 'bad' ? 'bad' : 'good',
    progressCurrent: typeof obj.progressCurrent === 'number' ? obj.progressCurrent : null,
    progressTarget: typeof obj.progressTarget === 'number' ? obj.progressTarget : null,
  }
}

export function getHabitifyHabitCatalog(): HabitifyHabitSummary[] {
  try {
    const raw = storageGetItem(CATALOG_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeSummary)
      .filter((entry): entry is HabitifyHabitSummary => entry != null)
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export function saveHabitifyHabitCatalog(habits: HabitifyHabitSummary[]): HabitifyHabitSummary[] {
  const byId = new Map<string, HabitifyHabitSummary>()
  for (const habit of habits) {
    const normalized = normalizeSummary(habit)
    if (normalized) byId.set(normalized.id, normalized)
  }
  const next = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  storageSetItem(CATALOG_KEY, JSON.stringify(next))
  return next
}

function upsertHabitifyCatalog(habits: HabitifyHabitSummary[]) {
  const byId = new Map(getHabitifyHabitCatalog().map((habit) => [habit.id, habit]))
  for (const habit of habits) {
    const normalized = normalizeSummary(habit)
    if (normalized) byId.set(normalized.id, normalized)
  }
  saveHabitifyHabitCatalog([...byId.values()])
}

function readJournalCache(): Record<string, HabitifyJournalCacheEntry[]> {
  try {
    const raw = storageGetItem(JOURNAL_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, HabitifyJournalCacheEntry[]> = {}
    for (const [date, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(value)) continue
      const entries = value
        .map(normalizeJournalEntry)
        .filter((entry): entry is HabitifyJournalCacheEntry => entry != null)
      if (entries.length > 0) out[date] = entries
    }
    return out
  } catch {
    return {}
  }
}

function pruneJournalCache(
  cache: Record<string, HabitifyJournalCacheEntry[]>,
): Record<string, HabitifyJournalCacheEntry[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - JOURNAL_CACHE_DAYS)
  const minDate = cutoff.toISOString().slice(0, 10)
  const next: Record<string, HabitifyJournalCacheEntry[]> = {}
  for (const [date, entries] of Object.entries(cache)) {
    if (date >= minDate) next[date] = entries
  }
  return next
}

function writeJournalCache(cache: Record<string, HabitifyJournalCacheEntry[]>) {
  storageSetItem(JOURNAL_KEY, JSON.stringify(pruneJournalCache(cache)))
  window.dispatchEvent(new Event(HABITIFY_JOURNAL_CHANGED))
}

export function getHabitifyJournalCache(date: string): HabitifyJournalCacheEntry[] {
  return readJournalCache()[date] ?? []
}

export function getHabitifyJournalEntry(
  date: string,
  habitId: string,
): HabitifyJournalCacheEntry | undefined {
  return getHabitifyJournalCache(date).find((entry) => entry.id === habitId)
}

export function cacheHabitifyJournal(
  date: string,
  entries: HabitifyJournalCacheEntry[],
): void {
  const normalized = entries
    .map(normalizeJournalEntry)
    .filter((entry): entry is HabitifyJournalCacheEntry => entry != null)
  upsertHabitifyCatalog(
    normalized.map((entry) => ({ id: entry.id, name: entry.name, type: entry.type })),
  )
  const cache = readJournalCache()
  cache[date] = normalized
  writeJournalCache(cache)
}

export function patchHabitifyJournalEntry(
  date: string,
  entry: HabitifyJournalCacheEntry,
): void {
  const normalized = normalizeJournalEntry(entry)
  if (!normalized) return
  const existing = getHabitifyJournalCache(date)
  const next = existing.some((item) => item.id === normalized.id)
    ? existing.map((item) => (item.id === normalized.id ? normalized : item))
    : [...existing, normalized]
  cacheHabitifyJournal(date, next)
}

export function getHabitifyPulseRate(metricKey: string, date: string): number {
  const id = habitifyIdFromMetricKey(metricKey)
  if (!id) return 0
  const entry = getHabitifyJournalEntry(date, id)
  if (!entry) return 0

  if (entry.type === 'bad') {
    return entry.status === 'completed' ? 0 : 100
  }

  if (entry.status === 'completed') return 100
  const target = entry.progressTarget
  const current = entry.progressCurrent
  if (target != null && target > 1 && current != null && Number.isFinite(current)) {
    return Math.min(100, Math.max(0, (current / target) * 100))
  }
  return 0
}

export function formatHabitifyPulseDetail(metricKey: string, date: string): string {
  const id = habitifyIdFromMetricKey(metricKey)
  if (!id) return 'Not synced'
  const entry = getHabitifyJournalEntry(date, id)
  if (!entry) return 'Not synced'

  if (entry.progressTarget != null && entry.progressTarget > 1) {
    const current = entry.progressCurrent ?? 0
    const label = entry.status === 'completed' ? 'Done' : 'In progress'
    return `${current}/${entry.progressTarget} · ${label}`
  }

  if (entry.type === 'bad') {
    return entry.status === 'completed' ? 'Broke streak' : 'Avoided'
  }
  return entry.status === 'completed' ? 'Done' : 'Not done'
}

export function isHabitifyHomeCollapsed(): boolean {
  try {
    return storageGetItem(HOME_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function setHabitifyHomeCollapsed(collapsed: boolean) {
  if (collapsed) storageSetItem(HOME_COLLAPSED_KEY, '1')
  else storageRemoveItem(HOME_COLLAPSED_KEY)
}
