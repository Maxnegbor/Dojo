import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ColorDotPicker } from '@/components/ui/ColorDotPicker'
import {
  createFocusLabel,
  FOCUS_LABEL_SWATCHES,
  FOCUS_LABELS_CHANGED,
  getFocusLabels,
  saveFocusLabels,
  type FocusLabel,
} from '@/lib/focusLabels'

interface FocusLabelsEditorProps {
  onSaved?: () => void
}

export function FocusLabelsEditor({ onSaved }: FocusLabelsEditorProps) {
  const [labels, setLabels] = useState(() => getFocusLabels())

  useEffect(() => {
    const sync = () => setLabels(getFocusLabels())
    window.addEventListener(FOCUS_LABELS_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(FOCUS_LABELS_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [])

  const commit = (next: FocusLabel[]) => {
    const saved = saveFocusLabels(next)
    setLabels(saved)
    onSaved?.()
  }

  const updateLabel = (id: string, patch: Partial<Pick<FocusLabel, 'label' | 'color'>>) => {
    commit(labels.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
  }

  const removeLabel = (id: string) => {
    commit(labels.filter((entry) => entry.id !== id))
  }

  const addLabel = () => {
    commit([...labels, createFocusLabel()])
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Tag focus sessions so Overview → Focus can break down time by what you worked on.
      </p>

      <ul className="space-y-2">
        {labels.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-2.5"
          >
            <ColorDotPicker
              value={entry.color}
              swatches={FOCUS_LABEL_SWATCHES}
              onChange={(color) => updateLabel(entry.id, { color })}
              label={`Color for ${entry.label || 'label'}`}
            />
            <input
              type="text"
              value={entry.label}
              maxLength={32}
              onChange={(e) => updateLabel(entry.id, { label: e.target.value })}
              className="min-w-0 flex-1 rounded-lg border border-zinc-700/80 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-[var(--accent-500)]"
              aria-label="Focus label name"
            />
            <button
              type="button"
              onClick={() => removeLabel(entry.id)}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
              aria-label={`Delete ${entry.label}`}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={addLabel}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
      >
        <Plus size={14} />
        Add label
      </button>
    </div>
  )
}
