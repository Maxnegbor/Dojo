import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MetricStepperProps {
  label: string
  value: number | null
  unit?: string
  step?: number
  disabled?: boolean
  className?: string
  onChange: (value: number | null) => void
}

function formatStepperValue(value: number | null, step: number): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (step < 1) {
    const decimals = String(step).split('.')[1]?.length ?? 1
    return value.toFixed(decimals)
  }
  return Number.isInteger(value) ? String(value) : String(value)
}

function roundToStep(value: number, step: number): number {
  const decimals = step < 1 ? (String(step).split('.')[1]?.length ?? 1) : 0
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function MetricStepper({
  label,
  value,
  unit,
  step = 1,
  disabled,
  className,
  onChange,
}: MetricStepperProps) {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const stepDown = () => {
    if (value == null) return
    const next = roundToStep(value - step, step)
    onChange(next <= 0 ? null : next)
  }

  const stepUp = () => {
    const base = value ?? 0
    onChange(roundToStep(base + step, step))
  }

  const startEditing = () => {
    if (disabled) return
    setInputValue(value != null ? formatStepperValue(value, step) : '')
    setEditing(true)
  }

  const commitInput = () => {
    setEditing(false)
    const parsed = parseFloat(inputValue)
    if (!inputValue.trim()) {
      onChange(null)
      return
    }
    if (!Number.isNaN(parsed) && parsed >= 0) {
      onChange(roundToStep(parsed, step))
    }
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  return (
    <div className={cn('inline-block w-fit max-w-full', className)}>
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <div
        className={cn(
          'flex h-[42px] w-fit items-stretch overflow-hidden rounded-lg border border-zinc-700/60 bg-zinc-900/80',
          'focus-within:border-[var(--accent-500)] focus-within:ring-1 focus-within:ring-[var(--accent-ring)]',
          disabled && 'opacity-60',
        )}
      >
        <button
          type="button"
          disabled={disabled || value == null}
          onClick={stepDown}
          className={cn(
            'flex w-9 shrink-0 items-center justify-center text-zinc-400 transition-colors',
            'hover:bg-zinc-800 hover:text-zinc-200',
            'disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-400',
          )}
          aria-label={`Decrease ${label}`}
        >
          <Minus size={14} />
        </button>

        {editing ? (
          <div className="flex min-w-[4.5rem] items-center justify-center gap-1 px-2">
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={commitInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitInput()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setEditing(false)
                }
              }}
              className="w-full min-w-0 bg-transparent text-center text-sm tabular-nums text-zinc-100 focus:outline-none"
              aria-label={`Enter ${label}`}
            />
            {unit ? <span className="shrink-0 text-xs text-zinc-500">{unit}</span> : null}
          </div>
        ) : (
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            onDoubleClick={startEditing}
            onKeyDown={(e) => {
              if (e.key === 'Enter') startEditing()
            }}
            className={cn(
              'flex min-w-[4.5rem] cursor-text select-none items-center justify-center gap-1 px-2 text-sm tabular-nums text-zinc-100',
              !disabled && 'hover:text-zinc-50',
            )}
            title={disabled ? undefined : 'Double-click to type'}
          >
            {formatStepperValue(value, step)}
            {unit ? <span className="text-xs text-zinc-500">{unit}</span> : null}
          </div>
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={stepUp}
          className={cn(
            'flex w-9 shrink-0 items-center justify-center text-zinc-400 transition-colors',
            'hover:bg-zinc-800 hover:text-zinc-200',
            'disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-400',
          )}
          aria-label={`Increase ${label}`}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

export function stepForWeeklyMetric(unit: string): number {
  const normalized = unit.trim().toLowerCase()
  if (normalized === 'kg' || normalized === 'lbs' || normalized === 'lb') return 0.1
  if (normalized === '%' || normalized === 'percent') return 1
  if (normalized === 'min' || normalized === 'min/wk') return 5
  return 1
}
