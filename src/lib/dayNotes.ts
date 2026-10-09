import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-day-notes'
export const DAY_NOTES_CHANGED = 'personal-os-day-notes-changed'

function readAll(): Record<string, string[]> {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const notes: Record<string, string[]> = {}
    for (const [date, value] of Object.entries(parsed)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(value)) continue
      const items = value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
      if (items.length > 0) notes[date] = items
    }
    return notes
  } catch {
    return {}
  }
}

export function getDayNoteItems(date: string): string[] {
  return readAll()[date] ?? []
}

export function saveDayNoteItems(date: string, items: string[]) {
  const notes = readAll()
  const cleaned = items.map((item) => item.trim()).filter((item) => item.length > 0)
  if (cleaned.length === 0) delete notes[date]
  else notes[date] = cleaned
  storageSetItem(STORAGE_KEY, JSON.stringify(notes))
  window.dispatchEvent(new Event(DAY_NOTES_CHANGED))
}
