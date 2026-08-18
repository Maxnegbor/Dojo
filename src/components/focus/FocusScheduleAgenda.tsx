import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ScheduleBlock } from '@/types'
import { GREY_BLOCK_HEX } from '@/types'
import { useSettings } from '@/context/SettingsContext'
import { fetchScheduleBlocksForDate, isGreyBlock } from '@/lib/scheduleBlock'
import { parseTimeToMinutes, cn, formatDate } from '@/lib/utils'

interface FocusScheduleAgendaProps {
  userId: string
  formatTime: (date: Date) => string
  className?: string
}

const HOUR_HEIGHT = 72
const TIMELINE_TOP_INSET = 18

function labelForTime(hhmm: string, formatTime: (date: Date) => string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  const date = new Date()
  date.setHours(h, m, 0, 0)
  return formatTime(date)
}

function formatScheduleHour(hour: number, formatTime: (date: Date) => string): string {
  if (hour === 24) return formatTime(new Date(2000, 0, 1, 0, 0))
  return formatTime(new Date(2000, 0, 1, hour, 0))
}

function minutesToStyle(
  startMin: number,
  endMin: number,
  timelineStartHour: number,
): { top: number; height: number } {
  const start = startMin - timelineStartHour * 60
  const end = endMin - timelineStartHour * 60
  return {
    top: (start / 60) * HOUR_HEIGHT + TIMELINE_TOP_INSET,
    height: Math.max(((end - start) / 60) * HOUR_HEIGHT, 28),
  }
}

export function FocusScheduleAgenda({
  userId,
  formatTime,
  className,
}: FocusScheduleAgendaProps) {
  const { settings } = useSettings()
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

  const startHour = settings.timelineStartHour
  const endHour = settings.timelineEndHour
  const slotHours = useMemo(
    () => Array.from({ length: Math.max(0, endHour - startHour) }, (_, i) => startHour + i),
    [startHour, endHour],
  )
  const contentHeight = Math.max(1, (endHour - startHour) * HOUR_HEIGHT + TIMELINE_TOP_INSET)
  const nowLine =
    nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60
      ? ((nowMinutes - startHour * 60) / 60) * HOUR_HEIGHT + TIMELINE_TOP_INSET
      : null

  return (
    <aside
      className={cn(
        'flex w-full flex-col overflow-hidden rounded-2xl border border-zinc-800/70 bg-zinc-950/40',
        className,
      )}
    >
      <div className="shrink-0 border-b border-zinc-800/70 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Schedule</h2>
      </div>

      {blocks.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm leading-relaxed text-zinc-500">
          No blocks planned for today.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 scrollbar-hidden">
          <div className="relative flex" style={{ height: contentHeight, minHeight: contentHeight }}>
            <div className="relative w-10 shrink-0 border-r border-zinc-800/70">
              {slotHours.map((h, i) => (
                <div
                  key={h}
                  className="pointer-events-none absolute inset-x-0 border-b border-zinc-800/35 pr-1 text-right text-[10px] text-zinc-600"
                  style={{ top: TIMELINE_TOP_INSET + i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                >
                  <span className={cn('block', i === 0 ? 'relative top-0.5' : 'relative -top-2')}>
                    {formatScheduleHour(h, formatTime)}
                  </span>
                </div>
              ))}
            </div>

            <div className="relative min-w-0 flex-1">
              {slotHours.map((h, i) => (
                <div
                  key={h}
                  className="pointer-events-none absolute inset-x-0"
                  style={{ top: TIMELINE_TOP_INSET + i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
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
                const style = minutesToStyle(startMin, endMin, startHour)

                return (
                  <div
                    key={block.id}
                    className={cn(
                      'absolute left-0 right-1 flex overflow-hidden rounded-lg border-2 bg-zinc-950/70 px-2 py-1 shadow-md',
                      isPast && 'opacity-40',
                    )}
                    style={{
                      ...style,
                      borderColor: `color-mix(in srgb, ${accent} 55%, transparent)`,
                      backgroundColor: `color-mix(in srgb, ${accent} 12%, rgb(9 9 11))`,
                      boxShadow: isCurrent ? '0 0 0 1px rgba(255,255,255,0.06)' : undefined,
                    }}
                  >
                    <div className={cn('min-w-0 flex-1', isShort ? 'pt-0.5' : 'pt-1')}>
                      <p className={cn('truncate text-xs font-medium leading-tight', isCurrent ? 'text-zinc-50' : 'text-zinc-200')}>
                        {block.title}
                      </p>
                      {!isShort && (
                        <p className="mt-0.5 text-[10px] tabular-nums text-zinc-400">
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
