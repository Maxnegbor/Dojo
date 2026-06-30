import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type {
  DailyLog,
  DailyLogInput,
  Goal,
  Reminder,
  ScheduleBlock,
  Workout,
} from '@/types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseAnonKey) &&
  !supabaseUrl.includes('your-project') &&
  supabaseAnonKey !== 'your-anon-key'

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

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

  if (existing) return existing as DailyLog

  const { data, error } = await supabase
    .from('daily_logs')
    .insert({ user_id: userId, date })
    .select()
    .single()

  if (error) throw error
  return data as DailyLog
}

export async function updateDailyLog(
  id: string,
  input: DailyLogInput,
): Promise<DailyLog> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('daily_logs')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as DailyLog
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
  return (data ?? []) as DailyLog[]
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

export async function upsertGoal(
  goal: Omit<Goal, 'created_at'> & { created_at?: string },
): Promise<Goal> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('goals')
    .upsert(goal)
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

export async function fetchAllUserStorage(userId: string): Promise<Record<string, unknown>> {
  if (!supabase) return {}

  const { data, error } = await supabase
    .from('user_storage')
    .select('key, value')
    .eq('user_id', userId)

  if (error) throw error

  const result: Record<string, unknown> = {}
  for (const row of data ?? []) {
    result[row.key as string] = row.value
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
