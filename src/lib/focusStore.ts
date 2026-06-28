import { DEFAULT_FOCUS_SETTINGS, type FocusTimerSettings } from '@/types'
import { localStore } from '@/lib/localStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

const SETTINGS_KEY = 'personal-os-focus-settings'

export function getFocusSettings(): FocusTimerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = { ...DEFAULT_FOCUS_SETTINGS, ...JSON.parse(raw) } as FocusTimerSettings
      return {
        ...parsed,
        focusMinutes: snapMinutes(parsed.focusMinutes),
        breakMinutes: snapMinutes(parsed.breakMinutes),
        longBreakMinutes: snapMinutes(parsed.longBreakMinutes ?? DEFAULT_FOCUS_SETTINGS.longBreakMinutes),
        iterations: Math.max(1, parsed.iterations),
        longBreakAfterCycles: Math.max(1, parsed.longBreakAfterCycles ?? DEFAULT_FOCUS_SETTINGS.longBreakAfterCycles),
        longBreakEnabled: Boolean(parsed.longBreakEnabled),
        allowPause: Boolean(parsed.allowPause),
      }
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_FOCUS_SETTINGS }
}

function snapMinutes(n: number): number {
  return Math.min(120, Math.max(5, Math.round(n / 5) * 5))
}

export function saveFocusSettings(settings: FocusTimerSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export async function addFocusMinutes(
  userId: string,
  date: string,
  minutes: number,
): Promise<number> {
  if (minutes <= 0) return 0

  if (isSupabaseConfigured) {
    const { getOrCreateDailyLog, updateDailyLog } = await import('@/lib/supabase')
    const log = await getOrCreateDailyLog(userId, date)
    const next = (log.focus_minutes ?? 0) + minutes
    await updateDailyLog(log.id, { focus_minutes: next })
    return next
  }

  const log = localStore.getOrCreateDailyLog(date)
  const next = (log.focus_minutes ?? 0) + minutes
  localStore.updateDailyLog(date, { focus_minutes: next })
  return next
}

export function getFocusMinutesToday(): number {
  const today = formatDate(new Date())
  return localStore.getOrCreateDailyLog(today).focus_minutes ?? 0
}

export async function fetchFocusMinutesToday(userId: string): Promise<number> {
  const today = formatDate(new Date())
  if (isSupabaseConfigured) {
    const { getOrCreateDailyLog } = await import('@/lib/supabase')
    const log = await getOrCreateDailyLog(userId, today)
    return log.focus_minutes ?? 0
  }
  return localStore.getOrCreateDailyLog(today).focus_minutes ?? 0
}
