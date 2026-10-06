import { useCallback, useEffect, useState } from 'react'
import type { ScheduleBlock } from '@/types'
import { useSettings } from '@/context/SettingsContext'
import { fetchScheduleBlocksForDate, isGreyBlock } from '@/lib/scheduleBlock'
import { ScheduleHourLabel } from '@/components/schedule/ScheduleHourLabel'
import { parseTimeToMinutes, cn, formatDate } from '@/lib/utils'

interface FocusScheduleAgendaProps {
  userId: string
  formatTime: (date: Date) => string
  className?: string
  screensaver?: boolean
  horizontal?: boolean
}

const HOUR_HEIGHT = 72
const TIMELINE_TOP_INSET = 18
const SCREENSAVER_HOUR_HEIGHT = 96
const WINDOW_MINUTES = 120
const PAST_MINUTES = 60
const EDGE_FADE = 'linear-gradient(to bottom, transparent, #000 2.25rem, #000 calc(100% - 2.25rem), transparent)'

function labelForTime(hhmm: string, formatTime: (date: Date) => string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  const date = new Date()
  date.setHours(h, m, 0, 0)
  return formatTime(date)
}

export function FocusScheduleAgenda({
  userId,
  formatTime,
  className,
  screensaver = false,
  horizontal = false,
}: FocusScheduleAgendaProps) {
  const { settings } = useSettings()
  const use24h = settings.timeFormat === '24h'
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })
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

  const hourHeight = screensaver ? SCREENSAVER_HOUR_HEIGHT : HOUR_HEIGHT
  const rangeStart = Math.max(0, nowMinutes - PAST_MINUTES)
  const rangeEnd = Math.min(24 * 60, nowMinutes + WINDOW_MINUTES)
  const spanMinutes = Math.max(1, rangeEnd - rangeStart)
  const contentHeight = (spanMinutes / 60) * hourHeight + TIMELINE_TOP_INSET

  const minuteTop = (minute: number) =>
    ((minute - rangeStart) / 60) * hourHeight + TIMELINE_TOP_INSET
  const nowLine = minuteTop(nowMinutes)

  const hourMarks: number[] = []
  for (let minute = Math.ceil(rangeStart / 60) * 60; minute <= rangeEnd; minute += 60) {
    hourMarks.push(minute)
  }

  const halfHourMarks: number[] = []
  for (let minute = Math.ceil((rangeStart + 1) / 30) * 30; minute < rangeEnd; minute += 30) {
    if (minute % 60 !== 0) halfHourMarks.push(minute)
  }

  const visibleBlocks = blocks.flatMap((block) => {
    const startMin = parseTimeToMinutes(block.start_time)
    const endMin = parseTimeToMinutes(block.end_time)
    const start = Math.max(startMin, rangeStart)
    const end = Math.min(endMin, rangeEnd)
    if (end <= start) return []
    return [{ block, startMin, endMin, start, end }]
  })

  if (horizontal) {
    const minuteLeft = (minute: number) => `${((minute - rangeStart) / spanMinutes) * 100}%`
    return (
      <aside aria-label="Focus screensaver schedule" className={cn('w-full px-4 sm:px-8', className)}>
        <div className="relative h-24 overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-950/70">
          {visibleBlocks.map(({ block, start, end }) => (
            <div
              key={block.id}
              data-schedule-block=""
              className="absolute top-8 bottom-3 flex min-w-0 items-center overflow-hidden rounded-md px-3"
              style={{
                left: minuteLeft(start),
                width: `calc(${((end - start) / spanMinutes) * 100}% - 2px)`,
                backgroundColor: isGreyBlock(block)
                  ? 'rgb(42 42 48)'
                  : `color-mix(in srgb, ${block.color} 24%, rgb(9 9 11))`,
              }}
              title={block.title}
            >
              <p className="truncate text-sm font-semibold text-zinc-100 sm:text-base">{block.title}</p>
            </div>
          ))}
          {halfHourMarks.map(minute => (
            <div key={minute} className="pointer-events-none absolute top-6 bottom-0 border-l border-dashed border-zinc-400/15" style={{ left: minuteLeft(minute) }} />
          ))}
          {hourMarks.map(minute => (
            <div key={minute} className="pointer-events-none absolute inset-y-0 border-l border-zinc-400/25" style={{ left: minuteLeft(minute) }}>
              <span className={cn(
                'absolute top-1 whitespace-nowrap text-xs tabular-nums text-zinc-400',
                rangeEnd - minute < 15 ? 'right-1' : 'left-2',
              )}>
                {use24h
                  ? `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:00`
                  : `${Math.floor(minute / 60) % 12 || 12}${minute < 720 || minute === 1440 ? 'am' : 'pm'}`}
              </span>
            </div>
          ))}
          <div data-focus-now="" aria-label="Now" className="pointer-events-none absolute top-6 bottom-0 z-10 w-0.5 bg-[var(--accent-500)]" style={{ left: minuteLeft(nowMinutes) }}>
            <span className="absolute top-0 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent-500)]" />
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className={cn(
        'flex w-full flex-col overflow-hidden transition-all duration-[1400ms] ease-in-out',
        screensaver && 'h-full min-h-0 rounded-2xl border border-zinc-800/50 bg-zinc-950/60',
        className,
      )}
    >
      <div className="px-3 py-3">
        <div
          className="relative flex"
          style={{
            height: contentHeight,
            maskImage: EDGE_FADE,
            WebkitMaskImage: EDGE_FADE,
          }}
        >
          <div className="relative w-10 shrink-0 border-r border-zinc-800/70">
            {hourMarks.map((minute) => (
              <div
                key={minute}
                className={cn(
                  'pointer-events-none absolute inset-x-0 pr-1 text-right text-zinc-600',
                  screensaver ? 'text-xs' : 'text-[10px]',
                )}
                style={{ top: minuteTop(minute) }}
              >
                <ScheduleHourLabel
                  hour={Math.floor(minute / 60)}
                  use24h={use24h}
                  position={minute === hourMarks[0] ? 'first' : 'default'}
                />
              </div>
            ))}
          </div>

          <div className="relative min-w-0 flex-1">
            {hourMarks.map((minute) => (
              <div
                key={minute}
                className="pointer-events-none absolute inset-x-0 h-px border-b border-zinc-800/25"
                style={{ top: minuteTop(minute) }}
              />
            ))}
            {halfHourMarks.map((minute) => (
              <div
                key={minute}
                className="pointer-events-none absolute inset-x-0 h-px border-b border-dashed border-zinc-800/10"
                style={{ top: minuteTop(minute) }}
              />
            ))}

            {visibleBlocks.map(({ block, startMin, endMin, start, end }) => {
              const durationMin = Math.max(1, endMin - startMin)
              const isShortInline = durationMin === 30
              const blockFill = isGreyBlock(block)
                ? 'rgb(42 42 48)'
                : `color-mix(in srgb, ${block.color} 24%, rgb(9 9 11))`
              const touchGap = 4
              const touchesNext = visibleBlocks.some(
                (other) => other.block.id !== block.id && other.startMin === endMin,
              )
              const touchesPrev = visibleBlocks.some(
                (other) => other.block.id !== block.id && other.endMin === startMin,
              )
              const gapBefore = touchesPrev ? touchGap / 2 : 0
              const gapAfter = touchesNext ? touchGap / 2 : 0
              const top = minuteTop(start) + gapBefore
              const height = Math.min(
                Math.max(((end - start) / 60) * hourHeight - gapBefore - gapAfter, 18),
                Math.max(18, contentHeight - top),
              )
              const startLabel = labelForTime(block.start_time, formatTime)
              const endLabel = labelForTime(block.end_time, formatTime)

              return (
                <div
                  key={block.id}
                  data-schedule-block=""
                  className={cn(
                    'absolute left-0 right-0 z-[2] flex overflow-hidden rounded-lg border shadow-md',
                    isShortInline ? 'items-center px-1.5' : 'px-2 py-1',
                  )}
                  style={{
                    top,
                    height,
                    borderColor: blockFill,
                    backgroundColor: blockFill,
                  }}
                >
                  {isShortInline ? (
                    <div className="flex w-full items-center gap-1.5">
                      <p
                        className={cn(
                          'min-w-0 truncate font-bold leading-tight text-zinc-100',
                          screensaver ? 'text-sm' : 'text-xs',
                        )}
                      >
                        {block.title}
                      </p>
                      <span
                        className="pointer-events-none shrink-0 tabular-nums text-zinc-400"
                        style={{ fontSize: '0.8em' }}
                      >
                        {startLabel}–{endLabel}
                      </span>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'truncate font-bold leading-tight text-zinc-100',
                          screensaver ? 'text-sm' : 'text-xs',
                        )}
                      >
                        {block.title}
                      </p>
                      <p
                        className="pointer-events-none tabular-nums text-zinc-400"
                        style={{ fontSize: '0.8em' }}
                      >
                        {startLabel} – {endLabel}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}

            <div
              data-focus-now=""
              className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
              style={{ top: nowLine }}
            >
              <div className="relative h-0 w-0 overflow-visible">
                <div className="h-2 w-2 -translate-x-[0.42rem] -translate-y-1/2 rounded-full bg-[var(--accent-500)] shadow-[0_0_0_2px_rgb(10_10_15)]" />
              </div>
              <div className="h-0.5 min-w-0 flex-1 bg-[var(--accent-500)]" />
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
