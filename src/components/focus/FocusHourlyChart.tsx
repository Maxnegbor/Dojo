import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  getDevDummyRollingFocusHours,
  getRollingFocusHours,
  withLiveFocusSession,
} from '@/lib/focusHourly'
import { FOCUS_SESSIONS_CHANGED } from '@/lib/focusSessions'
import { localStore } from '@/lib/localStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { addDaysToDateString, cn, formatDate, formatDuration, parseLocalDate } from '@/lib/utils'
import type { DailyLog } from '@/types'

type FocusChartRange = '12h' | '7d' | '30d' | '1y'

const RANGE_OPTIONS: { id: FocusChartRange; label: string }[] = [
  { id: '12h', label: 'Last 12 hours' },
  { id: '7d', label: 'Past 7 days' },
  { id: '30d', label: 'Past month' },
  { id: '1y', label: 'Past year' },
]

interface FocusChartPoint {
  key: string
  label: string
  tooltip: string
  minutes: number
}

interface FocusHourlyChartProps {
  userId?: string | null
  formatHour: (date: Date) => string
  liveSession?: { startMs: number; endMs: number } | null
  useDevDummy?: boolean
  className?: string
}

function hourTick(date: Date): string {
  const hour = date.getHours() % 12
  return String(hour === 0 ? 12 : hour)
}

function dayLabel(dateStr: string, compact: boolean): string {
  const date = parseLocalDate(dateStr)
  if (!compact) {
    return date.toLocaleDateString(undefined, { weekday: 'short' })
  }
  if (date.getDate() === 1) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return String(date.getDate())
}

function dayTooltip(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function recentDates(count: number, today = formatDate(new Date())): string[] {
  return Array.from({ length: count }, (_, index) => addDaysToDateString(today, index - (count - 1)))
}

function recentMonths(today = formatDate(new Date())): { key: string; label: string; name: string }[] {
  const anchor = parseLocalDate(today)
  const months: { key: string; label: string; name: string }[] = []
  for (let i = 11; i >= 0; i--) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    months.push({
      key,
      label: date.toLocaleDateString(undefined, { month: 'short' }),
      name: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    })
  }
  return months
}

function dummyMinutes(index: number, count: number): number {
  const wave = Math.sin((index / Math.max(1, count - 1)) * Math.PI)
  return Math.round(wave * 70 + (index % 4) * 8)
}

async function loadDailyLogs(userId: string, start: string, end: string): Promise<DailyLog[]> {
  if (isSupabaseConfigured) {
    const { fetchDailyLogs } = await import('@/lib/supabase')
    return fetchDailyLogs(userId, start, end)
  }
  localStore.setUserId(userId)
  return localStore.getDailyLogs(start, end)
}

function minutesByDate(logs: DailyLog[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const log of logs) {
    map.set(log.date, log.focus_minutes ?? 0)
  }
  return map
}

function liveMinutes(session: { startMs: number; endMs: number } | null | undefined): number {
  if (!session || session.endMs <= session.startMs) return 0
  return (session.endMs - session.startMs) / 60000
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: FocusChartPoint }>
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="rounded-md border border-zinc-700/80 bg-zinc-950 px-2 py-1 text-[10px] font-medium text-zinc-100 shadow-lg">
      {point.tooltip} · {formatDuration(point.minutes)}
    </div>
  )
}

export function FocusHourlyChart({
  userId,
  formatHour,
  liveSession,
  useDevDummy = false,
  className,
}: FocusHourlyChartProps) {
  const [range, setRange] = useState<FocusChartRange>('12h')
  const [dailyMinutes, setDailyMinutes] = useState<Map<string, number>>(() => new Map())
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1)
    window.addEventListener(FOCUS_SESSIONS_CHANGED, refresh)
    window.addEventListener('user-storage-ready', refresh)
    return () => {
      window.removeEventListener(FOCUS_SESSIONS_CHANGED, refresh)
      window.removeEventListener('user-storage-ready', refresh)
    }
  }, [])

  useEffect(() => {
    if (range === '12h' || useDevDummy || !userId) {
      setDailyMinutes(new Map())
      return
    }

    const today = formatDate(new Date())
    const start =
      range === '1y'
        ? `${recentMonths(today)[0]?.key ?? today.slice(0, 7)}-01`
        : recentDates(range === '7d' ? 7 : 30, today)[0] ?? today

    let cancelled = false
    void loadDailyLogs(userId, start, today)
      .then((logs) => {
        if (!cancelled) setDailyMinutes(minutesByDate(logs))
      })
      .catch(() => {
        if (!cancelled) setDailyMinutes(new Map())
      })

    return () => {
      cancelled = true
    }
  }, [range, userId, useDevDummy, refreshKey])

  const points = useMemo(() => {
    const now = new Date()
    const today = formatDate(now)
    const inProgress = useDevDummy ? 0 : liveMinutes(liveSession)

    if (range === '12h') {
      const base = useDevDummy ? getDevDummyRollingFocusHours(now) : getRollingFocusHours(now)
      const buckets = useDevDummy ? base : withLiveFocusSession(base, liveSession ?? null)
      return buckets.map((bucket) => ({
        key: bucket.hourStart.toISOString(),
        label: hourTick(bucket.hourStart),
        tooltip: formatHour(bucket.hourStart),
        minutes: bucket.minutes,
      }))
    }

    if (range === '1y') {
      const months = recentMonths(today)
      return months.map((month, index) => {
        let minutes = 0
        if (useDevDummy) {
          minutes = dummyMinutes(index, months.length) * 8
        } else {
          for (const [date, value] of dailyMinutes) {
            if (date.startsWith(month.key)) minutes += value
          }
          if (today.startsWith(month.key)) minutes += inProgress
        }
        return {
          key: month.key,
          label: month.label,
          tooltip: month.name,
          minutes,
        }
      })
    }

    const count = range === '7d' ? 7 : 30
    return recentDates(count, today).map((date, index) => ({
      key: date,
      label: dayLabel(date, count > 7),
      tooltip: dayTooltip(date),
      minutes: useDevDummy
        ? dummyMinutes(index, count)
        : (dailyMinutes.get(date) ?? 0) + (date === today ? inProgress : 0),
    }))
  }, [range, dailyMinutes, liveSession, useDevDummy, formatHour])

  const tickInterval = range === '30d' ? 4 : 0

  return (
    <div className={cn('w-full', className)}>
      <div className="relative mb-3 inline-flex items-center">
        <select
          value={range}
          onChange={(event) => setRange(event.target.value as FocusChartRange)}
          aria-label="Focus chart range"
          className="appearance-none bg-transparent pr-6 text-sm font-semibold text-zinc-200 outline-none"
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id} className="bg-zinc-950 text-zinc-100">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          aria-hidden
          className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-zinc-500"
        />
      </div>

      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="focus-chart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-500)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--accent-500)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fill: '#52525b', fontSize: 9 }}
              tickLine={false}
              axisLine={{ stroke: '#3f3f46' }}
              interval={tickInterval}
              minTickGap={4}
            />
            <YAxis hide domain={[0, (dataMax: number) => (dataMax > 0 ? dataMax * 1.12 : 1)]} />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: '#3f3f46', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="minutes"
              stroke="var(--accent-500)"
              strokeWidth={2}
              fill="url(#focus-chart-fill)"
              dot={{ r: range === '30d' ? 0 : 2.5, fill: 'var(--accent-500)', strokeWidth: 0 }}
              activeDot={{ r: 4, fill: 'var(--accent-400)', strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
