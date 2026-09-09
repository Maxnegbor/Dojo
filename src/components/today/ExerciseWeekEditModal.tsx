import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isToday, parseISO } from 'date-fns'
import { CalendarRange, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TimeInput } from '@/components/ui/TimeInput'
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
  overIndex: number
}

function DropGap() {
  return (
    <li
      aria-hidden
      className="h-1 shrink-0 rounded-full bg-[var(--accent-500)] shadow-[0_0_8px_var(--accent-glow)]"
    />
  )
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

  const insertIndexAtPoint = (day: WeekdayIndex, y: number, excludeId: string): number => {
    const dayEl = dayEls.current.get(day)
    if (!dayEl) return 0
    const cards = [...dayEl.querySelectorAll<HTMLElement>('[data-week-slot]')].filter(
      (el) => el.dataset.weekSlot !== excludeId,
    )
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect()
      if (y < rect.top + rect.height / 2) return i
    }
    return cards.length
  }

  const moveSlotToDay = (slotId: string, day: WeekdayIndex, insertIndex: number) => {
    setSlots((prev) => {
      const moving = prev.find((slot) => slot.id === slotId)
      if (!moving) return prev
      const rest = prev.filter((slot) => slot.id !== slotId)
      const dest = rest.filter((slot) => slot.weekday === day)
      const others = rest.filter((slot) => slot.weekday !== day)
      const index = Math.max(0, Math.min(insertIndex, dest.length))
      const currentIndex =
        moving.weekday === day
          ? prev.filter((slot) => slot.weekday === day).findIndex((slot) => slot.id === slotId)
          : -1
      if (moving.weekday === day && index === currentIndex) return prev
      return [
        ...others,
        ...dest.slice(0, index),
        { ...moving, weekday: day },
        ...dest.slice(index),
      ]
    })
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
    event.preventDefault()
    const target = event.currentTarget
    const pointerId = event.pointerId
    const rect = target.getBoundingClientRect()

    try {
      target.setPointerCapture(pointerId)
    } catch {
      /* ignore */
    }

    const next: DragState = {
      slot,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      overDay: slot.weekday,
      overIndex: insertIndexAtPoint(slot.weekday, event.clientY, slot.id),
    }
    dragRef.current = next
    setDrag(next)
    setAddingDay(null)

    const onMove = (ev: PointerEvent) => {
      const overDay = dayAtPoint(ev.clientX, ev.clientY)
      const overIndex =
        overDay == null ? 0 : insertIndexAtPoint(overDay, ev.clientY, slot.id)
      const following: DragState = {
        slot,
        x: ev.clientX,
        y: ev.clientY,
        width: rect.width,
        overDay,
        overIndex,
      }
      dragRef.current = following
      setDrag(following)
      ev.preventDefault()
    }

    const finish = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', finish)
      target.removeEventListener('pointercancel', finish)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        /* already released */
      }
      const overDay = dayAtPoint(ev.clientX, ev.clientY)
      if (overDay != null) {
        moveSlotToDay(
          slot.id,
          overDay,
          insertIndexAtPoint(overDay, ev.clientY, slot.id),
        )
      }
      dragRef.current = null
      setDrag(null)
    }

    target.addEventListener('pointermove', onMove, { passive: false })
    target.addEventListener('pointerup', finish)
    target.addEventListener('pointercancel', finish)
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
              className="text-lg font-semibold text-zinc-100"
            >
              {step === 'edit' ? 'Edit week plan' : 'Save week plan'}
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {step === 'edit'
                ? 'Drag a workout onto another day. Add with + under a day.'
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
                  const visibleSlots = dropTarget
                    ? daySlots.filter((slot) => slot.id !== draggingId)
                    : daySlots
                  const gapAt = dropTarget ? drag.overIndex : null
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
                            'text-[11px] font-semibold uppercase leading-none sm:text-xs',
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
                            'text-sm font-semibold tabular-nums leading-none sm:text-base',
                            adding ? 'text-zinc-50' : 'text-zinc-300',
                            today && !adding && 'text-[var(--accent-200)]',
                          )}
                        >
                          {dayNumber(date)}
                        </span>
                      </div>

                      <ul className="flex min-h-[4.5rem] flex-col gap-1">
                        {visibleSlots.length === 0 && gapAt == null ? (
                          <li className="px-0.5 py-1 text-center text-[11px] leading-tight text-zinc-600">
                            Rest
                          </li>
                        ) : (
                          <>
                            {gapAt === 0 ? <DropGap /> : null}
                            {visibleSlots.map((slot, slotIndex) => {
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
                                <Fragment key={slot.id}>
                                  <li
                                    data-week-slot={slot.id}
                                    onPointerDown={(event) => startSlotDrag(slot, event)}
                                    className={cn(
                                      'cursor-grab touch-none select-none rounded-md border border-zinc-800/80 bg-zinc-900/80 px-1.5 py-1.5 [-webkit-touch-callout:none] sm:px-2',
                                      isDragging
                                        ? 'cursor-grabbing opacity-30'
                                        : 'hover:border-zinc-700',
                                    )}
                                    onContextMenu={(event) => event.preventDefault()}
                                  >
                                    <div className="flex items-start gap-0.5">
                                      <span
                                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                                        style={{
                                          backgroundColor: type?.color || 'var(--accent-500)',
                                        }}
                                      />
                                      <p className="min-w-0 flex-1 break-words text-xs font-medium leading-snug text-zinc-100 sm:text-sm">
                                        {title}
                                      </p>
                                      <button
                                        type="button"
                                        onPointerDown={(event) => event.stopPropagation()}
                                        onClick={() => removeSlot(slot.id)}
                                        className="rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
                                        aria-label={`Remove ${title}`}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                    {meta ? (
                                      <p className="mt-0.5 pl-3 text-[11px] tabular-nums leading-tight text-zinc-400 sm:text-xs">
                                        {meta}
                                      </p>
                                    ) : null}
                                  </li>
                                  {gapAt === slotIndex + 1 ? <DropGap /> : null}
                                </Fragment>
                              )
                            })}
                          </>
                        )}
                      </ul>

                      <button
                        type="button"
                        onClick={() => {
                          setAddingDay((current) => (current === day ? null : day))
                          clearDraft()
                        }}
                        className={cn(
                          'mt-1 inline-flex items-center justify-center gap-0.5 rounded-md py-1 text-xs font-semibold',
                          adding
                            ? 'bg-zinc-800 text-zinc-200'
                            : 'text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-200',
                        )}
                        aria-label={`Add workout on ${weekdayLabel(day)}`}
                      >
                        {adding ? <X size={14} /> : <Plus size={14} />}
                      </button>
                    </div>
                  )
                })}
              </div>

              {addingDay != null && (
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Add to {weekdayLabel(addingDay)}
                  </p>
                  {workoutTypes.length === 0 ? (
                    <p className="text-sm text-zinc-500">
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
                              'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium',
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
                                'rounded-md border px-2 py-1 text-xs font-medium',
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
                            <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                              Time
                            </span>
                            <TimeInput
                              value={draftTime}
                              onChange={setDraftTime}
                              step={1800}
                              className="w-full"
                            />
                          </label>
                          {timed ? (
                            <label className="min-w-0">
                              <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                                Min
                              </span>
                              <input
                                type="number"
                                min={5}
                                step={5}
                                value={draftDuration}
                                onChange={(e) => setDraftDuration(e.target.value)}
                                className="w-full rounded-md border border-zinc-700/80 bg-zinc-900 px-2 py-1.5 text-sm tabular-nums text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                              />
                            </label>
                          ) : (
                            <label className="min-w-0">
                              <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                                {selectedType?.unit || 'Amount'}
                              </span>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={draftAmount}
                                onChange={(e) => setDraftAmount(e.target.value)}
                                className="w-full rounded-md border border-zinc-700/80 bg-zinc-900 px-2 py-1.5 text-sm tabular-nums text-zinc-100 outline-none focus:border-[var(--accent-500)]"
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
              className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-1/2 rounded-md border border-[var(--accent-500)]/50 bg-zinc-900 px-2.5 py-2 shadow-xl shadow-black/50"
              style={{
                left: drag.x,
                top: drag.y,
                width: Math.max(drag.width, 96),
              }}
            >
              <p className="truncate text-sm font-medium text-zinc-100">
                {drag.slot.subtype?.trim() ||
                  formatWorkoutPlanLabel(drag.slot.category, drag.slot.subtype)}
              </p>
              <p className="text-xs text-zinc-400">Drop on a day</p>
            </div>,
            document.body,
          )
        : null}
    </div>,
    document.body,
  )
}
