import { storageGetItem, storageRemoveItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-focus-open-timer'

export type OpenFocusClockMode = 'timer' | 'stopwatch'
export type OpenFocusPhase = 'focus' | 'break'

/** A focus session that was still in progress when the page closed. Restored paused. */
export interface OpenFocusTimer {
  clockMode: OpenFocusClockMode
  phase: OpenFocusPhase
  cycle: number
  remaining: number
  elapsed: number
  activeBreakMinutes: number
  labelId: string | null
  phaseStartMs: number
  creditedMinutes: number
  openSessionId: string | null
  plannedFocusMinutes: number
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function readOpenFocusTimer(): OpenFocusTimer | null {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OpenFocusTimer>
    if (parsed.clockMode !== 'timer' && parsed.clockMode !== 'stopwatch') return null
    if (parsed.phase !== 'focus' && parsed.phase !== 'break') return null
    const cycle = Math.round(finite(parsed.cycle, 1))
    if (cycle < 1) return null
    return {
      clockMode: parsed.clockMode,
      phase: parsed.phase,
      cycle,
      remaining: Math.max(0, Math.round(finite(parsed.remaining))),
      elapsed: Math.max(0, Math.round(finite(parsed.elapsed))),
      activeBreakMinutes: Math.max(0, Math.round(finite(parsed.activeBreakMinutes))),
      labelId: typeof parsed.labelId === 'string' && parsed.labelId.trim() ? parsed.labelId : null,
      phaseStartMs: finite(parsed.phaseStartMs, Date.now()),
      creditedMinutes: Math.max(0, Math.round(finite(parsed.creditedMinutes))),
      openSessionId:
        typeof parsed.openSessionId === 'string' && parsed.openSessionId.trim()
          ? parsed.openSessionId
          : null,
      plannedFocusMinutes: Math.max(1, Math.round(finite(parsed.plannedFocusMinutes, 25))),
    }
  } catch {
    return null
  }
}

export function writeOpenFocusTimer(timer: OpenFocusTimer) {
  storageSetItem(STORAGE_KEY, JSON.stringify(timer))
}

export function clearOpenFocusTimer() {
  storageRemoveItem(STORAGE_KEY)
}
