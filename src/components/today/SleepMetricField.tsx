import { GoalMetricInput } from '@/components/ui/GoalMetricInput'
import { MetricInput } from '@/components/ui/MetricInput'
import {
  formatSleepMetricUnit,
  isClockSleepMetric,
  sleepMetricTargetFromInputValue,
  sleepMetricTargetToInputValue,
  type SleepMetricDefinition,
} from '@/lib/sleepMetrics'

export function SleepMetricField({
  metric,
  value,
  onChange,
}: {
  metric: SleepMetricDefinition
  value: number | null
  onChange: (value: number | null) => void
}) {
  if (isClockSleepMetric(metric)) {
    return (
      <MetricInput
        label={metric.label}
        type="time"
        value={value != null ? sleepMetricTargetToInputValue(metric, value) : ''}
        onChange={(e) => {
          const next = sleepMetricTargetFromInputValue(metric, e.target.value)
          onChange(next)
        }}
      />
    )
  }

  return (
    <GoalMetricInput
      label={metric.label}
      unit={
        metric.id === 'sleep_duration' || metric.id === 'in_bed'
          ? 'hrs:min'
          : formatSleepMetricUnit(metric.unit)
      }
      metricKey={metric.id}
      value={value}
      onChange={onChange}
    />
  )
}
