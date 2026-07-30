import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { generateId } from '@/lib/utils'
import { BLOCK_COLOR_HEX, GREY_BLOCK_HEX } from '@/types'

const STORAGE_KEY = 'personal-os-schedule-colors'
export const SCHEDULE_COLORS_CHANGED = 'personal-os-schedule-colors-changed'

export interface ScheduleColorPreset {
  id: string
  label: string
  hex: string
  /** Marks the exercise-plan color — cannot be removed. */
  role?: 'workout'
}

export const SCHEDULE_COLOR_SWATCHES = [
  '#3b82f6',
  '#f43f5e',
  '#f59e0b',
  '#10b981',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#ec4899',
  '#84cc16',
  '#6366f1',
] as const

export const DEFAULT_SCHEDULE_COLOR_PRESETS: ScheduleColorPreset[] = [
  { id: 'blue', label: 'Deep Work', hex: BLOCK_COLOR_HEX.blue },
  { id: 'rose', label: 'Family', hex: BLOCK_COLOR_HEX.rose },
  { id: 'amber', label: 'Exercise', hex: BLOCK_COLOR_HEX.amber, role: 'workout' },
]

function slugifyPresetId(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return slug || `color_${generateId().slice(0, 8)}`
}

function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`
  return fallback
}

function normalizePreset(
  raw: Partial<ScheduleColorPreset> & { id?: string; label?: string },
  usedIds: Set<string>,
): ScheduleColorPreset {
  const label = (raw.label?.trim() || raw.id || 'Color').slice(0, 32)
  let id = (raw.id?.trim() || slugifyPresetId(label)).slice(0, 40)
  if (!id || usedIds.has(id)) {
    id = `${slugifyPresetId(label)}_${generateId().slice(0, 6)}`
  }
  usedIds.add(id)
  const hex = normalizeHex(raw.hex, SCHEDULE_COLOR_SWATCHES[0])
  const preset: ScheduleColorPreset = { id, label, hex }
  if (raw.role === 'workout') preset.role = 'workout'
  return preset
}

/** Ensure exactly one workout preset exists. */
export function normalizeScheduleColorPresets(
  presets: ScheduleColorPreset[] | undefined | null,
): ScheduleColorPreset[] {
  const usedIds = new Set<string>()
  const list = (Array.isArray(presets) ? presets : [])
    .filter((p) => p && typeof p === 'object')
    .map((p) => normalizePreset(p, usedIds))

  if (list.length === 0) {
    return DEFAULT_SCHEDULE_COLOR_PRESETS.map((p) => ({ ...p }))
  }

  const workoutIndex = list.findIndex((p) => p.role === 'workout' || p.id === 'amber')
  if (workoutIndex < 0) {
    list.push({
      ...DEFAULT_SCHEDULE_COLOR_PRESETS.find((p) => p.role === 'workout')!,
    })
  } else {
    list[workoutIndex] = { ...list[workoutIndex], role: 'workout' }
    for (let i = 0; i < list.length; i++) {
      if (i !== workoutIndex && list[i].role === 'workout') {
        const { role: _role, ...rest } = list[i]
        list[i] = rest
      }
    }
  }

  return list
}

export function getScheduleColorPresets(): ScheduleColorPreset[] {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SCHEDULE_COLOR_PRESETS.map((p) => ({ ...p }))
    const parsed = JSON.parse(raw) as ScheduleColorPreset[]
    return normalizeScheduleColorPresets(parsed)
  } catch {
    return DEFAULT_SCHEDULE_COLOR_PRESETS.map((p) => ({ ...p }))
  }
}

export function saveScheduleColorPresets(presets: ScheduleColorPreset[]) {
  const normalized = normalizeScheduleColorPresets(presets)
  storageSetItem(STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new Event(SCHEDULE_COLORS_CHANGED))
  return normalized
}

export function getScheduleColorPreset(id: string): ScheduleColorPreset | null {
  if (!id || id === 'grey') return null
  return getScheduleColorPresets().find((p) => p.id === id) ?? null
}

export function getWorkoutSchedulePreset(): ScheduleColorPreset {
  const presets = getScheduleColorPresets()
  return (
    presets.find((p) => p.role === 'workout') ??
    DEFAULT_SCHEDULE_COLOR_PRESETS.find((p) => p.role === 'workout')!
  )
}

export function isWorkoutScheduleColor(activityType: string): boolean {
  if (activityType === 'grey') return false
  const preset = getScheduleColorPreset(activityType)
  return preset?.role === 'workout' || activityType === 'amber'
}

export function scheduleColorHex(activityType: string, fallbackHex?: string): string {
  if (activityType === 'grey') return GREY_BLOCK_HEX
  const preset = getScheduleColorPreset(activityType)
  if (preset) return preset.hex
  if (fallbackHex && /^#[0-9a-fA-F]{6}$/.test(fallbackHex)) return fallbackHex
  return BLOCK_COLOR_HEX.blue
}

export function scheduleColorDefaultTitle(activityType: string): string {
  if (activityType === 'grey') return 'New Block'
  return getScheduleColorPreset(activityType)?.label ?? 'Block'
}

export function createScheduleColorPreset(partial?: {
  label?: string
  hex?: string
}): ScheduleColorPreset {
  const presets = getScheduleColorPresets()
  const usedHex = new Set(presets.map((p) => p.hex.toLowerCase()))
  const hex =
    partial?.hex ??
    SCHEDULE_COLOR_SWATCHES.find((c) => !usedHex.has(c.toLowerCase())) ??
    SCHEDULE_COLOR_SWATCHES[presets.length % SCHEDULE_COLOR_SWATCHES.length]
  const label = partial?.label?.trim() || 'New color'
  const usedIds = new Set(presets.map((p) => p.id))
  return normalizePreset({ label, hex }, usedIds)
}
