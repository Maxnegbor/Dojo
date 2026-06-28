import { useState } from 'react'
import { Flame, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { GoalPeriod } from '@/types'
import {
  DEFAULT_HABIT_TYPES,
  getHabitTypes,
  habitLogPeriod,
  saveHabitTypes,
  slugifyHabitId,
  type HabitTypeDefinition,
} from '@/lib/habitTypes'
import { cn } from '@/lib/utils'

interface HabitGoalsModalProps {
  onClose: () => void
}

export function HabitGoalsModal({ onClose }: HabitGoalsModalProps) {
  const [types, setTypes] = useState<HabitTypeDefinition[]>(() => getHabitTypes())
  const [newLabel, setNewLabel] = useState('')

  const persistTypes = (next: HabitTypeDefinition[]) => {
    setTypes(next)
    saveHabitTypes(next)
  }

  const updateType = (index: number, patch: Partial<HabitTypeDefinition>) => {
    persistTypes(types.map((t, i) => (i === index ? { ...t, ...patch } : t)))
  }

  const setLogPeriod = (index: number, log_period: GoalPeriod) => {
    updateType(index, { log_period })
  }

  const addType = () => {
    const label = newLabel.trim()
    if (!label) return

    let id = slugifyHabitId(label)
    let n = 2
    while (types.some((t) => t.id === id)) {
      id = `${slugifyHabitId(label)}_${n}`
      n++
    }

    persistTypes([...types, { id, label }])
    setNewLabel('')
  }

  const removeType = (index: number) => {
    if (types.length <= 1) return
    persistTypes(types.filter((_, i) => i !== index))
  }

  const resetTypes = () => {
    persistTypes([...DEFAULT_HABIT_TYPES])
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="habit-goals-title"
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-950 text-emerald-400 ring-1 ring-emerald-500/30">
              <Flame size={20} />
            </div>
            <div>
              <h2 id="habit-goals-title" className="text-lg font-semibold text-zinc-100">
                Habits
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Add habits and choose whether each one appears in your daily log or weekly review.
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

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {types.map((type, index) => (
            <div
              key={type.id}
              className="space-y-2 rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3"
            >
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={type.label}
                  onChange={(e) => updateType(index, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-3 py-2.5 text-sm text-zinc-100 focus:border-[var(--accent-500)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
                />
                <button
                  type="button"
                  disabled={types.length <= 1}
                  onClick={() => removeType(index)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-800/80 text-zinc-600 transition-colors hover:border-red-500/30 hover:bg-red-950/30 hover:text-red-400 disabled:pointer-events-none disabled:opacity-30"
                  aria-label={`Remove ${type.label}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLogPeriod(index, 'daily')}
                  className={cn(
                    'flex-1 rounded-md py-1.5 text-xs',
                    habitLogPeriod(type) === 'daily'
                      ? 'bg-[var(--accent-600)] text-white'
                      : 'bg-zinc-800 text-zinc-400',
                  )}
                >
                  Daily log
                </button>
                <button
                  type="button"
                  onClick={() => setLogPeriod(index, 'weekly')}
                  className={cn(
                    'flex-1 rounded-md py-1.5 text-xs',
                    habitLogPeriod(type) === 'weekly'
                      ? 'bg-[var(--accent-600)] text-white'
                      : 'bg-zinc-800 text-zinc-400',
                  )}
                >
                  Weekly review
                </button>
              </div>
            </div>
          ))}

          <div className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-700/60 bg-zinc-950/30 p-4 sm:flex-row sm:items-center">
            <input
              type="text"
              value={newLabel}
              placeholder="Add a habit…"
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addType()}
              className="min-w-0 flex-1 rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
            />
            <Button variant="secondary" onClick={addType} disabled={!newLabel.trim()} className="shrink-0">
              <Plus size={14} /> Add habit
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-800/80 px-6 py-4">
          <Button variant="ghost" onClick={resetTypes}>
            Reset habits
          </Button>
          <Button className="min-w-[7rem]" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
