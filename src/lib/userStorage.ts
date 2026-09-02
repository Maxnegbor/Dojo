import { isSupabaseConfigured } from '@/lib/supabase'

const cache = new Map<string, string>()
let activeUserId: string | null = null
let hydratedUserId: string | null = null
let hydratePromise: Promise<void> | null = null
const persistTail = new Map<string, Promise<void>>()

const APP_PREFIX = 'personal-os-'
const MTIME_KEY = 'personal-os-storage-mtime'

function skipMigrationKey(key: string): boolean {
  return (
    key.startsWith('personal-os-local-') ||
    key === 'personal-os-data' ||
    key.startsWith('personal-os-data-') ||
    key === MTIME_KEY
  )
}

function readMtimeMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MTIME_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value) result[key] = value
    }
    return result
  } catch {
    return {}
  }
}

function getMtime(key: string): string | null {
  return readMtimeMap()[key] ?? null
}

function stampMtime(key: string): void {
  if (key === MTIME_KEY) return
  try {
    const map = readMtimeMap()
    map[key] = new Date().toISOString()
    localStorage.setItem(MTIME_KEY, JSON.stringify(map))
  } catch {
    /* quota / private mode */
  }
}

function clearMtime(key: string): void {
  try {
    const map = readMtimeMap()
    if (!(key in map)) return
    delete map[key]
    localStorage.setItem(MTIME_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

function mirrorToLocal(key: string, value: string, stamp: boolean): void {
  try {
    localStorage.setItem(key, value)
    if (stamp) stampMtime(key)
  } catch {
    /* quota / private mode */
  }
}

function serializeValue(value: unknown): string | null {
  if (value === undefined) return null
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function isLocalNewer(localIso: string | null, remoteIso: string | null): boolean {
  if (!localIso) return false
  if (!remoteIso) return true
  return localIso >= remoteIso
}

function listLocalAppKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(APP_PREFIX) && !skipMigrationKey(key)) keys.push(key)
  }
  return keys
}

export function isUserStorageActive(): boolean {
  return Boolean(activeUserId && isSupabaseConfigured)
}

export function isUserStorageHydrated(userId: string): boolean {
  if (!userId) return false
  if (!isSupabaseConfigured) return true
  return hydratedUserId === userId
}

export async function initUserStorage(userId: string): Promise<void> {
  if (hydratePromise && activeUserId === userId) {
    try {
      await hydratePromise
      return
    } catch {
      hydratePromise = null
      hydratedUserId = null
    }
  }

  activeUserId = userId

  if (!isSupabaseConfigured) {
    hydratedUserId = userId
    window.dispatchEvent(new Event('user-storage-ready'))
    return
  }

  hydratePromise = (async () => {
    const { fetchAllUserStorage } = await import('@/lib/supabase')

    let remote: Awaited<ReturnType<typeof fetchAllUserStorage>> = {}
    try {
      remote = await fetchAllUserStorage(userId)
    } catch {
      cache.clear()
      for (const key of listLocalAppKeys()) {
        const raw = localStorage.getItem(key)
        if (raw != null) cache.set(key, raw)
      }
      hydratedUserId = userId
      window.dispatchEvent(new Event('user-storage-ready'))
      return
    }

    // Writes that happened while fetch was in-flight must win over stale remote.
    const localWrites = new Map(cache)

    cache.clear()
    for (const [key, row] of Object.entries(remote)) {
      const serialized = serializeValue(row.value)
      if (serialized != null) cache.set(key, serialized)
    }

    for (const key of listLocalAppKeys()) {
      const raw = localStorage.getItem(key)
      if (raw == null) continue
      const remoteRow = remote[key]
      if (!remoteRow) {
        cache.set(key, raw)
        enqueuePersist(key)
        continue
      }
      if (isLocalNewer(getMtime(key), remoteRow.updated_at)) {
        cache.set(key, raw)
        enqueuePersist(key)
      }
    }

    for (const [key, value] of localWrites) {
      cache.set(key, value)
      mirrorToLocal(key, value, true)
      enqueuePersist(key)
    }

    for (const [key, value] of cache) {
      mirrorToLocal(key, value, false)
    }

    hydratedUserId = userId
    window.dispatchEvent(new Event('user-storage-ready'))
  })()

  await hydratePromise
}

export function clearUserStorageSession(): void {
  activeUserId = null
  hydratedUserId = null
  hydratePromise = null
  cache.clear()
}

export function storageGetItem(key: string): string | null {
  if (cache.has(key)) return cache.get(key)!
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function storageSetItem(key: string, value: string): void {
  cache.set(key, value)
  mirrorToLocal(key, value, true)
  if (isUserStorageActive()) enqueuePersist(key)
}

export function storageRemoveItem(key: string): void {
  cache.delete(key)
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
  clearMtime(key)
  if (isUserStorageActive()) {
    const userId = activeUserId
    void import('@/lib/supabase').then(({ deleteUserStorageKey }) => {
      if (userId) void deleteUserStorageKey(userId, key)
    })
  }
}

export function storageKeys(prefix?: string): string[] {
  const keys = new Set<string>()
  for (const key of cache.keys()) {
    if (!prefix || key.startsWith(prefix)) keys.add(key)
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (!prefix || key.startsWith(prefix))) keys.add(key)
    }
  } catch {
    /* ignore */
  }
  return [...keys]
}

export async function clearAllUserStorage(userId: string): Promise<void> {
  cache.clear()
  if (isSupabaseConfigured) {
    const { clearUserStorage } = await import('@/lib/supabase')
    await clearUserStorage(userId)
  }
  const keys = storageKeys(APP_PREFIX).filter((key) => !skipMigrationKey(key))
  for (const key of keys) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    clearMtime(key)
  }
}

export async function flushStorageKey(key: string): Promise<void> {
  if (!isUserStorageActive()) return
  enqueuePersist(key)
  const pending = persistTail.get(key)
  if (pending) await pending.catch(() => undefined)
}

function parseStoredValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function enqueuePersist(key: string): void {
  const userId = activeUserId
  if (!userId) return
  const previous = persistTail.get(key) ?? Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(() => persistLatest(key, userId))
  persistTail.set(key, next)
}

/** Always persist whatever is currently in cache so a stale in-flight write cannot clobber a newer save. */
async function persistLatest(key: string, userId: string): Promise<void> {
  const value = cache.get(key)
  if (value == null) return
  const { upsertUserStorage } = await import('@/lib/supabase')
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const latest = cache.get(key)
      if (latest == null) return
      await upsertUserStorage(userId, key, parseStoredValue(latest))
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
  console.error('Failed to persist user storage', key, lastError)
}
