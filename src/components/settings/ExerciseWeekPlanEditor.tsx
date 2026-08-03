import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ToggleRow } from '@/components/settings/SettingsControls'
import { useSettings } from '@/context/SettingsContext'
import { useAuth } from '@/hooks/useData'
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
import { getActiveGoalByMetricKey, hasTarget } from '@/lib/goals'
import { localStore } from '@/lib/localStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  formatWorkoutPlanLabel,
  getWorkoutTypes,
  isTimedWorkoutUnit,
  workoutMetricKey,
  WORKOUT_TYPES_CHANGED,
} from '@/lib/workoutTypes'
import { cn, formatDuration } from '@/lib/utils'
import type { Goal } from '@/types'

interface ExerciseWeekPlanEditorProps {
  onSaved?: () => void
}

export function ExerciseWeekPlanEditor({ onSaved }: ExerciseWeekPlanEditorProps) {
  const { settings } = useSettings()
  const { userId } = useAuth()
  const includeTime = settings.exerciseWeekPlanIncludeTime
  const [template, setTemplate] = useState(() => getExerciseWeekTemplate())
  const [workoutTypes, setWorkoutTypes] = useState(() => getWorkoutTypes())
  const [goals, setGoals] = useState<Goal[]>(() => localStore.getGoals())
  const [openDay, setOpenDay] = useState<WeekdayIndex | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null)
  const [draftTime, setDraftTime] = useState('07:00')
  const [draftDuration, setDraftDuration] = useState('')
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

  useEffect(() => {
    let cancelled = false
    const loadGoals = async () => {
      if (isSupabaseConfigured && userId) {
        const { fetchGoals } = await import('@/lib/supabase')
        const next = await fetchGoals(userId)
        if (!cancelled) setGoals(next)
      } else {
        setGoals(localStore.getGoals())
      }
    }
    void loadGoals()
    return () => {
      cancelled = true
    }
  }, [userId])

  const weekdays = useMemo(
    () => orderedWeekdays(settings.weekStartsOn),
    [settings.weekStartsOn],
  )

  const typeById = useMemo(
    () => new Map(workoutTypes.map((type) => [type.id, type])),
    [workoutTypes],
  )

  const weeklyTargetByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const type of workoutTypes) {
      const goal = getActiveGoalByMetricKey(goals, workoutMetricKey(type.id))
      if (!goal || !hasTarget(goal)) continue
      const target = Math.round(goal.target_value ?? 0)
      if (target > 0) map.set(type.id, target)
    }
    return map
  }, [goals, workoutTypes])

  const totals = useMemo(() => {
    const planned = exerciseWeekTotalsByCategory(template.slots)
    const plannedByCategory = new Map(planned.map((row) => [row.category, row]))
    const categories = new Set([
      ...plannedByCategory.keys(),
      ...weeklyTargetByCategory.keys(),
    ])

    return [...categories]
      .map((category) => {
        const plannedRow = plannedByCategory.get(category)
        const minutes = plannedRow?.minutes ?? 0
        const count = plannedRow?.count ?? 0
        const target = weeklyTargetByCategory.get(category) ?? null
        const label =
          plannedRow?.label ?? typeById.get(category)?.label ?? category
        const percent =
          target != null && target > 0 ? Math.min(100, (minutes / target) * 100) : null
        return { category, label, minutes, count, target, percent }
      })
      .filter((row) => row.minutes > 0 || (row.target != null && row.target > 0))
      .sort(
        (a, b) =>
          b.minutes - a.minutes ||
          (b.target ?? 0) - (a.target ?? 0) ||
          a.label.localeCompare(b.label),
      )
  }, [template.slots, weeklyTargetByCategory, typeById])

  const commit = (next: ExerciseWeekTemplate) => {
    const saved = saveExerciseWeekTemplate(next)
    setTemplate(saved)
    onSaved?.()
  }

  const clearDraftSelection = () => {
    setSelectedCategoryId(null)
    setSelectedSubtype(null)
  }

  const selectedType = selectedCategoryId ? typeById.get(selectedCategoryId) : undefined
  const selectedSubtypes = selectedType?.subtypes ?? []
  const needsSubtype = selectedSubtypes.length > 0
  const draftDurationMinutes = Math.max(0, parseInt(draftDuration, 10) || 0)

  const selectCategory = (categoryId: string) => {
    if (selectedCategoryId === categoryId) {
      clearDraftSelection()
      return
    }
    setSelectedCategoryId(categoryId)
    setSelectedSubtype(null)
  }

  const selectSubtype = (subtype: string) => {
    setSelectedSubtype((prev) => (prev === subtype ? null : subtype))
  }

  const openDayEditor = (day: WeekdayIndex) => {
    setOpenDay((current) => (current === day ? null : day))
    clearDraftSelection()
    setDraftDuration('')
    setDraftAmount('3')
    setDraftTime('07:00')
  }

  const addSelectedToDay = (day: WeekdayIndex) => {
    if (!selectedCategoryId || !selectedType) return
    if (needsSubtype && !selectedSubtype) return
    if (draftDurationMinutes <= 0) return

    const amount = Math.max(0, Number(draftAmount) || 0)
    const start_time = includeTime ? draftTime || null : null
    const timed = isTimedWorkoutUnit(selectedType.unit)

    commit({
      ...template,
      slots: [
        ...template.slots,
        createExerciseWeekSlot({
          weekday: day,
          category: selectedCategoryId,
          subtype: selectedSubtype,
          start_time,
          duration_minutes: draftDurationMinutes,
          amount: timed ? draftDurationMinutes : amount > 0 ? amount : null,
        }),
      ],
    })
    // Keep the day open so you can add another session.
    setOpenDay(day)
    clearDraftSelection()
    setDraftDuration('')
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

  const canAdd =
    Boolean(selectedCategoryId) &&
    (!needsSubtype || Boolean(selectedSubtype)) &&
    draftDurationMinutes > 0

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
          <ul className="space-y-2">
            {totals.map((row) => {
              const hasTargetRow = row.target != null && row.target > 0
              const complete = hasTargetRow && row.minutes >= row.target!
              return (
                <li key={row.category} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-zinc-200">
                      {row.label}
                      {row.count > 0 ? (
                        <span className="ml-1.5 text-[11px] text-zinc-500">
                          · {row.count} session{row.count === 1 ? '' : 's'}
                        </span>
                      ) : hasTargetRow ? (
                        <span className="ml-1.5 text-[11px] text-zinc-600">· not planned</span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 font-semibold tabular-nums',
                        complete ? 'text-[var(--accent-300)]' : 'text-zinc-100',
                      )}
                    >
                      {hasTargetRow ? (
                        <>
                          {formatDuration(row.minutes)}
                          <span className="font-medium text-zinc-500">
                            {' '}
                            / {formatDuration(row.target!)}
                          </span>
                        </>
                      ) : (
                        formatDuration(row.minutes)
                      )}
                    </span>
                  </div>
                  {hasTargetRow && (
                    <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-300',
                          complete ? 'bg-[var(--accent-400)]' : 'bg-[var(--accent-500)]/70',
                        )}
                        style={{ width: `${row.percent ?? 0}%` }}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-2 border-t border-zinc-800/80 pt-2 text-right text-xs text-zinc-400">
            Total{' '}
            <span className="font-semibold text-zinc-200">
              {formatDuration(totals.reduce((sum, row) => sum + row.minutes, 0))}
            </span>
            {totals.some((row) => row.target != null && row.target > 0) ? (
              <span className="text-zinc-600">
                {' '}
                /{' '}
                {formatDuration(
                  totals.reduce((sum, row) => sum + (row.target ?? 0), 0),
                )}{' '}
                target
              </span>
            ) : null}
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
                          Workout
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {workoutTypes.map((type) => {
                            const active = selectedCategoryId === type.id
                            return (
                              <button
                                key={type.id}
                                type="button"
                                onClick={() => selectCategory(type.id)}
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

                      {needsSubtype && selectedCategoryId && selectedType ? (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                            {selectedType.label} subcategory
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedSubtypes.map((subtype) => {
                              const active = selectedSubtype === subtype
                              return (
                                <button
                                  key={subtype}
                                  type="button"
                                  onClick={() => selectSubtype(subtype)}
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
                      ) : null}

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
                        {selectedType && !isTimedWorkoutUnit(selectedType.unit) && (
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
                          type="button"
                          size="sm"
                          disabled={!canAdd}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            addSelectedToDay(day)
                          }}
                        >
                          <Plus size={14} />
                          Add
                        </Button>
                      </div>

                      {selectedCategoryId && needsSubtype && !selectedSubtype ? (
                        <p className="text-[10px] text-zinc-500">
                          Pick a subcategory for {selectedType?.label}.
                        </p>
                      ) : null}
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
