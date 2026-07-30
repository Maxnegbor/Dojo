import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScheduleBlock } from '@/types'
import { GREY_BLOCK_HEX } from '@/types'
import { fetchScheduleBlocksForDate, isGreyBlock } from '@/lib/scheduleBlock'
import { parseTimeToMinutes, cn, formatDate } from '@/lib/utils'

interface FocusScheduleAgendaProps {
  userId: string
  formatTime: (date: Date) => string
  className?: string
}

function labelForTime(hhmm: string, formatTime: (date: Date) => string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  const date = new Date()
  date.setHours(h, m, 0, 0)
  return formatTime(date)
}

function blockStatus(
  block: ScheduleBlock,
  nowMinutes: number,
): 'past' | 'current' | 'upcoming' {
  const start = parseTimeToMinutes(block.start_time)
  const end = parseTimeToMinutes(block.end_time)
  if (nowMinutes >= end) return 'past'
  if (nowMinutes >= start && nowMinutes < end) return 'current'
  return 'upcoming'
}

export function FocusScheduleAgenda({
  userId,
  formatTime,
  className,
}: FocusScheduleAgendaProps) {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })
  const currentRef = useRef<HTMLLIElement | null>(null)

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

  const items = useMemo(
    () =>
      blocks.map((block) => ({
        block,
        status: blockStatus(block, nowMinutes),
        accent: isGreyBlock(block) ? GREY_BLOCK_HEX : block.color || GREY_BLOCK_HEX,
      })),
    [blocks, nowMinutes],
  )

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [items])

  return (
    <aside
      className={cn(
        'flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-zinc-800/70 bg-zinc-950/40',
        className,
      )}
    >
      <div className="shrink-0 border-b border-zinc-800/70 px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          Today
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-100">Schedule</h2>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm leading-relaxed text-zinc-500">
          No blocks planned for today.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-3 scrollbar-hidden">
          {items.map(({ block, status, accent }) => {
            const isCurrent = status === 'current'
            return (
              <li
                key={block.id}
                ref={isCurrent ? currentRef : undefined}
                className={cn(
                  'rounded-xl px-3 py-3 transition-colors',
                  isCurrent && 'bg-zinc-900/90 ring-1 ring-zinc-700/80',
                  status === 'past' && 'opacity-40',
                )}
              >
                <div className="flex gap-3">
                  <span
                    className="mt-1.5 h-8 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: accent }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'truncate text-[1.05rem] font-medium leading-snug tracking-tight',
                        isCurrent ? 'text-zinc-50' : 'text-zinc-200',
                      )}
                    >
                      {block.title}
                    </p>
                    <p className="mt-1 text-sm tabular-nums text-zinc-500">
                      {labelForTime(block.start_time, formatTime)}
                      <span className="mx-1.5 text-zinc-600">–</span>
                      {labelForTime(block.end_time, formatTime)}
                      {isCurrent && (
                        <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-[var(--accent-400)]">
                          Now
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
