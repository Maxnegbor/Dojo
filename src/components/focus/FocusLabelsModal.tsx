import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { ColorDotPicker } from '@/components/ui/ColorDotPicker'
import {
  createFocusLabel,
  FOCUS_LABEL_SWATCHES,
  FOCUS_LABELS_CHANGED,
  getFocusLabels,
  saveFocusLabels,
  type FocusLabel,
} from '@/lib/focusLabels'
import {
  FOCUS_SESSIONS_CHANGED,
  getFocusSessions,
  sumFocusMinutesByLabel,
} from '@/lib/focusSessions'
import { cn, formatDuration } from '@/lib/utils'

interface FocusLabelsModalProps {
  selectedId: string | null
  onSelect: (labelId: string | null) => void
  onClose: () => void
}

export function FocusLabelsModal({ selectedId, onSelect, onClose }: FocusLabelsModalProps) {
  const [labels, setLabels] = useState(() => getFocusLabels())
  const [minutesByLabel, setMinutesByLabel] = useState(() =>
    sumFocusMinutesByLabel(getFocusSessions()),
  )

  useEffect(() => {
    const syncLabels = () => setLabels(getFocusLabels())
    const syncSessions = () => setMinutesByLabel(sumFocusMinutesByLabel(getFocusSessions()))
    window.addEventListener(FOCUS_LABELS_CHANGED, syncLabels)
    window.addEventListener(FOCUS_SESSIONS_CHANGED, syncSessions)
    window.addEventListener('user-storage-ready', syncLabels)
    window.addEventListener('user-storage-ready', syncSessions)
    return () => {
      window.removeEventListener(FOCUS_LABELS_CHANGED, syncLabels)
      window.removeEventListener(FOCUS_SESSIONS_CHANGED, syncSessions)
      window.removeEventListener('user-storage-ready', syncLabels)
      window.removeEventListener('user-storage-ready', syncSessions)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const commit = (next: FocusLabel[]) => {
    const saved = saveFocusLabels(next)
    setLabels(saved)
    if (selectedId && !saved.some((entry) => entry.id === selectedId)) {
      onSelect(null)
    }
  }

  const updateLabel = (id: string, patch: Partial<Pick<FocusLabel, 'label' | 'color'>>) => {
    commit(labels.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
  }

  const removeLabel = (id: string) => {
    commit(labels.filter((entry) => entry.id !== id))
  }

  const addLabel = () => {
    const created = createFocusLabel()
    commit([...labels, created])
    onSelect(created.id)
  }

  const unlabeledMinutes = minutesByLabel.get(null) ?? 0
  const totalLabeled = useMemo(
    () => labels.reduce((sum, entry) => sum + (minutesByLabel.get(entry.id) ?? 0), 0),
    [labels, minutesByLabel],
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-labelledby="focus-labels-title"
        className="flex max-h-[min(36rem,90vh)] w-full max-w-md flex-col rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800/80 px-5 py-4">
          <div>
            <h2 id="focus-labels-title" className="text-base font-semibold text-zinc-100">
              Focus labels
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Rename, recolor, or add what you work on.
              {totalLabeled > 0 || unlabeledMinutes > 0
                ? ` ${formatDuration(totalLabeled + unlabeledMinutes)} logged total.`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {labels.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-500">
              No labels yet. Add one to tag focus sessions.
            </p>
          ) : (
            <ul className="space-y-2">
              {labels.map((entry) => {
                const minutes = minutesByLabel.get(entry.id) ?? 0
                const selected = selectedId === entry.id
                return (
                  <li
                    key={entry.id}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border bg-zinc-950/60 p-2.5',
                      selected
                        ? 'border-[var(--accent-500)]/50'
                        : 'border-zinc-800/80',
                    )}
                  >
                    <ColorDotPicker
                      value={entry.color}
                      swatches={FOCUS_LABEL_SWATCHES}
                      onChange={(color) => updateLabel(entry.id, { color })}
                      label={`Color for ${entry.label || 'label'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={entry.label}
                        maxLength={32}
                        onChange={(e) => updateLabel(entry.id, { label: e.target.value })}
                        onFocus={() => onSelect(entry.id)}
                        className="w-full rounded-lg border border-zinc-700/80 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                        aria-label="Focus label name"
                      />
                      <p className="mt-1 px-0.5 text-[10px] tabular-nums text-zinc-500">
                        {minutes > 0 ? formatDuration(minutes) : 'No time yet'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLabel(entry.id)}
                      className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                      aria-label={`Delete ${entry.label}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {unlabeledMinutes > 0 && (
            <p className="px-1 text-[10px] text-zinc-600">
              Untagged sessions: {formatDuration(unlabeledMinutes)}
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-zinc-800/80 px-5 py-4">
          <button
            type="button"
            onClick={addLabel}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-700 px-3 py-2.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
          >
            <Plus size={14} />
            Add label
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-zinc-800 px-4 py-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
