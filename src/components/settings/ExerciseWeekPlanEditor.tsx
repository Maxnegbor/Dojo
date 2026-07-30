import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ToggleRow } from '@/components/settings/SettingsControls'
import { useSettings } from '@/context/SettingsContext'
import {
  createExerciseWeekSlot,
  exerciseWeekTotalsByCategory,
  EXERCISE_WEEK_TEMPLATE_CHANGED,
  getExerciseWeekTemplate,
  orderedWeekdays,
  saveExerciseWeekTemplate,
  weekdayLabel,
  type ExerciseWeekSlot,
  type ExerciseWeekTemplate,
  type WeekdayIndex,
} from '@/lib/exerciseWeekTemplate'
import {
  formatWorkoutPlanLabel,
  getWorkoutTypes,
  isTimedWorkoutUnit,
  WORKOUT_TYPES_CHANGED,
} from '@/lib/workoutTypes'
import { cn, formatDuration } from '@/lib/utils'

interface ExerciseWeekPlanEditorProps {
  onSaved?: () => void
}

type DraftSelection = {
  categoryId: string
  /** Empty string = type with no subtypes (or “whole type”). */
  subtype: string
}

function selectionKey(selection: DraftSelection): string {
  return `${selection.categoryId}::${selection.subtype}`
}

export function ExerciseWeekPlanEditor({ onSaved }: ExerciseWeekPlanEditorProps) {
  const { settings } = useSettings()
  const includeTime = settings.exerciseWeekPlanIncludeTime
  const [template, setTemplate] = useState(() => getExerciseWeekTemplate())
  const [workoutTypes, setWorkoutTypes] = useState(() => getWorkoutTypes())
  const [openDay, setOpenDay] = useState<WeekdayIndex | null>(null)
  const [selected, setSelected] = useState<DraftSelection[]>([])
  const [draftTime, setDraftTime] = useState('07:00')
  const [draftDuration, setDraftDuration] = useState('45')
  const [draftAmount, setDraftAmount] = useState('3')

  useEffect(() => {
    const syncTemplate = () => setTemplate(getExerciseWeekTemplate())
    const syncTypes = () => setWorkoutTypes(getWorkoutTypes())
    window.addEventListener(EXERCISE_WEEK_TEMPLATE_CHANGED, syncTemplate)
    window.addEventListener(WORKOUT_TYPES_CHANGED, syncTypes)
    return () => {
      window.removeEventListener(EXERCISE_WEEK_TEMPLATE_CHANGED, syncTemplate)
      window.removeEventListener(WORKOUT_TYPES_CHANGED, syncTypes)
    }
  }, [])

  const weekdays = useMemo(
    () => orderedWeekdays(settings.weekStartsOn),
    [settings.weekStartsOn],
  )

  const totals = useMemo(
    () => exerciseWeekTotalsByCategory(template.slots),
    [template.slots],
  )

  const typeById = useMemo(
    () => new Map(workoutTypes.map((type) => [type.id, type])),
    [workoutTypes],
  )

  const commit = (next: ExerciseWeekTemplate) => {
    const saved = saveExerciseWeekTemplate(next)
    setTemplate(saved)
    onSaved?.()
  }

  const selectedKeys = useMemo(() => new Set(selected.map(selectionKey)), [selected])

  const toggleCategory = (categoryId: string) => {
    const type = typeById.get(categoryId)
    const subtypes = type?.subtypes ?? []

    setSelected((prev) => {
      const without = prev.filter((entry) => entry.categoryId !== categoryId)
      const hadAny = without.length !== prev.length
      if (hadAny) return without

      if (subtypes.length > 0) {
        // Selecting a typed category waits for subcategory picks — seed empty until chosen.
        return prev
      }
      return [...prev, { categoryId, subtype: '' }]
    })
  }

  const isCategorySelected = (categoryId: string) =>
    selected.some((entry) => entry.categoryId === categoryId)

  const toggleSubtype = (categoryId: string, subtype: string) => {
    const key = selectionKey({ categoryId, subtype })
    setSelected((prev) => {
      if (prev.some((entry) => selectionKey(entry) === key)) {
        return prev.filter((entry) => selectionKey(entry) !== key)
      }
      // Drop bare category entry if present, then add subtype.
      return [
        ...prev.filter((entry) => entry.categoryId !== categoryId || entry.subtype !== ''),
        { categoryId, subtype },
      ]
    })
  }

  const openDayEditor = (day: WeekdayIndex) => {
    setOpenDay((current) => (current === day ? null : day))
    setSelected([])
    setDraftDuration('45')
    setDraftAmount('3')
    setDraftTime('07:00')
  }

  const addSelectedToDay = (day: WeekdayIndex) => {
    if (selected.length === 0) return
    const duration = Math.max(0, parseInt(draftDuration, 10) || 0)
    const amount = Math.max(0, Number(draftAmount) || 0)
    const start_time = includeTime ? draftTime || null : null

    const nextSlots = [...template.slots]
    for (const entry of selected) {
      const type = typeById.get(entry.categoryId)
      if (!type) continue
      const subtypes = type.subtypes ?? []
      if (subtypes.length > 0 && !entry.subtype) continue
      const timed = isTimedWorkoutUnit(type.unit)
      nextSlots.push(
        createExerciseWeekSlot({
          weekday: day,
          category: entry.categoryId,
          subtype: entry.subtype || null,
          start_time,
          duration_minutes: duration > 0 ? duration : 45,
          amount: timed ? (duration > 0 ? duration : null) : amount > 0 ? amount : null,
        }),
      )
    }
    commit({ ...template, slots: nextSlots })
    setSelected([])
  }

  const removeSlot = (id: string) => {
    commit({ ...template, slots: template.slots.filter((slot) => slot.id !== id) })
  }

  const updateSlot = (id: string, patch: Partial<ExerciseWeekSlot>) => {
    commit({
      ...template,
      slots: template.slots.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)),
    })
  }

  const slotsByDay = useMemo(() => {
    const map = new Map<WeekdayIndex, ExerciseWeekSlot[]>()
    for (const day of weekdays) map.set(day, [])
    for (const slot of template.slots) {
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
  }, [template.slots, weekdays])

  const categoriesNeedingSubtype = useMemo(() => {
    const ids = new Set<string>()
    for (const type of workoutTypes) {
      if ((type.subtypes?.length ?? 0) > 0 && isCategorySelected(type.id)) {
        ids.add(type.id)
      }
    }
    // Also show subtype pickers when user tapped a category with subtypes (even before selection)
    // Track "pending" category focus separately — use selected OR last tapped.
    return ids
  }, [workoutTypes, selected])

  const [pendingSubtypeCategory, setPendingSubtypeCategory] = useState<string | null>(null)

  const handleCategoryClick = (categoryId: string) => {
    const type = typeById.get(categoryId)
    const subtypes = type?.subtypes ?? []
    if (subtypes.length > 0) {
      if (isCategorySelected(categoryId) && pendingSubtypeCategory === categoryId) {
        // Second click on open category clears it
        setSelected((prev) => prev.filter((entry) => entry.categoryId !== categoryId))
        setPendingSubtypeCategory(null)
        return
      }
      setPendingSubtypeCategory(categoryId)
      return
    }
    setPendingSubtypeCategory(null)
    toggleCategory(categoryId)
  }

  const visibleSubtypeCategoryIds = useMemo(() => {
    const ids = new Set(categoriesNeedingSubtype)
    if (pendingSubtypeCategory) ids.add(pendingSubtypeCategory)
    return [...ids]
  }, [categoriesNeedingSubtype, pendingSubtypeCategory])

  const canAdd =
    selected.length > 0 &&
    selected.every((entry) => {
      const type = typeById.get(entry.categoryId)
      const subtypes = type?.subtypes ?? []
      return subtypes.length === 0 || Boolean(entry.subtype)
    })

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Set a repeating weekly workout plan. Tap a day to add one or more workouts. When enabled, it
        fills each week on Home (today onward).
      </p>

      <ToggleRow
        label="Use recurring weekly plan"
        description="Automatically apply this plan to each week"
        checked={template.enabled}
        onChange={(enabled) => commit({ ...template, enabled })}
      />

      {totals.length > 0 && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Planned minutes / week
          </p>
          <ul className="space-y-1.5">
            {totals.map((row) => (
              <li
                key={row.category}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate text-zinc-200">
                  {row.label}
                  <span className="ml-1.5 text-[11px] text-zinc-500">
                    · {row.count} session{row.count === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-zinc-100">
                  {formatDuration(row.minutes)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-zinc-800/80 pt-2 text-right text-xs text-zinc-400">
            Total{' '}
            <span className="font-semibold text-zinc-200">
              {formatDuration(totals.reduce((sum, row) => sum + row.minutes, 0))}
            </span>
          </p>
        </div>
      )}

      <div className="space-y-2">
        {weekdays.map((day) => {
          const slots = slotsByDay.get(day) ?? []
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
                  <p className="text-xs font-semibold text-zinc-200">{weekdayLabel(day)}</p>
                  {slots.length === 0 ? (
                    <p className="mt-0.5 text-[11px] text-zinc-600">Rest · tap to add</p>
                  ) : (
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                      {slots
                        .map((slot) => formatWorkoutPlanLabel(slot.category, slot.subtype))
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <ChevronDown
                  size={16}
                  className={cn(
                    'shrink-0 text-zinc-500 transition-transform duration-200',
                    expanded && 'rotate-180 text-[var(--accent-400)]',
                  )}
                />
              </button>

              {expanded && (
                <div className="space-y-3 border-t border-zinc-800/80 px-3 pb-3 pt-2.5">
                  {slots.length > 0 && (
                    <ul className="space-y-1.5">
                      {slots.map((slot) => {
                        const type = typeById.get(slot.category)
                        const slotTimed = type ? isTimedWorkoutUnit(type.unit) : true
                        return (
                          <li
                            key={slot.id}
                            className="flex items-start gap-2 rounded-lg border border-zinc-800/70 bg-zinc-900/60 p-2"
                          >
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-zinc-100">
                                  {formatWorkoutPlanLabel(slot.category, slot.subtype)}
                                </span>
                                {(type?.subtypes?.length ?? 0) > 0 && (
                                  <select
                                    value={slot.subtype ?? ''}
                                    onChange={(e) =>
                                      updateSlot(slot.id, {
                                        subtype: e.target.value.trim() || null,
                                      })
                                    }
                                    className="rounded-md border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-[11px] text-zinc-200"
                                  >
                                    <option value="">Subcategory…</option>
                                    {type?.subtypes?.map((subtype) => (
                                      <option key={subtype} value={subtype}>
                                        {subtype}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                {includeTime && (
                                  <input
                                    type="time"
                                    value={slot.start_time ?? '07:00'}
                                    onChange={(e) =>
                                      updateSlot(slot.id, {
                                        start_time: e.target.value || null,
                                      })
                                    }
                                    className="rounded-md border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-[11px] text-zinc-200"
                                  />
                                )}
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={slotTimed ? 20 : 1}
                                    value={
                                      slotTimed
                                        ? (slot.duration_minutes ?? '')
                                        : (slot.amount ?? '')
                                    }
                                    onChange={(e) => {
                                      const n = Number(e.target.value)
                                      if (!Number.isFinite(n)) return
                                      if (slotTimed) {
                                        updateSlot(slot.id, {
                                          duration_minutes: n,
                                          amount: n,
                                        })
                                      } else {
                                        updateSlot(slot.id, { amount: n })
                                      }
                                    }}
                                    className="w-16 rounded-md border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-[11px] text-zinc-200"
                                  />
                                  <span className="text-[10px] text-zinc-500">
                                    {slotTimed ? 'min' : (type?.unit ?? '')}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeSlot(slot.id)}
                              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                              aria-label="Remove workout"
                            >
                              <Trash2 size={14} />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {workoutTypes.length === 0 ? (
                    <p className="text-[11px] text-zinc-500">
                      Add workout types under Metrics → Workouts first.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                          Workouts
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {workoutTypes.map((type) => {
                            const active =
                              isCategorySelected(type.id) ||
                              pendingSubtypeCategory === type.id
                            return (
                              <button
                                key={type.id}
                                type="button"
                                onClick={() => handleCategoryClick(type.id)}
                                className={cn(
                                  'rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                                  active
                                    ? 'bg-[var(--accent-600)] text-white shadow-[0_0_12px_var(--accent-glow)]'
                                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200',
                                )}
                              >
                                {type.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {visibleSubtypeCategoryIds.map((categoryId) => {
                        const type = typeById.get(categoryId)
                        if (!type?.subtypes?.length) return null
                        return (
                          <div key={categoryId} className="space-y-1.5">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                              {type.label} subcategory
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {type.subtypes.map((subtype) => {
                                const active = selectedKeys.has(
                                  selectionKey({ categoryId, subtype }),
                                )
                                return (
                                  <button
                                    key={subtype}
                                    type="button"
                                    onClick={() => toggleSubtype(categoryId, subtype)}
                                    className={cn(
                                      'rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                                      active
                                        ? 'bg-[var(--accent-600)] text-white shadow-[0_0_12px_var(--accent-glow)]'
                                        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200',
                                    )}
                                  >
                                    {subtype}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}

                      <div className="flex flex-wrap items-end gap-2">
                        {includeTime && (
                          <label className="space-y-1">
                            <span className="block text-[10px] text-zinc-500">Time</span>
                            <input
                              type="time"
                              value={draftTime}
                              onChange={(e) => setDraftTime(e.target.value)}
                              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
                            />
                          </label>
                        )}
                        <label className="space-y-1">
                          <span className="block text-[10px] text-zinc-500">Duration (min)</span>
                          <input
                            type="number"
                            min={1}
                            value={draftDuration}
                            onChange={(e) => setDraftDuration(e.target.value)}
                            className="w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
                          />
                        </label>
                        {selected.some((entry) => {
                          const type = typeById.get(entry.categoryId)
                          return type ? !isTimedWorkoutUnit(type.unit) : false
                        }) && (
                          <label className="space-y-1">
                            <span className="block text-[10px] text-zinc-500">Amount</span>
                            <input
                              type="number"
                              min={1}
                              value={draftAmount}
                              onChange={(e) => setDraftAmount(e.target.value)}
                              className="w-20 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
                            />
                          </label>
                        )}
                        <Button
                          size="sm"
                          disabled={!canAdd}
                          onClick={() => addSelectedToDay(day)}
                        >
                          <Plus size={14} />
                          Add{selected.length > 1 ? ` ${selected.length}` : ''}
                        </Button>
                      </div>

                      {selected.length === 0 && pendingSubtypeCategory && (
                        <p className="text-[10px] text-zinc-500">
                          Pick one or more subcategories for{' '}
                          {typeById.get(pendingSubtypeCategory)?.label}.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
