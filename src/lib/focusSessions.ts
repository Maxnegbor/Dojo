import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { formatDate, generateId } from '@/lib/utils'

const STORAGE_KEY = 'personal-os-focus-sessions'
export const FOCUS_SESSIONS_CHANGED = 'personal-os-focus-sessions-changed'

/** Keep roughly a year of sessions for overview analysis. */
const MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000

export interface FocusSession {
  id: string
  date: string
  startMs: number
  endMs: number
  minutes: number
  label_id: string | null
  createdAt: string
}

function normalizeSession(raw: Partial<FocusSession>): FocusSession | null {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.date !== 'string' || !raw.date) return null
  const minutes =
    typeof raw.minutes === 'number' && Number.isFinite(raw.minutes)
      ? Math.max(0, Math.round(raw.minutes))
      : 0
  if (minutes <= 0) return null
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
    date: raw.date,
    startMs: typeof raw.startMs === 'number' ? raw.startMs : Date.now(),
    endMs: typeof raw.endMs === 'number' ? raw.endMs : Date.now(),
    minutes,
    label_id:
      typeof raw.label_id === 'string' && raw.label_id.trim() ? raw.label_id.trim() : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
  }
}

function prune(sessions: FocusSession[]): FocusSession[] {
  const cutoff = Date.now() - MAX_AGE_MS
  return sessions
    .filter((session) => session.endMs >= cutoff || session.startMs >= cutoff)
    .sort((a, b) => a.startMs - b.startMs)
}

function readAll(): FocusSession[] {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return prune(
      parsed
        .map((entry) => normalizeSession(entry as Partial<FocusSession>))
        .filter((entry): entry is FocusSession => entry != null),
    )
  } catch {
    return []
  }
}

function writeAll(sessions: FocusSession[]) {
  storageSetItem(STORAGE_KEY, JSON.stringify(prune(sessions)))
  window.dispatchEvent(new Event(FOCUS_SESSIONS_CHANGED))
}

export function getFocusSessions(): FocusSession[] {
  return readAll()
}

export function getFocusSessionsInRange(startDate: string, endDate: string): FocusSession[] {
  return readAll().filter((session) => session.date >= startDate && session.date <= endDate)
}

export function addFocusSession(params: {
  minutes: number
  startMs: number
  endMs: number
  labelId?: string | null
  date?: string
}): FocusSession | null {
  const minutes = Math.max(0, Math.round(params.minutes))
  if (minutes <= 0) return null
  const session: FocusSession = {
    id: generateId(),
    date: params.date ?? formatDate(new Date(params.endMs)),
    startMs: params.startMs,
    endMs: params.endMs,
    minutes,
    label_id: params.labelId?.trim() || null,
    createdAt: new Date().toISOString(),
  }
  writeAll([...readAll(), session])
  return session
}

export function sumFocusMinutesByLabel(
  sessions: FocusSession[],
): Map<string | null, number> {
  const map = new Map<string | null, number>()
  for (const session of sessions) {
    const key = session.label_id
    map.set(key, (map.get(key) ?? 0) + session.minutes)
  }
  return map
}
