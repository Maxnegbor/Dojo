import { isSupabaseConfigured } from '@/lib/supabase'

const cache = new Map<string, string>()
let activeUserId: string | null = null
let hydratePromise: Promise<void> | null = null
const persistTail = new Map<string, Promise<void>>()

const APP_PREFIX = 'personal-os-'

function skipMigrationKey(key: string): boolean {
  return (
    key.startsWith('personal-os-local-') ||
    key === 'personal-os-data' ||
    key.startsWith('personal-os-data-')
  )
}

export function isUserStorageActive(): boolean {
  return Boolean(activeUserId && isSupabaseConfigured)
}

export async function initUserStorage(userId: string): Promise<void> {
  if (hydratePromise && activeUserId === userId) {
    await hydratePromise
    return
  }

  activeUserId = userId

  if (!isSupabaseConfigured) {
    window.dispatchEvent(new Event('user-storage-ready'))
    return
  }

  hydratePromise = (async () => {
    const { fetchAllUserStorage, upsertUserStorage } = await import('@/lib/supabase')
    const remote = await fetchAllUserStorage(userId)

    // Writes that happened while fetch was in-flight must win over stale remote.
    const localWrites = new Map(cache)

    cache.clear()
    for (const [key, value] of Object.entries(remote)) {
      cache.set(key, JSON.stringify(value))
    }

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(APP_PREFIX) || skipMigrationKey(key)) continue
      if (key in remote) continue
      const raw = localStorage.getItem(key)
      if (raw == null) continue
      try {
        const parsed = JSON.parse(raw) as unknown
        cache.set(key, raw)
        await upsertUserStorage(userId, key, parsed)
        localStorage.removeItem(key)
      } catch {
        /* ignore invalid json */
      }
    }

    for (const [key, value] of localWrites) {
      cache.set(key, value)
      enqueuePersist(key)
    }

    window.dispatchEvent(new Event('user-storage-ready'))
  })()

  await hydratePromise
}

export function clearUserStorageSession(): void {
  activeUserId = null
  hydratePromise = null
  cache.clear()
}

export function storageGetItem(key: string): string | null {
  if (cache.has(key)) return cache.get(key)!
  if (!isUserStorageActive()) return localStorage.getItem(key)
  return null
}

export function storageSetItem(key: string, value: string): void {
  cache.set(key, value)
  if (isUserStorageActive()) {
    enqueuePersist(key)
    return
  }
  localStorage.setItem(key, value)
}

export function storageRemoveItem(key: string): void {
  cache.delete(key)
  if (isUserStorageActive()) {
    void import('@/lib/supabase').then(({ deleteUserStorageKey }) => {
      if (activeUserId) void deleteUserStorageKey(activeUserId, key)
    })
    return
  }
  localStorage.removeItem(key)
}

export function storageKeys(prefix?: string): string[] {
  if (isUserStorageActive()) {
    return [...cache.keys()].filter((key) => !prefix || key.startsWith(prefix))
  }
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (!prefix || key.startsWith(prefix))) keys.push(key)
  }
  return keys
}

export async function clearAllUserStorage(userId: string): Promise<void> {
  cache.clear()
  if (isSupabaseConfigured) {
    const { clearUserStorage } = await import('@/lib/supabase')
    await clearUserStorage(userId)
  }
  const keys = storageKeys(APP_PREFIX).filter((key) => !skipMigrationKey(key))
  for (const key of keys) {
    localStorage.removeItem(key)
  }
}

function parseStoredValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function enqueuePersist(key: string): void {
  const previous = persistTail.get(key) ?? Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(() => persistLatest(key))
  persistTail.set(key, next)
}

/** Always persist whatever is currently in cache so a stale in-flight write cannot clobber a newer save. */
async function persistLatest(key: string): Promise<void> {
  if (!activeUserId) return
  const value = cache.get(key)
  if (value == null) return
  const { upsertUserStorage } = await import('@/lib/supabase')
  await upsertUserStorage(activeUserId, key, parseStoredValue(value))
}
