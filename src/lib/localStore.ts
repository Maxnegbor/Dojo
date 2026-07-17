import type {
  DailyLog,
  Goal,
  Reminder,
  ScheduleBlock,
  Workout,
} from '@/types'
import { defaultHabits } from '@/types'
import { normalizeGoals } from '@/lib/goals'
import { getLocalDataKey } from '@/lib/localAuth'
import { generateId } from '@/lib/utils'

interface LocalStore {
  dailyLogs: DailyLog[]
  workouts: Workout[]
  goals: Goal[]
  scheduleBlocks: ScheduleBlock[]
  reminders: Reminder[]
}

let activeUserId = 'local-user'

function storageKey() {
  return getLocalDataKey(activeUserId)
}

function loadStore(): LocalStore {
  try {
    const raw = localStorage.getItem(storageKey())
    if (raw) return JSON.parse(raw) as LocalStore
  } catch {
    /* ignore */
  }
  return {
    dailyLogs: [],
    workouts: [],
    goals: [],
    scheduleBlocks: [],
    reminders: [],
  }
}

function saveStore(store: LocalStore) {
  localStorage.setItem(storageKey(), JSON.stringify(store))
}

export const localStore = {
  get userId() {
    return activeUserId
  },

  setUserId(userId: string) {
    activeUserId = userId
  },

  getDailyLog(date: string): DailyLog | undefined {
    return loadStore().dailyLogs.find((l) => l.date === date)
  },

  getOrCreateDailyLog(date: string): DailyLog {
    const store = loadStore()
    let log = store.dailyLogs.find((l) => l.date === date)
    if (!log) {
      const now = new Date().toISOString()
      log = {
        id: generateId(),
        user_id: activeUserId,
        date,
        sleep_hours: null,
        weight: null,
        steps: null,
        screen_time_minutes: null,
        focus_minutes: 0,
        notes: '',
        habits: defaultHabits(),
        custom_metrics: {},
        sleep_metrics: {},
        created_at: now,
        updated_at: now,
      }
      store.dailyLogs.push(log)
      saveStore(store)
    } else if (!log.habits) {
      log = { ...log, habits: defaultHabits() }
    }
    return log
  },

  updateDailyLog(date: string, updates: Partial<DailyLog>): DailyLog {
    const store = loadStore()
    const idx = store.dailyLogs.findIndex((l) => l.date === date)
    const now = new Date().toISOString()
    if (idx >= 0) {
      store.dailyLogs[idx] = {
        ...store.dailyLogs[idx],
        ...updates,
        updated_at: now,
      }
    } else {
      store.dailyLogs.push({
        id: generateId(),
        user_id: activeUserId,
        date,
        sleep_hours: null,
        weight: null,
        steps: null,
        screen_time_minutes: null,
        focus_minutes: 0,
        notes: '',
        habits: defaultHabits(),
        custom_metrics: {},
        sleep_metrics: {},
        created_at: now,
        updated_at: now,
        ...updates,
      })
    }
    saveStore(store)
    return store.dailyLogs.find((l) => l.date === date)!
  },

  getDailyLogs(start: string, end: string): DailyLog[] {
    return loadStore().dailyLogs.filter((l) => l.date >= start && l.date <= end)
  },

  getWorkouts(start: string, end: string): Workout[] {
    return loadStore().workouts.filter((w) => w.date >= start && w.date <= end)
  },

  addWorkout(workout: Omit<Workout, 'id' | 'created_at'>): Workout {
    const store = loadStore()
    const entry: Workout = {
      ...workout,
      id: generateId(),
      created_at: new Date().toISOString(),
    }
    store.workouts.push(entry)
    saveStore(store)
    return entry
  },

  getGoals(): Goal[] {
    return normalizeGoals(loadStore().goals)
  },

  upsertGoal(goal: Goal): Goal {
    const store = loadStore()
    const idx = store.goals.findIndex((g) => g.id === goal.id)
    if (idx >= 0) store.goals[idx] = goal
    else store.goals.push(goal)
    saveStore(store)
    return goal
  },

  deleteGoal(id: string) {
    const store = loadStore()
    store.goals = store.goals.filter((g) => g.id !== id)
    saveStore(store)
  },

  deleteGoalWithData(goal: Goal) {
    const store = loadStore()
    store.goals = store.goals.filter((g) => g.id !== goal.id)

    if (goal.metric_key.startsWith('custom:')) {
      for (const log of store.dailyLogs) {
        if (log.custom_metrics?.[goal.metric_key] != null) {
          const { [goal.metric_key]: _, ...rest } = log.custom_metrics
          log.custom_metrics = rest
        }
      }
    }

    saveStore(store)
  },

  getScheduleBlocks(date: string): ScheduleBlock[] {
    return loadStore().scheduleBlocks.filter((b) => b.date === date)
  },

  upsertScheduleBlock(block: ScheduleBlock): ScheduleBlock {
    const store = loadStore()
    const idx = store.scheduleBlocks.findIndex((b) => b.id === block.id)
    if (idx >= 0) store.scheduleBlocks[idx] = block
    else store.scheduleBlocks.push(block)
    saveStore(store)
    return block
  },

  deleteScheduleBlock(id: string) {
    const store = loadStore()
    store.scheduleBlocks = store.scheduleBlocks.filter((b) => b.id !== id)
    saveStore(store)
  },

  getReminders(): Reminder[] {
    return loadStore().reminders.map((r) => ({ ...r, kind: r.kind ?? 'task' }))
  },

  upsertReminder(reminder: Reminder): Reminder {
    const store = loadStore()
    const idx = store.reminders.findIndex((r) => r.id === reminder.id)
    if (idx >= 0) store.reminders[idx] = reminder
    else store.reminders.push(reminder)
    saveStore(store)
    return reminder
  },

  deleteReminder(id: string) {
    const store = loadStore()
    store.reminders = store.reminders.filter((r) => r.id !== id)
    saveStore(store)
  },

  removeWorkoutsForDate(date: string) {
    const store = loadStore()
    store.workouts = store.workouts.filter((w) => w.date !== date)
    saveStore(store)
  },

  updateWorkout(id: string, updates: Partial<Pick<Workout, 'duration_minutes' | 'notes'>>) {
    const store = loadStore()
    const idx = store.workouts.findIndex((w) => w.id === id)
    if (idx < 0) return
    store.workouts[idx] = { ...store.workouts[idx], ...updates }
    saveStore(store)
  },

  deleteWorkout(id: string) {
    const store = loadStore()
    store.workouts = store.workouts.filter((w) => w.id !== id)
    saveStore(store)
  },

  getLogDates(): string[] {
    return loadStore().dailyLogs.map((l) => l.date)
  },

  clearAllMorningLogs(): number {
    const store = loadStore()
    let count = 0
    for (const log of store.dailyLogs) {
      if (log.morning_log) {
        log.morning_log = null
        log.sleep_hours = null
        count++
      }
    }
    if (count > 0) saveStore(store)
    return count
  },

  replaceStore(data: LocalStore) {
    saveStore(data)
  },
}
