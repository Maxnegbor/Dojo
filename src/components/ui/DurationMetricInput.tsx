import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { minutesToHrsMinInput, parseHrsMinToMinutes, TIMED_METRIC_UNIT } from '@/lib/timedMetrics'

interface DurationMetricInputProps {
  label: string
  value: number | null | undefined
  onChange: (minutes: number | null) => void
  compact?: boolean
  disabled?: boolean
  placeholder?: string
}

export function DurationMetricInput({
  label,
  value,
  onChange,
  compact,
  disabled,
  placeholder = '0:00',
}: DurationMetricInputProps) {
  const [text, setText] = useState(() => minutesToHrsMinInput(value))

  useEffect(() => {
    setText(minutesToHrsMinInput(value))
  }, [value])

  const commit = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) {
      setText('')
      onChange(null)
      return
    }
    const minutes = parseHrsMinToMinutes(trimmed)
    if (minutes == null) {
      setText(minutesToHrsMinInput(value))
      return
    }
    const formatted = minutesToHrsMinInput(minutes)
    setText(formatted)
    onChange(minutes)
  }

  return (
    <label className="block">
      <span
        className={cn(
          'block font-medium text-zinc-400',
          compact ? 'mb-0.5 text-[10px] uppercase tracking-wide' : 'mb-1 text-xs',
        )}
      >
        {label}
      </span>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          placeholder={placeholder}
          disabled={disabled}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(text)
          }}
          className={cn(
            'w-full rounded-lg border border-zinc-700/60 bg-zinc-900/80 text-zinc-100',
            'placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]',
            'disabled:cursor-not-allowed disabled:opacity-60',
            compact ? 'px-2.5 py-1.5 pr-12 text-xs' : 'px-3 py-2 pr-14 text-sm',
          )}
        />
        <span
          className={cn(
            'pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500',
            compact ? 'text-[10px]' : 'text-xs',
          )}
        >
          {TIMED_METRIC_UNIT}
        </span>
      </div>
    </label>
  )
}
