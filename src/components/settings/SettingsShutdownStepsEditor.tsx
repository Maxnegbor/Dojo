import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  availableDailyShutdownStepPresets,
  DAILY_SHUTDOWN_STEP_PRESETS,
  DEFAULT_DAILY_SHUTDOWN_STEPS,
  getDailyShutdownStepPreset,
  normalizeDailyShutdownSteps,
} from '@/lib/dailyShutdownSteps'
import type { DailyShutdownStepId } from '@/types'
import { cn } from '@/lib/utils'

interface SettingsShutdownStepsEditorProps {
  steps: DailyShutdownStepId[]
  onChange: (steps: DailyShutdownStepId[]) => void
  onSaved?: () => void
}

export function SettingsShutdownStepsEditor({
  steps,
  onChange,
  onSaved,
}: SettingsShutdownStepsEditorProps) {
  const [confirmReset, setConfirmReset] = useState(false)
  const available = availableDailyShutdownStepPresets(steps)

  const commit = (next: DailyShutdownStepId[]) => {
    onChange(normalizeDailyShutdownSteps(next))
    onSaved?.()
  }

  const removeStep = (id: DailyShutdownStepId) => {
    commit(steps.filter((step) => step !== id))
  }

  const addStep = (id: DailyShutdownStepId) => {
    if (steps.includes(id)) return
    commit([...steps, id])
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    ;[next[index], next[target]] = [next[target], next[index]]
    commit(next)
  }

  const resetSteps = () => {
    commit([...DEFAULT_DAILY_SHUTDOWN_STEPS])
    setConfirmReset(false)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Choose which preset steps appear in daily shutdown and in what order. Empty lists fall back
        to the default flow.
      </p>

      {steps.length === 0 ? (
        <p className="text-xs text-zinc-500">No steps selected yet. Add a preset below.</p>
      ) : (
        <ul className="space-y-2">
          {steps.map((id, index) => {
            const preset = getDailyShutdownStepPreset(id)
            return (
              <li
                key={id}
                className="flex items-start gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3"
              >
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveStep(index, -1)}
                    disabled={index === 0}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30"
                    aria-label={`Move ${preset?.label ?? id} up`}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(index, 1)}
                    disabled={index === steps.length - 1}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30"
                    aria-label={`Move ${preset?.label ?? id} down`}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-100">{preset?.label ?? id}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{preset?.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeStep(id)}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                  aria-label={`Remove ${preset?.label ?? id}`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {available.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-400">Add a preset step</p>
          <div className="flex flex-wrap gap-2">
            {available.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => addStep(preset.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900 px-2.5 py-1.5',
                  'text-xs font-medium text-zinc-200 transition-colors hover:border-[var(--accent-500)]/50 hover:text-[var(--accent-200)]',
                )}
              >
                <Plus size={12} />
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {available.length === 0 && (
        <p className="text-xs text-zinc-600">
          All presets are in your flow ({DAILY_SHUTDOWN_STEP_PRESETS.length} steps).
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!confirmReset && (
          <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
            Reset to default
          </Button>
        )}
      </div>

      {confirmReset && (
        <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 p-3">
          <p className="text-xs text-zinc-400">
            Restore Wrap up → Habits → Plan tomorrow?
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" size="sm" onClick={resetSteps}>
              Reset
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
