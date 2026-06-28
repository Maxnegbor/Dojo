const APP_PREFIX = 'personal-os-'
const DATA_KEY = 'personal-os-data'

const EMPTY_STORE = {
  dailyLogs: [],
  workouts: [],
  goals: [],
  scheduleBlocks: [],
  reminders: [],
}

/** Wipes all local Dojo data: logs, goals, schedule, settings, drafts, and prefs. */
export function resetAllAppData() {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(APP_PREFIX)) keys.push(key)
  }
  for (const key of keys) {
    localStorage.removeItem(key)
  }

  // Keep an empty store so default goals are not re-seeded on first load.
  localStorage.setItem(DATA_KEY, JSON.stringify(EMPTY_STORE))
}

export const FRESH_START_QUOTE =
  'Every morning is a fresh start. Empty your cup — then fill it with intention.'
