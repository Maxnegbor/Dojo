import { clearAllUserData, isSupabaseConfigured } from '@/lib/supabase'

const APP_PREFIX = 'personal-os-'
const LEGACY_DATA_KEY = 'personal-os-data'

/** Wipes all Dojo config keys and user data (Supabase when configured). */
export async function resetAllAppData(userId?: string | null) {
  if (isSupabaseConfigured && userId) {
    await clearAllUserData(userId)
  }

  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(APP_PREFIX)) keys.push(key)
  }
  for (const key of keys) {
    localStorage.removeItem(key)
  }

  localStorage.removeItem(LEGACY_DATA_KEY)
}
