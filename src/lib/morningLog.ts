import type { DailyLog, MorningLog } from '@/types'

/** Minutes between two HH:mm times (handles overnight). */
export function minutesBetweenTimes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let startMin = sh * 60 + sm
  let endMin = eh * 60 + em
  if (endMin <= startMin) endMin += 24 * 60
  return endMin - startMin
}

export function computeMorningLogFields(input: {
  bedtime: string
  asleep_time: string
  wake_time: string
  alertness: number
}): MorningLog {
  const in_bed_minutes = minutesBetweenTimes(input.bedtime, input.wake_time)
  const sleep_minutes = minutesBetweenTimes(input.asleep_time, input.wake_time)
  return {
    bedtime: input.bedtime,
    asleep_time: input.asleep_time,
    wake_time: input.wake_time,
    alertness: input.alertness,
    in_bed_minutes,
    sleep_minutes,
  }
}

export function getMorningLog(log: DailyLog | undefined): MorningLog | null {
  if (!log?.morning_log?.bedtime) return null
  return log.morning_log
}

export function formatMorningMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h <= 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function averageTime(times: string[]): string {
  if (times.length === 0) return '—'
  const total = times.reduce(
    (s, t) => s + parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3), 10),
    0,
  )
  const avg = Math.round(total / times.length)
  const h = Math.floor(avg / 60) % 24
  const m = avg % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatTime12h(time: string, use24h: boolean): string {
  const [h, m] = time.split(':').map(Number)
  if (use24h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}
