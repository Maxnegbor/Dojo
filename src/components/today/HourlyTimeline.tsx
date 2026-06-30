import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minimize2, Trash2 } from 'lucide-react'
import { BLOCK_COLOR_DEFAULT_TITLES, BLOCK_COLOR_HEX, SCHEDULE_BLOCK_COLORS, type ScheduleBlock } from '@/types'
import { createScheduleBlock, isGreyBlock, setScheduleBlockColor } from '@/lib/scheduleBlock'
import { useSettings } from '@/context/SettingsContext'
import { generateId, minutesToTime, parseTimeToMinutes, cn } from '@/lib/utils'

const HOUR_HEIGHT = 88
const TIMELINE_TOP_INSET = 12
const COMPACT_BLOCK_MAX_MINUTES = 60

interface ScheduleBlockTitleInputProps {
  value: string
  onChange: (value: string) => void
  onMouseDown?: (e: React.MouseEvent<HTMLInputElement>) => void
  placeholder?: string
}

function ScheduleBlockTitleInput({
  value,
  onChange,
  onMouseDown,
  placeholder = 'New Block',
}: ScheduleBlockTitleInputProps) {
  const mirrorText = value || placeholder

  const mirrorClass =
    'invisible col-start-1 row-start-1 whitespace-pre text-xs font-medium leading-tight'

  const inputClass =
    'col-start-1 row-start-1 min-w-[3ch] w-full cursor-text bg-transparent px-0 py-0 text-xs font-medium leading-tight text-zinc-100 outline-none focus:outline-none'

  return (
    <div className="inline-grid w-fit max-w-full">
      <span aria-hidden className={mirrorClass}>
        {mirrorText}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onMouseDown={onMouseDown}
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
}

function ScheduleBlockColorPicker({
  block,
  onUpdate,
  compact = false,
}: {
  block: ScheduleBlock
  onUpdate: (block: ScheduleBlock) => void
  compact?: boolean
}) {
  if (!isGreyBlock(block)) return null

  return (
    <div className={cn('flex items-center gap-1.5', compact ? 'mt-1' : 'mt-1.5')}>
      {SCHEDULE_BLOCK_COLORS.map((blockColor) => (
        <button
          key={blockColor}
          type="button"
          title={BLOCK_COLOR_DEFAULT_TITLES[blockColor]}
          className={cn(
            'rounded-full border-2 border-transparent opacity-80 transition-transform hover:scale-110 hover:opacity-100',
            compact ? 'h-3 w-3' : 'h-3.5 w-3.5',
          )}
          style={{ backgroundColor: BLOCK_COLOR_HEX[blockColor] }}
          onClick={(e) => {
            e.stopPropagation()
            onUpdate(setScheduleBlockColor(block, blockColor))
          }}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ))}
    </div>
  )
}

function snapToGrid(minutes: number) {
  return Math.round(minutes / 15) * 15
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
}: HourlyTimelineProps) {
  const { formatTime } = useSettings()

  const { slotHours, timelineHeight, contentHeight, endMinutes } = useMemo(
    () => getTimelineMetrics(startHour, endHour),
    [startHour, endHour],
  )

  const yToMinutes = useCallback(
    (y: number) => {
      const raw = ((y - TIMELINE_TOP_INSET) / HOUR_HEIGHT) * 60 + startHour * 60
      return snapToGrid(Math.max(startHour * 60, Math.min(endMinutes, raw)))
    },
    [startHour, endMinutes],
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  const dragOffsetRef = useRef(0)
  const [scrollAreaHeight, setScrollAreaHeight] = useState<number | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [resizing, setResizing] = useState<string | null>(null)
  const [resizeMode, setResizeMode] = useState<ResizeMode>(null)
  const [creating, setCreating] = useState<{ start: number; end: number } | null>(null)
  const [nowLine, setNowLine] = useState<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

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

  const scrollToCurrentTime = useCallback(() => {
    if (!isActiveDay) return false

    const scrollEl = scrollRef.current
    const anchor = scrollAnchorRef.current
    if (!scrollEl || !anchor) return false

    const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
    if (maxScroll <= 0) return false

    const now = new Date()
    const mins = now.getHours() * 60 + now.getMinutes()

    if (mins < startHour * 60) {
      scrollEl.scrollTop = 0
      return true
    }

    if (mins > endMinutes) {
      scrollEl.scrollTop = maxScroll
      return true
    }

    // Align the now anchor with the top edge of the scroll viewport.
    const scrollRect = scrollEl.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    const nextScrollTop = scrollEl.scrollTop + (anchorRect.top - scrollRect.top)
    scrollEl.scrollTop = Math.max(0, Math.min(nextScrollTop, maxScroll))
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

    const now = new Date()
    const msUntilNextHour =
      (60 - now.getMinutes()) * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds()

    let hourInterval: number | undefined
    const hourTimeout = window.setTimeout(() => {
      scrollToCurrentTimeWithRetry()
      hourInterval = window.setInterval(scrollToCurrentTimeWithRetry, 60 * 60 * 1000)
    }, msUntilNextHour)

    return () => {
      clearTimeout(hourTimeout)
      if (hourInterval !== undefined) clearInterval(hourInterval)
    }
  }, [isActiveDay, scrollToCurrentTimeWithRetry])

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const measure = () => {
      const panelRect = panel.getBoundingClientRect()
      const headerH = headerRef.current?.getBoundingClientRect().height ?? 0
      const viewportRemaining = window.innerHeight - panelRect.top - 16
      const panelH = isFullscreen ? panelRect.height : Math.min(panelRect.height, viewportRemaining)
      const next = Math.floor(panelH - headerH)
      setScrollAreaHeight(next > 0 ? next : null)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(panel)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [isFullscreen])

  useLayoutEffect(() => {
    if (!isActiveDay || scrollAreaHeight == null) return
    scrollToCurrentTimeWithRetry()
  }, [isActiveDay, scrollAreaHeight, scrollToCurrentTimeWithRetry])

  useLayoutEffect(() => {
    if (!isActiveDay) return

    scrollToCurrentTimeWithRetry()
    const t1 = window.setTimeout(scrollToCurrentTimeWithRetry, 100)
    const t2 = window.setTimeout(scrollToCurrentTimeWithRetry, 400)
    const t3 = window.setTimeout(scrollToCurrentTimeWithRetry, 1000)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
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
  }, [startHour, endHour, contentHeight, isFullscreen])

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
      if (isActiveDay) scrollToCurrentTimeWithRetry()
    })
    ro.observe(el)

    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [startHour, endHour, contentHeight, isFullscreen, isActiveDay, scrollToCurrentTimeWithRetry])

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

  const getBlockStyle = (block: ScheduleBlock) => {
    const start = parseTimeToMinutes(block.start_time) - startHour * 60
    const end = parseTimeToMinutes(block.end_time) - startHour * 60
    const durationMins = parseTimeToMinutes(block.end_time) - parseTimeToMinutes(block.start_time)
    return {
      top: (start / 60) * HOUR_HEIGHT + TIMELINE_TOP_INSET,
      height: Math.max(((end - start) / 60) * HOUR_HEIGHT, durationMins <= 15 ? 24 : 32),
      durationMins,
    }
  }

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const y = e.clientY - rect.top
      const minutes = yToMinutes(y)

      if (creating) {
        setCreating({ start: creating.start, end: minutes })
        return
      }

      if (!dragging && !resizing) return
      const block = blocks.find((b) => b.id === (dragging || resizing))
      if (!block) return

      if (dragging) {
        const duration =
          parseTimeToMinutes(block.end_time) - parseTimeToMinutes(block.start_time)
        const newStart = Math.max(
          startHour * 60,
          Math.min(endMinutes - duration, minutes - dragOffsetRef.current),
        )
        onUpdate({
          ...block,
          start_time: minutesToTime(newStart),
          end_time: minutesToTime(newStart + duration),
        })
      } else if (resizing && resizeMode === 'bottom') {
        const start = parseTimeToMinutes(block.start_time)
        const newEnd = Math.max(start + 15, Math.min(endMinutes, minutes))
        onUpdate({ ...block, end_time: minutesToTime(newEnd) })
      } else if (resizing && resizeMode === 'top') {
        const end = parseTimeToMinutes(block.end_time)
        const newStart = Math.max(startHour * 60, Math.min(end - 15, minutes))
        onUpdate({ ...block, start_time: minutesToTime(newStart) })
      }
    },
    [blocks, creating, dragging, resizing, resizeMode, onUpdate, startHour, endMinutes, yToMinutes],
  )

  const handleMouseUp = useCallback(() => {
    if (creating && containerRef.current) {
      const startMin = Math.min(creating.start, creating.end)
      const endMin = Math.max(creating.start, creating.end)
      if (endMin - startMin >= 15) {
        onCreate(
          createScheduleBlock({
            id: generateId(),
            user_id: userId,
            date,
            start_time: minutesToTime(startMin),
            end_time: minutesToTime(endMin),
          }),
        )
      }
    }
    setCreating(null)
    setDragging(null)
    setResizing(null)
    setResizeMode(null)
  }, [creating, date, onCreate, userId])

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
      return {
        top: ((startMin - startHour * 60) / 60) * HOUR_HEIGHT + TIMELINE_TOP_INSET,
        height: Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 32),
      }
    })()

  return (
    <div
      className={cn(
        isFullscreen
          ? 'fixed inset-0 z-50 flex flex-col bg-[#0a0a0f]/95 p-4 backdrop-blur-md sm:p-6'
          : 'flex min-h-0 flex-1 flex-col',
      )}
    >
      <div
        ref={panelRef}
        className={cn(
          'relative isolate flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/40',
        )}
      >
        <div
          ref={headerRef}
          className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800/80 px-3 py-2"
        >
          <div>
            <p className="text-xs font-medium text-zinc-400">Schedule</p>
            <p className="text-[10px] text-zinc-600">
              Drag grid to create · drag block body to move · drag edges to resize
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsFullscreen((open) => !open)}
            className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Open schedule fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>

      <div
        ref={scrollRef}
        className="scrollbar-hidden overflow-y-auto overscroll-contain"
        style={scrollAreaHeight != null ? { height: scrollAreaHeight, flexShrink: 0 } : { minHeight: 0, flex: 1 }}
      >
        <div
          className="relative flex overflow-hidden"
          style={{
            height: contentHeight,
            minHeight: contentHeight,
            maxHeight: contentHeight,
          }}
        >
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
            className="relative min-w-0 flex-1 select-none overflow-hidden"
            style={{
              height: contentHeight,
              minHeight: contentHeight,
              maxHeight: contentHeight,
            }}
            onMouseDown={(e) => {
              if (e.target !== e.currentTarget || !containerRef.current) return
              const rect = containerRef.current.getBoundingClientRect()
              setCreating({ start: yToMinutes(e.clientY - rect.top), end: yToMinutes(e.clientY - rect.top) })
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

          {nowLine != null && (
            <div className="pointer-events-none absolute left-0 right-0 z-[3] flex items-center" style={{ top: nowLine }}>
              <div className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
              <div className="h-px flex-1 bg-red-500/70" />
            </div>
          )}

          {createPreview && (
            <div
              className="pointer-events-none absolute left-1 right-1 rounded-lg border-2 border-dashed border-[var(--accent-400)]/60 bg-[var(--accent-500)]/10"
              style={createPreview}
            />
          )}

          {blocks.map((block) => {
            const { durationMins, ...style } = getBlockStyle(block)
            const isCompact = durationMins <= COMPACT_BLOCK_MAX_MINUTES
            const isShortInline = durationMins === 15 || durationMins === 30
            const isMicro = durationMins <= 15
            return (
              <div
                key={block.id}
                className={cn(
                  'absolute left-1 right-1 z-[2] flex overflow-hidden rounded-lg border border-white/10 shadow-md cursor-grab active:cursor-grabbing',
                  isShortInline
                    ? 'items-center px-1.5'
                    : isCompact
                      ? 'px-1.5 py-0.5'
                      : 'px-2 py-1',
                )}
                style={{
                  ...style,
                  backgroundColor: `${block.color}40`,
                  borderLeftColor: block.color,
                  borderLeftWidth: 3,
                }}
                onMouseDown={(e) => {
                  const target = e.target as HTMLElement
                  if (target.closest('input, button, [data-resize-handle]')) return
                  if (!containerRef.current) return
                  e.stopPropagation()
                  const rect = containerRef.current.getBoundingClientRect()
                  const clickMinutes = yToMinutes(e.clientY - rect.top)
                  dragOffsetRef.current =
                    clickMinutes - parseTimeToMinutes(block.start_time)
                  setDragging(block.id)
                }}
              >
                <div
                  data-resize-handle
                  className={cn(
                    'absolute inset-x-0 top-0 z-10 cursor-ns-resize',
                    isMicro ? 'h-1' : 'h-2',
                  )}
                  onMouseDown={(e) => { e.stopPropagation(); setResizing(block.id); setResizeMode('top') }}
                />
                <div
                  className={cn(
                    'min-w-0 flex-1',
                    isShortInline ? 'pr-9' : isCompact ? 'pt-1.5 pr-9' : 'pt-3 pr-10',
                  )}
                >
                  {isShortInline ? (
                    <div className="flex items-center gap-1.5">
                      <ScheduleBlockTitleInput
                        value={block.title}
                        onChange={(title) => onUpdate({ ...block, title })}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                      <span className="pointer-events-none shrink-0 text-[10px] tabular-nums text-zinc-400">
                        {formatBlockTime(block.start_time)}–{formatBlockTime(block.end_time)}
                      </span>
                    </div>
                  ) : (
                    <>
                      <ScheduleBlockTitleInput
                        value={block.title}
                        onChange={(title) => onUpdate({ ...block, title })}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                      <p className="pointer-events-none text-[10px] tabular-nums text-zinc-400">
                        {formatBlockTime(block.start_time)} – {formatBlockTime(block.end_time)}
                      </p>
                    </>
                  )}
                  <ScheduleBlockColorPicker block={block} onUpdate={onUpdate} compact={isCompact} />
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
                    isMicro ? 'h-1' : 'h-2',
                  )}
                  onMouseDown={(e) => { e.stopPropagation(); setResizing(block.id); setResizeMode('bottom') }}
                />
              </div>
            )
          })}
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}
