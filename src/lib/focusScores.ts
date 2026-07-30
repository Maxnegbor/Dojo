import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { generateId } from '@/lib/utils'

const STORAGE_KEY = 'personal-os-focus-scores'
export const FOCUS_SCORES_CHANGED = 'personal-os-focus-scores-changed'

export interface FocusScoreSession {
  id: string
  date: string
  startMs: number
  endMs: number
  minutes: number
  score: number
  createdAt: string
}

function clampScore(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value)))
}

function normalizeSession(raw: Partial<FocusScoreSession>): FocusScoreSession | null {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.date !== 'string' || !raw.date) return null
  if (typeof raw.score !== 'number' || Number.isNaN(raw.score)) return null
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
    date: raw.date,
    startMs: typeof raw.startMs === 'number' ? raw.startMs : Date.now(),
    endMs: typeof raw.endMs === 'number' ? raw.endMs : Date.now(),
    minutes: typeof raw.minutes === 'number' ? Math.max(0, Math.round(raw.minutes)) : 0,
    score: clampScore(raw.score),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
  }
}

export function getFocusScoreSessions(): FocusScoreSession[] {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { sessions?: unknown }).sessions)
        ? (parsed as { sessions: unknown[] }).sessions
        : []
    return list
      .map((entry) => normalizeSession(entry as Partial<FocusScoreSession>))
      .filter((entry): entry is FocusScoreSession => entry != null)
      .sort((a, b) => b.endMs - a.endMs)
  } catch {
    return []
  }
}

function saveFocusScoreSessions(sessions: FocusScoreSession[]) {
  storageSetItem(STORAGE_KEY, JSON.stringify({ sessions }))
  window.dispatchEvent(new Event(FOCUS_SCORES_CHANGED))
}

export function addFocusScoreSession(input: {
  date: string
  startMs: number
  endMs: number
  minutes: number
  score: number
}): FocusScoreSession {
  const session: FocusScoreSession = {
    id: generateId(),
    date: input.date,
    startMs: input.startMs,
    endMs: input.endMs,
    minutes: Math.max(0, Math.round(input.minutes)),
    score: clampScore(input.score),
    createdAt: new Date().toISOString(),
  }
  const next = [session, ...getFocusScoreSessions()]
  // Keep roughly a year of scores.
  const cutoff = Date.now() - 400 * 24 * 60 * 60 * 1000
  saveFocusScoreSessions(next.filter((entry) => entry.endMs >= cutoff))
  return session
}

/** Mean of session scores in [startDate, endDate] inclusive. Null if none. */
export function averageFocusScoreForRange(
  startDate: string,
  endDate: string,
  sessions: FocusScoreSession[] = getFocusScoreSessions(),
): number | null {
  const inRange = sessions.filter(
    (session) => session.date >= startDate && session.date <= endDate,
  )
  if (inRange.length === 0) return null
  const sum = inRange.reduce((acc, session) => acc + session.score, 0)
  return Math.round((sum / inRange.length) * 10) / 10
}

export function formatFocusScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}
