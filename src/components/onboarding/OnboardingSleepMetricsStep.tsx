import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  BUILTIN_SLEEP_METRICS,
  WEARABLE_SLEEP_PRESET,
  WEARABLE_SLEEP_PRESET_ID,
  addCustomSleepMetric,
  removeCustomSleepMetric,
  sleepMetricDisplayUnit,
  toggleSleepMetric,
  type SleepMetricUnit,
  type SleepMetricsConfig,
} from '@/lib/sleepMetrics'
import { cn } from '@/lib/utils'
import { SegmentedControl } from '@/components/settings/SettingsControls'
import { OnboardingField, onboardingInputClass } from '@/components/onboarding/OnboardingLayout'

const ONBOARDING_TEMPLATE_IDS = [
  'sleep_duration',
  'bedtime',
  'wake_time',
  'alertness',
  WEARABLE_SLEEP_PRESET_ID,
]

const UNIT_OPTIONS: { value: SleepMetricUnit; label: string }[] = [
  { value: 'hours', label: 'Hours' },
  { value: 'minutes', label: 'Min' },
  { value: 'percent', label: '%' },
  { value: 'score10', label: '1–10' },
]

interface OnboardingSleepMetricsStepProps {
  config: SleepMetricsConfig
  onChange: (config: SleepMetricsConfig) => void
}

export function OnboardingSleepMetricsStep({ config, onChange }: OnboardingSleepMetricsStepProps) {
  const [customLabel, setCustomLabel] = useState('')
  const [customUnit, setCustomUnit] = useState<SleepMetricUnit>('minutes')

  const templateMetrics = useMemo(() => {
    const byId = new Map(BUILTIN_SLEEP_METRICS.map((m) => [m.id, m]))
    byId.set(WEARABLE_SLEEP_PRESET_ID, WEARABLE_SLEEP_PRESET)
    return ONBOARDING_TEMPLATE_IDS.map((id) => byId.get(id)).filter(Boolean)
  }, [])

  const handleToggle = (id: string, enabled: boolean) => {
    onChange(toggleSleepMetric(config, id, enabled))
  }

  const handleAddCustom = () => {
    const next = addCustomSleepMetric(config, customLabel, customUnit)
    if (next === config) return
    onChange(next)
    setCustomLabel('')
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-zinc-200">Sleep metrics</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Optional — add fields like sleep duration, alertness, or wearable scores. You can skip
            this and add them later on the Metrics page.
          </p>
        </div>

        <div className="space-y-2">
          {templateMetrics.map((metric) => {
            if (!metric) return null
            const enabled = config.enabledIds.includes(metric.id)
            const isWearable = metric.id === WEARABLE_SLEEP_PRESET_ID

            return (
              <button
                key={metric.id}
                type="button"
                onClick={() => handleToggle(metric.id, !enabled)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                  enabled
                    ? 'border-[var(--accent-500)]/60 bg-[var(--accent-950)]/40 ring-1 ring-[var(--accent-500)]/30'
                    : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">
                    {isWearable ? 'Wearable sleep score' : metric.label}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {isWearable
                      ? 'Log a percentage from your ring, watch, or app'
                      : sleepMetricDisplayUnit(metric)}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                    enabled
                      ? 'bg-[var(--accent-600)]/30 text-[var(--accent-300)]'
                      : 'bg-zinc-800 text-zinc-500',
                  )}
                >
                  {enabled ? 'On' : 'Off'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {config.customMetrics.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-400">Custom metrics</p>
          {config.customMetrics.map((metric) => (
            <div
              key={metric.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3"
            >
              <div>
                <p className="text-sm text-zinc-200">{metric.label}</p>
                <p className="text-[11px] text-zinc-500">{sleepMetricDisplayUnit(metric)}</p>
              </div>
              <button
                type="button"
                onClick={() => onChange(removeCustomSleepMetric(config, metric.id))}
                className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                aria-label={`Remove ${metric.label}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
        <OnboardingField label="Add a custom metric">
          <p className="mb-2 text-[11px] text-zinc-500">
            Name your metric and pick the unit you want to log it in.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="e.g. Deep sleep, HRV"
              className={cn(onboardingInputClass, 'min-w-0 flex-1')}
            />
            <div className="sm:w-48">
              <SegmentedControl
                label="Unit"
                value={customUnit}
                options={UNIT_OPTIONS}
                onChange={setCustomUnit}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!customLabel.trim()}
              onClick={handleAddCustom}
              className="shrink-0"
            >
              <Plus size={14} />
              Add
            </Button>
          </div>
        </OnboardingField>
      </div>
    </div>
  )
}
