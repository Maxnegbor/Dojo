import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isToday, parseISO } from 'date-fns'
import { CalendarRange, Pencil, Plus, Trash2, X } from 'lucide-react'
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

interface ExerciseWeekEditModalProps {
  viewDate: string
  userId: string | null
  onClose: () => void
  onSaved: () => void
}

type SaveStep = 'edit' | 'choose'

const LONG_PRESS_MS = 220
const MOVE_CANCEL_PX = 10

function weekdayLetter(dateStr: string): string {
  return parseISO(`${dateStr}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })
}

function dayNumber(dateStr: string): string {
  return String(parseISO(`${dateStr}T12:00:00`).getDate())
}

function formatPlanTime(time: string, use24h: boolean): string {
  const [h, m] = time.split(':').map(Number)
  if (use24h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

interface DragState {
  slot: ExerciseWeekSlot
  x: number
  y: number
  width: number
  overDay: WeekdayIndex | null
}

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
  const use24h = settings.timeFormat === '24h'

  const [slots, setSlots] = useState<ExerciseWeekSlot[]>(() =>
    plannedWorkoutsToWeekSlots(weekDates),
  )
  const [addingDay, setAddingDay] = useState<WeekdayIndex | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null)
  const [draftTime, setDraftTime] = useState('07:00')
  const [draftDuration, setDraftDuration] = useState('45')
  const [draftAmount, setDraftAmount] = useState('3')
  const [step, setStep] = useState<SaveStep>('edit')
  const [saving, setSaving] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)

  const dayEls = useRef(new Map<WeekdayIndex, HTMLElement>())
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag

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

  const dayAtPoint = (x: number, y: number): WeekdayIndex | null => {
    for (const day of weekdays) {
      const el = dayEls.current.get(day)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return day
    }
    return null
  }

  const moveSlotToDay = (slotId: string, day: WeekdayIndex) => {
    setSlots((prev) =>
      prev.map((slot) => (slot.id === slotId ? { ...slot, weekday: day } : slot)),
    )
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

  const bindDayEl = (day: WeekdayIndex) => (el: HTMLDivElement | null) => {
    if (el) dayEls.current.set(day, el)
    else dayEls.current.delete(day)
  }

  const startSlotDrag = (
    slot: ExerciseWeekSlot,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    if (event.button !== 0) return
    const target = event.currentTarget
    const originX = event.clientX
    const originY = event.clientY
    const pointerId = event.pointerId
    const rect = target.getBoundingClientRect()
    let started = false
    let cancelled = false
    let holdTimer: ReturnType<typeof setTimeout> | null = window.setTimeout(() => {
      holdTimer = null
      begin(originX, originY)
    }, LONG_PRESS_MS)

    const cleanupWindow = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }

    const begin = (x: number, y: number) => {
      if (started || cancelled) return
      started = true
      if (holdTimer != null) {
        window.clearTimeout(holdTimer)
        holdTimer = null
      }
      try {
        target.setPointerCapture(pointerId)
      } catch {
        /* ignore */
      }
      const next: DragState = {
        slot,
        x,
        y,
        width: rect.width,
        overDay: slot.weekday,
      }
      dragRef.current = next
      setDrag(next)
      setAddingDay(null)
    }

    const onMove = (ev: PointerEvent) => {
      if (cancelled) return
      const dx = ev.clientX - originX
      const dy = ev.clientY - originY
      if (!started) {
        if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
          cancelled = true
          if (holdTimer != null) window.clearTimeout(holdTimer)
          cleanupWindow()
        }
        return
      }
      const overDay = dayAtPoint(ev.clientX, ev.clientY)
      const next: DragState = {
        slot,
        x: ev.clientX,
        y: ev.clientY,
        width: rect.width,
        overDay,
      }
      dragRef.current = next
      setDrag(next)
      ev.preventDefault()
    }

    const finish = (ev: PointerEvent) => {
      if (holdTimer != null) window.clearTimeout(holdTimer)
      cleanupWindow()
      if (started) {
        try {
          target.releasePointerCapture(pointerId)
        } catch {
          /* already released */
        }
        const overDay = dayAtPoint(ev.clientX, ev.clientY)
        if (overDay != null && overDay !== slot.weekday) {
          moveSlotToDay(slot.id, overDay)
        }
      }
      dragRef.current = null
      setDrag(null)
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  useEffect(() => {
    if (!drag) return
    const prev = document.body.style.userSelect
    const overflow = document.body.style.overflow
    document.body.style.userSelect = 'none'
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.userSelect = prev
      document.body.style.overflow = overflow
    }
  }, [drag])

  const draggingId = drag?.slot.id ?? null

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-week-edit-title"
        className="flex max-h-[min(94dvh,calc(100dvh-env(safe-area-inset-bottom)-0.75rem))] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800/80 px-4 py-3 sm:px-5 sm:py-4">
          <div>
            <h2
              id="exercise-week-edit-title"
              className="text-base font-semibold text-zinc-100"
            >
              {step === 'edit' ? 'Edit week plan' : 'Save week plan'}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {step === 'edit'
                ? 'Hold a workout to drag it to another day. Add with + under a day.'
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

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-5 sm:py-4">
          {step === 'edit' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-7 items-start gap-1 sm:gap-1.5">
                {weekdays.map((day, index) => {
                  const date = weekDates[index]!
                  const daySlots = slotsByDay.get(day) ?? []
                  const today = isToday(parseISO(`${date}T12:00:00`))
                  const adding = addingDay === day
                  const dropTarget = drag?.overDay === day
                  return (
                    <div
                      key={day}
                      ref={bindDayEl(day)}
                      className={cn(
                        'flex min-w-0 flex-col rounded-lg px-0.5 py-1 transition-colors sm:px-1',
                        adding && 'bg-[var(--accent-950)]/85 ring-1 ring-[var(--accent-ring)]',
                        dropTarget &&
                          !adding &&
                          'bg-[var(--accent-950)]/50 ring-1 ring-[var(--accent-500)]/40',
                        today && !adding && !dropTarget && 'bg-[var(--accent-950)]/30',
                      )}
                    >
                      <div className="mb-1.5 flex flex-col items-center gap-0.5">
                        <span
                          className={cn(
                            'text-[8px] font-semibold uppercase leading-none',
                            adding || dropTarget
                              ? 'text-[var(--accent-300)]'
                              : today
                                ? 'text-[var(--accent-400)]'
                                : 'text-zinc-500',
                          )}
                        >
                          {weekdayLetter(date)}
                        </span>
                        <span
                          className={cn(
                            'text-[11px] font-semibold tabular-nums leading-none',
                            adding ? 'text-zinc-50' : 'text-zinc-300',
                            today && !adding && 'text-[var(--accent-200)]',
                          )}
                        >
                          {dayNumber(date)}
                        </span>
                      </div>

                      <ul className="flex min-h-[4.5rem] flex-col gap-1">
                        {daySlots.length === 0 ? (
                          <li className="px-0.5 py-1 text-center text-[9px] leading-tight text-zinc-600">
                            Rest
                          </li>
                        ) : (
                          daySlots.map((slot) => {
                            const type = typeById.get(slot.category)
                            const title =
                              slot.subtype?.trim() ||
                              formatWorkoutPlanLabel(slot.category, slot.subtype)
                            const meta = [
                              slot.start_time
                                ? formatPlanTime(slot.start_time, use24h)
                                : null,
                              slot.duration_minutes
                                ? formatDuration(slot.duration_minutes)
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                            const isDragging = draggingId === slot.id
                            return (
                              <li
                                key={slot.id}
                                onPointerDown={(event) => startSlotDrag(slot, event)}
                                className={cn(
                                  'touch-manipulation select-none rounded-md border border-zinc-800/80 bg-zinc-900/80 px-1 py-1 [-webkit-touch-callout:none]',
                                  isDragging && 'opacity-30',
                                )}
                                onContextMenu={(event) => event.preventDefault()}
                              >
                                <div className="flex items-start gap-0.5">
                                  <span
                                    className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{
                                      backgroundColor: type?.color || 'var(--accent-500)',
                                    }}
                                  />
                                  <p className="min-w-0 flex-1 break-words text-[9px] font-medium leading-tight text-zinc-100 sm:text-[10px]">
                                    {title}
                                  </p>
                                  <button
                                    type="button"
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onClick={() => removeSlot(slot.id)}
                                    className="rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
                                    aria-label={`Remove ${title}`}
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                                {meta ? (
                                  <p className="mt-0.5 pl-2 text-[8px] tabular-nums leading-tight text-zinc-500">
                                    {meta}
                                  </p>
                                ) : null}
                              </li>
                            )
                          })
                        )}
                      </ul>

                      <button
                        type="button"
                        onClick={() => {
                          setAddingDay((current) => (current === day ? null : day))
                          clearDraft()
                        }}
                        className={cn(
                          'mt-1 inline-flex items-center justify-center gap-0.5 rounded-md py-0.5 text-[9px] font-semibold',
                          adding
                            ? 'bg-zinc-800 text-zinc-200'
                            : 'text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-200',
                        )}
                        aria-label={`Add workout on ${weekdayLabel(day)}`}
                      >
                        {adding ? <X size={10} /> : <Plus size={10} />}
                      </button>
                    </div>
                  )
                })}
              </div>

              {addingDay != null && (
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Add to {weekdayLabel(addingDay)}
                  </p>
                  {workoutTypes.length === 0 ? (
                    <p className="text-[11px] text-zinc-500">
                      Add workout types in Metrics first.
                    </p>
                  ) : (
                    <div className="space-y-2">
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
                        onClick={() => addSlot(addingDay)}
                      >
                        <Plus size={14} />
                        Add to {weekdayLabel(addingDay)}
                      </Button>
                    </div>
                  )}
                </div>
              )}
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

        <div className="flex shrink-0 gap-2 border-t border-zinc-800/80 px-4 py-3 sm:px-5 sm:py-4">
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

      {drag
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-1/2 rounded-md border border-[var(--accent-500)]/50 bg-zinc-900 px-2 py-1.5 shadow-xl shadow-black/50"
              style={{
                left: drag.x,
                top: drag.y,
                width: Math.max(drag.width, 72),
              }}
            >
              <p className="truncate text-[11px] font-medium text-zinc-100">
                {drag.slot.subtype?.trim() ||
                  formatWorkoutPlanLabel(drag.slot.category, drag.slot.subtype)}
              </p>
              <p className="text-[9px] text-zinc-500">Drop on a day</p>
            </div>,
            document.body,
          )
        : null}
    </div>,
    document.body,
  )
}
