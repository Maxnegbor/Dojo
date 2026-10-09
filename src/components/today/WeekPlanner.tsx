import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { DayNoteButton, DayNotesEditor } from '@/components/today/DayNotes'
import { getDayNoteItems } from '@/lib/dayNotes'
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
  isGreyBlock,
  persistScheduleBlock,
  removeScheduleBlock,
  replaceScheduleBlocksForDate,
  setScheduleBlockColor,
} from '@/lib/scheduleBlock'
import { removeScheduleBlockAlarm } from '@/lib/scheduleBlockAlarms'
import {
  getScheduleTemplates,
  scheduleBlocksFromTemplate,
  type ScheduleTemplate,
} from '@/lib/scheduleTemplates'
import { getScheduleColorPresets, isWorkoutScheduleColor } from '@/lib/scheduleColors'
import {
  formatWorkoutPlanLabel,
  getWorkoutTypeUnit,
  getWorkoutTypes,
  isTimedWorkoutUnit,
} from '@/lib/workoutTypes'
import { GREY_BLOCK_HEX, GREY_BLOCK_TITLE, type ScheduleBlock } from '@/types'
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

const MIN_HOUR_HEIGHT = 56
const BLOCK_MOVE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const RESIZE_HANDLE_MAX = 22
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
      /** Shift was held when the drag started, so this moves a copy. */
      copy: boolean
    }
  | { kind: 'resize'; id: string; edge: 'start' | 'end'; date: string; start: number; end: number }

function isUnsetBlockTitle(title: string) {
  const trimmed = title.trim()
  return trimmed.length === 0 || trimmed === GREY_BLOCK_TITLE || trimmed === 'New Block'
}

function minutesOnDay(minutes: number) {
  const date = new Date()
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return date
}

function weekBlockFill(block: ScheduleBlock) {
  if (isGreyBlock(block)) return 'rgb(42 42 48)'
  return `color-mix(in srgb, ${block.color} 24%, rgb(9 9 11))`
}

function resizeHandleHeight(blockHeight: number) {
  const leavesAGrip = Math.max(8, (blockHeight - 24) / 2)
  return Math.min(RESIZE_HANDLE_MAX, leavesAGrip)
}

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
  const [colorChosenIds, setColorChosenIds] = useState<Set<string>>(() => new Set())
  const [titleFocus, setTitleFocus] = useState<{ id: string; select: boolean } | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [blockMenu, setBlockMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [dayMenu, setDayMenu] = useState<{ date: string; x: number; y: number } | null>(null)
  const [notesDate, setNotesDate] = useState<string | null>(null)
  const [planDrop, setPlanDrop] = useState<{ date: string; start: number; end: number } | null>(null)
  const [planOpen, setPlanOpen] = useState(true)
  const [now, setNow] = useState(() => new Date())
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scheduleViewport, setScheduleViewport] = useState(0)
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
  const scheduleHeight = Math.max(hours * MIN_HOUR_HEIGHT, scheduleViewport)
  const hourHeight = scheduleHeight / hours
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

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const measure = () => {
      const next = scroller.clientHeight
      setScheduleViewport((current) => (Math.abs(current - next) < 0.5 ? current : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || loading) return
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const top = ((nowMin - windowStart) / 60) * hourHeight - hourHeight
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
        if (blockMenu || dayMenu) {
          setBlockMenu(null)
          setDayMenu(null)
        } else if (selectedId) setSelectedId(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, selectedId, blockMenu, dayMenu])

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
    return windowStart + ((clientY - rect.top) / hourHeight) * 60
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
      if (
        active &&
        (active.kind === 'resize' || (active.kind === 'move' && !active.copy)) &&
        active.id === block.id
      ) {
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
      window.getSelection()?.removeAllRanges()
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
      if (current.kind === 'move' && current.copy) {
        const copy = {
          ...block,
          id: generateId(),
          user_id: api.userId,
          date: current.date,
          start_time: minutesToTime(current.start),
          end_time: minutesToTime(current.end),
          created_at: new Date().toISOString(),
        }
        void persistScheduleBlock(copy).then((saved) => {
          setBlocks((prev) => [...prev, saved])
          setSelectedId(saved.id)
          api.onChanged?.()
        })
        return
      }
      void api.saveBlock(block, { date: current.date, start: current.start, end: current.end })
    }

    const blockSelect = (event: Event) => {
      if (gestureRef.current) event.preventDefault()
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.addEventListener('selectstart', blockSelect)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.removeEventListener('selectstart', blockSelect)
    }
  }, [])

  useEffect(() => {
    if (!gesture) return
    const { userSelect, cursor } = document.body.style
    document.body.style.userSelect = 'none'
    document.body.style.setProperty('-webkit-user-select', 'none')
    if (gesture.kind === 'move') document.body.style.cursor = 'grabbing'
    window.getSelection()?.removeAllRanges()
    return () => {
      document.body.style.userSelect = userSelect
      document.body.style.cursor = cursor
      document.body.style.removeProperty('-webkit-user-select')
      window.getSelection()?.removeAllRanges()
    }
  }, [Boolean(gesture)])

  const removeSelected = async (id: string) => {
    await removeScheduleBlock(id)
    unlinkPlannedWorkoutByScheduleBlockId(id)
    setBlocks((prev) => prev.filter((block) => block.id !== id))
    setSelectedId(null)
    setBlockMenu(null)
    reloadPlans()
    onChanged?.()
  }

  const copyBlockToOtherDays = async (source: ScheduleBlock) => {
    const copies = weekDates
      .filter((date) => date !== source.date)
      .map((date) => ({
        ...source,
        id: generateId(),
        user_id: userId,
        date,
        created_at: new Date().toISOString(),
      }))
    const saved: ScheduleBlock[] = []
    for (const copy of copies) saved.push(await persistScheduleBlock(copy))
    if (saved.length > 0) {
      setBlocks((prev) => [...prev, ...saved])
      onChanged?.()
    }
    setBlockMenu(null)
  }

  const clearDay = async (date: string) => {
    const existing = blocks.filter((block) => block.date === date)
    for (const block of existing) {
      await removeScheduleBlock(block.id)
      unlinkPlannedWorkoutByScheduleBlockId(block.id)
      removeScheduleBlockAlarm(block.id)
    }
    setBlocks((prev) => prev.filter((block) => block.date !== date))
    setSelectedId((current) => (current && existing.some((block) => block.id === current) ? null : current))
    setDayMenu(null)
    reloadPlans()
    onChanged?.()
  }

  const applyTemplateToDay = async (date: string, template: ScheduleTemplate) => {
    if (template.blocks.length === 0) {
      setDayMenu(null)
      return
    }
    const existing = blocks.filter((block) => block.date === date)
    const next = scheduleBlocksFromTemplate(template, date, userId)
    const saved = await replaceScheduleBlocksForDate(existing, next, {
      preservePlanLinkedForDate: date,
    })
    const kept = new Set(saved.map((block) => block.id))
    for (const block of existing) {
      if (kept.has(block.id)) continue
      removeScheduleBlockAlarm(block.id)
    }
    setBlocks((prev) => [...prev.filter((block) => block.date !== date), ...saved])
    setSelectedId((current) => (current && kept.has(current) ? current : null))
    setDayMenu(null)
    reloadPlans()
    onChanged?.()
  }

  useEffect(() => {
    if (!blockMenu && !dayMenu) return
    const onPointer = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-block-menu]')) return
      setBlockMenu(null)
      setDayMenu(null)
    }
    window.addEventListener('mousedown', onPointer, true)
    return () => window.removeEventListener('mousedown', onPointer, true)
  }, [blockMenu, dayMenu])

  const chooseColor = (block: ScheduleBlock, colorId: string, typedTitle?: string) => {
    setColorChosenIds((prev) => {
      const next = new Set(prev)
      next.add(block.id)
      return next
    })
    setSelectedId(block.id)
    const colored = setScheduleBlockColor(block, colorId)
    const next =
      colorId === 'grey' ? { ...colored, title: typedTitle ?? '' } : colored
    setBlocks((prev) => prev.map((entry) => (entry.id === block.id ? next : entry)))
    setTitleFocus({ id: block.id, select: colorId !== 'grey' && typedTitle == null })
    void persistScheduleBlock(next).then((saved) => {
      if (isWorkoutScheduleColor(block.activity_type) && !isWorkoutScheduleColor(saved.activity_type)) {
        unlinkPlannedWorkoutByScheduleBlockId(saved.id)
        reloadPlans()
      }
      setBlocks((prev) =>
        prev.map((entry) =>
          entry.id === saved.id ? { ...saved, title: colorId === 'grey' ? entry.title : saved.title } : entry,
        ),
      )
      onChanged?.()
    })
  }

  useEffect(() => {
    const awaiting = blocks.filter(
      (block) =>
        isGreyBlock(block) && isUnsetBlockTitle(block.title) && !colorChosenIds.has(block.id),
    )
    if (awaiting.length === 0 || blockMenu || dayMenu) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || gestureRef.current) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.length !== 1) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return
      }
      const newest = [...awaiting].sort((a, b) => a.created_at.localeCompare(b.created_at))
      const block = awaiting.find((entry) => entry.id === selectedId) ?? newest[newest.length - 1]
      if (!block) return
      event.preventDefault()
      chooseColor(block, 'grey', event.key)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [blocks, blockMenu, colorChosenIds, dayMenu, selectedId])

  useLayoutEffect(() => {
    if (!titleFocus) return
    const input = titleInputRef.current
    if (!input) return
    input.focus()
    if (titleFocus.select && input.value) input.select()
    else input.setSelectionRange(input.value.length, input.value.length)
    setTitleFocus(null)
  }, [titleFocus, blocks])

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
  const nowTop = ((nowMin - windowStart) / 60) * hourHeight
  const todayIndex = weekDates.indexOf(today)
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
  const copyPreview = (() => {
    if (gesture?.kind !== 'move' || !gesture.copy || !gesture.moved) return null
    const source = blocks.find((block) => block.id === gesture.id)
    if (!source) return null
    return { block: source, date: gesture.date, start: gesture.start, end: gesture.end }
  })()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Week planner"
      className="fixed inset-0 z-50 flex flex-col bg-[#09090b] text-zinc-100 lg:left-14 max-lg:bottom-[calc(4.25rem+env(safe-area-inset-bottom))]"
    >
      <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-zinc-800 px-4">
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
        </div>
        <div className="h-8 w-[9.5rem]" aria-hidden />
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-lg p-2 text-zinc-400 transition-colors duration-200 ease-out hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Close week planner"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          className={cn(
            'flex shrink-0 flex-col overflow-hidden border-zinc-800 transition-[width,max-height] duration-300 ease-out',
            planOpen
              ? 'max-h-40 w-full border-b md:max-h-none md:w-56 md:border-b-0 md:border-r'
              : 'max-h-11 w-full border-b md:max-h-none md:w-10 md:border-b-0 md:border-r',
          )}
        >
          <div className={cn('flex shrink-0 items-center', planOpen ? 'gap-1 px-2 py-2' : 'justify-center px-1 py-2')}>
            <p
              className={cn(
                'min-w-0 flex-1 truncate px-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500',
                !planOpen && 'sr-only',
              )}
            >
              Exercise plan
            </p>
            <button
              type="button"
              aria-expanded={planOpen}
              aria-label={planOpen ? 'Collapse exercise plan' : 'Expand exercise plan'}
              onClick={() => setPlanOpen((open) => !open)}
              className="rounded-lg p-1.5 text-zinc-400 transition-colors duration-200 ease-out hover:bg-zinc-800 hover:text-zinc-100"
            >
              {planOpen ? (
                <ChevronLeft size={16} className="max-md:-rotate-90" />
              ) : (
                <ChevronRight size={16} className="max-md:rotate-90" />
              )}
            </button>
          </div>
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
                            {item.schedule_block_id && (
                              <Check
                                size={13}
                                strokeWidth={2.75}
                                className="ml-auto shrink-0 text-emerald-400"
                                aria-label="Placed on the week"
                              />
                            )}
                          </span>
                          <span className="mt-0.5 block pl-3 text-[10px] text-zinc-500">
                            {formatDuration(duration)}
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
                <div
                  key={date}
                  className="relative px-1 py-2 text-center"
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setBlockMenu(null)
                    setDayMenu({ date, x: event.clientX, y: event.clientY })
                  }}
                >
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
                  <div className="absolute right-0.5 top-1.5">
                    <DayNoteButton date={date} onEdit={() => setNotesDate(date)} />
                  </div>
                </div>
              )
            })}
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-sm text-zinc-500">Loading week…</p>
            ) : (
              <div className="relative" style={{ height: hours * hourHeight }}>
                <div
                  className="grid h-full"
                  style={{ gridTemplateColumns: `${GUTTER} repeat(7, minmax(0, 1fr))` }}
                >
                  <div className="relative border-r border-zinc-800/80">
                    {Array.from({ length: hours }, (_, index) => (
                      <div
                        key={startHour + index}
                        className={cn(
                          'absolute right-2 text-[10px] tabular-nums text-zinc-600',
                          index === 0 ? 'top-1' : '-translate-y-1/2',
                        )}
                        style={index === 0 ? undefined : { top: index * hourHeight }}
                      >
                        {hourLabel(startHour + index, use24h)}
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
                          if (event.button !== 0) return
                          if (event.target !== event.currentTarget) return
                          event.preventDefault()
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
                            style={{ top: index * hourHeight, height: hourHeight }}
                          >
                            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-zinc-800/50" />
                          </div>
                        ))}

                        {createPreview?.date === date && (
                          <div
                            className="pointer-events-none absolute z-[3] flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--accent-400)]/60 bg-[var(--accent-500)]/10 transition-[top,height] duration-150 ease-out"
                            style={{
                              top: ((createPreview.start - windowStart) / 60) * hourHeight,
                              height: ((createPreview.end - createPreview.start) / 60) * hourHeight,
                              left: 2,
                              right: 2,
                            }}
                          >
                            {createPreview.end - createPreview.start >= SNAP && (
                              <div className="flex flex-col items-center gap-0.5 px-1 text-center">
                                <span className="text-[11px] font-semibold tabular-nums text-[var(--accent-300)]">
                                  {formatDuration(createPreview.end - createPreview.start)}
                                </span>
                                <span className="text-[10px] tabular-nums text-[var(--accent-300)]/75">
                                  {formatTime(minutesOnDay(createPreview.start))}
                                  {' – '}
                                  {formatTime(minutesOnDay(createPreview.end))}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {copyPreview?.date === date && (
                          <div
                            className={cn(
                              'pointer-events-none absolute z-[5] rounded-lg border px-1.5 text-left shadow-lg shadow-black/40',
                              copyPreview.end - copyPreview.start <= SNAP
                                ? 'flex flex-col justify-center'
                                : 'py-1',
                            )}
                            style={{
                              top: ((copyPreview.start - windowStart) / 60) * hourHeight,
                              height: Math.max(
                                ((copyPreview.end - copyPreview.start) / 60) * hourHeight,
                                18,
                              ),
                              left: 2,
                              right: 2,
                              borderColor: weekBlockFill(copyPreview.block),
                              backgroundColor: weekBlockFill(copyPreview.block),
                              transition: `top 150ms ${BLOCK_MOVE_EASE}, height 150ms ${BLOCK_MOVE_EASE}`,
                            }}
                          >
                            <p
                              className={cn(
                                'truncate text-[11px] font-semibold text-zinc-100',
                                copyPreview.end - copyPreview.start <= SNAP ? 'leading-none' : 'leading-tight',
                              )}
                            >
                              {copyPreview.block.title}
                            </p>
                            {((copyPreview.end - copyPreview.start) / 60) * hourHeight > 36 && (
                              <p className="truncate text-[10px] leading-tight text-zinc-400">
                                {formatTime(minutesOnDay(copyPreview.start))} –{' '}
                                {formatTime(minutesOnDay(copyPreview.end))}
                              </p>
                            )}
                          </div>
                        )}

                        {planDrop?.date === date && (
                          <div
                            className="pointer-events-none absolute z-[3] rounded-lg border-2 border-dashed border-red-400/70 bg-red-500/15 transition-[top,height] duration-150 ease-out"
                            style={{
                              top: ((planDrop.start - windowStart) / 60) * hourHeight,
                              height: Math.max(
                                ((planDrop.end - planDrop.start) / 60) * hourHeight,
                                18,
                              ),
                              left: 2,
                              right: 2,
                            }}
                          />
                        )}

                        {laidOut.map((item) => {
                          const { block, start, end, col, cols } = item
                          const touchGap = 4
                          const touchesNext = laidOut.some(
                            (other) => other.block.id !== block.id && other.start === end,
                          )
                          const touchesPrev = laidOut.some(
                            (other) => other.block.id !== block.id && other.end === start,
                          )
                          const gapBefore = touchesPrev ? touchGap / 2 : 0
                          const gapAfter = touchesNext ? touchGap / 2 : 0
                          const top = ((start - windowStart) / 60) * hourHeight + gapBefore
                          const height = Math.max(
                            ((end - start) / 60) * hourHeight - gapBefore - gapAfter,
                            18,
                          )
                          const edge = resizeHandleHeight(height)
                          const isHalfHour = end - start <= SNAP
                          const selectedBlock = selectedId === block.id
                          const awaitingColor =
                            isGreyBlock(block) &&
                            isUnsetBlockTitle(block.title) &&
                            !colorChosenIds.has(block.id)
                          const blockFill = weekBlockFill(block)
                          const edgeTone = `color-mix(in srgb, ${block.color || GREY_BLOCK_HEX} 55%, white)`
                          const resizeEdge =
                            gesture?.kind === 'resize' && gesture.id === block.id ? gesture.edge : null
                          const isLiveGesture =
                            ((gesture?.kind === 'move' && !gesture.copy) || gesture?.kind === 'resize') &&
                            gesture.id === block.id
                          return (
                            <div
                              key={block.id}
                              className={cn(
                                'absolute rounded-lg border px-1.5 text-left shadow-md',
                                isHalfHour ? 'flex flex-col justify-center' : 'py-1',
                                selectedBlock
                                  ? 'z-[4] overflow-visible'
                                  : isLiveGesture
                                    ? 'z-[3] overflow-hidden'
                                    : 'z-[2] overflow-hidden',
                                selectedBlock && 'ring-2 ring-white/80',
                                isLiveGesture && 'shadow-lg shadow-black/40',
                                gesture?.kind === 'move' && !gesture.copy && gesture.id === block.id
                                  ? 'cursor-grabbing'
                                  : 'cursor-grab',
                              )}
                              style={{
                                top,
                                height,
                                left: `calc(${(col / cols) * 100}% + 2px)`,
                                width: `calc(${100 / cols}% - 4px)`,
                                paddingTop: isHalfHour ? 0 : edge,
                                borderColor: blockFill,
                                backgroundColor: blockFill,
                                transition: `top 150ms ${BLOCK_MOVE_EASE}, height 150ms ${BLOCK_MOVE_EASE}, left 150ms ${BLOCK_MOVE_EASE}, width 150ms ${BLOCK_MOVE_EASE}, box-shadow 150ms ease, border-color 150ms ease, background-color 150ms ease`,
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                setBlockMenu({ id: block.id, x: event.clientX, y: event.clientY })
                              }}
                              onMouseDown={(event) => {
                                if (event.button !== 0) return
                                const target = event.target as HTMLElement
                                if (target.closest('input, button, [data-resize-handle]')) return
                                event.preventDefault()
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
                                  copy: event.shiftKey,
                                })
                              }}
                            >
                              {awaitingColor ? (
                                <div
                                  className="flex flex-wrap items-center gap-1"
                                  onMouseDown={(event) => event.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    aria-label="Grey"
                                    className="h-3.5 w-3.5 rounded-full ring-1 ring-black/30"
                                    style={{ backgroundColor: GREY_BLOCK_HEX }}
                                    onClick={() => chooseColor(block, 'grey')}
                                  />
                                  {colors.map((color) => (
                                    <button
                                      key={color.id}
                                      type="button"
                                      aria-label={color.label}
                                      title={color.label}
                                      className="h-3.5 w-3.5 rounded-full"
                                      style={{ backgroundColor: color.hex }}
                                      onClick={() => chooseColor(block, color.id)}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <>
                                  <div
                                    className={cn(
                                      'relative text-[11px] font-semibold text-zinc-100',
                                      isHalfHour ? 'leading-none' : 'leading-tight',
                                    )}
                                  >
                                    <p className={cn('truncate', selectedBlock && 'invisible')}>
                                      {block.title || '\u00a0'}
                                    </p>
                                    {selectedBlock && (
                                      <input
                                        ref={titleInputRef}
                                        value={block.title}
                                        aria-label="Block title"
                                        placeholder=""
                                        className="absolute inset-0 m-0 box-border h-full w-full appearance-none border-0 bg-transparent p-0 font-[inherit] text-[length:inherit] leading-[inherit] text-inherit outline-none"
                                        onMouseDown={(event) => event.stopPropagation()}
                                        onKeyDown={(event) => {
                                          if (event.key !== 'Enter') return
                                          event.preventDefault()
                                          event.stopPropagation()
                                          event.currentTarget.blur()
                                          setSelectedId(null)
                                        }}
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
                                    )}
                                  </div>
                                  {height > 36 && (
                                    <p
                                      className={cn(
                                        'truncate text-[10px] text-zinc-400',
                                        isHalfHour ? 'leading-none' : 'leading-tight',
                                      )}
                                    >
                                      {formatTime(minutesOnDay(start))} – {formatTime(minutesOnDay(end))}
                                    </p>
                                  )}
                                </>
                              )}
                              <div
                                data-resize-handle
                                className="group/edge absolute inset-x-0 top-0 z-30 cursor-ns-resize"
                                style={{ height: edge }}
                                onMouseDown={(event) => {
                                  if (event.button !== 0) return
                                  event.preventDefault()
                                  event.stopPropagation()
                                  const span = displayOf(block)
                                  beginGesture({
                                    kind: 'resize',
                                    id: block.id,
                                    edge: 'start',
                                    date: span.date,
                                    start: span.start,
                                    end: span.end,
                                  })
                                }}
                              >
                                <div
                                  aria-hidden
                                  className={cn(
                                    'pointer-events-none absolute inset-x-0 top-0 rounded-t-lg transition-[height,opacity,background-color] duration-150',
                                    resizeEdge === 'start'
                                      ? 'h-[2.5px] opacity-100'
                                      : 'h-0 opacity-0 group-hover/edge:h-[2.5px] group-hover/edge:opacity-100',
                                  )}
                                  style={{ backgroundColor: edgeTone }}
                                />
                              </div>
                              <div
                                data-resize-handle
                                className="group/edge absolute inset-x-0 bottom-0 z-30 cursor-ns-resize"
                                style={{ height: edge }}
                                onMouseDown={(event) => {
                                  if (event.button !== 0) return
                                  event.preventDefault()
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
                              >
                                <div
                                  aria-hidden
                                  className={cn(
                                    'pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg transition-[height,opacity,background-color] duration-150',
                                    resizeEdge === 'end'
                                      ? 'h-[2.5px] opacity-100'
                                      : 'h-0 opacity-0 group-hover/edge:h-[2.5px] group-hover/edge:opacity-100',
                                  )}
                                  style={{ backgroundColor: edgeTone }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>

                {showNow && todayIndex >= 0 && (
                  <div
                    className="pointer-events-none absolute z-20"
                    style={{
                      top: nowTop,
                      left: `calc(${GUTTER} + (100% - ${GUTTER}) * ${todayIndex} / 7)`,
                      width: `calc((100% - ${GUTTER}) / 7)`,
                    }}
                  >
                    <div className="absolute inset-x-0 h-px bg-rose-500" />
                    <div className="absolute left-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {blockMenu &&
        (() => {
          const source = blocks.find((block) => block.id === blockMenu.id)
          if (!source) return null
          const left = Math.max(8, Math.min(blockMenu.x, window.innerWidth - 200))
          const top = Math.max(8, Math.min(blockMenu.y, window.innerHeight - 96))
          return (
            <div
              data-block-menu
              className="fixed z-50 min-w-[11.5rem] overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 py-1 shadow-xl"
              style={{ left, top }}
              onMouseDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800/80"
                onClick={() => void copyBlockToOtherDays(source)}
              >
                Copy to other days
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-zinc-800/80"
                onClick={() => void removeSelected(source.id)}
              >
                Delete
              </button>
            </div>
          )
        })()}
      {dayMenu &&
        (() => {
          const templates = getScheduleTemplates()
          const left = Math.max(8, Math.min(dayMenu.x, window.innerWidth - 200))
          const top = Math.max(8, Math.min(dayMenu.y, window.innerHeight - 240))
          return (
            <div
              data-block-menu
              className="fixed z-50 max-h-72 min-w-[11.5rem] overflow-y-auto rounded-lg border border-zinc-700/80 bg-zinc-950 py-1 shadow-xl"
              style={{ left, top }}
              onMouseDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800/80"
                onClick={() => {
                  setNotesDate(dayMenu.date)
                  setDayMenu(null)
                }}
              >
                {getDayNoteItems(dayMenu.date).length > 0 ? 'Edit notes' : 'Add notes'}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-zinc-800/80"
                onClick={() => void clearDay(dayMenu.date)}
              >
                Clear all
              </button>
              {templates.length > 0 && (
                <>
                  <div className="mx-2 my-1 border-t border-zinc-800" />
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className="flex w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800/80"
                      onClick={() => void applyTemplateToDay(dayMenu.date, template)}
                    >
                      {template.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )
        })()}
      {notesDate && <DayNotesEditor date={notesDate} onClose={() => setNotesDate(null)} />}
    </div>
  )
}
