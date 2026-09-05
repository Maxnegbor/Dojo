import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ScheduleBlock } from '@/types'
import { GREY_BLOCK_HEX } from '@/types'
import { useSettings } from '@/context/SettingsContext'
import { fetchScheduleBlocksForDate, isGreyBlock } from '@/lib/scheduleBlock'
import { ScheduleHourLabel } from '@/components/schedule/ScheduleHourLabel'
import { computeScheduleScrollToNowTarget } from '@/lib/scheduleScroll'
import { useStickyScheduleTitles } from '@/hooks/useStickyScheduleTitles'
import { parseTimeToMinutes, cn, formatDate } from '@/lib/utils'

interface FocusScheduleAgendaProps {
  userId: string
  formatTime: (date: Date) => string
  className?: string
  screensaver?: boolean
}

const HOUR_HEIGHT = 72
const TIMELINE_TOP_INSET = 18
const SCREENSAVER_HOUR_HEIGHT = 96

function labelForTime(hhmm: string, formatTime: (date: Date) => string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  const date = new Date()
  date.setHours(h, m, 0, 0)
  return formatTime(date)
}

function minutesToStyle(
  startMin: number,
  endMin: number,
  timelineStartHour: number,
  hourHeight: number,
): { top: number; height: number } {
  const start = startMin - timelineStartHour * 60
  const end = endMin - timelineStartHour * 60
  return {
    top: (start / 60) * hourHeight + TIMELINE_TOP_INSET,
    height: Math.max(((end - start) / 60) * hourHeight, 28),
  }
}

export function FocusScheduleAgenda({
  userId,
  formatTime,
  className,
  screensaver = false,
}: FocusScheduleAgendaProps) {
  const { settings } = useSettings()
  const use24h = settings.timeFormat === '24h'
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const today = formatDate(new Date())
    const next = await fetchScheduleBlocksForDate(userId, today)
    setBlocks([...next].sort((a, b) => a.start_time.localeCompare(b.start_time)))
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setNowMinutes(now.getHours() * 60 + now.getMinutes())
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        tick()
        void load()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const startHour = settings.timelineStartHour
  const endHour = settings.timelineEndHour
  const hourHeight = screensaver ? SCREENSAVER_HOUR_HEIGHT : HOUR_HEIGHT
  const slotHours = useMemo(
    () => Array.from({ length: Math.max(0, endHour - startHour) }, (_, i) => startHour + i),
    [startHour, endHour],
  )
  const contentHeight = Math.max(1, (endHour - startHour) * hourHeight + TIMELINE_TOP_INSET)
  const nowLine =
    nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60
      ? ((nowMinutes - startHour * 60) / 60) * hourHeight + TIMELINE_TOP_INSET
      : null

  const scrollToNow = useCallback(
    (smooth = false) => {
      const scrollEl = scrollRef.current
      if (!scrollEl) return false

      const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
      if (maxScroll <= 0) return false

      const target = computeScheduleScrollToNowTarget({
        nowLinePx: nowLine,
        nowMinutes,
        timelineStartMinutes: startHour * 60,
        timelineEndMinutes: endHour * 60,
        contentEndPx: contentHeight,
        hourHeightPx: hourHeight,
        scrollHeight: scrollEl.scrollHeight,
        clientHeight: scrollEl.clientHeight,
        currentScrollTop: scrollEl.scrollTop,
      })

      scrollEl.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' })
      return true
    },
    [nowLine, nowMinutes, startHour, endHour, hourHeight, contentHeight],
  )

  useLayoutEffect(() => {
    let attempts = 0
    const run = () => {
      if (scrollToNow(false) || attempts >= 30) return
      attempts += 1
      requestAnimationFrame(run)
    }
    run()
  }, [scrollToNow, blocks.length, contentHeight])

  useEffect(() => {
    scrollToNow(true)
  }, [nowMinutes, scrollToNow])

  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    const ro = new ResizeObserver(() => scrollToNow(false))
    ro.observe(scrollEl)
    return () => ro.disconnect()
  }, [scrollToNow])

  useStickyScheduleTitles(
    scrollRef,
    screensaver,
    `${blocks.length}:${contentHeight}:${hourHeight}:${nowMinutes}`,
  )

  return (
    <aside
      className={cn(
        'flex w-full flex-col overflow-hidden rounded-2xl border border-zinc-800/70 bg-zinc-950/40 transition-all duration-[1400ms] ease-in-out',
        screensaver && 'h-full min-h-0 border-zinc-800/50 bg-zinc-950/60',
        className,
      )}
    >
      {blocks.length === 0 ? (
        <p
          className={cn(
            'px-5 py-10 text-center leading-relaxed text-zinc-500 transition-all duration-[1400ms] ease-in-out',
            screensaver ? 'px-6 text-base' : 'text-sm',
          )}
        >
          No blocks planned for today.
        </p>
      ) : (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 scrollbar-hidden"
        >
          <div className="relative flex" style={{ height: contentHeight, minHeight: contentHeight }}>
            <div className="relative w-10 shrink-0 border-r border-zinc-800/70">
              {slotHours.map((h, i) => (
                <div
                  key={h}
                  className={cn(
                    'pointer-events-none absolute inset-x-0 border-b border-zinc-800/35 pr-1 text-right text-zinc-600',
                    screensaver ? 'text-xs' : 'text-[10px]',
                  )}
                  style={{ top: TIMELINE_TOP_INSET + i * hourHeight, height: hourHeight }}
                >
                  <ScheduleHourLabel
                    hour={h}
                    use24h={use24h}
                    position={i === 0 ? 'first' : 'default'}
                  />
                </div>
              ))}
            </div>

            <div className="relative min-w-0 flex-1">
              {slotHours.map((h, i) => (
                <div
                  key={h}
                  className="pointer-events-none absolute inset-x-0"
                  style={{ top: TIMELINE_TOP_INSET + i * hourHeight, height: hourHeight }}
                >
                  <div className="h-px w-full border-b border-zinc-800/25" />
                  <div className="absolute left-0 right-0 top-1/2 h-px border-b border-zinc-800/10 border-dashed" />
                </div>
              ))}

              {blocks.map((block) => {
                const startMin = parseTimeToMinutes(block.start_time)
                const endMin = parseTimeToMinutes(block.end_time)
                const durationMin = Math.max(1, endMin - startMin)
                const isCurrent = nowMinutes >= startMin && nowMinutes < endMin
                const isPast = nowMinutes >= endMin
                const isShort = durationMin <= 30
                const accent = isGreyBlock(block) ? GREY_BLOCK_HEX : block.color || GREY_BLOCK_HEX
                const style = minutesToStyle(startMin, endMin, startHour, hourHeight)

                const fill = `color-mix(in srgb, ${accent} 12%, rgb(9 9 11))`

                return (
                  <div
                    key={block.id}
                    data-schedule-block={screensaver ? '' : undefined}
                    className={cn(
                      'absolute left-0 right-1 flex flex-col overflow-hidden rounded-lg border-2 bg-zinc-950/70 px-2 py-1 shadow-md',
                      isPast && 'opacity-40',
                      screensaver && 'px-0 py-0',
                    )}
                    style={{
                      ...style,
                      borderColor: `color-mix(in srgb, ${accent} 55%, transparent)`,
                      backgroundColor: fill,
                      boxShadow: isCurrent ? '0 0 0 1px rgba(255,255,255,0.06)' : undefined,
                    }}
                  >
                    <div
                      data-sticky-block-title={screensaver ? '' : undefined}
                      className={cn(
                        'min-w-0',
                        screensaver
                          ? 'relative z-[12] w-full shrink-0 px-3 py-2 will-change-transform data-[stuck=true]:shadow-[0_12px_18px_-10px_rgba(0,0,0,0.65)]'
                          : isShort
                            ? 'pt-0.5'
                            : 'pt-1',
                      )}
                      style={screensaver ? { backgroundColor: fill } : undefined}
                    >
                      <p
                        className={cn(
                          'truncate font-bold leading-tight',
                          screensaver ? 'text-sm' : 'text-xs',
                          isCurrent ? 'text-zinc-50' : 'text-zinc-200',
                        )}
                      >
                        {block.title}
                      </p>
                      {!isShort && (
                        <p
                          className={cn(
                            'mt-0.5 tabular-nums text-zinc-400',
                            screensaver ? 'text-xs' : 'text-[10px]',
                          )}
                        >
                          {labelForTime(block.start_time, formatTime)}
                          <span className="mx-1 text-zinc-600">–</span>
                          {labelForTime(block.end_time, formatTime)}
                          {isCurrent && (
                            <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-[var(--accent-400)]">
                              Now
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}

              {nowLine != null && (
                <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowLine }}>
                  <div className="relative h-0 w-0 overflow-visible">
                    <div className="h-2 w-2 -translate-x-[0.42rem] -translate-y-1/2 rounded-full bg-[var(--accent-500)] shadow-[0_0_0_2px_rgb(10_10_15)]" />
                  </div>
                  <div className="h-0.5 min-w-0 flex-1 bg-[var(--accent-500)]" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
