const PULSE_DEV_PREVIEW_KEY = 'dojo-pulse-dev-preview'
const PULSE_DEV_PREVIEW_EVENT = 'dojo-pulse-dev-preview-change'

export function getPulseDevPreviewScore(): number | null {
  try {
    const raw = sessionStorage.getItem(PULSE_DEV_PREVIEW_KEY)
    if (raw == null || raw === '') return null
    const score = Number(raw)
    return Number.isFinite(score) ? score : null
  } catch {
    return null
  }
}

export function setPulseDevPreviewScore(score: number | null): void {
  try {
    if (score == null) {
      sessionStorage.removeItem(PULSE_DEV_PREVIEW_KEY)
    } else {
      sessionStorage.setItem(PULSE_DEV_PREVIEW_KEY, String(score))
    }
    window.dispatchEvent(new CustomEvent(PULSE_DEV_PREVIEW_EVENT, { detail: score }))
  } catch {
    /* ignore */
  }
}

export function subscribePulseDevPreview(onChange: () => void): () => void {
  const handler = () => onChange()
  window.addEventListener(PULSE_DEV_PREVIEW_EVENT, handler)
  return () => window.removeEventListener(PULSE_DEV_PREVIEW_EVENT, handler)
}
