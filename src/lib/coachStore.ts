import { formatDate, parseTimeToMinutes } from '@/lib/utils'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-coach'
export const COACH_CHANGED = 'personal-os-coach-changed'

export type CoachSlot = 'morning' | 'midday' | 'evening'
export type CoachKind = CoachSlot | 'insights'

export const COACH_SLOTS: CoachSlot[] = ['morning', 'midday', 'evening']

export const COACH_SLOT_LABELS: Record<CoachSlot, string> = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
}

export const DEFAULT_COACH_SCHEDULE: CoachSchedule = {
  morning: '07:30',
  midday: '12:30',
  evening: '18:30',
}

export interface CoachSchedule {
  morning: string
  midday: string
  evening: string
}

export interface CoachBullet {
  title: string
  detail: string
}

export interface CoachAdvice {
  kind: CoachKind
  date: string
  generatedAt: string
  headline: string
  body: string
  bullets: CoachBullet[]
}

interface CoachLastRead {
  date: string
  kind: CoachSlot
  generatedAt: string
}

interface CoachStore {
  byDate: Record<string, Partial<Record<CoachKind, CoachAdvice>>>
  schedule: CoachSchedule
  lastRead: CoachLastRead | null
}

const KIND_HEADLINES: Record<CoachKind, string> = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
  insights: 'Insights',
}

function normalizeClock(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const match = /^(\d{1,2}):(\d{2})/.exec(raw.trim())
  if (!match) return fallback
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return fallback
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function normalizeCoachSchedule(raw: unknown): CoachSchedule {
  const source = raw && typeof raw === 'object' ? (raw as Partial<CoachSchedule>) : {}
  return {
    morning: normalizeClock(source.morning, DEFAULT_COACH_SCHEDULE.morning),
    midday: normalizeClock(source.midday, DEFAULT_COACH_SCHEDULE.midday),
    evening: normalizeClock(source.evening, DEFAULT_COACH_SCHEDULE.evening),
  }
}

export function isCoachScheduleOrdered(schedule: CoachSchedule): boolean {
  return (
    parseTimeToMinutes(schedule.morning) < parseTimeToMinutes(schedule.midday) &&
    parseTimeToMinutes(schedule.midday) < parseTimeToMinutes(schedule.evening)
  )
}

function normalizeBullet(raw: unknown): CoachBullet | null {
  if (!raw || typeof raw !== 'object') return null
  const title = typeof (raw as { title?: unknown }).title === 'string'
    ? (raw as { title: string }).title.trim()
    : ''
  const detail = typeof (raw as { detail?: unknown }).detail === 'string'
    ? (raw as { detail: string }).detail.trim()
    : ''
  if (!title && !detail) return null
  return { title: title || 'Note', detail }
}

function isCoachKind(raw: unknown): raw is CoachKind {
  return raw === 'morning' || raw === 'midday' || raw === 'evening' || raw === 'insights'
}

export function clampCoachSentences(text: string, max = 2): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const parts = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
  if (!parts || parts.length <= max) return trimmed
  return parts.slice(0, max).join('').replace(/\s+/g, ' ').trim()
}

export function normalizeCoachAdvice(
  raw: unknown,
  kind: CoachKind,
  date: string,
): CoachAdvice | null {
  if (!raw || typeof raw !== 'object') return null
  const headline =
    typeof (raw as { headline?: unknown }).headline === 'string'
      ? (raw as { headline: string }).headline.trim()
      : ''
  const body =
    typeof (raw as { body?: unknown }).body === 'string'
      ? (raw as { body: string }).body.trim()
      : ''
  const bulletsRaw = (raw as { bullets?: unknown }).bullets
  const bullets = Array.isArray(bulletsRaw)
    ? bulletsRaw.map(normalizeBullet).filter((row): row is CoachBullet => row != null).slice(0, 3)
    : []
  if (!headline && !body && bullets.length === 0) return null
  const generatedAt =
    typeof (raw as { generatedAt?: unknown }).generatedAt === 'string' &&
    (raw as { generatedAt: string }).generatedAt
      ? (raw as { generatedAt: string }).generatedAt
      : new Date().toISOString()
  return {
    kind,
    date,
    generatedAt,
    headline: headline || KIND_HEADLINES[kind],
    body: clampCoachSentences(body, 2),
    bullets,
  }
}

function isCoachSlot(raw: unknown): raw is CoachSlot {
  return raw === 'morning' || raw === 'midday' || raw === 'evening'
}

function normalizeLastRead(raw: unknown): CoachLastRead | null {
  if (!raw || typeof raw !== 'object') return null
  const date =
    typeof (raw as { date?: unknown }).date === 'string'
      ? (raw as { date: string }).date
      : ''
  const generatedAt =
    typeof (raw as { generatedAt?: unknown }).generatedAt === 'string'
      ? (raw as { generatedAt: string }).generatedAt
      : ''
  const kind = (raw as { kind?: unknown }).kind
  if (!date || !generatedAt || !isCoachSlot(kind)) return null
  return { date, kind, generatedAt }
}

function emptyStore(): CoachStore {
  return { byDate: {}, schedule: { ...DEFAULT_COACH_SCHEDULE }, lastRead: null }
}

function readStore(): CoachStore {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as { byDate?: unknown; schedule?: unknown; lastRead?: unknown }
    const byDate =
      parsed.byDate && typeof parsed.byDate === 'object'
        ? (parsed.byDate as CoachStore['byDate'])
        : {}
    return {
      byDate,
      schedule: normalizeCoachSchedule(parsed.schedule),
      lastRead: normalizeLastRead(parsed.lastRead),
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: CoachStore) {
  const dates = Object.keys(store.byDate).sort()
  const trimmed: CoachStore['byDate'] = {}
  for (const date of dates.slice(-45)) {
    trimmed[date] = store.byDate[date]!
  }
  storageSetItem(
    STORAGE_KEY,
    JSON.stringify({
      byDate: trimmed,
      schedule: normalizeCoachSchedule(store.schedule),
      lastRead: store.lastRead,
    }),
  )
  window.dispatchEvent(new Event(COACH_CHANGED))
}

export function getCoachSchedule(): CoachSchedule {
  return readStore().schedule
}

export function saveCoachSchedule(schedule: CoachSchedule): CoachSchedule {
  const next = normalizeCoachSchedule(schedule)
  const store = readStore()
  store.schedule = next
  writeStore(store)
  return next
}

export function getCoachAdvice(date: string, kind: CoachKind): CoachAdvice | null {
  const stored = readStore().byDate[date]?.[kind]
  if (!stored || !isCoachKind(stored.kind)) return null
  return {
    ...stored,
    body: clampCoachSentences(stored.body, 2),
    bullets: (stored.bullets ?? []).slice(0, 3),
  }
}

export function getCoachSlotAdvice(date: string): Partial<Record<CoachSlot, CoachAdvice>> {
  const entry = readStore().byDate[date]
  if (!entry) return {}
  const out: Partial<Record<CoachSlot, CoachAdvice>> = {}
  for (const slot of COACH_SLOTS) {
    const advice = entry[slot]
    if (advice) {
      out[slot] = {
        ...advice,
        body: clampCoachSentences(advice.body, 2),
        bullets: (advice.bullets ?? []).slice(0, 3),
      }
    }
  }
  return out
}

export function getVisibleCoachAdvice(date: string): CoachAdvice | null {
  const bySlot = getCoachSlotAdvice(date)
  for (let i = COACH_SLOTS.length - 1; i >= 0; i -= 1) {
    const advice = bySlot[COACH_SLOTS[i]!]
    if (advice) return advice
  }
  return null
}

export function getLatestCoachAdvice(date: string): CoachAdvice | null {
  return getVisibleCoachAdvice(date)
}

export function hasUnreadCoachAdvice(date: string): boolean {
  const visible = getVisibleCoachAdvice(date)
  if (!visible || !isCoachSlot(visible.kind)) return false
  const read = readStore().lastRead
  if (!read) return true
  return (
    read.date !== visible.date ||
    read.kind !== visible.kind ||
    read.generatedAt !== visible.generatedAt
  )
}

export function markCoachAdviceRead(advice: CoachAdvice) {
  if (!isCoachSlot(advice.kind)) return
  const store = readStore()
  const current = store.lastRead
  if (
    current &&
    current.date === advice.date &&
    current.kind === advice.kind &&
    current.generatedAt === advice.generatedAt
  ) {
    return
  }
  store.lastRead = { date: advice.date, kind: advice.kind, generatedAt: advice.generatedAt }
  writeStore(store)
}

export function saveCoachAdvice(advice: CoachAdvice): CoachAdvice {
  const store = readStore()
  const current = store.byDate[advice.date] ?? {}
  store.byDate[advice.date] = { ...current, [advice.kind]: advice }
  writeStore(store)
  return advice
}

export function isCoachSlotDue(
  slot: CoachSlot,
  date: string,
  now: Date = new Date(),
  schedule: CoachSchedule = getCoachSchedule(),
): boolean {
  const today = formatDate(now)
  if (date > today) return false
  if (date < today) return true
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return nowMinutes >= parseTimeToMinutes(schedule[slot])
}

export function getDueCoachSlots(
  date: string,
  now: Date = new Date(),
  schedule: CoachSchedule = getCoachSchedule(),
): CoachSlot[] {
  return COACH_SLOTS.filter((slot) => isCoachSlotDue(slot, date, now, schedule))
}

export function getNextCoachSlot(
  date: string,
  now: Date = new Date(),
  schedule: CoachSchedule = getCoachSchedule(),
): CoachSlot | null {
  if (date !== formatDate(now)) return null
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return (
    COACH_SLOTS.find((slot) => parseTimeToMinutes(schedule[slot]) > nowMinutes) ?? null
  )
}

export function msUntilCoachSlot(
  slot: CoachSlot,
  now: Date = new Date(),
  schedule: CoachSchedule = getCoachSchedule(),
): number {
  const target = parseTimeToMinutes(schedule[slot])
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const elapsedMs = now.getSeconds() * 1000 + now.getMilliseconds()
  let deltaMinutes = target - nowMinutes
  if (deltaMinutes < 0) deltaMinutes += 24 * 60
  if (deltaMinutes === 0) return Math.max(250, 60_000 - elapsedMs)
  return deltaMinutes * 60 * 1000 - elapsedMs
}
