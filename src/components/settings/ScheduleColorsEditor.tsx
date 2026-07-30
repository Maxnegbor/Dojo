import { useState } from 'react'
import { Dumbbell, Plus, Trash2 } from 'lucide-react'
import { ColorDotPicker } from '@/components/ui/ColorDotPicker'
import {
  createScheduleColorPreset,
  getScheduleColorPresets,
  saveScheduleColorPresets,
  SCHEDULE_COLOR_SWATCHES,
  type ScheduleColorPreset,
} from '@/lib/scheduleColors'
import { cn } from '@/lib/utils'

interface ScheduleColorsEditorProps {
  onSaved?: () => void
}

export function ScheduleColorsEditor({ onSaved }: ScheduleColorsEditorProps) {
  const [presets, setPresets] = useState(() => getScheduleColorPresets())

  const commit = (next: ScheduleColorPreset[]) => {
    const saved = saveScheduleColorPresets(next)
    setPresets(saved)
    onSaved?.()
  }

  const updatePreset = (id: string, patch: Partial<Pick<ScheduleColorPreset, 'label' | 'hex'>>) => {
    commit(
      presets.map((preset) => (preset.id === id ? { ...preset, ...patch } : preset)),
    )
  }

  const removePreset = (id: string) => {
    const target = presets.find((preset) => preset.id === id)
    if (!target || target.role === 'workout') return
    commit(presets.filter((preset) => preset.id !== id))
  }

  const addPreset = () => {
    commit([...presets, createScheduleColorPreset()])
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Colors on new schedule blocks. The workout color is used when you assign a block to an
        exercise type.
      </p>

      <ul className="space-y-2">
        {presets.map((preset) => {
          const isWorkout = preset.role === 'workout'
          return (
            <li
              key={preset.id}
              className="flex items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-2.5"
            >
              <div className="flex shrink-0 flex-col items-center gap-1">
                <ColorDotPicker
                  value={preset.hex}
                  swatches={SCHEDULE_COLOR_SWATCHES}
                  onChange={(hex) => updatePreset(preset.id, { hex })}
                  label={`Color for ${preset.label || 'schedule block'}`}
                />
                {isWorkout && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-400/90">
                    <Dumbbell size={9} />
                    Workout
                  </span>
                )}
              </div>

              <input
                type="text"
                value={preset.label}
                maxLength={32}
                onChange={(e) => updatePreset(preset.id, { label: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-zinc-700/80 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                aria-label="Color label"
              />

              <button
                type="button"
                onClick={() => removePreset(preset.id)}
                disabled={isWorkout || presets.length <= 1}
                title={
                  isWorkout
                    ? 'Workout color is required for the exercise planner'
                    : 'Remove color'
                }
                className={cn(
                  'rounded-lg p-2 text-zinc-500 transition-colors',
                  isWorkout || presets.length <= 1
                    ? 'cursor-not-allowed opacity-30'
                    : 'hover:bg-red-500/10 hover:text-red-400',
                )}
                aria-label={`Remove ${preset.label}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={addPreset}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-700/80 bg-zinc-900/40 px-3 py-2.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-900 hover:text-zinc-100"
      >
        <Plus size={14} />
        Add color
      </button>
    </div>
  )
}
