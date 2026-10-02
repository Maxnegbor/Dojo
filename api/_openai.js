const ALLOWED_MODELS = new Set(['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'])

export function siteOpenAIKey() {
  return process.env.OPENAI_API_KEY?.trim() || ''
}

export function rejectMissingSiteKey(res) {
  res.status(501).json({
    error: { message: 'ChatGPT is not configured for this site yet.' },
  })
}

export function siteChatBody(body) {
  const source = body && typeof body === 'object' ? body : {}
  const requested = typeof source.model === 'string' ? source.model.trim() : ''
  const maxRaw = Number(source.max_tokens)
  const maxTokens = Number.isFinite(maxRaw) ? Math.min(Math.max(1, maxRaw), 2000) : 700
  return {
    ...source,
    model: ALLOWED_MODELS.has(requested) ? requested : 'gpt-4.1-mini',
    max_tokens: maxTokens,
  }
}
