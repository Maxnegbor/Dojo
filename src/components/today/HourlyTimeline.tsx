import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Maximize2, Minimize2, Trash2, X } from 'lucide-react'
import { GREY_BLOCK_TITLE, type ScheduleBlock, type WorkoutCategory } from '@/types'
import { createScheduleBlock, isGreyBlock, setScheduleBlockColor } from '@/lib/scheduleBlock'
import {
  getScheduleColorPresets,
  getWorkoutSchedulePreset,
  isWorkoutScheduleColor,
  SCHEDULE_COLORS_CHANGED,
  type ScheduleColorPreset,
} from '@/lib/scheduleColors'
import {
  EXERCISE_PLAN_CHANGED,
  getActivePlannedWorkoutDrag,
  getPlannedWorkouts,
  PLANNED_WORKOUT_DRAG_MIME,
} from '@/lib/exercisePlan'
import { SCHEDULE_SCROLL_TO_NOW } from '@/lib/scheduleScroll'
import { getWorkoutTypes } from '@/lib/workoutTypes'
import { useSettings } from '@/context/SettingsContext'
import { generateId, formatDuration, minutesToTime, parseTimeToMinutes, cn } from '@/lib/utils'

const HOUR_HEIGHT = 88
const TIMELINE_TOP_INSET = 12
const NOW_DOT_GUTTER = 16
/** Schedule snap + minimum block length (minutes). */
const GRID_MINUTES = 30
/** Blocks at or under this use the tight layout; 60+ matches the tall layout. */
const COMPACT_BLOCK_MAX_MINUTES = GRID_MINUTES
/** Minimum scroll viewport when the screen budget is tiny. */
const SCHEDULE_MIN_VIEWPORT = HOUR_HEIGHT + TIMELINE_TOP_INSET
/** Fallback until the first layout measurement (≈6 hours). */
const SCHEDULE_FALLBACK_VIEWPORT = HOUR_HEIGHT * 6 + TIMELINE_TOP_INSET
/** Gap between schedule bottom and the viewport / height host edge. */
const SCHEDULE_VIEWPORT_GAP = 16

interface ScheduleBlockTitleInputProps {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  onMouseDown?: (e: React.MouseEvent<HTMLInputElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  inputRef?: React.Ref<HTMLInputElement>
  autoFocus?: boolean
}

function ScheduleBlockTitleInput({
  value,
  onChange,
  onFocus,
  onBlur,
  onMouseDown,
  onKeyDown,
  placeholder = 'New Block',
  inputRef,
  autoFocus,
}: ScheduleBlockTitleInputProps) {
  const mirrorText = value || placeholder

  const mirrorClass =
    'invisible col-start-1 row-start-1 whitespace-pre text-[1em] font-medium leading-tight'

  const inputClass =
    'col-start-1 row-start-1 min-w-[3ch] w-full cursor-text bg-transparent px-0 py-0 text-[1em] font-medium leading-tight text-zinc-100 outline-none focus:outline-none'

  return (
    <div className="inline-grid w-fit max-w-full">
      <span aria-hidden className={mirrorClass}>
        {mirrorText}
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onMouseDown={onMouseDown}
        onKeyDown={onKeyDown}
        className={inputClass}
      />
    </div>
  )
}

type ResizeMode = 'bottom' | 'top' | null

interface HourlyTimelineProps {
  blocks: ScheduleBlock[]
  date: string
  userId: string
  isActiveDay: boolean
  startHour?: number
  endHour?: number
  onUpdate: (block: ScheduleBlock) => void
  onDelete: (id: string) => void
  onCreate: (block: ScheduleBlock) => void
  /** When amber is chosen on a grey block, pick a workout type for the exercise plan. */
  onAssignExercise?: (block: ScheduleBlock, category: WorkoutCategory) => void
  /** Extra controls in the schedule card header (e.g. template menu). */
  headerActions?: ReactNode
  /** Drop a planned workout from Exercise plan onto this timeline. */
  onDropPlannedWorkout?: (planId: string, startMinutes: number) => void
  /** When true, enlarge text for ambient/screensaver display. */
  screensaver?: boolean
}

function isDefaultGreyTitle(title: string) {
  const trimmed = title.trim()
  return trimmed.length === 0 || trimmed === GREY_BLOCK_TITLE || trimmed === 'New Block'
}

function blockNeedsWorkoutType(block: ScheduleBlock, linkedBlockIds: Set<string>): boolean {
  if (!isWorkoutScheduleColor(block.activity_type)) return false
  return !linkedBlockIds.has(block.id)
}

function ScheduleBlockWorkoutTypePicker({
  block,
  onAssignExercise,
  onCancel,
  compact = false,
}: {
  block: ScheduleBlock
  onAssignExercise: (block: ScheduleBlock, category: WorkoutCategory) => void
  onCancel?: () => void
  compact?: boolean
}) {
  const workoutTypes = useMemo(() => getWorkoutTypes(), [])
  if (workoutTypes.length === 0) return null

  return (
    <div
      className={cn('flex flex-wrap items-center gap-1', compact ? 'mt-1' : 'mt-1.5')}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="w-full text-[9px] font-medium uppercase tracking-wide text-zinc-500">
        Choose workout
      </span>
      {workoutTypes.map((type) => (
        <button
          key={type.id}
          type="button"
          title={type.label}
          className="max-w-[5.5rem] truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-black shadow-sm transition-transform hover:scale-105"
          style={{ backgroundColor: 'var(--accent-500)' }}
          onClick={(e) => {
            e.stopPropagation()
            onAssignExercise(block, type.id)
          }}
        >
          {type.label}
        </button>
      ))}
      {onCancel ? (
        <button
          type="button"
          aria-label="Cancel workout pick"
          className="flex h-5 w-5 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          onClick={(e) => {
            e.stopPropagation()
            onCancel()
          }}
        >
          <X size={11} />
        </button>
      ) : null}
    </div>
  )
}

function ScheduleBlockColorPicker({
  block,
  onUpdate,
  onAssignExercise,
  compact = false,
  presets,
}: {
  block: ScheduleBlock
  onUpdate: (block: ScheduleBlock) => void
  onAssignExercise?: (block: ScheduleBlock, category: WorkoutCategory) => void
  compact?: boolean
  presets: ScheduleColorPreset[]
}) {
  const [pickingExercise, setPickingExercise] = useState(false)
  const workoutTypes = useMemo(() => getWorkoutTypes(), [])
  const workoutPresetId = useMemo(() => getWorkoutSchedulePreset().id, [presets])

  useEffect(() => {
    setPickingExercise(false)
  }, [block.id, block.activity_type])

  if (!isGreyBlock(block)) return null

  if (pickingExercise) {
    return (
      <ScheduleBlockWorkoutTypePicker
        block={block}
        compact={compact}
        onCancel={() => setPickingExercise(false)}
        onAssignExercise={(nextBlock, category) => {
          onAssignExercise?.(nextBlock, category)
          setPickingExercise(false)
        }}
      />
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', compact ? 'mt-1' : 'mt-1.5')}>
      {presets.map((preset) => {
        const isWorkout = preset.role === 'workout' || preset.id === workoutPresetId
        return (
          <button
            key={preset.id}
            type="button"
            title={
              isWorkout && onAssignExercise && workoutTypes.length > 0
                ? `${preset.label} — choose workout`
                : preset.label
            }
            className={cn(
              'rounded-full border-2 border-transparent opacity-80 transition-transform hover:scale-110 hover:opacity-100',
              compact ? 'h-3 w-3' : 'h-3.5 w-3.5',
            )}
            style={{ backgroundColor: preset.hex }}
            onClick={(e) => {
              e.stopPropagation()
              if (isWorkout && onAssignExercise && workoutTypes.length > 0) {
                setPickingExercise(true)
                return
              }
              onUpdate(setScheduleBlockColor(block, preset.id))
            }}
            onMouseDown={(e) => e.stopPropagation()}
          />
        )
      })}
    </div>
  )
}

function snapToGrid(minutes: number) {
  return Math.round(minutes / GRID_MINUTES) * GRID_MINUTES
}

function minutesToStyle(
  startMin: number,
  endMin: number,
  timelineStartHour: number,
): { top: number; height: number; durationMins: number } {
  const durationMins = Math.max(1, endMin - startMin)
  const start = startMin - timelineStartHour * 60
  const end = endMin - timelineStartHour * 60
  return {
    top: (start / 60) * HOUR_HEIGHT + TIMELINE_TOP_INSET,
    height: Math.max(((end - start) / 60) * HOUR_HEIGHT, durationMins <= GRID_MINUTES ? 28 : 32),
    durationMins,
  }
}

function formatScheduleHour(hour: number, formatTime: (date: Date) => string): string {
  if (hour === 24) {
    return formatTime(new Date(2000, 0, 1, 0, 0))
  }
  return formatTime(new Date(2000, 0, 1, hour, 0))
}

function getTimelineMetrics(startHour: number, endHour: number) {
  const slotCount = Math.max(0, endHour - startHour)
  const timelineHeight = slotCount * HOUR_HEIGHT
  const contentHeight = timelineHeight + TIMELINE_TOP_INSET
  const slotHours = Array.from({ length: slotCount }, (_, i) => startHour + i)

  return {
    slotCount,
    slotHours,
    timelineHeight,
    contentHeight,
    endMinutes: endHour * 60,
  }
}

function clampScrollTop(el: HTMLElement) {
  const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
  if (el.scrollTop > maxScroll) {
    el.scrollTop = maxScroll
  }
  return maxScroll
}

export function HourlyTimeline({
  blocks,
  date,
  userId,
  isActiveDay,
  startHour = 6,
  endHour = 23,
  onUpdate,
  onDelete,
  onCreate,
  onAssignExercise,
  headerActions,
  onDropPlannedWorkout,
  screensaver = false,
}: HourlyTimelineProps) {
  const { formatTime } = useSettings()
  const [colorPresets, setColorPresets] = useState(() => getScheduleColorPresets())
  const [linkedBlockIds, setLinkedBlockIds] = useState<Set<string>>(
    () => new Set(getPlannedWorkouts().map((p) => p.schedule_block_id).filter(Boolean) as string[]),
  )

  useEffect(() => {
    const refresh = () => setColorPresets(getScheduleColorPresets())
    window.addEventListener(SCHEDULE_COLORS_CHANGED, refresh)
    window.addEventListener('user-storage-ready', refresh)
    return () => {
      window.removeEventListener(SCHEDULE_COLORS_CHANGED, refresh)
      window.removeEventListener('user-storage-ready', refresh)
    }
  }, [])

  useEffect(() => {
    const refresh = () =>
      setLinkedBlockIds(
        new Set(getPlannedWorkouts().map((p) => p.schedule_block_id).filter(Boolean) as string[]),
      )
    window.addEventListener(EXERCISE_PLAN_CHANGED, refresh)
    window.addEventListener('user-storage-ready', refresh)
    return () => {
      window.removeEventListener(EXERCISE_PLAN_CHANGED, refresh)
      window.removeEventListener('user-storage-ready', refresh)
    }
  }, [])

  const { slotHours, timelineHeight, contentHeight, endMinutes } = useMemo(
    () => getTimelineMetrics(startHour, endHour),
    [startHour, endHour],
  )

  const yToRawMinutes = useCallback(
    (y: number) => {
      const raw = ((y - TIMELINE_TOP_INSET) / HOUR_HEIGHT) * 60 + startHour * 60
      return Math.max(startHour * 60, Math.min(endMinutes, raw))
    },
    [startHour, endMinutes],
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  const dragOffsetRef = useRef(0)
  const interactionBlockRef = useRef<ScheduleBlock | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [resizing, setResizing] = useState<string | null>(null)
  const [resizeMode, setResizeMode] = useState<ResizeMode>(null)
  const [hoverResize, setHoverResize] = useState<{ id: string; edge: 'top' | 'bottom' } | null>(
    null,
  )
  const [preview, setPreview] = useState<{
    id: string
    startMin: number
    endMin: number
  } | null>(null)
  const [creating, setCreating] = useState<{ start: number; end: number } | null>(null)
  const [planDropPreview, setPlanDropPreview] = useState<{
    startMin: number
    endMin: number
  } | null>(null)
  const [titleEdits, setTitleEdits] = useState<Record<string, string>>({})
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [focusTitleId, setFocusTitleId] = useState<string | null>(null)
  const titleInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [nowLine, setNowLine] = useState<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [maxViewportHeight, setMaxViewportHeight] = useState<number | null>(null)

  const scrollAreaHeight = Math.min(
    contentHeight,
    maxViewportHeight ?? SCHEDULE_FALLBACK_VIEWPORT,
  )

  useLayoutEffect(() => {
    if (isFullscreen) return

    const scrollEl = scrollRef.current
    if (!scrollEl) return

    const measure = () => {
      const top = scrollEl.getBoundingClientRect().top
      const host = scrollEl.closest('[data-schedule-height-host]') as HTMLElement | null
      let available: number
      if (host) {
        available = Math.floor(host.getBoundingClientRect().bottom - top)
      } else {
        const main = scrollEl.closest('main')
        if (main) {
          const padBottom = parseFloat(getComputedStyle(main).paddingBottom) || 0
          available = Math.floor(main.getBoundingClientRect().bottom - top - padBottom)
        } else {
          const bottom = window.visualViewport?.height ?? window.innerHeight
          available = Math.floor(bottom - top - SCHEDULE_VIEWPORT_GAP)
        }
      }
      setMaxViewportHeight(Math.max(SCHEDULE_MIN_VIEWPORT, available))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(document.documentElement)
    const host = scrollEl.closest('[data-schedule-height-host]')
    if (host) ro.observe(host)
    if (headerRef.current) ro.observe(headerRef.current)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [isFullscreen, startHour, endHour, contentHeight])

  useEffect(() => {
    if (!isActiveDay) {
      setNowLine(null)
      return
    }
    const tick = () => {
      const now = new Date()
      const mins = now.getHours() * 60 + now.getMinutes()
      if (mins >= startHour * 60 && mins <= endMinutes) {
        setNowLine(((mins - startHour * 60) / 60) * HOUR_HEIGHT + TIMELINE_TOP_INSET)
      } else setNowLine(null)
    }
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [isActiveDay, startHour, endMinutes])

  const scrollToCurrentTime = useCallback((options?: { smooth?: boolean }) => {
    if (!isActiveDay) return false

    const scrollEl = scrollRef.current
    const anchor = scrollAnchorRef.current
    if (!scrollEl || !anchor) return false

    const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
    if (maxScroll <= 0) return false

    const behavior = options?.smooth ? 'smooth' : 'auto'
    const now = new Date()
    const mins = now.getHours() * 60 + now.getMinutes()

    if (mins < startHour * 60) {
      scrollEl.scrollTo({ top: 0, behavior })
      return true
    }

    if (mins > endMinutes) {
      scrollEl.scrollTo({ top: maxScroll, behavior })
      return true
    }

    // Align the now anchor with the top edge of the scroll viewport.
    const scrollRect = scrollEl.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    const nextScrollTop = scrollEl.scrollTop + (anchorRect.top - scrollRect.top)
    scrollEl.scrollTo({
      top: Math.max(0, Math.min(nextScrollTop, maxScroll)),
      behavior,
    })
    return true
  }, [isActiveDay, startHour, endMinutes])

  const scrollToCurrentTimeWithRetry = useCallback(() => {
    if (!isActiveDay) return

    let attempts = 0
    const run = () => {
      if (scrollToCurrentTime() || attempts >= 60) return
      attempts += 1
      requestAnimationFrame(run)
    }
    run()
  }, [isActiveDay, scrollToCurrentTime])

  useEffect(() => {
    if (!isActiveDay) return

    scrollToCurrentTimeWithRetry()

    const onScrollRequest = () => scrollToCurrentTimeWithRetry()
    window.addEventListener(SCHEDULE_SCROLL_TO_NOW, onScrollRequest)

    const now = new Date()
    const msUntilNextHour =
      (60 - now.getMinutes()) * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds()

    let hourInterval: number | undefined
    const hourTimeout = window.setTimeout(() => {
      scrollToCurrentTimeWithRetry()
      hourInterval = window.setInterval(scrollToCurrentTimeWithRetry, 60 * 60 * 1000)
    }, msUntilNextHour)

    return () => {
      window.removeEventListener(SCHEDULE_SCROLL_TO_NOW, onScrollRequest)
      clearTimeout(hourTimeout)
      if (hourInterval !== undefined) clearInterval(hourInterval)
    }
  }, [isActiveDay, scrollToCurrentTimeWithRetry])

  useLayoutEffect(() => {
    if (!isActiveDay) return
    scrollToCurrentTimeWithRetry()
  }, [isActiveDay, startHour, endHour, date, timelineHeight, scrollToCurrentTimeWithRetry])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return

    clampScrollTop(el)
    const raf = requestAnimationFrame(() => clampScrollTop(el))
    const t = window.setTimeout(() => clampScrollTop(el), 50)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [startHour, endHour, contentHeight, isFullscreen, scrollAreaHeight])

  useEffect(() => {
    if (!isFullscreen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isFullscreen])

  useLayoutEffect(() => {
    if (!isFullscreen) return
    scrollToCurrentTimeWithRetry()
    const t = window.setTimeout(scrollToCurrentTimeWithRetry, 100)
    return () => clearTimeout(t)
  }, [isFullscreen, scrollToCurrentTimeWithRetry])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
      if (maxScroll <= 0) return

      const nextScroll = el.scrollTop + e.deltaY
      const clamped = Math.max(0, Math.min(maxScroll, nextScroll))
      if (clamped === el.scrollTop) return

      e.preventDefault()
      e.stopPropagation()
      el.scrollTop = clamped
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [contentHeight, isFullscreen])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onScroll = () => clampScrollTop(el)

    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })

    const ro = new ResizeObserver(() => {
      clampScrollTop(el)
    })
    ro.observe(el)

    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [startHour, endHour, contentHeight, isFullscreen])

  const scrollAnchorTop = useMemo(() => {
    if (!isActiveDay) return 0
    const now = new Date()
    const mins = now.getHours() * 60 + now.getMinutes()
    return ((mins - startHour * 60) / 60) * HOUR_HEIGHT + TIMELINE_TOP_INSET
  }, [isActiveDay, startHour, endHour, date])

  const formatBlockTime = (time: string) => {
    const [h, m] = time.slice(0, 5).split(':').map(Number)
    return formatTime(new Date(2000, 0, 1, h, m))
  }

  const blockTitleValue = (block: ScheduleBlock) =>
    editingTitleId === block.id && titleEdits[block.id] !== undefined
      ? titleEdits[block.id]
      : block.title

  const beginTitleEdit = (block: ScheduleBlock) => {
    setEditingTitleId(block.id)
    setTitleEdits((prev) =>
      prev[block.id] !== undefined ? prev : { ...prev, [block.id]: block.title },
    )
  }

  const updateTitleDraft = (blockId: string, title: string) => {
    setTitleEdits((prev) => ({ ...prev, [blockId]: title }))
  }

  const commitTitleEdit = (block: ScheduleBlock) => {
    const draft = titleEdits[block.id]
    setEditingTitleId((current) => (current === block.id ? null : current))
    setFocusTitleId((current) => (current === block.id ? null : current))
    if (draft === undefined) return

    setTitleEdits((prev) => {
      const next = { ...prev }
      delete next[block.id]
      return next
    })

    if (draft !== block.title) {
      onUpdate({ ...block, title: draft })
    }
  }

  useLayoutEffect(() => {
    if (!focusTitleId) return
    if (!blocks.some((block) => block.id === focusTitleId)) return
    const input = titleInputRefs.current[focusTitleId]
    if (!input) return
    input.focus()
    input.select()
    setFocusTitleId(null)
  }, [blocks, focusTitleId, editingTitleId, titleEdits])

  const getBlockStyle = (block: ScheduleBlock) => {
    if (preview?.id === block.id) {
      return minutesToStyle(preview.startMin, preview.endMin, startHour)
    }
    const startMin = parseTimeToMinutes(block.start_time)
    const endMin = parseTimeToMinutes(block.end_time)
    return minutesToStyle(startMin, endMin, startHour)
  }

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const y = e.clientY - rect.top
      const rawMinutes = yToRawMinutes(y)

      if (creating) {
        setCreating({
          start: creating.start,
          end: snapToGrid(rawMinutes),
        })
        return
      }

      if (!dragging && !resizing) return
      const block = interactionBlockRef.current
      if (!block) return

      if (dragging) {
        const duration =
          parseTimeToMinutes(block.end_time) - parseTimeToMinutes(block.start_time)
        const newStart = Math.max(
          startHour * 60,
          Math.min(
            endMinutes - duration,
            snapToGrid(rawMinutes - dragOffsetRef.current),
          ),
        )
        setPreview((prev) => {
          if (
            prev?.id === block.id &&
            prev.startMin === newStart &&
            prev.endMin === newStart + duration
          ) {
            return prev
          }
          return {
            id: block.id,
            startMin: newStart,
            endMin: newStart + duration,
          }
        })
      } else if (resizing && resizeMode === 'bottom') {
        const start = parseTimeToMinutes(block.start_time)
        const newEnd = Math.max(start + GRID_MINUTES, Math.min(endMinutes, snapToGrid(rawMinutes)))
        setPreview((prev) => {
          if (prev?.id === block.id && prev.startMin === start && prev.endMin === newEnd) {
            return prev
          }
          return { id: block.id, startMin: start, endMin: newEnd }
        })
      } else if (resizing && resizeMode === 'top') {
        const end = parseTimeToMinutes(block.end_time)
        const newStart = Math.max(
          startHour * 60,
          Math.min(end - GRID_MINUTES, snapToGrid(rawMinutes)),
        )
        setPreview((prev) => {
          if (prev?.id === block.id && prev.startMin === newStart && prev.endMin === end) {
            return prev
          }
          return { id: block.id, startMin: newStart, endMin: end }
        })
      }
    },
    [
      creating,
      dragging,
      resizing,
      resizeMode,
      startHour,
      endMinutes,
      yToRawMinutes,
    ],
  )

  const handleMouseUp = useCallback(() => {
    if (creating) {
      const startMin = snapToGrid(Math.min(creating.start, creating.end))
      const endMin = snapToGrid(Math.max(creating.start, creating.end))
      if (endMin - startMin >= GRID_MINUTES) {
        const block = createScheduleBlock({
          id: generateId(),
          user_id: userId,
          date,
          start_time: minutesToTime(startMin),
          end_time: minutesToTime(endMin),
        })
        onCreate(block)
        setEditingTitleId(block.id)
        setTitleEdits((prev) => ({ ...prev, [block.id]: block.title }))
        setFocusTitleId(block.id)
      }
      setCreating(null)
      setHoverResize(null)
      return
    }

    const block = interactionBlockRef.current
    if (block && preview && (dragging || resizing)) {
      const startMin = snapToGrid(preview.startMin)
      let endMin = snapToGrid(preview.endMin)
      if (endMin - startMin < GRID_MINUTES) {
        endMin = startMin + GRID_MINUTES
      }
      endMin = Math.min(endMinutes, endMin)
      const nextStart = Math.max(startHour * 60, Math.min(endMinutes - GRID_MINUTES, startMin))
      const nextEnd = Math.max(nextStart + GRID_MINUTES, Math.min(endMinutes, endMin))

      setPreview({ id: block.id, startMin: nextStart, endMin: nextEnd })
      if (
        nextStart !== parseTimeToMinutes(block.start_time) ||
        nextEnd !== parseTimeToMinutes(block.end_time)
      ) {
        onUpdate({
          ...block,
          start_time: minutesToTime(nextStart),
          end_time: minutesToTime(nextEnd),
        })
      }
    } else {
      setPreview(null)
    }

    interactionBlockRef.current = null
    setDragging(null)
    setResizing(null)
    setResizeMode(null)
    setHoverResize(null)
  }, [
    creating,
    date,
    onCreate,
    onUpdate,
    userId,
    preview,
    dragging,
    resizing,
    startHour,
    endMinutes,
  ])

  useEffect(() => {
    if (!preview || dragging || resizing) return
    const block = blocks.find((entry) => entry.id === preview.id)
    if (!block) {
      setPreview(null)
      return
    }
    if (
      parseTimeToMinutes(block.start_time) === preview.startMin &&
      parseTimeToMinutes(block.end_time) === preview.endMin
    ) {
      setPreview(null)
    }
  }, [blocks, preview, dragging, resizing])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const createPreview =
    creating &&
    (() => {
      const startMin = Math.min(creating.start, creating.end)
      const endMin = Math.max(creating.start, creating.end)
      const durationMins = Math.max(0, endMin - startMin)
      return {
        top: ((startMin - startHour * 60) / 60) * HOUR_HEIGHT + TIMELINE_TOP_INSET,
        height: Math.max((durationMins / 60) * HOUR_HEIGHT, 8),
        durationMins,
        startMin,
        endMin,
      }
    })()

  const planDropStyle = planDropPreview
    ? minutesToStyle(planDropPreview.startMin, planDropPreview.endMin, startHour)
    : null

  return (
    <div
      className={cn(
        isFullscreen
          ? 'fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6'
          : 'flex h-full max-h-full min-h-0 flex-col pl-4',
      )}
    >
      {isFullscreen && (
        <button
          type="button"
          aria-label="Exit schedule fullscreen"
          className="absolute inset-0 z-0 bg-black/55 backdrop-blur-md"
          onClick={() => setIsFullscreen(false)}
        />
      )}
      <div
        ref={panelRef}
        className={cn(
          'relative isolate flex max-h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900',
          !isFullscreen && 'h-full w-full -ml-4',
          isFullscreen &&
            'z-10 h-[min(100%,52rem)] w-full max-w-md shadow-2xl shadow-black/50 sm:max-w-lg',
        )}
      >
        <div
          ref={headerRef}
          className={cn(
            'flex shrink-0 items-start justify-between gap-3 rounded-t-xl border-zinc-800/80 px-3 py-2',
            'transition-[max-height,opacity,padding,border-color] duration-[1600ms] ease-in-out',
            screensaver ? 'overflow-hidden border-b-transparent opacity-0' : 'border-b opacity-100',
          )}
          style={{
            maxHeight: screensaver ? '0px' : '4.5rem',
            paddingTop: screensaver ? '0px' : undefined,
            paddingBottom: screensaver ? '0px' : undefined,
          }}
        >
          <div className="min-w-0">
            {isActiveDay ? (
              <button
                type="button"
                onClick={() => scrollToCurrentTime({ smooth: true })}
                className="rounded-lg px-2 py-0.5 text-xs font-semibold text-[var(--accent-400)] transition-colors hover:bg-[var(--accent-500)]/10 hover:text-[var(--accent-300)]"
                aria-label="Scroll to current time"
              >
                Now
              </button>
            ) : (
              <span className="block h-5" aria-hidden />
            )}
            <p className="text-[10px] text-zinc-600">
              Drag grid to create · drag exercise plan onto schedule · drag blocks to move
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerActions}
            <button
              type="button"
              onClick={() => setIsFullscreen((open) => !open)}
              className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Open schedule fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

      <div
        ref={scrollRef}
        className="scrollbar-hidden overflow-y-auto overscroll-contain rounded-b-xl"
        style={
          isFullscreen
            ? { minHeight: 0, flex: 1 }
            : { height: scrollAreaHeight, flexShrink: 0 }
        }
      >
        <div
          className="relative flex"
          style={{
            height: contentHeight,
            minHeight: contentHeight,
            maxHeight: contentHeight,
          }}
        >
          <div
            aria-hidden
            className="shrink-0"
            style={{ width: NOW_DOT_GUTTER, height: contentHeight }}
          />
          <div
            className="relative w-11 shrink-0 border-r border-zinc-800/80"
            style={{
              height: contentHeight,
              minHeight: contentHeight,
              maxHeight: contentHeight,
            }}
          >
            {slotHours.map((h, i) => (
              <div
                key={h}
                className="pointer-events-none absolute inset-x-0 border-b border-zinc-800/40 pr-1.5 text-right text-[10px] text-zinc-600"
                style={{ top: TIMELINE_TOP_INSET + i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              >
                <span className={cn('block', i === 0 ? 'relative top-0.5' : 'relative -top-2')}>
                  {formatScheduleHour(h, formatTime)}
                </span>
              </div>
            ))}
            {slotHours.length > 0 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 pr-1.5 text-right text-[10px] text-zinc-600">
                <span className="relative -top-2 block">
                  {formatScheduleHour(endHour, formatTime)}
                </span>
              </div>
            )}
          </div>

          <div
            ref={containerRef}
            className={cn(
              'relative min-w-0 flex-1 select-none overflow-hidden',
              onDropPlannedWorkout && planDropPreview && 'ring-1 ring-inset ring-[var(--accent-500)]/40',
            )}
            style={{
              height: contentHeight,
              minHeight: contentHeight,
              maxHeight: contentHeight,
            }}
            onMouseDown={(e) => {
              if (e.target !== e.currentTarget || !containerRef.current) return
              const rect = containerRef.current.getBoundingClientRect()
              setCreating({
                start: snapToGrid(yToRawMinutes(e.clientY - rect.top)),
                end: snapToGrid(yToRawMinutes(e.clientY - rect.top)),
              })
            }}
            onDragOverCapture={(e) => {
              if (!onDropPlannedWorkout) return
              if (![...e.dataTransfer.types].includes(PLANNED_WORKOUT_DRAG_MIME)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              if (!containerRef.current) return
              const rect = containerRef.current.getBoundingClientRect()
              const startMin = snapToGrid(yToRawMinutes(e.clientY - rect.top))
              const active = getActivePlannedWorkoutDrag()
              const duration = active?.durationMinutes ?? 60
              const endMin = Math.min(endMinutes, startMin + duration)
              setPlanDropPreview({ startMin, endMin: Math.max(startMin + GRID_MINUTES, endMin) })
            }}
            onDragLeave={(e) => {
              if (!onDropPlannedWorkout) return
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              setPlanDropPreview(null)
            }}
            onDropCapture={(e) => {
              if (!onDropPlannedWorkout) return
              e.preventDefault()
              e.stopPropagation()
              setPlanDropPreview(null)
              const planId =
                e.dataTransfer.getData(PLANNED_WORKOUT_DRAG_MIME) ||
                getActivePlannedWorkoutDrag()?.id ||
                ''
              if (!planId || !containerRef.current) return
              const rect = containerRef.current.getBoundingClientRect()
              const startMin = snapToGrid(yToRawMinutes(e.clientY - rect.top))
              onDropPlannedWorkout(planId, startMin)
            }}
          >
            <div
              ref={scrollAnchorRef}
              aria-hidden
              className="pointer-events-none absolute left-0 h-px w-px"
              style={{ top: scrollAnchorTop }}
            />
          {slotHours.map((h, i) => (
            <div
              key={h}
              className="pointer-events-none absolute w-full"
              style={{ top: TIMELINE_TOP_INSET + i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
            >
              <div className="h-px w-full border-b border-zinc-800/25" />
              <div className="absolute left-0 right-0 top-1/2 h-px border-b border-zinc-800/10 border-dashed" />
            </div>
          ))}
          {slotHours.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px border-b border-zinc-800/25" />
          )}

          {slotHours.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
              Adjust schedule hours in Settings
            </p>
          )}

          {createPreview && (
            <div
              className="pointer-events-none absolute left-0 right-1 flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--accent-400)]/60 bg-[var(--accent-500)]/10 transition-[top,height] duration-150 ease-out"
              style={{ top: createPreview.top, height: createPreview.height }}
            >
              {createPreview.durationMins >= GRID_MINUTES && (
                <div className="flex flex-col items-center gap-0.5 px-2 text-center">
                  <span className="text-sm font-semibold tabular-nums text-[var(--accent-300)]">
                    {formatDuration(createPreview.durationMins)}
                  </span>
                  <span className="text-[10px] tabular-nums text-[var(--accent-300)]/75">
                    {formatBlockTime(minutesToTime(createPreview.startMin))}
                    {' – '}
                    {formatBlockTime(minutesToTime(createPreview.endMin))}
                  </span>
                </div>
              )}
            </div>
          )}

          {planDropStyle && planDropPreview && (
            <div
              className="pointer-events-none absolute left-0 right-1 z-[3] flex items-center justify-center rounded-lg border-2 border-dashed border-red-400/70 bg-red-500/15"
              style={{ top: planDropStyle.top, height: planDropStyle.height }}
            >
              <div className="flex flex-col items-center gap-0.5 px-2 text-center">
                <span className="text-sm font-semibold tabular-nums text-red-200">
                  {formatDuration(planDropStyle.durationMins)}
                </span>
                <span className="text-[10px] tabular-nums text-red-200/75">
                  {formatBlockTime(minutesToTime(planDropPreview.startMin))}
                  {' – '}
                  {formatBlockTime(minutesToTime(planDropPreview.endMin))}
                </span>
              </div>
            </div>
          )}

          {blocks.map((block) => {
            const { durationMins, ...style } = getBlockStyle(block)
            const isCompact = durationMins <= COMPACT_BLOCK_MAX_MINUTES
            const isShortInline = durationMins === GRID_MINUTES
            const isMicro = durationMins <= GRID_MINUTES
            const isLiveGesture = dragging === block.id || resizing === block.id
            const isInteracting = preview?.id === block.id
            const displayStart = isInteracting
              ? minutesToTime(Math.round(preview.startMin))
              : block.start_time
            const displayEnd = isInteracting
              ? minutesToTime(Math.round(preview.endMin))
              : block.end_time
            const topEdgeActive =
              (hoverResize?.id === block.id && hoverResize.edge === 'top') ||
              (resizing === block.id && resizeMode === 'top')
            const bottomEdgeActive =
              (hoverResize?.id === block.id && hoverResize.edge === 'bottom') ||
              (resizing === block.id && resizeMode === 'bottom')
            return (
              <div
                key={block.id}
                className={cn(
                  'absolute left-0 right-1 z-[2] flex overflow-hidden rounded-lg border-2 bg-zinc-950/70 shadow-md cursor-grab active:cursor-grabbing',
                  isLiveGesture && 'z-[3] shadow-lg shadow-black/40',
                  isShortInline
                    ? 'items-center px-1.5'
                    : isCompact
                      ? 'px-1.5 py-0.5'
                      : 'px-2 py-1',
                )}
                style={{
                  ...style,
                  borderColor: `color-mix(in srgb, ${block.color} 55%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${block.color} 12%, rgb(9 9 11))`,
                  transition:
                    'top 150ms cubic-bezier(0.22, 1, 0.36, 1), height 150ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 150ms ease',
                }}
                onMouseDown={(e) => {
                  const target = e.target as HTMLElement
                  if (target.closest('input, button, [data-resize-handle]')) return
                  if (!containerRef.current) return
                  e.stopPropagation()
                  const rect = containerRef.current.getBoundingClientRect()
                  const clickMinutes = yToRawMinutes(e.clientY - rect.top)
                  const startMin = parseTimeToMinutes(block.start_time)
                  const endMin = parseTimeToMinutes(block.end_time)
                  dragOffsetRef.current = clickMinutes - startMin
                  interactionBlockRef.current = block
                  setPreview({ id: block.id, startMin, endMin })
                  setDragging(block.id)
                }}
              >
                <div
                  data-resize-handle
                  className={cn(
                    'absolute inset-x-0 top-0 z-10 cursor-ns-resize',
                    isMicro ? 'h-2' : 'h-2.5',
                  )}
                  onMouseEnter={() => setHoverResize({ id: block.id, edge: 'top' })}
                  onMouseLeave={() =>
                    setHoverResize((prev) =>
                      prev?.id === block.id && prev.edge === 'top' ? null : prev,
                    )
                  }
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    const startMin = parseTimeToMinutes(block.start_time)
                    const endMin = parseTimeToMinutes(block.end_time)
                    interactionBlockRef.current = block
                    setPreview({ id: block.id, startMin, endMin })
                    setHoverResize({ id: block.id, edge: 'top' })
                    setResizing(block.id)
                    setResizeMode('top')
                  }}
                />
                <div
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute inset-x-0 top-0 z-[11] rounded-t-[7px] transition-[height,opacity,background-color,box-shadow] duration-150',
                    topEdgeActive
                      ? 'h-[2.5px] opacity-100'
                      : 'h-0 opacity-0',
                  )}
                  style={
                    topEdgeActive
                      ? { backgroundColor: `color-mix(in srgb, ${block.color} 55%, white)` }
                      : undefined
                  }
                />
                <div
                  className={cn(
                    'min-w-0 flex-1',
                    isShortInline ? 'pr-9' : isCompact ? 'pt-1.5 pr-9' : 'pt-3 pr-10',
                  )}
                  style={{
                    fontSize: screensaver ? '1rem' : '0.75rem',
                    transition: 'font-size 1200ms cubic-bezier(0.4,0,0.2,1)',
                  }}
                >
                  {isShortInline ? (
                    <div className="flex items-center gap-1.5">
                      <ScheduleBlockTitleInput
                        value={blockTitleValue(block)}
                        onChange={(title) => updateTitleDraft(block.id, title)}
                        onFocus={() => beginTitleEdit(block)}
                        onBlur={() => commitTitleEdit(block)}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        inputRef={(el) => {
                          titleInputRefs.current[block.id] = el
                        }}
                      />
                      <span className="pointer-events-none shrink-0 tabular-nums text-zinc-400" style={{ fontSize: '0.8em' }}>
                        {formatBlockTime(displayStart)}–{formatBlockTime(displayEnd)}
                      </span>
                    </div>
                  ) : (
                    <>
                      <ScheduleBlockTitleInput
                        value={blockTitleValue(block)}
                        onChange={(title) => updateTitleDraft(block.id, title)}
                        onFocus={() => beginTitleEdit(block)}
                        onBlur={() => commitTitleEdit(block)}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        inputRef={(el) => {
                          titleInputRefs.current[block.id] = el
                        }}
                      />
                      <p className="pointer-events-none tabular-nums text-zinc-400" style={{ fontSize: '0.8em' }}>
                        {formatBlockTime(displayStart)} – {formatBlockTime(displayEnd)}
                      </p>
                    </>
                  )}
                  {isDefaultGreyTitle(blockTitleValue(block)) && (
                    <ScheduleBlockColorPicker
                      block={block}
                      onUpdate={onUpdate}
                      onAssignExercise={onAssignExercise}
                      compact={isCompact}
                      presets={colorPresets}
                    />
                  )}
                  {onAssignExercise &&
                    blockNeedsWorkoutType(block, linkedBlockIds) &&
                    !isDefaultGreyTitle(blockTitleValue(block)) && (
                      <ScheduleBlockWorkoutTypePicker
                        block={block}
                        compact={isCompact}
                        onAssignExercise={onAssignExercise}
                      />
                    )}
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(block.id) }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={cn(
                    'group/trash absolute right-2 z-20 flex items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-black/20 hover:text-red-400',
                    isCompact ? 'top-1/2 -translate-y-1/2 p-1.5' : 'top-3.5 p-2.5',
                  )}
                  aria-label="Delete block"
                >
                  <Trash2
                    size={12}
                    className="transition-transform duration-200 ease-out group-hover/trash:scale-[1.35]"
                  />
                </button>
                <div
                  data-resize-handle
                  className={cn(
                    'absolute inset-x-0 bottom-0 z-10 cursor-ns-resize',
                    isMicro ? 'h-2' : 'h-2.5',
                  )}
                  onMouseEnter={() => setHoverResize({ id: block.id, edge: 'bottom' })}
                  onMouseLeave={() =>
                    setHoverResize((prev) =>
                      prev?.id === block.id && prev.edge === 'bottom' ? null : prev,
                    )
                  }
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    const startMin = parseTimeToMinutes(block.start_time)
                    const endMin = parseTimeToMinutes(block.end_time)
                    interactionBlockRef.current = block
                    setPreview({ id: block.id, startMin, endMin })
                    setHoverResize({ id: block.id, edge: 'bottom' })
                    setResizing(block.id)
                    setResizeMode('bottom')
                  }}
                />
                <div
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute inset-x-0 bottom-0 z-[11] rounded-b-[7px] transition-[height,opacity,background-color,box-shadow] duration-150',
                    bottomEdgeActive
                      ? 'h-[2.5px] opacity-100'
                      : 'h-0 opacity-0',
                  )}
                  style={
                    bottomEdgeActive
                      ? { backgroundColor: `color-mix(in srgb, ${block.color} 55%, white)` }
                      : undefined
                  }
                />
              </div>
            )
          })}
          </div>

          {nowLine != null && (
            <div
              className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
              style={{ top: nowLine }}
            >
              <div
                className="flex shrink-0 items-center justify-center"
                style={{ width: NOW_DOT_GUTTER }}
              >
                <div className="schedule-now-dot schedule-now-dot--lg" aria-hidden>
                  <span className="schedule-now-dot__ping" />
                  <span className="schedule-now-dot__ping" />
                  <div className="relative z-[1] h-3.5 w-3.5 rounded-full bg-[var(--accent-500)] shadow-[0_0_0_2px_rgb(10_10_15)]" />
                </div>
              </div>
              <div className="h-0.5 min-w-0 flex-1 bg-[var(--accent-500)]" />
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  )
}
