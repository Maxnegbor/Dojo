import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  WEIGHT_STEP_KG,
  adjustWeightKg,
  formatWeightStepper,
  formatWeightValue,
  parseWeightInput,
} from '@/lib/settingsStore'
import type { AppSettings } from '@/types'

interface WeightStepperProps {
  label?: string
  valueKg: number | null
  unit: AppSettings['weightUnit']
  disabled?: boolean
  onChange: (kg: number | null) => void
}

export function WeightStepper({
  label = 'Weight',
  valueKg,
  unit,
  disabled,
  onChange,
}: WeightStepperProps) {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const stepDown = () => {
    if (valueKg == null) return
    const next = adjustWeightKg(valueKg, -WEIGHT_STEP_KG)
    onChange(next <= 0 ? null : next)
  }

  const stepUp = () => {
    const base = valueKg ?? 0
    onChange(adjustWeightKg(base, WEIGHT_STEP_KG))
  }

  const startEditing = () => {
    if (disabled) return
    setInputValue(valueKg != null ? formatWeightValue(valueKg, unit) : '')
    setEditing(true)
  }

  const commitInput = () => {
    setEditing(false)
    const parsed = parseWeightInput(inputValue, unit)
    if (parsed != null && parsed > 0) {
      onChange(Math.round(parsed * 10) / 10)
    } else if (!inputValue.trim()) {
      onChange(null)
    }
  }

  const cancelInput = () => {
    setEditing(false)
    setInputValue('')
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <div
        className={cn(
          'flex h-[42px] items-stretch overflow-hidden rounded-lg border border-zinc-700/60 bg-zinc-900/80',
          'focus-within:border-[var(--accent-500)] focus-within:ring-1 focus-within:ring-[var(--accent-ring)]',
          disabled && 'opacity-60',
        )}
      >
        <button
          type="button"
          disabled={disabled || valueKg == null}
          onClick={stepDown}
          className={cn(
            'flex w-10 shrink-0 items-center justify-center text-zinc-400 transition-colors',
            'hover:bg-zinc-800 hover:text-zinc-200',
            'disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-400',
          )}
          aria-label="Decrease weight"
        >
          <Minus size={14} />
        </button>

        {editing ? (
          <div className="flex flex-1 items-center justify-center gap-1 px-1">
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
                  cancelInput()
                }
              }}
              className="w-full bg-transparent text-center text-sm tabular-nums text-zinc-100 focus:outline-none"
              aria-label="Enter weight"
            />
            <span className="shrink-0 text-xs text-zinc-500">{unit}</span>
          </div>
        ) : (
          <span
            role="button"
            tabIndex={disabled ? -1 : 0}
            onDoubleClick={startEditing}
            onKeyDown={(e) => {
              if (e.key === 'Enter') startEditing()
            }}
            className={cn(
              'flex flex-1 cursor-text select-none items-center justify-center gap-1 text-sm tabular-nums text-zinc-100',
              !disabled && 'hover:text-zinc-50',
            )}
            title={disabled ? undefined : 'Double-click to type'}
          >
            {formatWeightStepper(valueKg, unit)}
            <span className="text-xs text-zinc-500">{unit}</span>
          </span>
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={stepUp}
          className={cn(
            'flex w-10 shrink-0 items-center justify-center text-zinc-400 transition-colors',
            'hover:bg-zinc-800 hover:text-zinc-200',
            'disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-400',
          )}
          aria-label="Increase weight"
        >
          <Plus size={14} />
        </button>
      </div>
    </label>
  )
}
