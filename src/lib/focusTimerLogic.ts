import type { FocusTimerSettings } from '@/types'

export type TimerPhase = 'focus' | 'break' | 'done'

/** Break length after completing focus cycle `completedFocusCycle` (1-based). */
export function getBreakMinutesAfterFocus(
  settings: FocusTimerSettings,
  completedFocusCycle: number,
): number {
  if (settings.skipBreaks || completedFocusCycle >= settings.iterations) return 0

  if (
    settings.longBreakEnabled &&
    settings.longBreakAfterCycles > 0 &&
    completedFocusCycle % settings.longBreakAfterCycles === 0
  ) {
    return settings.longBreakMinutes
  }
  return settings.breakMinutes
}

export function isLongBreakAfterFocus(
  settings: FocusTimerSettings,
  completedFocusCycle: number,
): boolean {
  if (settings.skipBreaks || completedFocusCycle >= settings.iterations) return false
  return (
    settings.longBreakEnabled &&
    settings.longBreakAfterCycles > 0 &&
    completedFocusCycle % settings.longBreakAfterCycles === 0
  )
}

export function totalSessionSeconds(settings: FocusTimerSettings): number {
  let total = settings.focusMinutes * 60 * settings.iterations
  if (!settings.skipBreaks) {
    for (let c = 1; c < settings.iterations; c++) {
      total += getBreakMinutesAfterFocus(settings, c) * 60
    }
  }
  return total
}

export function remainingSessionSeconds(
  settings: FocusTimerSettings,
  phase: TimerPhase,
  cycle: number,
  remainingInPhase: number,
): number {
  if (phase === 'done') return 0

  let total = remainingInPhase

  if (phase === 'focus') {
    if (!settings.skipBreaks && cycle < settings.iterations) {
      total += getBreakMinutesAfterFocus(settings, cycle) * 60
    }
    for (let c = cycle + 1; c <= settings.iterations; c++) {
      total += settings.focusMinutes * 60
      if (!settings.skipBreaks && c < settings.iterations) {
        total += getBreakMinutesAfterFocus(settings, c) * 60
      }
    }
  } else if (phase === 'break') {
    for (let c = cycle + 1; c <= settings.iterations; c++) {
      total += settings.focusMinutes * 60
      if (!settings.skipBreaks && c < settings.iterations) {
        total += getBreakMinutesAfterFocus(settings, c) * 60
      }
    }
  }

  return total
}

export function totalFocusMinutes(settings: FocusTimerSettings): number {
  return settings.focusMinutes * settings.iterations
}

/**
 * Minutes to credit for a focus block.
 * A finished countdown always logs the planned length so timer drift
 * cannot round a 5-minute session up to 6.
 * An early stop uses time actually counted down, capped at the plan.
 */
export function loggedFocusMinutes(
  plannedMinutes: number,
  remainingSeconds: number,
  completedNaturally: boolean,
): number {
  const planned = Math.max(1, Math.round(plannedMinutes))
  if (completedNaturally) return planned
  const elapsedSeconds = Math.max(0, planned * 60 - Math.max(0, remainingSeconds))
  const minutes = Math.round(elapsedSeconds / 60)
  return Math.max(1, Math.min(planned, minutes))
}

export function remainingFocusMinutes(
  settings: FocusTimerSettings,
  phase: TimerPhase,
  cycle: number,
  remainingInPhase: number,
): number {
  if (phase === 'done') return 0

  let total = phase === 'focus' ? Math.ceil(remainingInPhase / 60) : 0
  for (let c = cycle + 1; c <= settings.iterations; c++) {
    total += settings.focusMinutes
  }
  return total
}
