import { storageGetItem, storageRemoveItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-habitify'
const HOME_COLLAPSED_KEY = 'personal-os-habitify-home-collapsed'
export const HABITIFY_CHANGED = 'personal-os-habitify-changed'

export interface HabitifyConfig {
  apiKey: string
}

function normalizeConfig(raw: unknown): HabitifyConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const key = (raw as { apiKey?: unknown }).apiKey
  if (typeof key !== 'string') return null
  const trimmed = key.trim()
  if (!trimmed) return null
  return { apiKey: trimmed }
}

export function getHabitifyConfig(): HabitifyConfig | null {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return null
    return normalizeConfig(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function getHabitifyApiKey(): string | null {
  return getHabitifyConfig()?.apiKey ?? null
}

export function saveHabitifyConfig(config: HabitifyConfig): HabitifyConfig {
  const next = normalizeConfig(config)
  if (!next) {
    clearHabitifyConfig()
    throw new Error('Enter a valid Habitify API key')
  }
  storageSetItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(HABITIFY_CHANGED))
  return next
}

export function clearHabitifyConfig() {
  storageRemoveItem(STORAGE_KEY)
  window.dispatchEvent(new Event(HABITIFY_CHANGED))
}

export function isHabitifyConnected(): boolean {
  return getHabitifyApiKey() != null
}

export function isHabitifyHomeCollapsed(): boolean {
  try {
    return storageGetItem(HOME_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function setHabitifyHomeCollapsed(collapsed: boolean) {
  if (collapsed) storageSetItem(HOME_COLLAPSED_KEY, '1')
  else storageRemoveItem(HOME_COLLAPSED_KEY)
}
