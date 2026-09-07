import { storageGetItem, storageRemoveItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-openai'
export const OPENAI_CHANGED = 'personal-os-openai-changed'

export const OPENAI_MODELS = [
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { id: 'gpt-4o', label: 'GPT-4o' },
] as const

export const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini'

export interface OpenAIConfig {
  apiKey: string
  model: string
}

function normalizeModel(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_OPENAI_MODEL
  const trimmed = raw.trim()
  return trimmed || DEFAULT_OPENAI_MODEL
}

function normalizeConfig(raw: unknown): OpenAIConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const key = (raw as { apiKey?: unknown }).apiKey
  if (typeof key !== 'string') return null
  const trimmed = key.trim()
  if (!trimmed) return null
  return {
    apiKey: trimmed,
    model: normalizeModel((raw as { model?: unknown }).model),
  }
}

export function getOpenAIConfig(): OpenAIConfig | null {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return null
    return normalizeConfig(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function getOpenAIApiKey(): string | null {
  return getOpenAIConfig()?.apiKey ?? null
}

export function getOpenAIModel(): string {
  return getOpenAIConfig()?.model ?? DEFAULT_OPENAI_MODEL
}

export function saveOpenAIConfig(config: OpenAIConfig): OpenAIConfig {
  const next = normalizeConfig(config)
  if (!next) {
    clearOpenAIConfig()
    throw new Error('Enter a valid OpenAI API key')
  }
  storageSetItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(OPENAI_CHANGED))
  return next
}

export function clearOpenAIConfig() {
  storageRemoveItem(STORAGE_KEY)
  window.dispatchEvent(new Event(OPENAI_CHANGED))
}

export function isOpenAIConnected(): boolean {
  return getOpenAIApiKey() != null
}
