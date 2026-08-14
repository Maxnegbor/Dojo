import { useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DatePickerField } from '@/components/ui/DatePickerField'
import {
  createEmptyOutcomeGoal,
  createOutcomeGoalLink,
  defaultPeriodForMetric,
  defaultTargetForMetric,
  listMetricOptionsForGoals,
  type GoalMetricOption,
} from '@/lib/outcomeGoals'
import { metricLabel } from '@/lib/goals'
import {
  getSleepMetricDefinition,
  getSleepMetricsConfig,
  isClockSleepMetric,
  sleepMetricIdFromLibraryKey,
  sleepMetricTargetFromInputValue,
  sleepMetricTargetToInputValue,
} from '@/lib/sleepMetrics'
import type {
  Goal,
  MetricKey,
  OutcomeGoal,
  OutcomeGoalComparator,
  OutcomeGoalLink,
  OutcomeGoalLinkPeriod,
  OutcomeGoalRecurrence,
} from '@/types'
import { cn } from '@/lib/utils'

interface OutcomeGoalEditorProps {
  initial?: OutcomeGoal | null
  hybridGoals: Goal[]
  onSave: (goal: OutcomeGoal) => void
  onCancel: () => void
}

function groupedMetricOptions(options: GoalMetricOption[]) {
  const groups: { label: string; options: GoalMetricOption[] }[] = []
  const index = new Map<string, number>()
  for (const option of options) {
    const label = option.categoryLabel || 'Ungrouped'
    let i = index.get(label)
    if (i == null) {
      i = groups.length
      index.set(label, i)
      groups.push({ label, options: [] })
    }
    groups[i].options.push(option)
  }
  return groups
}

function LinkTargetInput({
  link,
  unit,
  onChange,
}: {
  link: OutcomeGoalLink
  unit: string
  onChange: (next: OutcomeGoalLink) => void
}) {
  const sleepId = sleepMetricIdFromLibraryKey(link.metric_key)
  const sleepMetric = sleepId
    ? getSleepMetricDefinition(getSleepMetricsConfig(), sleepId)
    : undefined

  if (sleepMetric && isClockSleepMetric(sleepMetric)) {
    return (
      <input
        type="time"
        value={sleepMetricTargetToInputValue(sleepMetric, link.target_value)}
        onChange={(e) => {
          const next = sleepMetricTargetFromInputValue(sleepMetric, e.target.value)
          if (next == null) return
          onChange({ ...link, target_value: next })
        }}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm tabular-nums text-zinc-100"
      />
    )
  }

  if (sleepMetric && (sleepMetric.id === 'sleep_duration' || sleepMetric.id === 'in_bed')) {
    return (
      <input
        type="number"
        min={0}
        step="any"
        value={sleepMetricTargetToInputValue(sleepMetric, link.target_value)}
        onChange={(e) => {
          const next = sleepMetricTargetFromInputValue(sleepMetric, e.target.value)
          onChange({ ...link, target_value: next ?? 0 })
        }}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm tabular-nums text-zinc-100"
      />
    )
  }

  return (
    <input
      type="number"
      min={0}
      step="any"
      value={link.target_value}
      onChange={(e) =>
        onChange({
          ...link,
          target_value: Number(e.target.value) || 0,
        })
      }
      aria-label={unit ? `Target ${unit}` : 'Target'}
      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm tabular-nums text-zinc-100"
    />
  )
}

function LinkRow({
  link,
  metricOptions,
  onChange,
  onRemove,
}: {
  link: OutcomeGoalLink
  metricOptions: GoalMetricOption[]
  onChange: (next: OutcomeGoalLink) => void
  onRemove: () => void
}) {
  const options = useMemo(() => {
    if (metricOptions.some((option) => option.key === link.metric_key)) return metricOptions
    return [
      {
        key: link.metric_key,
        label: metricLabel(link.metric_key),
        unit: '',
        categoryId: '',
        categoryLabel: 'Other',
      },
      ...metricOptions,
    ]
  }, [link.metric_key, metricOptions])

  const selected = options.find((option) => option.key === link.metric_key)
  const groups = groupedMetricOptions(options)
  const targetUnit = selected?.unit?.trim()

  return (
    <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Metric
          </span>
          <select
            value={link.metric_key}
            onChange={(e) => {
              const key = e.target.value as MetricKey
              onChange({
                ...link,
                metric_key: key,
                target_value: defaultTargetForMetric(key),
                period: defaultPeriodForMetric(key),
              })
            }}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          >
            {groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove metric"
          className="mt-5 rounded p-1 text-zinc-600 hover:text-red-400"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Compare
          </span>
          <select
            value={link.comparator}
            onChange={(e) =>
              onChange({ ...link, comparator: e.target.value as OutcomeGoalComparator })
            }
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          >
            <option value="gte">≥</option>
            <option value="lte">≤</option>
            <option value="eq">=</option>
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block truncate text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Target{targetUnit ? ` · ${targetUnit}` : ''}
          </span>
          <LinkTargetInput link={link} unit={targetUnit ?? ''} onChange={onChange} />
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Period
          </span>
          <select
            value={link.period}
            onChange={(e) =>
              onChange({ ...link, period: e.target.value as OutcomeGoalLinkPeriod })
            }
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="by_deadline">By deadline</option>
          </select>
        </label>
      </div>
    </div>
  )
}

export function OutcomeGoalEditor({
  initial,
  hybridGoals,
  onSave,
  onCancel,
}: OutcomeGoalEditorProps) {
  const metricOptions = useMemo(
    () => listMetricOptionsForGoals(hybridGoals),
    [hybridGoals],
  )
  const [title, setTitle] = useState(initial?.title ?? '')
  const [deadline, setDeadline] = useState(initial?.deadline ?? '')
  const [recurrence, setRecurrence] = useState<OutcomeGoalRecurrence>(
    initial?.recurrence ?? 'weekly',
  )
  const [recurrenceDays, setRecurrenceDays] = useState(
    initial?.recurrence_days && initial.recurrence_days > 0
      ? String(initial.recurrence_days)
      : '30',
  )
  const [links, setLinks] = useState<OutcomeGoalLink[]>(initial?.links ?? [])

  const canSave = title.trim().length > 0 && links.length > 0

  const addLink = () => {
    const used = new Set(links.map((link) => link.metric_key))
    const first = metricOptions.find((option) => !used.has(option.key)) ?? metricOptions[0]
    if (!first) return
    setLinks((prev) => [
      ...prev,
      createOutcomeGoalLink({
        metric_key: first.key,
        target_value: defaultTargetForMetric(first.key),
        period: defaultPeriodForMetric(first.key),
        comparator: 'gte',
      }),
    ])
  }

  const handleSave = () => {
    if (!canSave) return
    const base = initial ?? createEmptyOutcomeGoal()
    const parsedDays = Math.max(1, Math.round(Number(recurrenceDays)) || 30)
    onSave({
      ...base,
      title: title.trim(),
      deadline: deadline.trim() || undefined,
      recurrence,
      recurrence_days:
        recurrence === 'every_14' ? 14 : recurrence === 'custom' ? parsedDays : undefined,
      review: undefined,
      links: links.filter((link) => {
        const sleepId = sleepMetricIdFromLibraryKey(link.metric_key)
        const metric = sleepId
          ? getSleepMetricDefinition(getSleepMetricsConfig(), sleepId)
          : undefined
        if (metric && isClockSleepMetric(metric)) return Number.isFinite(link.target_value)
        return link.target_value > 0
      }),
      updated_at: new Date().toISOString(),
    })
  }

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900 p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">
          {initial ? 'Edit goal' : 'New goal'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            What do you want?
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Build to 87 kg"
            autoFocus
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-500)]"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Deadline
            </span>
            <DatePickerField value={deadline} onChange={setDeadline} />
          </label>
          <div className="min-w-0">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Recurs
              </span>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as OutcomeGoalRecurrence)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="every_14">Every 14 days</option>
                <option value="custom">Custom…</option>
              </select>
            </label>
            {recurrence === 'custom' && (
              <label className="mt-2 flex items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Every
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={recurrenceDays}
                  onChange={(e) => setRecurrenceDays(e.target.value)}
                  className="w-20 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm tabular-nums text-zinc-100"
                />
                <span className="text-xs text-zinc-500">days</span>
              </label>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Linked metrics
            </p>
            <button
              type="button"
              onClick={addLink}
              disabled={metricOptions.length === 0}
              className={cn(
                'inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-semibold',
                'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40',
              )}
            >
              <Plus size={11} /> Metric
            </button>
          </div>

          {metricOptions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-3 text-xs text-zinc-500">
              Add metrics on the Metrics page first, then link them here.
            </p>
          ) : links.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-3 text-xs text-zinc-500">
              Link a metric to measure this goal.
            </p>
          ) : (
            <div className="space-y-2">
              {links.map((link, index) => (
                <LinkRow
                  key={link.id}
                  link={link}
                  metricOptions={metricOptions}
                  onChange={(next) =>
                    setLinks((prev) => prev.map((entry, i) => (i === index ? next : entry)))
                  }
                  onRemove={() => setLinks((prev) => prev.filter((_, i) => i !== index))}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={!canSave} onClick={handleSave}>
            Save goal
          </Button>
        </div>
      </div>
    </div>
  )
}
