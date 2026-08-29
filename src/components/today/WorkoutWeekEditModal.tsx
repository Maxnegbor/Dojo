import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useSettings } from '@/context/SettingsContext'
import { setWorkoutDayTotal, totalMinutesForDay } from '@/lib/workoutDayTotals'
import {
  DEFAULT_WORKOUT_UNIT,
  getWorkoutTypes,
  type WorkoutTypeDefinition,
} from '@/lib/workoutTypes'
import type { Workout } from '@/types'
import { cn, getWeekDates } from '@/lib/utils'

interface WorkoutWeekEditModalProps {
  date: string
  userId: string
  weekWorkouts: Workout[]
  onClose: () => void
  onSaved: () => void | Promise<void>
}

export function WorkoutWeekEditModal({
  date,
  userId,
  weekWorkouts,
  onClose,
  onSaved,
}: WorkoutWeekEditModalProps) {
  const { settings } = useSettings()
  const weekDates = useMemo(
    () => getWeekDates(parseISO(`${date}T12:00:00`), settings.weekStartsOn),
    [date, settings.weekStartsOn],
  )
  const types = useMemo(() => getWorkoutTypes(), [])

  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const day of weekDates) {
      for (const type of types) {
        const key = `${day}:${type.id}`
        const total = totalMinutesForDay(weekWorkouts, day, type.id)
        initial[key] = total > 0 ? String(total) : ''
      }
    }
    return initial
  })
  const [saving, setSaving] = useState(false)
  const [selectedDay, setSelectedDay] = useState(date)

  const unitFor = (type: WorkoutTypeDefinition) => type.unit || DEFAULT_WORKOUT_UNIT

  const save = async () => {
    setSaving(true)
    try {
      let working = [...weekWorkouts]
      for (const day of weekDates) {
        for (const type of types) {
          const key = `${day}:${type.id}`
          const raw = draft[key]?.trim() ?? ''
          const next = raw ? Number(raw) : 0
          const minutes = Number.isFinite(next) && next > 0 ? next : 0
          const current = totalMinutesForDay(working, day, type.id)
          if (Math.round(current) === Math.round(minutes)) continue
          working = await setWorkoutDayTotal({
            userId,
            date: day,
            category: type.id,
            minutes,
            existing: working,
          })
        }
      }
      await onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="workout-week-edit-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="workout-week-edit-title" className="text-sm font-semibold text-zinc-100">
              Edit this week’s workouts
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Pick a day and fix logged minutes. Totals feed the Home progress bars.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 flex gap-1 overflow-x-auto pb-0.5">
          {weekDates.map((day) => {
            const active = day === selectedDay
            const isToday = day === date
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={cn(
                  'min-w-[3.25rem] shrink-0 rounded-lg border px-2 py-1.5 text-center transition-colors',
                  active
                    ? 'border-[var(--accent-500)]/60 bg-[var(--accent-500)]/15 text-zinc-100'
                    : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                )}
              >
                <span className="block text-[10px] uppercase tracking-wide">
                  {format(parseISO(`${day}T12:00:00`), 'EEE')}
                </span>
                <span className={cn('block text-sm tabular-nums', isToday && 'font-semibold')}>
                  {format(parseISO(`${day}T12:00:00`), 'd')}
                </span>
              </button>
            )
          })}
        </div>

        <ul className="space-y-2">
          {types.map((type) => {
            const key = `${selectedDay}:${type.id}`
            const unit = unitFor(type)
            return (
              <li
                key={type.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2.5"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent-500)]" />
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{type.label}</span>
                <div className="relative w-[5.5rem]">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={draft[key] ?? ''}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    placeholder="0"
                    className={cn(
                      'w-full rounded-lg border border-zinc-700 bg-zinc-950 py-1.5 pl-2 pr-8 text-sm text-zinc-100',
                      'placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]',
                      '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                    )}
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">
                    {unit}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>

        {types.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">No workout metrics to edit.</p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
