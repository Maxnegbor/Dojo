import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { ColorDotPicker } from '@/components/ui/ColorDotPicker'
import { KIND_CATEGORY_FALLBACK } from '@/lib/metricLibrary'
import {
  getWorkoutTypes,
  saveWorkoutTypes,
  slugifyWorkoutId,
  WORKOUT_COLOR_PRESETS,
  WORKOUT_TYPES_CHANGED,
  type WorkoutTypeDefinition,
} from '@/lib/workoutTypes'
import { cn } from '@/lib/utils'

interface WorkoutSubcategoriesEditorProps {
  onSaved?: () => void
}

function parseSubtypeDraft(raw: string): string | null {
  const label = raw.trim().slice(0, 32)
  return label || null
}

function uniqueWorkoutId(label: string, types: WorkoutTypeDefinition[]): string {
  let id = slugifyWorkoutId(label)
  let n = 2
  while (types.some((type) => type.id === id)) {
    id = `${slugifyWorkoutId(label)}_${n}`
    n++
  }
  return id
}

function nextWorkoutColor(types: WorkoutTypeDefinition[]): string {
  const used = new Set(types.map((type) => type.color.toLowerCase()))
  return (
    WORKOUT_COLOR_PRESETS.find((hex) => !used.has(hex.toLowerCase())) ??
    WORKOUT_COLOR_PRESETS[types.length % WORKOUT_COLOR_PRESETS.length] ??
    WORKOUT_COLOR_PRESETS[0]
  )
}

export function WorkoutSubcategoriesEditor({ onSaved }: WorkoutSubcategoriesEditorProps) {
  const [types, setTypes] = useState(() => getWorkoutTypes())
  const [draftByType, setDraftByType] = useState<Record<string, string>>({})

  useEffect(() => {
    const sync = () => setTypes(getWorkoutTypes())
    window.addEventListener(WORKOUT_TYPES_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(WORKOUT_TYPES_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [])

  const commit = (next: WorkoutTypeDefinition[]) => {
    saveWorkoutTypes(next)
    setTypes(getWorkoutTypes())
    onSaved?.()
  }

  const updateType = (typeId: string, patch: Partial<WorkoutTypeDefinition>) => {
    commit(types.map((type) => (type.id === typeId ? { ...type, ...patch } : type)))
  }

  const setSubtypes = (typeId: string, subtypes: string[]) => {
    commit(
      types.map((type) => {
        if (type.id !== typeId) return type
        const next: WorkoutTypeDefinition = { ...type }
        if (subtypes.length > 0) next.subtypes = subtypes
        else delete next.subtypes
        return next
      }),
    )
  }

  const addType = () => {
    const label = 'New workout'
    commit([
      ...types,
      {
        id: uniqueWorkoutId(label, types),
        label,
        color: nextWorkoutColor(types),
        unit: 'min',
        category_id: KIND_CATEGORY_FALLBACK.workout,
      },
    ])
  }

  const removeType = (typeId: string) => {
    commit(types.filter((type) => type.id !== typeId))
  }

  const addSubtype = (typeId: string) => {
    const label = parseSubtypeDraft(draftByType[typeId] ?? '')
    if (!label) return
    const type = types.find((entry) => entry.id === typeId)
    if (!type) return
    const existing = type.subtypes ?? []
    if (existing.some((entry) => entry.toLowerCase() === label.toLowerCase())) {
      setDraftByType((prev) => ({ ...prev, [typeId]: '' }))
      return
    }
    setSubtypes(typeId, [...existing, label].slice(0, 12))
    setDraftByType((prev) => ({ ...prev, [typeId]: '' }))
  }

  const removeSubtype = (typeId: string, subtype: string) => {
    const type = types.find((entry) => entry.id === typeId)
    if (!type) return
    setSubtypes(
      typeId,
      (type.subtypes ?? []).filter((entry) => entry !== subtype),
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Add workout types and optional session flavors. When a type has subcategories, Home planning
        and the weekly template ask you to pick one (e.g. Strength → Push).
      </p>

      {types.length === 0 ? (
        <p className="text-[11px] text-zinc-600">No workout types yet.</p>
      ) : (
        types.map((type) => {
          const subtypes = type.subtypes ?? []
          const draft = draftByType[type.id] ?? ''
          return (
            <div
              key={type.id}
              className="space-y-2.5 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3"
            >
              <div className="flex items-center gap-2">
                <ColorDotPicker
                  value={type.color || WORKOUT_COLOR_PRESETS[0]}
                  swatches={WORKOUT_COLOR_PRESETS}
                  onChange={(color) => updateType(type.id, { color })}
                  label={`Color for ${type.label}`}
                />
                <input
                  type="text"
                  value={type.label}
                  maxLength={32}
                  onChange={(e) => updateType(type.id, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700/80 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                  aria-label="Workout type name"
                />
                <button
                  type="button"
                  onClick={() => removeType(type.id)}
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                  aria-label={`Delete ${type.label}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {subtypes.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {subtypes.map((subtype) => (
                    <span
                      key={subtype}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700/80 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200"
                    >
                      {subtype}
                      <button
                        type="button"
                        onClick={() => removeSubtype(type.id, subtype)}
                        className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                        aria-label={`Remove ${subtype}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-zinc-600">No subcategories yet</p>
              )}

              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={draft}
                  maxLength={32}
                  placeholder={
                    type.label.toLowerCase().includes('strength')
                      ? 'e.g. Push'
                      : 'e.g. Easy'
                  }
                  onChange={(e) =>
                    setDraftByType((prev) => ({ ...prev, [type.id]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addSubtype(type.id)
                    }
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-[var(--accent-500)]"
                />
                <button
                  type="button"
                  onClick={() => addSubtype(type.id)}
                  disabled={!parseSubtypeDraft(draft)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                    parseSubtypeDraft(draft)
                      ? 'bg-[var(--accent-500)] text-black hover:bg-[var(--accent-400)]'
                      : 'cursor-not-allowed bg-zinc-800 text-zinc-500',
                  )}
                >
                  <Plus size={12} />
                  Add
                </button>
              </div>
            </div>
          )
        })
      )}

      <button
        type="button"
        onClick={addType}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
      >
        <Plus size={14} />
        Add workout type
      </button>
    </div>
  )
}
