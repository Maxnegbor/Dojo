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
  if (usesTimedMetricInput(unit, metricKey)) {
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
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value
        if (!raw.trim()) {
          onChange(null)
          return
        }
        if (unit === 'steps') {
          const parsed = parseInt(raw, 10)
          onChange(Number.isNaN(parsed) ? null : parsed)
          return
        }
        const parsed = parseFloat(raw)
        onChange(Number.isNaN(parsed) ? null : parsed)
      }}
    />
  )
}
