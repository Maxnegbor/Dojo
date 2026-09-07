import { getOpenAIApiKey, getOpenAIModel } from '@/lib/openaiStore'

const PROXY_URL = '/api/openai'

export class OpenAIApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'OpenAIApiError'
    this.status = status
  }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

function errorMessage(payload: unknown, fallback: string, status: number): string {
  if (payload && typeof payload === 'object') {
    const err = (payload as { error?: { message?: unknown } }).error
    if (typeof err?.message === 'string' && err.message.trim()) return err.message
  }
  if (status === 401) return 'OpenAI API key is invalid. Update it in Settings → Integrations.'
  if (status === 429) return 'OpenAI rate limit hit. Wait a moment and try again.'
  return fallback
}

export async function verifyOpenAIApiKey(apiKey: string): Promise<void> {
  const res = await fetch(`${PROXY_URL}/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      Accept: 'application/json',
    },
  })
  if (res.ok) return
  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    /* ignore */
  }
  throw new OpenAIApiError(
    errorMessage(payload, 'Could not verify the OpenAI API key', res.status),
    res.status,
  )
}

export async function createChatCompletion(input: {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  apiKey?: string
  model?: string
}): Promise<string> {
  const apiKey = input.apiKey ?? getOpenAIApiKey()
  if (!apiKey) throw new OpenAIApiError('ChatGPT is not connected', 401)
  const model = input.model ?? getOpenAIModel()

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: input.messages,
      temperature: input.temperature ?? 0.6,
      max_tokens: input.maxTokens ?? 700,
      response_format: { type: 'json_object' },
    }),
  })

  let payload: ChatCompletionResponse | null = null
  try {
    payload = (await res.json()) as ChatCompletionResponse
  } catch {
    payload = null
  }

  if (!res.ok) {
    throw new OpenAIApiError(
      errorMessage(payload, 'ChatGPT request failed', res.status),
      res.status,
    )
  }

  const content = payload?.choices?.[0]?.message?.content?.trim()
  if (!content) throw new OpenAIApiError('ChatGPT returned an empty reply', 502)
  return content
}
