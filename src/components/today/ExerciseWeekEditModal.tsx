import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarRange, ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useSettings } from '@/context/SettingsContext'
import {
  applyExerciseSlotsToWeekOnly,
  createExerciseWeekSlot,
  orderedWeekdays,
  plannedWorkoutsToWeekSlots,
  savePermanentExerciseWeekPlan,
  weekdayLabel,
  type ExerciseWeekSlot,
  type WeekdayIndex,
} from '@/lib/exerciseWeekTemplate'
import {
  formatWorkoutPlanLabel,
  getWorkoutTypes,
  isTimedWorkoutUnit,
} from '@/lib/workoutTypes'
import { cn, formatDuration, getWeekDates } from '@/lib/utils'
import { parseISO } from 'date-fns'

interface ExerciseWeekEditModalProps {
  viewDate: string
  userId: string | null
  onClose: () => void
  onSaved: () => void
}

type SaveStep = 'edit' | 'choose'

export function ExerciseWeekEditModal({
  viewDate,
  userId,
  onClose,
  onSaved,
}: ExerciseWeekEditModalProps) {
  const { settings } = useSettings()
  const weekDates = useMemo(
    () => getWeekDates(parseISO(`${viewDate}T12:00:00`), settings.weekStartsOn),
    [viewDate, settings.weekStartsOn],
  )
  const weekdays = useMemo(
    () => orderedWeekdays(settings.weekStartsOn),
    [settings.weekStartsOn],
  )
  const workoutTypes = useMemo(() => getWorkoutTypes(), [])
  const typeById = useMemo(
    () => new Map(workoutTypes.map((type) => [type.id, type])),
    [workoutTypes],
  )

  const [slots, setSlots] = useState<ExerciseWeekSlot[]>(() =>
    plannedWorkoutsToWeekSlots(weekDates),
  )
  const [openDay, setOpenDay] = useState<WeekdayIndex | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null)
  const [draftTime, setDraftTime] = useState('07:00')
  const [draftDuration, setDraftDuration] = useState('45')
  const [draftAmount, setDraftAmount] = useState('3')
  const [step, setStep] = useState<SaveStep>('edit')
  const [saving, setSaving] = useState(false)

  const selectedType = selectedCategoryId ? typeById.get(selectedCategoryId) : null
  const subtypes = selectedType?.subtypes ?? []
  const needsSubtype = subtypes.length > 0
  const timed = selectedType ? isTimedWorkoutUnit(selectedType.unit) : true
  const draftDurationMinutes = Math.max(0, Number(draftDuration) || 0)

  const slotsByDay = useMemo(() => {
    const map = new Map<WeekdayIndex, ExerciseWeekSlot[]>()
    for (const day of weekdays) map.set(day, [])
    for (const slot of slots) {
      const list = map.get(slot.weekday) ?? []
      list.push(slot)
      map.set(slot.weekday, list)
    }
    for (const [day, list] of map) {
      map.set(
        day,
        [...list].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '')),
      )
    }
    return map
  }, [slots, weekdays])

  const clearDraft = () => {
    setSelectedCategoryId(null)
    setSelectedSubtype(null)
    setDraftTime('07:00')
    setDraftDuration('45')
    setDraftAmount('3')
  }

  const openDayEditor = (day: WeekdayIndex) => {
    setOpenDay((current) => (current === day ? null : day))
    clearDraft()
  }

  const addSlot = (day: WeekdayIndex) => {
    if (!selectedCategoryId || !selectedType) return
    if (needsSubtype && !selectedSubtype) return
    if (draftDurationMinutes <= 0) return

    const amount = Math.max(0, Number(draftAmount) || 0)
    setSlots((prev) => [
      ...prev,
      createExerciseWeekSlot({
        weekday: day,
        category: selectedCategoryId,
        subtype: selectedSubtype,
        start_time: draftTime || null,
        duration_minutes: draftDurationMinutes,
        amount: timed ? draftDurationMinutes : amount > 0 ? amount : null,
      }),
    ])
    clearDraft()
  }

  const removeSlot = (id: string) => {
    setSlots((prev) => prev.filter((slot) => slot.id !== id))
  }

  const canAdd =
    Boolean(selectedCategoryId) &&
    (!needsSubtype || Boolean(selectedSubtype)) &&
    draftDurationMinutes > 0

  const persist = async (mode: 'week' | 'permanent') => {
    if (saving) return
    setSaving(true)
    try {
      if (mode === 'permanent') {
        await savePermanentExerciseWeekPlan({
          weekDates,
          slots,
          userId,
          timelineEndHour: settings.timelineEndHour,
        })
      } else {
        await applyExerciseSlotsToWeekOnly({
          weekDates,
          slots,
          userId,
          timelineEndHour: settings.timelineEndHour,
        })
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-week-edit-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800/80 px-5 py-4">
          <div>
            <h2
              id="exercise-week-edit-title"
              className="text-base font-semibold text-zinc-100"
            >
              {step === 'edit' ? 'Edit week plan' : 'Save week plan'}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {step === 'edit'
                ? 'Adjust workouts for this week, then choose how to save.'
                : 'Apply only to this week, or make it your permanent weekly schedule.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === 'edit' ? (
            <div className="space-y-2">
              {weekdays.map((day) => {
                const daySlots = slotsByDay.get(day) ?? []
                const expanded = openDay === day
                return (
                  <div
                    key={day}
                    className={cn(
                      'overflow-hidden rounded-xl border transition-colors',
                      expanded
                        ? 'border-[var(--accent-500)]/50 bg-zinc-950/80 ring-1 ring-[var(--accent-500)]/20'
                        : 'border-zinc-800/80 bg-zinc-950/40',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => openDayEditor(day)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                      aria-expanded={expanded}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-200">
                          {weekdayLabel(day)}
                        </p>
                        {daySlots.length === 0 ? (
                          <p className="mt-0.5 text-[11px] text-zinc-600">Rest · tap to add</p>
                        ) : (
                          <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                            {daySlots
                              .map((slot) =>
                                formatWorkoutPlanLabel(slot.category, slot.subtype),
                              )
                              .join(' · ')}
                          </p>
                        )}
                      </div>
                      <ChevronDown
                        size={16}
                        className={cn(
                          'shrink-0 text-zinc-500 transition-transform',
                          expanded && 'rotate-180 text-[var(--accent-400)]',
                        )}
                      />
                    </button>

                    {expanded && (
                      <div className="space-y-3 border-t border-zinc-800/80 px-3 pb-3 pt-2.5">
                        {daySlots.length > 0 && (
                          <ul className="space-y-1.5">
                            {daySlots.map((slot) => {
                              const type = typeById.get(slot.category)
                              return (
                                <li
                                  key={slot.id}
                                  className="flex items-center gap-2 rounded-lg border border-zinc-800/70 bg-zinc-900/60 px-2 py-1.5"
                                >
                                  <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{
                                      backgroundColor: type?.color || 'var(--accent-500)',
                                    }}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[11px] font-medium text-zinc-200">
                                      {formatWorkoutPlanLabel(slot.category, slot.subtype)}
                                    </p>
                                    <p className="text-[10px] tabular-nums text-zinc-500">
                                      {slot.start_time ? `${slot.start_time} · ` : ''}
                                      {formatDuration(slot.duration_minutes ?? 0)}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeSlot(slot.id)}
                                    className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                                    aria-label="Remove workout"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )}

                        {workoutTypes.length === 0 ? (
                          <p className="text-[11px] text-zinc-500">
                            Add workout types in Metrics first.
                          </p>
                        ) : (
                          <>
                            <div className="flex flex-wrap gap-1">
                              {workoutTypes.map((type) => (
                                <button
                                  key={type.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedCategoryId(type.id)
                                    setSelectedSubtype(null)
                                  }}
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
                                    selectedCategoryId === type.id
                                      ? 'border-[var(--accent-500)]/60 bg-[var(--accent-950)] text-[var(--accent-200)]'
                                      : 'border-zinc-700/80 bg-zinc-900 text-zinc-200',
                                  )}
                                >
                                  <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: type.color }}
                                  />
                                  {type.label}
                                </button>
                              ))}
                            </div>

                            {needsSubtype && (
                              <div className="flex flex-wrap gap-1">
                                {subtypes.map((subtype) => (
                                  <button
                                    key={subtype}
                                    type="button"
                                    onClick={() => setSelectedSubtype(subtype)}
                                    className={cn(
                                      'rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
                                      selectedSubtype === subtype
                                        ? 'border-[var(--accent-500)]/60 bg-[var(--accent-950)] text-[var(--accent-200)]'
                                        : 'border-zinc-700/80 bg-zinc-900 text-zinc-200',
                                    )}
                                  >
                                    {subtype}
                                  </button>
                                ))}
                              </div>
                            )}

                            {selectedCategoryId && (!needsSubtype || selectedSubtype) && (
                              <div className="grid grid-cols-2 gap-1.5">
                                <label className="min-w-0">
                                  <span className="mb-0.5 block text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                                    Time
                                  </span>
                                  <input
                                    type="time"
                                    step={1800}
                                    value={draftTime}
                                    onChange={(e) => setDraftTime(e.target.value)}
                                    className="w-full rounded-md border border-zinc-700/80 bg-zinc-900 px-1.5 py-1 text-[11px] tabular-nums text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                                  />
                                </label>
                                {timed ? (
                                  <label className="min-w-0">
                                    <span className="mb-0.5 block text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                                      Min
                                    </span>
                                    <input
                                      type="number"
                                      min={5}
                                      step={5}
                                      value={draftDuration}
                                      onChange={(e) => setDraftDuration(e.target.value)}
                                      className="w-full rounded-md border border-zinc-700/80 bg-zinc-900 px-1.5 py-1 text-[11px] tabular-nums text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                                    />
                                  </label>
                                ) : (
                                  <label className="min-w-0">
                                    <span className="mb-0.5 block text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                                      {selectedType?.unit || 'Amount'}
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      value={draftAmount}
                                      onChange={(e) => setDraftAmount(e.target.value)}
                                      className="w-full rounded-md border border-zinc-700/80 bg-zinc-900 px-1.5 py-1 text-[11px] tabular-nums text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                                    />
                                  </label>
                                )}
                              </div>
                            )}

                            <Button
                              size="sm"
                              className="w-full"
                              disabled={!canAdd}
                              onClick={() => addSlot(day)}
                            >
                              <Plus size={14} />
                              Add to {weekdayLabel(day)}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => void persist('week')}
                className="flex w-full items-start gap-3 rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 py-3 text-left transition-colors hover:border-[var(--accent-500)]/50 hover:bg-[var(--accent-950)]/30"
              >
                <CalendarRange size={18} className="mt-0.5 shrink-0 text-[var(--accent-300)]" />
                <span>
                  <span className="block text-sm font-semibold text-zinc-100">
                    Only this week
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    Keep your permanent weekly schedule unchanged.
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void persist('permanent')}
                className="flex w-full items-start gap-3 rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 py-3 text-left transition-colors hover:border-[var(--accent-500)]/50 hover:bg-[var(--accent-950)]/30"
              >
                <Pencil size={18} className="mt-0.5 shrink-0 text-[var(--accent-300)]" />
                <span>
                  <span className="block text-sm font-semibold text-zinc-100">
                    New permanent weekly schedule
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    Replace the recurring plan and apply it to this week.
                  </span>
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-zinc-800/80 px-5 py-4">
          {step === 'edit' ? (
            <>
              <Button variant="secondary" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={() => setStep('choose')}>
                Save…
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setStep('edit')}
              disabled={saving}
            >
              Back
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
