import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  SLEEP_METRIC_UNIT_LABELS,
  sleepMetricDisplayUnit,
  WEARABLE_SLEEP_PRESET_ID,
  addCustomSleepMetric,
  getAllSleepMetricDefinitions,
  removeCustomSleepMetric,
  toggleSleepMetric,
  type SleepMetricDefinition,
  type SleepMetricUnit,
  type SleepMetricsConfig,
} from '@/lib/sleepMetrics'
import { cn } from '@/lib/utils'

interface SleepMetricsSettingsEditorProps {
  config: SleepMetricsConfig
  onChange: (config: SleepMetricsConfig) => void
  showIntro?: boolean
}

const UNIT_OPTIONS: SleepMetricUnit[] = ['hours', 'minutes', 'percent', 'score10']

function metricBadge(metric: SleepMetricDefinition) {
  if (metric.id === WEARABLE_SLEEP_PRESET_ID) return 'Preset'
  if (metric.source === 'builtin') return 'Built-in'
  return 'Custom'
}

export function SleepMetricsSettingsEditor({
  config,
  onChange,
  showIntro = true,
}: SleepMetricsSettingsEditorProps) {
  const [customLabel, setCustomLabel] = useState('')
  const [customUnit, setCustomUnit] = useState<SleepMetricUnit>('minutes')

  const allMetrics = useMemo(() => getAllSleepMetricDefinitions(config), [config])

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
    <div className="space-y-4">
      {showIntro && (
        <p className="text-xs leading-relaxed text-zinc-500">
          Choose which sleep data you log each morning and what shows in Overview. Percent-based
          metrics (like a wearable score) can map directly to your Pulse sleep score.
        </p>
      )}

      <div className="space-y-2">
        {allMetrics.map((metric) => {
          const enabled = config.enabledIds.includes(metric.id)
          const isCustom = metric.source === 'custom'
          const isInBed = metric.id === 'in_bed'

          return (
            <div
              key={metric.id}
              className={cn(
                'rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3',
                isInBed && 'opacity-80',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-zinc-200">{metric.label}</p>
                    <span className="rounded-md bg-zinc-800/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                      {metricBadge(metric)}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {sleepMetricDisplayUnit(metric)}
                    </span>
                  </div>
                  {isInBed && (
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Computed from bedtime and wake time when those are enabled.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isCustom && (
                    <button
                      type="button"
                      onClick={() => onChange(removeCustomSleepMetric(config, metric.id))}
                      className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                      aria-label={`Remove ${metric.label}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => handleToggle(metric.id, !enabled)}
                    className={cn(
                      'relative h-7 w-12 shrink-0 rounded-full transition-colors',
                      enabled ? 'bg-[var(--accent-600)]' : 'bg-zinc-700',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-1 h-5 w-5 rounded-full bg-white transition-transform',
                        enabled ? 'left-6' : 'left-1',
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
        <p className="text-sm font-medium text-zinc-200">Add custom sleep metric</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Track anything else you care about — deep sleep minutes, HRV, readiness, and so on.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Metric name"
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[var(--accent-500)]"
          />
          <select
            value={customUnit}
            onChange={(e) => setCustomUnit(e.target.value as SleepMetricUnit)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[var(--accent-500)]"
          >
            {UNIT_OPTIONS.map((unit) => (
              <option key={unit} value={unit}>
                {SLEEP_METRIC_UNIT_LABELS[unit]}
              </option>
            ))}
          </select>
          <Button
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
      </div>
    </div>
  )
}
