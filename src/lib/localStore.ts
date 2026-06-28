import type {
  DailyLog,
  Goal,
  Reminder,
  ScheduleBlock,
  Workout,
} from '@/types'
import { defaultHabits } from '@/types'
import { normalizeGoals } from '@/lib/goals'
import { generateId } from '@/lib/utils'

const STORAGE_KEY = 'personal-os-data'

interface LocalStore {
  dailyLogs: DailyLog[]
  workouts: Workout[]
  goals: Goal[]
  scheduleBlocks: ScheduleBlock[]
  reminders: Reminder[]
}

const DEMO_USER = 'local-user'

function loadStore(): LocalStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export const localStore = {
  userId: DEMO_USER,

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
        user_id: DEMO_USER,
        date,
        sleep_hours: null,
        weight: null,
        steps: null,
        screen_time_minutes: null,
        focus_minutes: 0,
        notes: '',
        habits: defaultHabits(),
        custom_metrics: {},
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
        user_id: DEMO_USER,
        date,
        sleep_hours: null,
        weight: null,
        steps: null,
        screen_time_minutes: null,
        focus_minutes: 0,
        notes: '',
        habits: defaultHabits(),
        custom_metrics: {},
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

  getLogDates(): string[] {
    return loadStore().dailyLogs.map((l) => l.date)
  },
}
