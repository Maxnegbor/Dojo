import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-openai'
export const OPENAI_CHANGED = 'personal-os-openai-changed'

export const OPENAI_MODELS = [
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { id: 'gpt-4o', label: 'GPT-4o' },
] as const

export const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini'

function normalizeModel(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_OPENAI_MODEL
  const trimmed = raw.trim()
  return OPENAI_MODELS.some((item) => item.id === trimmed) ? trimmed : DEFAULT_OPENAI_MODEL
}

/** Drop a personally saved key. ChatGPT uses the site key on the server. */
function readModel(): string {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return DEFAULT_OPENAI_MODEL
    const parsed = JSON.parse(raw) as unknown
    const model = normalizeModel(
      parsed && typeof parsed === 'object' ? (parsed as { model?: unknown }).model : undefined,
    )
    if (parsed && typeof parsed === 'object' && 'apiKey' in parsed) {
      storageSetItem(STORAGE_KEY, JSON.stringify({ model }))
      window.dispatchEvent(new Event(OPENAI_CHANGED))
    }
    return model
  } catch {
    return DEFAULT_OPENAI_MODEL
  }
}

export function getOpenAIModel(): string {
  return readModel()
}

export function saveOpenAIModel(model: string): string {
  const next = normalizeModel(model)
  storageSetItem(STORAGE_KEY, JSON.stringify({ model: next }))
  window.dispatchEvent(new Event(OPENAI_CHANGED))
  return next
}
