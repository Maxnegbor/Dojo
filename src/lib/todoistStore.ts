import { storageGetItem, storageRemoveItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-todoist'
const HOME_COLLAPSED_KEY = 'personal-os-todoist-home-collapsed'
export const TODOIST_CHANGED = 'personal-os-todoist-changed'

export interface TodoistConfig {
  apiToken: string
}

function normalizeConfig(raw: unknown): TodoistConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const token = (raw as { apiToken?: unknown }).apiToken
  if (typeof token !== 'string') return null
  const trimmed = token.trim()
  if (!trimmed) return null
  return { apiToken: trimmed }
}

export function getTodoistConfig(): TodoistConfig | null {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return null
    return normalizeConfig(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function getTodoistToken(): string | null {
  return getTodoistConfig()?.apiToken ?? null
}

export function saveTodoistConfig(config: TodoistConfig): TodoistConfig {
  const next = normalizeConfig(config)
  if (!next) {
    clearTodoistConfig()
    throw new Error('Enter a valid Todoist API token')
  }
  storageSetItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(TODOIST_CHANGED))
  return next
}

export function clearTodoistConfig() {
  storageRemoveItem(STORAGE_KEY)
  window.dispatchEvent(new Event(TODOIST_CHANGED))
}

export function isTodoistConnected(): boolean {
  return getTodoistToken() != null
}

export function isTodoistHomeCollapsed(): boolean {
  try {
    return storageGetItem(HOME_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function setTodoistHomeCollapsed(collapsed: boolean) {
  if (collapsed) storageSetItem(HOME_COLLAPSED_KEY, '1')
  else storageRemoveItem(HOME_COLLAPSED_KEY)
}
