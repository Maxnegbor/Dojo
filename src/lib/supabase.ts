import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type {
  DailyLog,
  DailyLogInput,
  Goal,
  Reminder,
  ScheduleBlock,
  Workout,
} from '@/types'
import { encodeSleepMetricsAsCustom, resolveSleepMetrics } from '@/lib/sleepMetrics'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseAnonKey) &&
  !supabaseUrl.includes('your-project') &&
  supabaseAnonKey !== 'your-anon-key'

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

/** Expose sleep metrics stored in custom_metrics (`sm:`) as sleep_metrics for the app. */
function hydrateDailyLog(log: DailyLog): DailyLog {
  const merged = resolveSleepMetrics(log)
  if (Object.keys(merged).length === 0) return log
  return {
    ...log,
    sleep_metrics: {
      ...merged,
      ...(log.sleep_metrics ?? {}),
    },
  }
}

function hydrateDailyLogs(logs: DailyLog[]): DailyLog[] {
  return logs.map(hydrateDailyLog)
}

export async function getOrCreateDailyLog(
  userId: string,
  date: string,
): Promise<DailyLog> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: existing } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()

  if (existing) return hydrateDailyLog(existing as DailyLog)

  const { data, error } = await supabase
    .from('daily_logs')
    .insert({ user_id: userId, date })
    .select()
    .single()

  if (error) throw error
  return hydrateDailyLog(data as DailyLog)
}

export async function updateDailyLog(
  id: string,
  input: DailyLogInput,
): Promise<DailyLog> {
  if (!supabase) throw new Error('Supabase not configured')

  const payload = {
    ...input,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('daily_logs')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (!error) return hydrateDailyLog(data as DailyLog)

  if (input.sleep_metrics != null && isMissingSleepMetricsColumn(error)) {
    const { sleep_metrics, ...withoutSleepMetrics } = input

    const { data: current, error: currentError } = await supabase
      .from('daily_logs')
      .select('custom_metrics')
      .eq('id', id)
      .maybeSingle()
    if (currentError) throw currentError

    const existingCustom =
      (current?.custom_metrics as Record<string, number | null> | null | undefined) ??
      input.custom_metrics ??
      {}
    const custom_metrics = encodeSleepMetricsAsCustom(sleep_metrics, {
      ...existingCustom,
      ...(input.custom_metrics ?? {}),
    })

    const { data: retryData, error: retryError } = await supabase
      .from('daily_logs')
      .update({
        ...withoutSleepMetrics,
        custom_metrics,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (!retryError) {
      return hydrateDailyLog({
        ...(retryData as DailyLog),
        sleep_metrics: {
          ...resolveSleepMetrics(retryData as DailyLog),
          ...sleep_metrics,
        },
        custom_metrics,
      })
    }
    throw retryError
  }

  if (isMissingRowError(error)) {
    throw new Error(
      'Daily log record not found. Refresh the page and try again.',
    )
  }

  throw error
}

export async function updateDailyLogForDate(
  userId: string,
  date: string,
  input: DailyLogInput,
): Promise<DailyLog> {
  const log = await getOrCreateDailyLog(userId, date)
  return updateDailyLog(log.id, input)
}

function isMissingSleepMetricsColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as Record<string, unknown>
  const message = typeof record.message === 'string' ? record.message : ''
  const details = typeof record.details === 'string' ? record.details : ''
  const combined = `${message} ${details}`.toLowerCase()
  return (
    record.code === '42703' ||
    record.code === 'PGRST204' ||
    combined.includes('sleep_metrics')
  )
}

function isMissingRowError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as Record<string, unknown>
  return record.code === 'PGRST116'
}

export async function fetchDailyLogs(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<DailyLog[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error) throw error
  return hydrateDailyLogs((data ?? []) as DailyLog[])
}

export async function clearAllMorningLogs(userId: string): Promise<void> {
  if (!supabase) return

  const { data, error } = await supabase
    .from('daily_logs')
    .select('id')
    .eq('user_id', userId)
    .not('morning_log', 'is', null)

  if (error) throw error
  if (!data?.length) return

  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('daily_logs')
    .update({ morning_log: null, sleep_hours: null, updated_at: now })
    .eq('user_id', userId)
    .not('morning_log', 'is', null)

  if (updateError) throw updateError
}

export async function fetchWorkouts(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<Workout[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error) throw error
  return (data ?? []) as Workout[]
}

export async function addWorkout(
  workout: Omit<Workout, 'id' | 'created_at'>,
): Promise<Workout> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('workouts')
    .insert(workout)
    .select()
    .single()

  if (error) throw error
  return data as Workout
}

export async function updateWorkout(
  id: string,
  updates: Partial<Pick<Workout, 'duration_minutes' | 'notes'>>,
): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from('workouts').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteWorkout(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from('workouts').delete().eq('id', id)
  if (error) throw error
}

export async function fetchGoals(userId: string): Promise<Goal[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as Goal[]
}

const GOAL_TABLE_FIELDS = [
  'id',
  'user_id',
  'metric_key',
  'name',
  'target_value',
  'target_type',
  'log_period',
  'target_period',
  'period_days',
  'period_start_date',
  'period_end_date',
  'period_recurring',
  'category_id',
  'goal_weight_start',
  'goal_weight_target',
  'unit',
  'is_active',
  'show_in_daily_log',
  'created_at',
] as const

function goalRowForTable(
  goal: Omit<Goal, 'created_at'> & { created_at?: string },
): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  const raw = goal as unknown as Record<string, unknown>
  for (const field of GOAL_TABLE_FIELDS) {
    if (raw[field] !== undefined) row[field] = raw[field]
  }
  return row
}

export async function upsertGoal(
  goal: Omit<Goal, 'created_at'> & { created_at?: string },
): Promise<Goal> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('goals')
    .upsert(goalRowForTable(goal))
    .select()
    .single()

  if (error) throw error
  return data as Goal
}

export async function deleteGoal(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from('goals').delete().eq('id', id)
  if (error) throw error
}

export async function fetchScheduleBlocks(
  userId: string,
  date: string,
): Promise<ScheduleBlock[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('schedule_blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('start_time', { ascending: true })

  if (error) throw error
  return (data ?? []) as ScheduleBlock[]
}

export async function upsertScheduleBlock(
  block: Omit<ScheduleBlock, 'created_at'> & { created_at?: string },
): Promise<ScheduleBlock> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('schedule_blocks')
    .upsert(block)
    .select()
    .single()

  if (error) throw error
  return data as ScheduleBlock
}

export async function deleteScheduleBlock(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from('schedule_blocks').delete().eq('id', id)
  if (error) throw error
}

export async function fetchReminders(userId: string): Promise<Reminder[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', userId)
    .order('due_date', { ascending: true })

  if (error) throw error
  return (data ?? []) as Reminder[]
}

export async function upsertReminder(
  reminder: Omit<Reminder, 'created_at'> & { created_at?: string },
): Promise<Reminder> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('reminders')
    .upsert(reminder)
    .select()
    .single()

  if (error) throw error
  return data as Reminder
}

export async function deleteReminder(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from('reminders').delete().eq('id', id)
  if (error) throw error
}

export interface UserStorageRow {
  value: unknown
  updated_at: string | null
}

export async function fetchAllUserStorage(
  userId: string,
): Promise<Record<string, UserStorageRow>> {
  if (!supabase) return {}

  const { data, error } = await supabase
    .from('user_storage')
    .select('key, value, updated_at')
    .eq('user_id', userId)

  if (error) throw error

  const result: Record<string, UserStorageRow> = {}
  for (const row of data ?? []) {
    result[row.key as string] = {
      value: row.value,
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
    }
  }
  return result
}

export async function upsertUserStorage(
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase.from('user_storage').upsert(
    {
      user_id: userId,
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,key' },
  )

  if (error) throw error
}

export async function deleteUserStorageKey(userId: string, key: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase
    .from('user_storage')
    .delete()
    .eq('user_id', userId)
    .eq('key', key)
  if (error) throw error
}

export async function clearUserStorage(userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from('user_storage').delete().eq('user_id', userId)
  if (error) throw error
}

/** Deletes the signed-in Supabase auth user (app data cascades via FK). */
export async function deleteSupabaseAccount(): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase.rpc('delete_own_account')
  if (error) throw error
}

/** Deletes all rows owned by the user across core tables and user_storage. */
export async function clearAllUserData(userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  await clearUserStorage(userId)

  for (const table of [
    'daily_logs',
    'workouts',
    'goals',
    'schedule_blocks',
    'reminders',
  ] as const) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    if (error) throw error
  }
}
