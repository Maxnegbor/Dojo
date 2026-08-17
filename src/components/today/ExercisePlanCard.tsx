import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isToday, parseISO } from 'date-fns'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { ExerciseWeekEditModal } from '@/components/today/ExerciseWeekEditModal'
import { useSettings } from '@/context/SettingsContext'
import {
  addPlannedWorkout,
  beginPlannedWorkoutDrag,
  endPlannedWorkoutDrag,
  EXERCISE_PLAN_CHANGED,
  getPlannedWorkoutLogAmount,
  getPlannedWorkoutsForDates,
  MIN_PLAN_SCHEDULE_MINUTES,
  PLANNED_WORKOUT_DRAG_MIME,
  plannedWorkoutCanSync,
  removePlannedWorkout,
  type PlannedWorkout,
} from '@/lib/exercisePlan'
import {
  applyExerciseWeekTemplateToDates,
  EXERCISE_WEEK_TEMPLATE_CHANGED,
} from '@/lib/exerciseWeekTemplate'
import {
  formatWorkoutAmount,
  formatWorkoutPlanLabel,
  getWorkoutTypes,
  isTimedWorkoutUnit,
  WORKOUT_TYPES_CHANGED,
} from '@/lib/workoutTypes'
import { cn, formatDuration, getWeekDates } from '@/lib/utils'

interface ExercisePlanCardProps {
  viewDate: string
  userId: string | null
  onSelectDate?: (date: string) => void
  /** Called after a plan creates/updates/removes a schedule block. */
  onScheduleChange?: () => void
  onRemoveLoggedWorkout?: (workoutId: string) => Promise<void>
  onVolumeLogged?: () => void
  /** Lock to viewDate only — hide the week day strip. */
  singleDate?: boolean
  className?: string
}

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

export function ExercisePlanCard({
  viewDate,
  userId,
  onSelectDate,
  onScheduleChange,
  onRemoveLoggedWorkout,
  onVolumeLogged,
  singleDate = false,
  className,
}: ExercisePlanCardProps) {
  const { settings } = useSettings()
  const [workoutTypes, setWorkoutTypes] = useState(() => getWorkoutTypes())
  const typeById = useMemo(
    () => new Map(workoutTypes.map((type) => [type.id, type])),
    [workoutTypes],
  )

  const weekDates = useMemo(
    () => getWeekDates(parseISO(`${viewDate}T12:00:00`), settings.weekStartsOn),
    [viewDate, settings.weekStartsOn],
  )

  const [selectedDate, setSelectedDate] = useState(viewDate)
  const [planned, setPlanned] = useState<PlannedWorkout[]>(() =>
    getPlannedWorkoutsForDates(weekDates),
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftCategory, setDraftCategory] = useState<string | null>(null)
  const [draftSubtype, setDraftSubtype] = useState<string | null>(null)
  const [draftTime, setDraftTime] = useState('07:00')
  const [draftDuration, setDraftDuration] = useState('45')
  const [draftAmount, setDraftAmount] = useState('3')
  const [draftNotes, setDraftNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [weekEditOpen, setWeekEditOpen] = useState(false)

  useEffect(() => {
    setSelectedDate(viewDate)
  }, [viewDate])

  useEffect(() => {
    const syncTypes = () => setWorkoutTypes(getWorkoutTypes())
    window.addEventListener(WORKOUT_TYPES_CHANGED, syncTypes)
    window.addEventListener('user-storage-ready', syncTypes)
    return () => {
      window.removeEventListener(WORKOUT_TYPES_CHANGED, syncTypes)
      window.removeEventListener('user-storage-ready', syncTypes)
    }
  }, [])

  const refresh = useCallback(() => {
    setPlanned(getPlannedWorkoutsForDates(weekDates))
  }, [weekDates])

  const onScheduleChangeRef = useRef(onScheduleChange)
  onScheduleChangeRef.current = onScheduleChange

  useEffect(() => {
    let cancelled = false
    const syncWeek = async () => {
      const changed = await applyExerciseWeekTemplateToDates({
        weekDates,
        userId,
        timelineEndHour: settings.timelineEndHour,
      })
      if (cancelled) return
      refresh()
      if (changed) onScheduleChangeRef.current?.()
    }
    void syncWeek()
    return () => {
      cancelled = true
    }
  }, [weekDates, userId, settings.timelineEndHour, refresh])

  useEffect(() => {
    const onPlanChange = () => refresh()
    const onTemplateChange = () => {
      void applyExerciseWeekTemplateToDates({
        weekDates,
        userId,
        timelineEndHour: settings.timelineEndHour,
      }).then((changed) => {
        refresh()
        if (changed) onScheduleChangeRef.current?.()
      })
    }
    window.addEventListener(EXERCISE_PLAN_CHANGED, onPlanChange)
    window.addEventListener(EXERCISE_WEEK_TEMPLATE_CHANGED, onTemplateChange)
    window.addEventListener('user-storage-ready', onPlanChange)
    return () => {
      window.removeEventListener(EXERCISE_PLAN_CHANGED, onPlanChange)
      window.removeEventListener(EXERCISE_WEEK_TEMPLATE_CHANGED, onTemplateChange)
      window.removeEventListener('user-storage-ready', onPlanChange)
    }
  }, [weekDates, userId, settings.timelineEndHour, refresh])

  const byDate = useMemo(() => {
    const map = new Map<string, PlannedWorkout[]>()
    for (const date of weekDates) map.set(date, [])
    for (const item of planned) {
      const list = map.get(item.date)
      if (list) list.push(item)
    }
    return map
  }, [planned, weekDates])

  const selectedItems = byDate.get(selectedDate) ?? []

  if (!settings.showHomeWorkoutPlanner) return null

  const resetDraft = () => {
    setDraftCategory(null)
    setDraftSubtype(null)
    setDraftTime('07:00')
    setDraftDuration('45')
    setDraftAmount('3')
    setDraftNotes('')
  }

  const selectDay = (date: string) => {
    setSelectedDate(date)
    setPickerOpen(false)
    resetDraft()
    onSelectDate?.(date)
  }

  const draftType = draftCategory ? typeById.get(draftCategory) : null
  const draftSubtypes = draftType?.subtypes ?? []
  const needsSubtype = draftSubtypes.length > 0
  const draftTimed = draftType ? isTimedWorkoutUnit(draftType.unit) : true
  const use24h = settings.timeFormat === '24h'
  const canSubmit =
    Boolean(draftCategory) && (!needsSubtype || Boolean(draftSubtype)) && !saving

  const selectCategory = (categoryId: string) => {
    setDraftCategory(categoryId)
    setDraftSubtype(null)
  }

  const submitPlan = async () => {
    if (!draftCategory || !userId || saving) return
    if (needsSubtype && !draftSubtype) return

    setSaving(true)
    try {
      if (draftTimed) {
        const duration = parseInt(draftDuration, 10)
        const duration_minutes =
          Number.isFinite(duration) && duration > 0 ? duration : null
        await addPlannedWorkout({
          date: selectedDate,
          category: draftCategory,
          subtype: draftSubtype,
          start_time: draftTime || null,
          duration_minutes,
          amount: duration_minutes,
          notes: draftNotes,
          userId,
          timelineEndHour: settings.timelineEndHour,
        })
      } else {
        const amountRaw = parseFloat(draftAmount)
        const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : null
        await addPlannedWorkout({
          date: selectedDate,
          category: draftCategory,
          subtype: draftSubtype,
          start_time: draftTime || null,
          amount,
          notes: draftNotes,
          userId,
          timelineEndHour: settings.timelineEndHour,
        })
      }
      onScheduleChange?.()
      setPickerOpen(false)
      resetDraft()
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (id: string) => {
    const item = planned.find((entry) => entry.id === id)
    if (item?.logged_workout_id && onRemoveLoggedWorkout) {
      await onRemoveLoggedWorkout(item.logged_workout_id)
      onVolumeLogged?.()
    }
    await removePlannedWorkout(id)
    onScheduleChange?.()
  }

  const addButton = (
    <button
      type="button"
      onClick={() => {
        setPickerOpen((open) => !open)
        if (pickerOpen) resetDraft()
      }}
      disabled={workoutTypes.length === 0}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
        pickerOpen
          ? 'bg-zinc-800 text-zinc-200'
          : 'bg-[var(--accent-500)] text-black hover:bg-[var(--accent-400)]',
        workoutTypes.length === 0 && 'cursor-not-allowed opacity-40',
      )}
    >
      {pickerOpen ? <X size={11} /> : <Plus size={11} />}
      {pickerOpen ? 'Close' : 'Add'}
    </button>
  )

  const editWeekButton = !singleDate ? (
    <button
      type="button"
      onClick={() => {
        setPickerOpen(false)
        resetDraft()
        setWeekEditOpen(true)
      }}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-zinc-700/80 bg-zinc-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
      aria-label="Edit week plan"
    >
      <Pencil size={11} />
      Edit
    </button>
  ) : null

  return (
    <Card className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-zinc-200">Exercise plan</h3>
        <div className="flex items-center gap-1">
          {editWeekButton}
          {addButton}
        </div>
      </div>
      {weekEditOpen && (
        <ExerciseWeekEditModal
          viewDate={viewDate}
          userId={userId}
          onClose={() => setWeekEditOpen(false)}
          onSaved={() => {
            refresh()
            onScheduleChange?.()
          }}
        />
      )}
      <div className="space-y-2">
        {!singleDate && (
          <div className="flex items-stretch gap-0.5">
            {weekDates.map((date) => {
              const selected = date === selectedDate
              const today = isToday(parseISO(`${date}T12:00:00`))
              const dayItems = byDate.get(date) ?? []

              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => selectDay(date)}
                  title={
                    dayItems.length > 0
                      ? dayItems
                          .map((item) =>
                            formatWorkoutPlanLabel(item.category, item.subtype),
                          )
                          .join(', ')
                      : undefined
                  }
                  className={cn(
                    'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md px-0.5 py-1 transition-colors',
                    selected
                      ? 'bg-[var(--accent-950)]/85 ring-1 ring-[var(--accent-ring)]'
                      : today
                        ? 'bg-[var(--accent-950)]/30'
                        : 'hover:bg-zinc-800/60',
                  )}
                >
                  <span
                    className={cn(
                      'text-[8px] font-semibold uppercase leading-none',
                      selected
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
                      'text-[11px] tabular-nums font-semibold leading-none',
                      selected ? 'text-zinc-50' : 'text-zinc-300',
                      today && !selected && 'text-[var(--accent-200)]',
                    )}
                  >
                    {dayNumber(date)}
                  </span>
                  <span className="flex h-1.5 items-center justify-center gap-0.5">
                    {dayItems.length === 0 ? (
                      today && !selected ? (
                        <span className="h-1 w-1 rounded-full bg-[var(--accent-500)]" />
                      ) : (
                        <span className="h-1 w-1" />
                      )
                    ) : (
                      dayItems.slice(0, 3).map((item) => {
                        const type = typeById.get(item.category)
                        return (
                          <span
                            key={item.id}
                            className="h-1 w-1 rounded-full"
                            style={{
                              backgroundColor: type?.color || 'var(--accent-500)',
                            }}
                          />
                        )
                      })
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {workoutTypes.length === 0 ? (
          <p className="text-[10px] text-zinc-500">Add workout types in Metrics first.</p>
        ) : pickerOpen ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {workoutTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => selectCategory(type.id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                    draftCategory === type.id
                      ? 'border-[var(--accent-500)]/60 bg-[var(--accent-950)] text-[var(--accent-200)]'
                      : 'border-zinc-700/80 bg-zinc-900 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800',
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: type.color || 'var(--accent-500)' }}
                  />
                  {type.label}
                </button>
              ))}
            </div>

            {needsSubtype && (
              <div className="flex flex-wrap gap-1">
                {draftSubtypes.map((subtype) => (
                  <button
                    key={subtype}
                    type="button"
                    onClick={() => setDraftSubtype(subtype)}
                    className={cn(
                      'rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                      draftSubtype === subtype
                        ? 'border-[var(--accent-500)]/60 bg-[var(--accent-950)] text-[var(--accent-200)]'
                        : 'border-zinc-700/80 bg-zinc-900 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800',
                    )}
                  >
                    {subtype}
                  </button>
                ))}
              </div>
            )}

            {draftCategory && (!needsSubtype || draftSubtype) && (
              <>
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
                  {draftTimed ? (
                    <label className="min-w-0">
                      <span className="mb-0.5 block text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                        Min
                      </span>
                      <input
                        type="number"
                        min={MIN_PLAN_SCHEDULE_MINUTES}
                        step={5}
                        inputMode="numeric"
                        value={draftDuration}
                        onChange={(e) => setDraftDuration(e.target.value)}
                        className="w-full rounded-md border border-zinc-700/80 bg-zinc-900 px-1.5 py-1 text-[11px] tabular-nums text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                      />
                    </label>
                  ) : (
                    <label className="min-w-0">
                      <span className="mb-0.5 block text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                        {draftType?.unit ?? 'sets'}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={draftAmount}
                        onChange={(e) => setDraftAmount(e.target.value)}
                        className="w-full rounded-md border border-zinc-700/80 bg-zinc-900 px-1.5 py-1 text-[11px] tabular-nums text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                      />
                    </label>
                  )}
                </div>

                <input
                  type="text"
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  placeholder="Note"
                  maxLength={60}
                  className="w-full rounded-md border border-zinc-700/80 bg-zinc-900 px-1.5 py-1 text-[10px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-500)]"
                />

                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => void submitPlan()}
                  className={cn(
                    'flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
                    canSubmit
                      ? 'bg-[var(--accent-500)] text-black hover:bg-[var(--accent-400)]'
                      : 'cursor-not-allowed bg-zinc-800 text-zinc-500',
                  )}
                >
                  {saving
                    ? 'Saving…'
                    : draftType
                      ? `Plan ${formatWorkoutPlanLabel(draftType.id, draftSubtype)}`
                      : 'Pick a type'}
                </button>
              </>
            )}

            {draftCategory && needsSubtype && !draftSubtype && (
              <p className="text-[10px] text-zinc-600">
                Choose {draftSubtypes.slice(0, 3).join(', ')}
                {draftSubtypes.length > 3 ? '…' : ''}.
              </p>
            )}
          </div>
        ) : selectedItems.length === 0 ? (
          <p className="text-[10px] text-zinc-600">Nothing planned</p>
        ) : (
          <ul className="space-y-0.5">
            {selectedItems.map((item) => {
              const type = typeById.get(item.category)
              const unit = type?.unit ?? 'min'
              const timed = isTimedWorkoutUnit(unit)
              const synced = plannedWorkoutCanSync(item) && Boolean(item.schedule_block_id)
              const logAmount = getPlannedWorkoutLogAmount(item)
              const amountLabel =
                logAmount != null ? formatWorkoutAmount(logAmount, unit) : null
              const title = formatWorkoutPlanLabel(item.category, item.subtype)
              const meta = [
                item.start_time ? formatPlanTime(item.start_time, use24h) : null,
                timed && item.duration_minutes != null && item.duration_minutes > 0
                  ? formatDuration(item.duration_minutes)
                  : !timed && amountLabel
                    ? amountLabel
                    : null,
                synced ? 'sched' : null,
                item.completed ? 'logged' : null,
              ]
                .filter(Boolean)
                .join(' · ')

              return (
                <li
                  key={item.id}
                  draggable={!item.completed}
                  onDragStart={(e) => {
                    if (item.completed) {
                      e.preventDefault()
                      return
                    }
                    beginPlannedWorkoutDrag(item)
                    e.dataTransfer.setData(PLANNED_WORKOUT_DRAG_MIME, item.id)
                    e.dataTransfer.effectAllowed = 'copyMove'
                  }}
                  onDragEnd={() => endPlannedWorkoutDrag()}
                  title={
                    item.completed
                      ? undefined
                      : 'Drag onto the schedule to place at that time'
                  }
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-1.5 py-1',
                    item.completed
                      ? 'bg-[var(--accent-950)]/35'
                      : 'cursor-grab bg-zinc-900/40 active:cursor-grabbing',
                    !item.completed && !item.schedule_block_id && 'ring-1 ring-zinc-700/60',
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: type?.color || 'var(--accent-500)' }}
                  />
                  <p
                    className={cn(
                      'min-w-0 flex-1 truncate text-[11px]',
                      item.completed ? 'text-[var(--accent-200)]' : 'text-zinc-200',
                    )}
                  >
                    <span className="font-medium">
                      {item.subtype?.trim() || type?.label || item.category}
                    </span>
                    {meta ? (
                      <span className="font-normal text-zinc-500"> · {meta}</span>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    aria-label={`Remove ${title}`}
                    className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleRemove(item.id)
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}
