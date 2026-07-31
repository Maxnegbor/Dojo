import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  createFocusLabel,
  FOCUS_LABELS_CHANGED,
  getFocusLabels,
  saveFocusLabels,
  type FocusLabel,
} from '@/lib/focusLabels'
import { cn } from '@/lib/utils'

interface FocusLabelPickerProps {
  value: string | null
  onChange: (labelId: string | null) => void
  disabled?: boolean
  className?: string
}

export function FocusLabelPicker({
  value,
  onChange,
  disabled = false,
  className,
}: FocusLabelPickerProps) {
  const [labels, setLabels] = useState<FocusLabel[]>(() => getFocusLabels())

  useEffect(() => {
    const sync = () => setLabels(getFocusLabels())
    window.addEventListener(FOCUS_LABELS_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(FOCUS_LABELS_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [])

  const addLabel = () => {
    if (disabled) return
    const created = createFocusLabel()
    const next = saveFocusLabels([...getFocusLabels(), created])
    setLabels(next)
    onChange(created.id)
  }

  return (
    <div className={cn('w-full', className)}>
      <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        Working on
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
            value == null
              ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
              : 'border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          None
        </button>
        {labels.map((label) => {
          const active = value === label.id
          return (
            <button
              key={label.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(label.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                active
                  ? 'border-transparent text-zinc-950'
                  : 'border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700',
                disabled && 'cursor-not-allowed opacity-50',
              )}
              style={
                active
                  ? { backgroundColor: label.color, borderColor: label.color }
                  : undefined
              }
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/20"
                style={{ backgroundColor: label.color }}
              />
              {label.label}
            </button>
          )
        })}
        <button
          type="button"
          disabled={disabled}
          onClick={addLabel}
          aria-label="Add label"
          title="Add label"
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-zinc-700 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <Plus size={14} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  )
}
