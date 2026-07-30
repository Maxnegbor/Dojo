import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-focus-hourly'
const ROLLING_HOURS = 12
const RETENTION_HOURS = 48

type HourlyBuckets = Record<string, number>

function hourKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}`
}

function loadBuckets(): HourlyBuckets {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as HourlyBuckets
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveBuckets(buckets: HourlyBuckets) {
  storageSetItem(STORAGE_KEY, JSON.stringify(buckets))
}

function pruneBuckets(buckets: HourlyBuckets, now = new Date()) {
  const cutoff = new Date(now)
  cutoff.setHours(cutoff.getHours() - RETENTION_HOURS)
  const cutoffKey = hourKey(cutoff)
  for (const key of Object.keys(buckets)) {
    if (key < cutoffKey) delete buckets[key]
  }
}

function distributeMinutesAcrossHours(startMs: number, endMs: number): HourlyBuckets {
  const result: HourlyBuckets = {}
  if (endMs <= startMs) return result

  let cursor = startMs
  while (cursor < endMs) {
    const date = new Date(cursor)
    const nextHour = new Date(date)
    nextHour.setHours(date.getHours() + 1, 0, 0, 0)
    const segmentEnd = Math.min(endMs, nextHour.getTime())
    const minutes = (segmentEnd - cursor) / 60000
    if (minutes > 0) {
      const key = hourKey(date)
      result[key] = (result[key] ?? 0) + minutes
    }
    cursor = segmentEnd
  }

  return result
}

function mergeBuckets(target: HourlyBuckets, source: HourlyBuckets) {
  for (const [key, minutes] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + minutes
  }
}

export function recordFocusSession(startMs: number, endMs: number = Date.now()) {
  if (endMs <= startMs) return
  const buckets = loadBuckets()
  mergeBuckets(buckets, distributeMinutesAcrossHours(startMs, endMs))
  pruneBuckets(buckets, new Date(endMs))
  saveBuckets(buckets)
}

export interface FocusHourBucket {
  hourStart: Date
  minutes: number
}

export function getRollingFocusHours(
  now = new Date(),
  hours = ROLLING_HOURS,
): FocusHourBucket[] {
  const buckets = loadBuckets()
  const result: FocusHourBucket[] = []

  for (let i = hours - 1; i >= 0; i--) {
    const hourStart = new Date(now)
    hourStart.setMinutes(0, 0, 0)
    hourStart.setHours(hourStart.getHours() - i)
    const key = hourKey(hourStart)
    result.push({
      hourStart,
      minutes: buckets[key] ?? 0,
    })
  }

  return result
}

export function getDevDummyRollingFocusHours(
  now = new Date(),
  hours = ROLLING_HOURS,
): FocusHourBucket[] {
  const pattern = [0, 8, 22, 35, 12, 0, 18, 45, 28, 15, 5, 40]
  const result: FocusHourBucket[] = []

  for (let i = hours - 1; i >= 0; i--) {
    const hourStart = new Date(now)
    hourStart.setMinutes(0, 0, 0)
    hourStart.setHours(hourStart.getHours() - i)
    const patternIndex = hours - 1 - i
    result.push({
      hourStart,
      minutes: pattern[patternIndex % pattern.length] ?? 0,
    })
  }

  return result
}

export function withLiveFocusSession(
  buckets: FocusHourBucket[],
  session: { startMs: number; endMs: number } | null,
): FocusHourBucket[] {
  if (!session || session.endMs <= session.startMs) return buckets

  const live = distributeMinutesAcrossHours(session.startMs, session.endMs)
  return buckets.map((bucket) => ({
    ...bucket,
    minutes: bucket.minutes + (live[hourKey(bucket.hourStart)] ?? 0),
  }))
}
