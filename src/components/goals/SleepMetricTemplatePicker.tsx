import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  SLEEP_METRIC_UNIT_LABELS,
  sleepMetricDisplayUnit,
  addCustomSleepMetric,
  getAvailableSleepMetricTemplates,
  toggleSleepMetric,
  type SleepMetricDefinition,
  type SleepMetricUnit,
  type SleepMetricsConfig,
} from '@/lib/sleepMetrics'

const UNIT_OPTIONS: SleepMetricUnit[] = ['hours', 'minutes', 'percent', 'score10']

interface SleepMetricTemplatePickerProps {
  config: SleepMetricsConfig
  onChange: (config: SleepMetricsConfig) => void
  onDone: () => void
}

function templateUnitLabel(metric: SleepMetricDefinition): string {
  return sleepMetricDisplayUnit(metric)
}

export function SleepMetricTemplatePicker({
  config,
  onChange,
  onDone,
}: SleepMetricTemplatePickerProps) {
  const [customLabel, setCustomLabel] = useState('')
  const [customUnit, setCustomUnit] = useState<SleepMetricUnit>('minutes')

  const templates = useMemo(() => getAvailableSleepMetricTemplates(config), [config])

  const addTemplate = (metric: SleepMetricDefinition) => {
    onChange(toggleSleepMetric(config, metric.id, true))
    onDone()
  }

  const addCustom = () => {
    const next = addCustomSleepMetric(config, customLabel, customUnit)
    if (next === config) return
    onChange(next)
    setCustomLabel('')
    onDone()
  }

  return (
    <div className="space-y-3">
      {templates.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          {templates.map((metric) => (
            <button
              key={metric.id}
              type="button"
              onClick={() => addTemplate(metric)}
              className="flex w-full items-start justify-between gap-3 border-b border-zinc-800/80 px-4 py-3 text-left last:border-b-0 hover:bg-zinc-900/80"
            >
              <span>
                <span className="block text-sm font-medium text-zinc-100">{metric.label}</span>
                <span className="mt-0.5 block text-[11px] text-zinc-500">
                  {templateUnitLabel(metric)}
                </span>
              </span>
              <Plus size={14} className="mt-0.5 shrink-0 text-zinc-500" />
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
        <p className="text-sm font-medium text-zinc-200">Custom sleep field</p>
        <p className="mt-1 text-[11px] text-zinc-500">e.g. deep sleep, HRV, or readiness.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Field name"
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
          <Button variant="secondary" size="sm" disabled={!customLabel.trim()} onClick={addCustom}>
            <Plus size={14} />
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}
