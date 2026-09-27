import { clearFocusSessionLabel, getFocusSessions } from '@/lib/focusSessions'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { generateId } from '@/lib/utils'

const STORAGE_KEY = 'personal-os-focus-labels'
/** Kept after delete so Overview can still name historical sessions. */
const ARCHIVE_KEY = 'personal-os-focus-labels-archive'
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

/** Slug `createFocusLabel()` used before ids were unique. Reused after delete. */
const GENERIC_NEW_LABEL_ID = 'new_label'

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

/** Give recycled `new_label` rows a unique id so they stop inheriting old minutes. */
function remintGenericCreateId(labels: FocusLabel[]): FocusLabel[] {
  if (!labels.some((entry) => entry.id === GENERIC_NEW_LABEL_ID)) return labels
  const usedIds = new Set(labels.map((entry) => entry.id))
  return labels.map((entry) => {
    if (entry.id !== GENERIC_NEW_LABEL_ID) return entry
    return normalizeLabel({ ...entry, id: generateId() }, usedIds)
  })
}

function persistGenericIdRepair(repaired: FocusLabel[]) {
  storageSetItem(STORAGE_KEY, JSON.stringify(repaired))
  const archiveById = new Map(getArchivedFocusLabels().map((entry) => [entry.id, entry]))
  if (!archiveById.has(GENERIC_NEW_LABEL_ID)) {
    archiveById.set(GENERIC_NEW_LABEL_ID, {
      id: GENERIC_NEW_LABEL_ID,
      label: 'New label',
      color: FOCUS_LABEL_SWATCHES[0],
    })
    saveArchivedFocusLabels([...archiveById.values()])
  }
  try {
    if (storageGetItem(LAST_LABEL_KEY)?.trim() === GENERIC_NEW_LABEL_ID) {
      storageSetItem(LAST_LABEL_KEY, '')
    }
  } catch {
    /* ignore */
  }
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
    const normalized = normalizeFocusLabels(parsed)
    const repaired = remintGenericCreateId(normalized)
    if (repaired !== normalized) persistGenericIdRepair(repaired)
    return repaired
  } catch {
    return DEFAULT_FOCUS_LABELS.map((entry) => ({ ...entry }))
  }
}

export function getArchivedFocusLabels(): FocusLabel[] {
  try {
    const raw = storageGetItem(ARCHIVE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FocusLabel[]
    if (!Array.isArray(parsed)) return []
    return normalizeFocusLabels(parsed)
  } catch {
    return []
  }
}

function saveArchivedFocusLabels(labels: FocusLabel[]) {
  storageSetItem(ARCHIVE_KEY, JSON.stringify(normalizeFocusLabels(labels)))
}

/** Humanize a slug id when we have no archived name (e.g. deep_work → Deep work). */
export function humanizeFocusLabelId(id: string): string {
  const cleaned = id.replace(/_[a-z0-9]{6}$/i, '').replace(/_/g, ' ').trim()
  if (!cleaned) return id
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function fallbackColorForId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return FOCUS_LABEL_SWATCHES[hash % FOCUS_LABEL_SWATCHES.length] ?? FOCUS_LABEL_SWATCHES[0]
}

/** Active label, then archive, then a stable fallback from the id. */
export function resolveFocusLabelMeta(id: string): FocusLabel {
  const active = getFocusLabels().find((entry) => entry.id === id)
  if (active) return active
  const archived = getArchivedFocusLabels().find((entry) => entry.id === id)
  if (archived) return archived
  return {
    id,
    label: humanizeFocusLabelId(id),
    color: fallbackColorForId(id),
  }
}

export function saveFocusLabels(labels: FocusLabel[]): FocusLabel[] {
  const previous = getFocusLabels()
  const next = remintGenericCreateId(normalizeFocusLabels(labels))
  const nextIds = new Set(next.map((entry) => entry.id))

  const removed = previous.filter((entry) => !nextIds.has(entry.id))
  const archiveById = new Map(getArchivedFocusLabels().map((entry) => [entry.id, entry]))
  let archiveChanged = false

  for (const entry of removed) {
    archiveById.set(entry.id, entry)
    archiveChanged = true
  }
  for (const id of nextIds) {
    if (archiveById.delete(id)) archiveChanged = true
  }
  if (archiveChanged) {
    saveArchivedFocusLabels([...archiveById.values()])
  }

  storageSetItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(FOCUS_LABELS_CHANGED))
  return next
}

function usedFocusLabelIds(): Set<string> {
  const used = new Set<string>()
  for (const entry of getFocusLabels()) used.add(entry.id)
  for (const entry of getArchivedFocusLabels()) used.add(entry.id)
  for (const session of getFocusSessions()) {
    if (session.label_id) used.add(session.label_id)
  }
  return used
}

export function createFocusLabel(patch?: Partial<Pick<FocusLabel, 'label' | 'color'>>): FocusLabel {
  const existing = getFocusLabels()
  const usedIds = usedFocusLabelIds()
  const swatch =
    FOCUS_LABEL_SWATCHES[existing.length % FOCUS_LABEL_SWATCHES.length] ??
    FOCUS_LABEL_SWATCHES[0]
  // Unique id so a new row never inherits minutes from a deleted/renamed label.
  return normalizeLabel(
    {
      id: generateId(),
      label: patch?.label?.trim() || 'New label',
      color: patch?.color ?? swatch,
    },
    usedIds,
  )
}

/** Put an archived label back on the active list. */
export function restoreArchivedFocusLabel(id: string): FocusLabel[] {
  const archived = getArchivedFocusLabels()
  const entry = archived.find((item) => item.id === id)
  if (!entry) return getFocusLabels()
  const active = getFocusLabels()
  if (active.some((item) => item.id === id)) {
    saveArchivedFocusLabels(archived.filter((item) => item.id !== id))
    window.dispatchEvent(new Event(FOCUS_LABELS_CHANGED))
    return active
  }
  return saveFocusLabels([...active, entry])
}

/**
 * Remove an archived label for good.
 * Session minutes stay, with the label cleared so they count as unlabeled focus time.
 */
export function permanentlyDeleteArchivedFocusLabel(id: string) {
  const trimmed = id.trim()
  if (!trimmed) return
  saveArchivedFocusLabels(getArchivedFocusLabels().filter((item) => item.id !== trimmed))
  clearFocusSessionLabel(trimmed)
  window.dispatchEvent(new Event(FOCUS_LABELS_CHANGED))
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
