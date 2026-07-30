import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
  getWorkoutTypes,
  saveWorkoutTypes,
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

  const setSubtypes = (typeId: string, subtypes: string[]) => {
    commit(
      types.map((type) => {
        if (type.id !== typeId) return type
        const next: WorkoutTypeDefinition = {
          id: type.id,
          label: type.label,
          color: type.color,
          unit: type.unit,
          log_period: type.log_period,
          log_when: type.log_when,
          morning_day: type.morning_day,
        }
        if (subtypes.length > 0) next.subtypes = subtypes
        return next
      }),
    )
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

  if (types.length === 0) {
    return (
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Add workout types under Metrics → Workouts first, then define subcategories here (e.g. Strength
        → Push / Pull / Legs).
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Optional session flavors for each workout type. When set, Home planning and this weekly
        template ask you to pick one (e.g. Strength → Push).
      </p>
      {types.map((type) => {
        const subtypes = type.subtypes ?? []
        const draft = draftByType[type.id] ?? ''
        return (
          <div
            key={type.id}
            className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 space-y-2.5"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: type.color || 'var(--accent-500)' }}
              />
              <p className="text-sm font-medium text-zinc-100">{type.label}</p>
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
      })}
    </div>
  )
}
