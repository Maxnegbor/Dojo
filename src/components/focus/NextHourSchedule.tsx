import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useSettings } from '@/context/SettingsContext'
import { useAuth } from '@/hooks/useData'
import { localStore } from '@/lib/localStore'
import { normalizeScheduleBlock } from '@/lib/scheduleBlock'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { ScheduleBlock } from '@/types'
import { cn, formatDate, parseTimeToMinutes } from '@/lib/utils'

interface WindowBlock extends ScheduleBlock {
  offsetStart: number
  offsetEnd: number
}

function blocksInNextHour(blocks: ScheduleBlock[], now: Date): WindowBlock[] {
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const windowEnd = nowMins + 60

  return blocks
    .filter((b) => {
      const start = parseTimeToMinutes(b.start_time.slice(0, 5))
      const end = parseTimeToMinutes(b.end_time.slice(0, 5))
      return start < windowEnd && end > nowMins
    })
    .map((b) => {
      const start = parseTimeToMinutes(b.start_time.slice(0, 5))
      const end = parseTimeToMinutes(b.end_time.slice(0, 5))
      return {
        ...b,
        offsetStart: Math.max(0, start - nowMins),
        offsetEnd: Math.min(60, end - nowMins),
      }
    })
    .sort((a, b) => a.offsetStart - b.offsetStart)
}

function formatBlockTime(time: string, formatTime: (date: Date) => string) {
  const [h, m] = time.slice(0, 5).split(':').map(Number)
  return formatTime(new Date(2000, 0, 1, h, m))
}

export function NextHourSchedule() {
  const { userId } = useAuth()
  const { formatTime } = useSettings()
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!userId) return
    const today = formatDate(new Date())

    async function load() {
      if (isSupabaseConfigured) {
        const { fetchScheduleBlocks } = await import('@/lib/supabase')
        setBlocks((await fetchScheduleBlocks(userId!, today)).map(normalizeScheduleBlock))
      } else {
        setBlocks(localStore.getScheduleBlocks(today).map(normalizeScheduleBlock))
      }
    }

    load()
    const refresh = window.setInterval(load, 60_000)
    return () => clearInterval(refresh)
  }, [userId])

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(tick)
  }, [])

  const upcoming = useMemo(() => blocksInNextHour(blocks, now), [blocks, now])
  const windowLabel = `${formatTime(now)} – ${formatTime(new Date(now.getTime() + 60 * 60_000))}`

  return (
    <Card
      title="Next hour"
      action={
        <Link
          to="/"
          className="flex items-center gap-1 text-[10px] text-zinc-500 transition-colors hover:text-[var(--accent-400)]"
        >
          <CalendarClock size={12} />
          Today
        </Link>
      }
    >
      <p className="mb-2 text-[10px] text-zinc-500">{windowLabel}</p>

      <div className="relative h-10 overflow-hidden rounded-lg bg-zinc-800/60">
        {upcoming.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-zinc-600">
            Nothing scheduled
          </div>
        ) : (
          upcoming.map((block) => {
            const left = (block.offsetStart / 60) * 100
            const width = ((block.offsetEnd - block.offsetStart) / 60) * 100
            return (
              <div
                key={block.id}
                title={`${block.title} (${formatBlockTime(block.start_time, formatTime)}–${formatBlockTime(block.end_time, formatTime)})`}
                className="absolute top-1 bottom-1 overflow-hidden rounded-md border border-white/10 px-1.5"
                style={{
                  left: `${left}%`,
                  width: `${Math.max(width, 4)}%`,
                  backgroundColor: `${block.color}55`,
                  borderLeftColor: block.color,
                  borderLeftWidth: 2,
                }}
              >
                <span className="block truncate text-[10px] font-medium text-zinc-100">
                  {block.title}
                </span>
              </div>
            )
          })
        )}
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
          style={{ left: 0 }}
        />
      </div>

      {upcoming.length > 0 && (
        <ul className="mt-2 space-y-1">
          {upcoming.map((block) => (
            <li
              key={block.id}
              className={cn('flex items-center gap-2 text-[11px] text-zinc-400')}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: block.color }}
              />
              <span className="truncate text-zinc-300">{block.title}</span>
              <span className="ml-auto shrink-0 tabular-nums text-zinc-600">
                {formatBlockTime(block.start_time, formatTime)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
