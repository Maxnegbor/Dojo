import { useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DatePickerField } from '@/components/ui/DatePickerField'
import {
  createEmptyOutcomeGoal,
  createOutcomeGoalLink,
  listMetricOptionsForGoals,
} from '@/lib/outcomeGoals'
import type {
  Goal,
  MetricKey,
  OutcomeGoal,
  OutcomeGoalComparator,
  OutcomeGoalLink,
  OutcomeGoalLinkPeriod,
  OutcomeGoalLinkRole,
  OutcomeGoalReview,
} from '@/types'
import { cn } from '@/lib/utils'

interface OutcomeGoalEditorProps {
  initial?: OutcomeGoal | null
  hybridGoals: Goal[]
  onSave: (goal: OutcomeGoal) => void
  onCancel: () => void
}

function LinkRow({
  link,
  metricOptions,
  onChange,
  onRemove,
}: {
  link: OutcomeGoalLink
  metricOptions: { key: MetricKey; label: string; unit: string }[]
  onChange: (next: OutcomeGoalLink) => void
  onRemove: () => void
}) {
  return (
    <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <select
          value={link.role}
          onChange={(e) =>
            onChange({ ...link, role: e.target.value as OutcomeGoalLinkRole })
          }
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-300"
        >
          <option value="outcome">Outcome</option>
          <option value="process">Process</option>
        </select>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove metric link"
          className="rounded p-1 text-zinc-600 hover:text-red-400"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Metric
        </span>
        <select
          value={link.metric_key}
          onChange={(e) =>
            onChange({ ...link, metric_key: e.target.value as MetricKey })
          }
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
        >
          {metricOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

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
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Target
          </span>
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
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm tabular-nums text-zinc-100"
          />
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
  const [review, setReview] = useState<OutcomeGoalReview>(initial?.review ?? 'weekly')
  const [links, setLinks] = useState<OutcomeGoalLink[]>(initial?.links ?? [])

  const canSave = title.trim().length > 0 && links.length > 0

  const addLink = (role: OutcomeGoalLinkRole) => {
    const first = metricOptions[0]
    if (!first) return
    setLinks((prev) => [
      ...prev,
      createOutcomeGoalLink({
        metric_key: first.key,
        role,
        target_value: 1,
        period: role === 'outcome' ? 'by_deadline' : 'weekly',
        comparator: 'gte',
      }),
    ])
  }

  const handleSave = () => {
    if (!canSave) return
    const base = initial ?? createEmptyOutcomeGoal()
    onSave({
      ...base,
      title: title.trim(),
      deadline: deadline.trim() || undefined,
      review,
      links: links.filter((link) => link.target_value > 0),
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
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Review
            </span>
            <select
              value={review}
              onChange={(e) => setReview(e.target.value as OutcomeGoalReview)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Linked metrics
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => addLink('outcome')}
                disabled={metricOptions.length === 0}
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-semibold',
                  'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40',
                )}
              >
                <Plus size={11} /> Outcome
              </button>
              <button
                type="button"
                onClick={() => addLink('process')}
                disabled={metricOptions.length === 0}
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-semibold',
                  'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40',
                )}
              >
                <Plus size={11} /> Process
              </button>
            </div>
          </div>

          {metricOptions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-3 text-xs text-zinc-500">
              Add metrics on the Metrics page first, then link them here.
            </p>
          ) : links.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-3 text-xs text-zinc-500">
              Add an outcome metric (what changes) and optional process metrics (what you do).
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
