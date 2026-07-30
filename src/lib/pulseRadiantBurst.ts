const STORAGE_PREFIX = 'personal-os-pulse-radiant-burst'

export const PULSE_RADIANT_TEST_REQUESTED = 'personal-os:pulse-radiant-test'
const PULSE_RADIANT_TEST_PENDING_KEY = 'personal-os-pulse-radiant-test-pending'

export function pulseRadiantBurstStorageKey(date: string): string {
  return `${STORAGE_PREFIX}:${date}`
}

export function hasPlayedPulseRadiantBurst(date: string): boolean {
  try {
    return localStorage.getItem(pulseRadiantBurstStorageKey(date)) === '1'
  } catch {
    return false
  }
}

export function markPulseRadiantBurstPlayed(date: string): void {
  try {
    localStorage.setItem(pulseRadiantBurstStorageKey(date), '1')
  } catch {
    /* ignore quota / private mode */
  }
}

/** Dev: play the home pulse grow→slam→burst sequence. */
export function requestPulseRadiantTest() {
  window.dispatchEvent(new Event(PULSE_RADIANT_TEST_REQUESTED))
}

export function markPulseRadiantTestPending() {
  try {
    sessionStorage.setItem(PULSE_RADIANT_TEST_PENDING_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function consumePulseRadiantTestPending(): boolean {
  try {
    if (sessionStorage.getItem(PULSE_RADIANT_TEST_PENDING_KEY) !== '1') return false
    sessionStorage.removeItem(PULSE_RADIANT_TEST_PENDING_KEY)
    return true
  } catch {
    return false
  }
}
