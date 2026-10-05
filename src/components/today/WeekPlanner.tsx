import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import { useSettings } from '@/context/SettingsContext'
import {
  beginPlannedWorkoutDrag,
  endPlannedWorkoutDrag,
  EXERCISE_PLAN_CHANGED,
  getActivePlannedWorkoutDrag,
  getPlannedWorkouts,
  getPlannedWorkoutsForDates,
  placePlannedWorkoutOnSchedule,
  PLANNED_WORKOUT_DRAG_MIME,
  resolvePlanScheduleDuration,
  unlinkPlannedWorkoutByScheduleBlockId,
  updatePlannedWorkout,
  type PlannedWorkout,
} from '@/lib/exercisePlan'
import { applyExerciseWeekTemplateToDates } from '@/lib/exerciseWeekTemplate'
import {
  createScheduleBlock,
  fetchScheduleBlocksForDate,
  persistScheduleBlock,
  removeScheduleBlock,
  setScheduleBlockColor,
} from '@/lib/scheduleBlock'
import { getScheduleColorPresets, isWorkoutScheduleColor } from '@/lib/scheduleColors'
import {
  formatWorkoutPlanLabel,
  getWorkoutTypeUnit,
  getWorkoutTypes,
  isTimedWorkoutUnit,
} from '@/lib/workoutTypes'
import { GREY_BLOCK_HEX, type ScheduleBlock } from '@/types'
import {
  cn,
  formatDate,
  formatDuration,
  generateId,
  getWeekDates,
  minutesToTime,
  parseLocalDate,
  parseTimeToMinutes,
} from '@/lib/utils'

const HOUR_HEIGHT = 56
const SNAP = 30
const GUTTER = '4.25rem'

interface WeekPlannerProps {
  userId: string
  anchorDate: string
  startHour: number
  endHour: number
  onClose: () => void
  onChanged?: () => void
}

type Gesture =
  | { kind: 'create'; date: string; anchor: number; current: number }
  | {
      kind: 'move'
      id: string
      date: string
      start: number
      end: number
      offset: number
      moved: boolean
    }
  | { kind: 'resize'; id: string; edge: 'start' | 'end'; date: string; start: number; end: number }

function snapMinutes(minutes: number) {
  return Math.round(minutes / SNAP) * SNAP
}

function hourLabel(hour: number, use24h: boolean) {
  if (use24h) return `${String(hour).padStart(2, '0')}:00`
  const h12 = hour % 12 || 12
  const meridiem = hour < 12 ? 'AM' : 'PM'
  return `${h12} ${meridiem}`
}

function weekTitle(dates: string[]) {
  const start = parseLocalDate(dates[0] ?? formatDate(new Date()))
  const end = parseLocalDate(dates[dates.length - 1] ?? formatDate(new Date()))
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }
  const startLabel = start.toLocaleDateString(undefined, { month: 'short' })
  const endLabel = end.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  return `${startLabel} – ${endLabel}`
}

function shiftWeek(date: string, weeks: number) {
  const next = parseLocalDate(date)
  next.setDate(next.getDate() + weeks * 7)
  return formatDate(next)
}

interface Span {
  date: string
  start: number
  end: number
}

function layoutDay(blocks: Array<{ block: ScheduleBlock; start: number; end: number }>) {
  const items = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end)
  const columnEnds: number[] = []
  const placed: Array<(typeof items)[number] & { col: number }> = []
  for (const item of items) {
    let col = columnEnds.findIndex((end) => end <= item.start)
    if (col < 0) {
      col = columnEnds.length
      columnEnds.push(item.end)
    } else {
      columnEnds[col] = item.end
    }
    placed.push({ ...item, col })
  }

  const result: Array<(typeof placed)[number] & { cols: number }> = []
  let group: typeof placed = []
  let groupEnd = -1
  const flush = () => {
    if (group.length === 0) return
    const cols = Math.max(...group.map((item) => item.col)) + 1
    for (const item of group) result.push({ ...item, cols })
    group = []
    groupEnd = -1
  }
  for (const item of placed) {
    if (group.length > 0 && item.start >= groupEnd) flush()
    group.push(item)
    groupEnd = Math.max(groupEnd, item.end)
  }
  flush()
  return result
}

export function WeekPlanner({
  userId,
  anchorDate,
  startHour,
  endHour,
  onClose,
  onChanged,
}: WeekPlannerProps) {
  const { settings, formatTime } = useSettings()
  const use24h = settings.timeFormat === '24h'
  const [weekAnchor, setWeekAnchor] = useState(anchorDate)
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [plans, setPlans] = useState<PlannedWorkout[]>([])
  const [loading, setLoading] = useState(true)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [planDrop, setPlanDrop] = useState<{ date: string; start: number; end: number } | null>(null)
  const [now, setNow] = useState(() => new Date())
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  gestureRef.current = gesture
  const beginGesture = (next: Gesture) => {
    gestureRef.current = next
    setGesture(next)
  }

  const weekDates = useMemo(
    () => getWeekDates(parseLocalDate(weekAnchor), settings.weekStartsOn),
    [weekAnchor, settings.weekStartsOn],
  )
  const windowStart = startHour * 60
  const windowEnd = endHour * 60
  const hours = Math.max(1, endHour - startHour)
  const today = formatDate(new Date())

  const reloadPlans = useCallback(() => {
    setPlans(getPlannedWorkoutsForDates(weekDates))
  }, [weekDates])

  const reloadBlocks = useCallback(async () => {
    const lists = await Promise.all(weekDates.map((date) => fetchScheduleBlocksForDate(userId, date)))
    setBlocks(lists.flat())
  }, [userId, weekDates])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      await applyExerciseWeekTemplateToDates({
        weekDates,
        userId,
        timelineEndHour: endHour,
      })
      if (cancelled) return
      await reloadBlocks()
      if (cancelled) return
      reloadPlans()
      setLoading(false)
      onChanged?.()
    })()
    return () => {
      cancelled = true
    }
  }, [weekDates, userId, endHour, reloadBlocks, reloadPlans])

  useEffect(() => {
    const onPlan = () => reloadPlans()
    window.addEventListener(EXERCISE_PLAN_CHANGED, onPlan)
    return () => window.removeEventListener(EXERCISE_PLAN_CHANGED, onPlan)
  }, [reloadPlans])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || loading) return
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const top = ((nowMin - windowStart) / 60) * HOUR_HEIGHT - HOUR_HEIGHT
    scroller.scrollTop = Math.max(0, top)
    // Scroll once when the week finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, weekAnchor])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea')) {
        if (event.key === 'Escape') target.blur()
        return
      }
      if (event.key === 'Escape') {
        if (selectedId) setSelectedId(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, selectedId])

  const columnAt = (clientX: number) => {
    for (const date of weekDates) {
      const el = columnRefs.current[date]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right) return { date, el }
    }
    return null
  }

  const rawMinutesAt = (clientY: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    return windowStart + ((clientY - rect.top) / HOUR_HEIGHT) * 60
  }

  const clampSpan = (start: number, end: number): { start: number; end: number } => {
    let nextStart = snapMinutes(start)
    let nextEnd = snapMinutes(end)
    if (nextEnd < nextStart) [nextStart, nextEnd] = [nextEnd, nextStart]
    if (nextEnd - nextStart < SNAP) nextEnd = nextStart + SNAP
    if (nextEnd > windowEnd) {
      nextEnd = windowEnd
      nextStart = Math.min(nextStart, Math.max(windowStart, nextEnd - SNAP))
    }
    if (nextStart < windowStart) {
      nextStart = windowStart
      nextEnd = Math.min(windowEnd, Math.max(nextStart + SNAP, nextEnd))
    }
    if (nextEnd <= nextStart) nextEnd = Math.min(windowEnd, nextStart + SNAP)
    return { start: nextStart, end: nextEnd }
  }

  const displayOf = useCallback(
    (block: ScheduleBlock): Span => {
      const active = gesture
      if (active && (active.kind === 'move' || active.kind === 'resize') && active.id === block.id) {
        return { date: active.date, start: active.start, end: active.end }
      }
      return {
        date: block.date,
        start: parseTimeToMinutes(block.start_time),
        end: parseTimeToMinutes(block.end_time),
      }
    },
    [gesture],
  )

  const saveBlock = useCallback(
    async (block: ScheduleBlock, span: Span) => {
      const start_time = minutesToTime(span.start)
      const end_time = minutesToTime(span.end)
      const saved = await persistScheduleBlock({
        ...block,
        date: span.date,
        start_time,
        end_time,
      })
      const plan = getPlannedWorkouts().find((item) => item.schedule_block_id === block.id)
      if (plan) {
        const unit = getWorkoutTypeUnit(plan.category)
        const duration = span.end - span.start
        updatePlannedWorkout(plan.id, {
          date: span.date,
          start_time,
          duration_minutes: duration,
          amount: isTimedWorkoutUnit(unit) ? duration : plan.amount,
        })
        reloadPlans()
      }
      setBlocks((prev) => prev.map((entry) => (entry.id === saved.id ? saved : entry)))
      onChanged?.()
      return saved
    },
    [onChanged, reloadPlans],
  )

  const interactionRef = useRef({
    columnAt,
    rawMinutesAt,
    clampSpan,
    windowStart,
    windowEnd,
    userId,
    blocks,
    saveBlock,
    onChanged,
  })
  interactionRef.current = {
    columnAt,
    rawMinutesAt,
    clampSpan,
    windowStart,
    windowEnd,
    userId,
    blocks,
    saveBlock,
    onChanged,
  }

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const current = gestureRef.current
      if (!current) return
      const api = interactionRef.current
      const column = api.columnAt(event.clientX)
      if (!column) return
      const pointer = api.rawMinutesAt(event.clientY, column.el)

      const publish = (next: Gesture) => {
        gestureRef.current = next
        setGesture(next)
      }

      if (current.kind === 'create') {
        publish({ ...current, date: column.date, current: pointer })
        return
      }

      if (current.kind === 'move') {
        const duration = current.end - current.start
        let start = snapMinutes(pointer - current.offset)
        start = Math.max(api.windowStart, Math.min(api.windowEnd - duration, start))
        publish({
          ...current,
          date: column.date,
          start,
          end: start + duration,
          moved: true,
        })
        return
      }

      if (current.edge === 'end') {
        const end = Math.min(api.windowEnd, Math.max(current.start + SNAP, snapMinutes(pointer)))
        publish({ ...current, end })
      } else {
        const start = Math.max(api.windowStart, Math.min(current.end - SNAP, snapMinutes(pointer)))
        publish({ ...current, start })
      }
    }

    const onUp = () => {
      const current = gestureRef.current
      if (!current) return
      const api = interactionRef.current
      gestureRef.current = null
      setGesture(null)

      if (current.kind === 'create') {
        const span = api.clampSpan(current.anchor, current.current)
        if (span.end - span.start < SNAP) return
        const block = createScheduleBlock({
          id: generateId(),
          user_id: api.userId,
          date: current.date,
          start_time: minutesToTime(span.start),
          end_time: minutesToTime(span.end),
        })
        void persistScheduleBlock(block).then((saved) => {
          setBlocks((prev) => [...prev, saved])
          setSelectedId(saved.id)
          api.onChanged?.()
        })
        return
      }

      const block = api.blocks.find((entry) => entry.id === current.id)
      if (!block) return
      if (current.kind === 'move' && !current.moved) {
        setSelectedId(block.id)
        return
      }
      void api.saveBlock(block, { date: current.date, start: current.start, end: current.end })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const removeSelected = async (id: string) => {
    await removeScheduleBlock(id)
    unlinkPlannedWorkoutByScheduleBlockId(id)
    setBlocks((prev) => prev.filter((block) => block.id !== id))
    setSelectedId(null)
    reloadPlans()
    onChanged?.()
  }

  const recolor = async (block: ScheduleBlock, colorId: string) => {
    const next = setScheduleBlockColor(block, colorId)
    const saved = await persistScheduleBlock(next)
    if (isWorkoutScheduleColor(block.activity_type) && !isWorkoutScheduleColor(saved.activity_type)) {
      unlinkPlannedWorkoutByScheduleBlockId(saved.id)
      reloadPlans()
    }
    setBlocks((prev) => prev.map((entry) => (entry.id === saved.id ? saved : entry)))
    onChanged?.()
  }

  const rename = async (block: ScheduleBlock, title: string) => {
    const saved = await persistScheduleBlock({ ...block, title })
    setBlocks((prev) => prev.map((entry) => (entry.id === saved.id ? saved : entry)))
    onChanged?.()
  }

  const dropPlan = async (planId: string, date: string, start: number) => {
    await placePlannedWorkoutOnSchedule({
      planId,
      startMinutes: start,
      userId,
      timelineEndHour: endHour,
      date,
    })
    await reloadBlocks()
    reloadPlans()
    onChanged?.()
  }

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const showNow = weekDates.includes(today) && nowMin >= windowStart && nowMin <= windowEnd
  const nowTop = ((nowMin - windowStart) / 60) * HOUR_HEIGHT
  const todayIndex = weekDates.indexOf(today)
  const selected = blocks.find((block) => block.id === selectedId) ?? null
  const colors = getScheduleColorPresets()
  const types = getWorkoutTypes()

  const plansByDate = new Map<string, PlannedWorkout[]>()
  for (const date of weekDates) plansByDate.set(date, [])
  for (const plan of plans) {
    const list = plansByDate.get(plan.date)
    if (list) list.push(plan)
  }

  const createPreview =
    gesture?.kind === 'create'
      ? { date: gesture.date, ...clampSpan(gesture.anchor, gesture.current) }
      : null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Week planner"
      className="fixed inset-0 z-[300] flex flex-col bg-[#09090b] text-zinc-100"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Previous week"
            onClick={() => setWeekAnchor((date) => shiftWeek(date, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Next week"
            onClick={() => setWeekAnchor((date) => shiftWeek(date, 1))}
          >
            <ChevronRight size={18} />
          </button>
          <h2 className="truncate text-lg font-semibold">{weekTitle(weekDates)}</h2>
          {selected && (
            <div className="ml-3 hidden items-center gap-1.5 sm:flex">
              <button
                type="button"
                aria-label="Grey"
                className={cn(
                  'h-4 w-4 rounded-full ring-1 ring-white/20',
                  selected.activity_type === 'grey' && 'ring-2 ring-white',
                )}
                style={{ backgroundColor: GREY_BLOCK_HEX }}
                onClick={() => void recolor(selected, 'grey')}
              />
              {colors.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  aria-label={color.label}
                  title={color.label}
                  className={cn(
                    'h-4 w-4 rounded-full',
                    selected.activity_type === color.id && 'ring-2 ring-white',
                  )}
                  style={{ backgroundColor: color.hex }}
                  onClick={() => void recolor(selected, color.id)}
                />
              ))}
              <button
                type="button"
                className="ml-1 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-red-300"
                aria-label="Delete block"
                onClick={() => void removeSelected(selected.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="Close week planner"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex max-h-40 w-full shrink-0 flex-col overflow-hidden border-b border-zinc-800 md:max-h-none md:w-56 md:border-b-0 md:border-r">
          <p className="px-3 py-3 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Exercise plan
          </p>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-4">
            {weekDates.map((date) => {
              const items = plansByDate.get(date) ?? []
              if (items.length === 0) return null
              const label = parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'short' })
              return (
                <div key={date}>
                  <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                    {label}
                  </p>
                  <ul className="space-y-1">
                    {items.map((item) => {
                      const type = types.find((entry) => entry.id === item.category)
                      const title = formatWorkoutPlanLabel(item.category, item.subtype)
                      const duration = resolvePlanScheduleDuration(item)
                      return (
                        <li
                          key={item.id}
                          draggable={!item.completed}
                          onDragStart={(event) => {
                            if (item.completed) {
                              event.preventDefault()
                              return
                            }
                            beginPlannedWorkoutDrag(item)
                            event.dataTransfer.setData(PLANNED_WORKOUT_DRAG_MIME, item.id)
                            event.dataTransfer.effectAllowed = 'copyMove'
                          }}
                          onDragEnd={() => {
                            endPlannedWorkoutDrag()
                            setPlanDrop(null)
                          }}
                          className={cn(
                            'rounded-md px-2 py-1.5 text-xs',
                            item.completed
                              ? 'bg-zinc-900/50 text-zinc-500'
                              : 'cursor-grab bg-zinc-900 text-zinc-200 active:cursor-grabbing',
                          )}
                          title={item.completed ? 'Already logged' : 'Drag onto the week'}
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: type?.color || 'var(--accent-500)' }}
                            />
                            <span className="min-w-0 truncate font-medium">{title}</span>
                          </span>
                          <span className="mt-0.5 block pl-3 text-[10px] text-zinc-500">
                            {formatDuration(duration)}
                            {item.schedule_block_id ? ' · on the week' : ''}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
            {plans.length === 0 && (
              <p className="px-1 text-xs text-zinc-600">Nothing planned this week.</p>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="grid shrink-0 border-b border-zinc-800"
            style={{ gridTemplateColumns: `${GUTTER} repeat(7, minmax(0, 1fr))` }}
          >
            <div />
            {weekDates.map((date) => {
              const day = parseLocalDate(date)
              const isToday = date === today
              return (
                <div key={date} className="px-1 py-2 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    {day.toLocaleDateString(undefined, { weekday: 'short' })}
                  </p>
                  <p
                    className={cn(
                      'mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                      isToday ? 'bg-[var(--accent-500)] text-zinc-950' : 'text-zinc-200',
                    )}
                  >
                    {day.getDate()}
                  </p>
                </div>
              )
            })}
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-sm text-zinc-500">Loading week…</p>
            ) : (
              <div className="relative" style={{ height: hours * HOUR_HEIGHT }}>
                <div
                  className="grid h-full"
                  style={{ gridTemplateColumns: `${GUTTER} repeat(7, minmax(0, 1fr))` }}
                >
                  <div className="relative border-r border-zinc-800/80">
                    {Array.from({ length: hours }, (_, index) => (
                      <div
                        key={startHour + index}
                        className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-zinc-600"
                        style={{ top: index * HOUR_HEIGHT }}
                      >
                        {index === 0 ? '' : hourLabel(startHour + index, use24h)}
                      </div>
                    ))}
                  </div>

                  {weekDates.map((date) => {
                    const dayBlocks = blocks
                      .map((block) => ({ block, ...displayOf(block) }))
                      .filter(
                        (item) =>
                          item.date === date && item.end > windowStart && item.start < windowEnd,
                      )
                    const laidOut = layoutDay(
                      dayBlocks.map((item) => ({
                        block: item.block,
                        start: Math.max(item.start, windowStart),
                        end: Math.min(item.end, windowEnd),
                      })),
                    )
                    return (
                      <div
                        key={date}
                        ref={(node) => {
                          columnRefs.current[date] = node
                        }}
                        className="relative border-l border-zinc-800/70"
                        onMouseDown={(event) => {
                          if (event.target !== event.currentTarget) return
                          const start = snapMinutes(rawMinutesAt(event.clientY, event.currentTarget))
                          const clamped = Math.max(windowStart, Math.min(windowEnd - SNAP, start))
                          setSelectedId(null)
                          beginGesture({ kind: 'create', date, anchor: clamped, current: clamped })
                        }}
                        onDragOverCapture={(event) => {
                          if (![...event.dataTransfer.types].includes(PLANNED_WORKOUT_DRAG_MIME)) return
                          event.preventDefault()
                          const start = snapMinutes(rawMinutesAt(event.clientY, event.currentTarget))
                          const duration = getActivePlannedWorkoutDrag()?.durationMinutes ?? 45
                          const clamped = Math.max(windowStart, Math.min(windowEnd - SNAP, start))
                          setPlanDrop({
                            date,
                            start: clamped,
                            end: Math.min(windowEnd, clamped + duration),
                          })
                        }}
                        onDragLeave={(event) => {
                          if (event.currentTarget.contains(event.relatedTarget as Node)) return
                          setPlanDrop((prev) => (prev?.date === date ? null : prev))
                        }}
                        onDropCapture={(event) => {
                          if (![...event.dataTransfer.types].includes(PLANNED_WORKOUT_DRAG_MIME)) return
                          event.preventDefault()
                          const planId =
                            event.dataTransfer.getData(PLANNED_WORKOUT_DRAG_MIME) ||
                            getActivePlannedWorkoutDrag()?.id ||
                            ''
                          const start = planDrop?.date === date ? planDrop.start : snapMinutes(rawMinutesAt(event.clientY, event.currentTarget))
                          setPlanDrop(null)
                          if (planId) void dropPlan(planId, date, start)
                        }}
                      >
                        {Array.from({ length: hours }, (_, index) => (
                          <div
                            key={index}
                            className="pointer-events-none absolute inset-x-0 border-t border-zinc-800/80"
                            style={{ top: index * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                          >
                            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-zinc-800/50" />
                          </div>
                        ))}

                        {createPreview?.date === date && (
                          <div
                            className="pointer-events-none absolute z-[3] rounded-md border border-dashed border-[var(--accent-400)] bg-[var(--accent-500)]/20"
                            style={{
                              top: ((createPreview.start - windowStart) / 60) * HOUR_HEIGHT,
                              height: ((createPreview.end - createPreview.start) / 60) * HOUR_HEIGHT,
                              left: 2,
                              right: 2,
                            }}
                          />
                        )}

                        {planDrop?.date === date && (
                          <div
                            className="pointer-events-none absolute z-[3] rounded-md border border-dashed border-rose-400/80 bg-rose-500/20"
                            style={{
                              top: ((planDrop.start - windowStart) / 60) * HOUR_HEIGHT,
                              height: Math.max(
                                ((planDrop.end - planDrop.start) / 60) * HOUR_HEIGHT,
                                18,
                              ),
                              left: 2,
                              right: 2,
                            }}
                          />
                        )}

                        {laidOut.map((item) => {
                          const { block, start, end, col, cols } = item
                          const top = ((start - windowStart) / 60) * HOUR_HEIGHT
                          const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, 18)
                          const selectedBlock = selectedId === block.id
                          const startDate = new Date()
                          startDate.setHours(Math.floor(start / 60), start % 60, 0, 0)
                          const endDate = new Date()
                          endDate.setHours(Math.floor(end / 60), end % 60, 0, 0)
                          return (
                            <div
                              key={block.id}
                              className={cn(
                                'absolute z-[2] overflow-hidden rounded-md px-1.5 py-1 text-left shadow-md',
                                selectedBlock && 'ring-2 ring-white/80',
                                gesture?.kind === 'move' && gesture.id === block.id
                                  ? 'cursor-grabbing'
                                  : 'cursor-grab',
                              )}
                              style={{
                                top,
                                height,
                                left: `calc(${(col / cols) * 100}% + 2px)`,
                                width: `calc(${100 / cols}% - 4px)`,
                                backgroundColor: block.color || GREY_BLOCK_HEX,
                                color: '#18181b',
                              }}
                              onMouseDown={(event) => {
                                const target = event.target as HTMLElement
                                if (target.closest('input, button, [data-resize-handle]')) return
                                event.stopPropagation()
                                const column = columnRefs.current[date]
                                if (!column) return
                                const pointer = rawMinutesAt(event.clientY, column)
                                const span = displayOf(block)
                                beginGesture({
                                  kind: 'move',
                                  id: block.id,
                                  date: block.date,
                                  start: span.start,
                                  end: span.end,
                                  offset: pointer - span.start,
                                  moved: false,
                                })
                              }}
                            >
                              {selectedBlock ? (
                                <input
                                  value={block.title}
                                  aria-label="Block title"
                                  className="w-full bg-transparent text-[11px] font-semibold leading-tight text-zinc-950 outline-none"
                                  onMouseDown={(event) => event.stopPropagation()}
                                  onChange={(event) => {
                                    const title = event.target.value
                                    setBlocks((prev) =>
                                      prev.map((entry) =>
                                        entry.id === block.id ? { ...entry, title } : entry,
                                      ),
                                    )
                                  }}
                                  onBlur={(event) => void rename(block, event.target.value)}
                                />
                              ) : (
                                <p className="truncate text-[11px] font-semibold leading-tight">
                                  {block.title}
                                </p>
                              )}
                              {height > 36 && (
                                <p className="truncate text-[10px] leading-tight opacity-80">
                                  {formatTime(startDate)} – {formatTime(endDate)}
                                </p>
                              )}
                              <div
                                data-resize-handle
                                className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                                onMouseDown={(event) => {
                                  event.stopPropagation()
                                  const span = displayOf(block)
                                  beginGesture({
                                    kind: 'resize',
                                    id: block.id,
                                    edge: 'end',
                                    date: span.date,
                                    start: span.start,
                                    end: span.end,
                                  })
                                }}
                              />
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>

                {showNow && (
                  <div
                    className="pointer-events-none absolute z-20"
                    style={{ top: nowTop, left: GUTTER, right: 0 }}
                  >
                    <div className="absolute inset-x-0 h-px bg-rose-500" />
                    {todayIndex >= 0 && (
                      <div
                        className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500"
                        style={{ left: `calc((100% / 7) * ${todayIndex})` }}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
