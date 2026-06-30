import { useState } from 'react'
import { Check, Target, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/settings/SettingsControls'
import type { FocusGoalFormValues } from '@/lib/focusGoalSync'
import { cn } from '@/lib/utils'

export type { FocusGoalFormValues }

interface FocusGoalModalProps {
  initial: FocusGoalFormValues
  onSave: (values: FocusGoalFormValues) => Promise<void>
  onClose: () => void
  mode?: 'create' | 'edit'
}

function normalizeAmount(raw: number, unit: 'hours' | 'minutes'): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0
  if (unit === 'hours') return Math.min(12, Math.max(1, Math.round(raw)))
  return Math.min(480, Math.max(1, Math.round(raw)))
}

export function FocusGoalModal({ initial, onSave, onClose, mode = 'create' }: FocusGoalModalProps) {
  const [period, setPeriod] = useState(initial.period)
  const [unit, setUnit] = useState(initial.unit)
  const [amountInput, setAmountInput] = useState(String(initial.amount))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleUnitChange = (nextUnit: 'hours' | 'minutes') => {
    if (nextUnit === unit) return
    const parsed = parseFloat(amountInput)
    if (nextUnit === 'hours') {
      const hrs = Number.isFinite(parsed) ? Math.max(1, Math.min(12, Math.round(parsed / 60) || 1)) : 1
      setUnit('hours')
      setAmountInput(String(hrs))
    } else {
      const mins = Number.isFinite(parsed) ? Math.max(1, Math.min(480, Math.round(parsed * 60))) : 60
      setUnit('minutes')
      setAmountInput(String(mins))
    }
    setError(null)
  }

  const handleSave = async () => {
    const parsed = parseFloat(amountInput)
    const amount = normalizeAmount(parsed, unit)
    if (amount <= 0) {
      setError(`Enter a valid ${unit === 'hours' ? 'hour' : 'minute'} amount`)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave({ period, amount, unit })
      if (mode === 'edit') {
        onClose()
        return
      }
      setSaved(true)
    } catch {
      setError('Could not save focus goal. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-labelledby="focus-goal-title"
        className="w-full max-w-md rounded-2xl border border-zinc-700/80 bg-zinc-900 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-950)] text-[var(--accent-400)]">
              {saved ? <Check size={18} /> : <Target size={18} />}
            </div>
            <div>
              <h2 id="focus-goal-title" className="text-base font-semibold text-zinc-100">
                {saved ? 'Focus goal set' : mode === 'edit' ? 'Edit focus goal' : 'Set focus goal'}
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                {saved
                  ? 'Added to Metrics and Overview.'
                  : mode === 'edit'
                    ? 'Update your daily or weekly focus target.'
                    : 'Choose a daily or weekly focus target.'}
              </p>
            </div>
          </div>
          {!saved && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {saved ? (
          <div className="space-y-4">
            <p className="rounded-xl border border-emerald-900/40 bg-emerald-950/30 px-3 py-2.5 text-xs leading-relaxed text-emerald-200/90">
              You can change or remove this goal anytime in{' '}
              <span className="font-medium text-emerald-100">Metrics</span>.
            </p>
            <Button className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <SegmentedControl
              label="Period"
              value={period}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
              ]}
              onChange={setPeriod}
            />
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor="focus-goal-target" className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Target
                </label>
                <input
                  id="focus-goal-target"
                  type="number"
                  min={1}
                  max={unit === 'hours' ? 12 : 480}
                  step={1}
                  inputMode="numeric"
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value)
                    setError(null)
                  }}
                  className={cn(
                    'w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2.5 text-sm text-zinc-100',
                    'outline-none focus:border-[var(--accent-500)] focus:ring-1 focus:ring-[var(--accent-ring)]',
                  )}
                  placeholder={unit === 'hours' ? '2' : '90'}
                />
              </div>
              <div className="min-w-0 flex-1">
                <SegmentedControl
                  label="Unit"
                  value={unit}
                  options={[
                    { value: 'hours', label: 'Hours' },
                    { value: 'minutes', label: 'Minutes' },
                  ]}
                  onChange={handleUnitChange}
                />
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-400">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="secondary" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save goal'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
