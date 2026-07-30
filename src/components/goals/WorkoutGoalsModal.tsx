import { useState } from 'react'
import { Dumbbell, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Goal } from '@/types'
import { normalizeGoal } from '@/lib/goals'
import {
  DEFAULT_WORKOUT_TYPES,
  WORKOUT_COLOR_PRESETS,
  getWorkoutTypes,
  saveWorkoutTypes,
  slugifyWorkoutId,
  workoutGoalUnitLabel,
  workoutMetricKey,
  type WorkoutTypeDefinition,
} from '@/lib/workoutTypes'
import { generateId } from '@/lib/utils'

interface WorkoutGoalsModalProps {
  goals: Goal[]
  userId: string
  onClose: () => void
  onSaveGoal: (goal: Goal) => void
  onDeleteGoal: (goal: Goal) => void
}

export function WorkoutGoalsModal({
  goals,
  userId,
  onClose,
  onSaveGoal,
  onDeleteGoal,
}: WorkoutGoalsModalProps) {
  const [types, setTypes] = useState<WorkoutTypeDefinition[]>(() => getWorkoutTypes())
  const [newLabel, setNewLabel] = useState('')

  const workoutGoal = (category: string) =>
    goals.find((g) => g.is_active && g.metric_key === workoutMetricKey(category))

  const persistTypes = (next: WorkoutTypeDefinition[]) => {
    setTypes(next)
    saveWorkoutTypes(next)
  }

  const updateType = (index: number, patch: Partial<WorkoutTypeDefinition>) => {
    const next = types.map((type, i) => (i === index ? { ...type, ...patch } : type))
    persistTypes(next)
  }

  const setWeeklyTarget = (category: string, label: string, raw: string) => {
    const existing = workoutGoal(category)
    const value = raw.trim() === '' ? null : Number(raw)
    if (value != null && (!Number.isFinite(value) || value <= 0)) return

    onSaveGoal(
      normalizeGoal({
        id: existing?.id ?? generateId(),
        user_id: userId,
        metric_key: workoutMetricKey(category),
        name: label,
        target_value: value,
        log_period: 'weekly',
        target_period: 'weekly',
        goal_weight_start: null,
        goal_weight_target: null,
        unit: existing?.unit || 'min',
        is_active: true,
        created_at: existing?.created_at ?? new Date().toISOString(),
      }),
    )
  }

  const addType = () => {
    const label = newLabel.trim()
    if (!label) return

    let id = slugifyWorkoutId(label)
    let n = 2
    while (types.some((t) => t.id === id)) {
      id = `${slugifyWorkoutId(label)}_${n}`
      n++
    }

    persistTypes([...types, { id, label, color: WORKOUT_COLOR_PRESETS[0], unit: 'min' }])
    setNewLabel('')
  }

  const removeType = (index: number) => {
    if (types.length <= 1) return
    const type = types[index]
    const goal = workoutGoal(type.id)
    if (goal) onDeleteGoal(goal)
    persistTypes(types.filter((_, i) => i !== index))
  }

  const resetTypes = () => {
    for (const type of types) {
      const goal = workoutGoal(type.id)
      if (goal && !DEFAULT_WORKOUT_TYPES.some((d) => d.id === type.id)) {
        onDeleteGoal(goal)
      }
    }
    persistTypes([...DEFAULT_WORKOUT_TYPES])
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="workout-goals-title"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-950)] text-[var(--accent-400)] ring-1 ring-[var(--accent-ring)]">
              <Dumbbell size={20} />
            </div>
            <div>
              <h2 id="workout-goals-title" className="text-lg font-semibold text-zinc-100">
                Workout Goals
              </h2>
              <p className="mt-1 max-w-md text-sm text-zinc-500">
                Customize workout types for your daily log and set weekly minute targets.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {types.map((type, index) => {
            const goal = workoutGoal(type.id)
            return (
              <div
                key={type.id}
                className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4 sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
                  <label className="min-w-0 flex-1">
                    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                      Type name
                    </span>
                    <input
                      type="text"
                      value={type.label}
                      onChange={(e) => updateType(index, { label: e.target.value })}
                      className="w-full rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-3 py-2.5 text-sm text-zinc-100 focus:border-[var(--accent-500)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
                    />
                  </label>

                  <label className="shrink-0 sm:w-36">
                    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                      Weekly target
                    </span>
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        placeholder="—"
                        value={goal ? String(goal.target_value) : ''}
                        onChange={(e) => setWeeklyTarget(type.id, type.label, e.target.value)}
                        className="w-full rounded-lg border border-zinc-700/60 bg-zinc-900/80 py-2.5 pl-3 pr-14 text-sm tabular-nums text-zinc-100 placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                        {workoutGoalUnitLabel(goal?.unit || type.unit || 'min', 'weekly')}
                      </span>
                    </div>
                  </label>

                  <button
                    type="button"
                    disabled={types.length <= 1}
                    onClick={() => removeType(index)}
                    className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-lg border border-zinc-800/80 text-zinc-600 transition-colors hover:border-red-500/30 hover:bg-red-950/30 hover:text-red-400 disabled:pointer-events-none disabled:opacity-30 sm:mb-0"
                    aria-label={`Remove ${type.label}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })}

          <div className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-700/60 bg-zinc-950/30 p-4 sm:flex-row sm:items-center">
            <input
              type="text"
              value={newLabel}
              placeholder="Add a workout type…"
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addType()}
              className="min-w-0 flex-1 rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
            />
            <Button variant="secondary" onClick={addType} disabled={!newLabel.trim()} className="shrink-0">
              <Plus size={14} /> Add type
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-800/80 px-6 py-4">
          <Button variant="ghost" size="sm" onClick={resetTypes}>
            Reset defaults
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  )
}
