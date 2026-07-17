import { deleteLocalAccount } from '@/lib/localAuth'
import { deleteSupabaseAccount, isSupabaseConfigured } from '@/lib/supabase'
import { formatUnknownError } from '@/lib/utils'

const APP_PREFIX = 'personal-os-'
const LEGACY_DATA_KEY = 'personal-os-data'

function clearAllLocalAppKeys() {
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

/** Deletes the account (Supabase auth user or local user) and wipes local app storage. */
export async function deleteAccount(userId: string | null): Promise<void> {
  if (isSupabaseConfigured) {
    await deleteSupabaseAccount()
  } else {
    if (!userId) throw new Error('No signed-in user')
    deleteLocalAccount(userId)
  }

  clearAllLocalAppKeys()
}

export function formatDeleteAccountError(error: unknown): string {
  const message = formatUnknownError(error, 'Could not delete account. Try again.')
  if (message.includes('delete_own_account')) {
    return `${message} Run supabase/migrations/003_delete_own_account.sql in the Supabase SQL editor, then try again.`
  }
  return message
}
