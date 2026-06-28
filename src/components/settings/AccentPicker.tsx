import { ACCENT_LABELS, ACCENT_SWATCHES, type AccentColor } from '@/types'
import { cn } from '@/lib/utils'

interface AccentPickerProps {
  value: AccentColor
  onChange: (value: AccentColor) => void
}

export function AccentPicker({ value, onChange }: AccentPickerProps) {
  const options = Object.keys(ACCENT_LABELS) as AccentColor[]

  return (
    <div>
      <span className="mb-2 block text-xs font-medium text-zinc-400">Accent color</span>
      <div className="flex flex-wrap gap-2">
        {options.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={ACCENT_LABELS[color]}
            aria-pressed={value === color}
            onClick={() => onChange(color)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
              value === color
                ? 'border-[var(--accent-500)] bg-[var(--accent-950)] text-[var(--accent-200)]'
                : 'border-zinc-700/80 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600',
            )}
          >
            <span
              className="h-3.5 w-3.5 rounded-full ring-2 ring-white/10"
              style={{ backgroundColor: ACCENT_SWATCHES[color] }}
            />
            {ACCENT_LABELS[color]}
          </button>
        ))}
      </div>
    </div>
  )
}
