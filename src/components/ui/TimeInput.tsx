import { Clock } from 'lucide-react'
import { useSettings } from '@/context/SettingsContext'
import { cn } from '@/lib/utils'

function normalizeTimeValue(raw: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(raw.trim())
  if (!match) return raw
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`
}

function formatTimeValue(value: string, use24h: boolean): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return value || '—'
  const hours = Number(match[1])
  const minutes = match[2]
  if (use24h) return `${String(hours).padStart(2, '0')}:${minutes}`
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${minutes} ${period}`
}

interface TimeInputProps {
  value: string
  onChange: (value: string) => void
  step?: number
  compact?: boolean
  className?: string
  'aria-label'?: string
}

/** Always-visible clock time. Native pickers in dark, narrow grids often look empty until focused. */
export function TimeInput({
  value,
  onChange,
  step = 60,
  compact = false,
  className,
  'aria-label': ariaLabel,
}: TimeInputProps) {
  const { settings } = useSettings()
  const use24h = settings.timeFormat === '24h'
  const display = formatTimeValue(value, use24h)

  return (
    <div
      className={cn(
        'relative min-w-[7.25rem] rounded-md border border-zinc-700/80 bg-zinc-900 text-zinc-100',
        'focus-within:border-[var(--accent-500)]',
        className,
      )}
    >
      <div
        className={cn(
          'pointer-events-none flex items-center justify-between gap-2',
          compact ? 'px-1.5 py-1' : 'px-2 py-1.5',
        )}
        aria-hidden
      >
        <span
          className={cn(
            'min-w-0 truncate tabular-nums',
            compact ? 'text-[11px]' : 'text-sm',
          )}
        >
          {display}
        </span>
        <Clock size={compact ? 12 : 14} className="shrink-0 text-zinc-500" />
      </div>
      <input
        type="time"
        step={step}
        value={value}
        aria-label={ariaLabel ?? 'Time'}
        onChange={(event) => {
          const next = normalizeTimeValue(event.target.value)
          if (next) onChange(next)
        }}
        className="absolute inset-0 z-10 cursor-pointer opacity-[0.01] [color-scheme:dark]"
      />
    </div>
  )
}
