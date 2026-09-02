import { useEffect, useState } from 'react'
import { MetricInput } from '@/components/ui/MetricInput'
import { DurationMetricInput } from '@/components/ui/DurationMetricInput'
import { usesTimedMetricInput } from '@/lib/timedMetrics'

interface GoalMetricInputProps {
  label: string
  unit: string
  metricKey?: string
  value: number | null | undefined
  onChange: (value: number | null) => void
  compact?: boolean
  disabled?: boolean
  step?: string
  placeholder?: string
}

function valueToText(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return ''
  return String(value)
}

function parseMetricText(raw: string, integerOnly: boolean): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = integerOnly ? parseInt(trimmed, 10) : parseFloat(trimmed)
  return Number.isNaN(parsed) ? null : parsed
}

function isDraftNumericText(raw: string, integerOnly: boolean): boolean {
  if (!raw) return true
  if (integerOnly) return /^-?\d*$/.test(raw)
  return /^-?\d*\.?\d*$/.test(raw)
}

export function GoalMetricInput({
  label,
  unit,
  metricKey,
  value,
  onChange,
  compact,
  disabled,
  step,
  placeholder,
}: GoalMetricInputProps) {
  const timed = usesTimedMetricInput(unit, metricKey)
  const integerOnly = unit === 'steps'
  const [text, setText] = useState(() => valueToText(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (timed || focused) return
    setText(valueToText(value))
  }, [value, focused, timed])

  if (timed) {
    return (
      <DurationMetricInput
        label={label}
        value={value}
        onChange={onChange}
        compact={compact}
        disabled={disabled}
        placeholder={placeholder}
      />
    )
  }

  return (
    <MetricInput
      label={label}
      unit={unit}
      compact={compact}
      disabled={disabled}
      step={step}
      placeholder={placeholder}
      type="text"
      inputMode={integerOnly ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        const parsed = parseMetricText(text, integerOnly)
        setText(valueToText(parsed))
        onChange(parsed)
      }}
      onChange={(e) => {
        const raw = e.target.value
        if (!isDraftNumericText(raw, integerOnly)) return
        setText(raw)
        if (!raw.trim() || raw === '-' || raw === '.' || raw === '-.') {
          onChange(null)
          return
        }
        const parsed = parseMetricText(raw, integerOnly)
        if (parsed != null) onChange(parsed)
      }}
    />
  )
}
