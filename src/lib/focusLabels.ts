import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { generateId } from '@/lib/utils'

const STORAGE_KEY = 'personal-os-focus-labels'
const LAST_LABEL_KEY = 'personal-os-focus-last-label'
export const FOCUS_LABELS_CHANGED = 'personal-os-focus-labels-changed'

export interface FocusLabel {
  id: string
  label: string
  color: string
}

export const FOCUS_LABEL_SWATCHES = [
  '#f59e0b',
  '#3b82f6',
  '#10b981',
  '#8b5cf6',
  '#f43f5e',
  '#06b6d4',
  '#f97316',
  '#ec4899',
  '#84cc16',
  '#6366f1',
] as const

export const DEFAULT_FOCUS_LABELS: FocusLabel[] = [
  { id: 'deep_work', label: 'Deep Work', color: '#3b82f6' },
  { id: 'learning', label: 'Learning', color: '#8b5cf6' },
  { id: 'admin', label: 'Admin', color: '#f59e0b' },
]

function slugifyLabelId(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return slug || `label_${generateId().slice(0, 8)}`
}

function normalizeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`
  return fallback
}

function normalizeLabel(
  raw: Partial<FocusLabel> & { id?: string; label?: string },
  usedIds: Set<string>,
): FocusLabel {
  const label = (raw.label?.trim() || raw.id || 'Label').slice(0, 32)
  let id = (raw.id?.trim() || slugifyLabelId(label)).slice(0, 40)
  if (!id || usedIds.has(id)) {
    id = `${slugifyLabelId(label)}_${generateId().slice(0, 6)}`
  }
  usedIds.add(id)
  return {
    id,
    label,
    color: normalizeColor(raw.color ?? (raw as { hex?: string }).hex, FOCUS_LABEL_SWATCHES[0]),
  }
}

export function normalizeFocusLabels(labels: FocusLabel[] | undefined | null): FocusLabel[] {
  const usedIds = new Set<string>()
  const list = (Array.isArray(labels) ? labels : [])
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => normalizeLabel(entry, usedIds))
  return list
}

export function getFocusLabels(): FocusLabel[] {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    // No key yet → seed defaults for first visit. An explicit `[]` means the user
    // deleted every label and must stay empty.
    if (raw == null) return DEFAULT_FOCUS_LABELS.map((entry) => ({ ...entry }))
    const parsed = JSON.parse(raw) as FocusLabel[]
    if (!Array.isArray(parsed)) {
      return DEFAULT_FOCUS_LABELS.map((entry) => ({ ...entry }))
    }
    return normalizeFocusLabels(parsed)
  } catch {
    return DEFAULT_FOCUS_LABELS.map((entry) => ({ ...entry }))
  }
}

export function saveFocusLabels(labels: FocusLabel[]): FocusLabel[] {
  const next = normalizeFocusLabels(labels)
  storageSetItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(FOCUS_LABELS_CHANGED))
  return next
}

export function createFocusLabel(patch?: Partial<Pick<FocusLabel, 'label' | 'color'>>): FocusLabel {
  const usedIds = new Set(getFocusLabels().map((entry) => entry.id))
  const swatch =
    FOCUS_LABEL_SWATCHES[getFocusLabels().length % FOCUS_LABEL_SWATCHES.length] ??
    FOCUS_LABEL_SWATCHES[0]
  return normalizeLabel(
    {
      label: patch?.label?.trim() || 'New label',
      color: patch?.color ?? swatch,
    },
    usedIds,
  )
}

export function getFocusLabelById(id: string | null | undefined): FocusLabel | null {
  if (!id) return null
  return getFocusLabels().find((entry) => entry.id === id) ?? null
}

export function getLastFocusLabelId(): string | null {
  try {
    const raw = storageGetItem(LAST_LABEL_KEY)
    if (!raw) return null
    const id = raw.trim()
    if (!id) return null
    return getFocusLabels().some((entry) => entry.id === id) ? id : null
  } catch {
    return null
  }
}

export function setLastFocusLabelId(id: string | null) {
  if (!id) {
    storageSetItem(LAST_LABEL_KEY, '')
    return
  }
  storageSetItem(LAST_LABEL_KEY, id)
}
