import { useMemo, useState } from 'react'
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  startOfMonth,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useSettings } from '@/context/SettingsContext'
import { cn, formatDate, formatDuration, getMonthStartPad, getWeekdayLabels } from '@/lib/utils'
import type { DailyLog } from '@/types'

interface MonthlyFocusCalendarProps {
  logs: DailyLog[]
  /** When set, calendar follows overview navigation instead of its own month picker. */
  viewMonth?: Date
  compact?: boolean
}

function focusHeatBackground(intensity: number): string {
  if (intensity <= 0) return 'rgb(39 39 42)'
  const mix = Math.round(18 + intensity * 82)
  return `color-mix(in srgb, var(--accent-500) ${mix}%, rgb(39 39 42))`
}

export function MonthlyFocusCalendar({ logs, viewMonth, compact = false }: MonthlyFocusCalendarProps) {
  const { settings } = useSettings()
  const [internalMonth, setInternalMonth] = useState(() => startOfMonth(new Date()))
  const month = viewMonth ? startOfMonth(viewMonth) : internalMonth
  const today = formatDate(new Date())

  const days = useMemo(() => {
    const start = startOfMonth(month)
    const end = endOfMonth(month)
    return eachDayOfInterval({ start, end })
  }, [month])

  const logMap = useMemo(() => new Map(logs.map((l) => [l.date, l])), [logs])

  const monthStats = useMemo(() => {
    let totalMinutes = 0
    let daysFocused = 0
    let maxMinutes = 0

    for (const day of days) {
      const dateStr = formatDate(day)
      const focus = logMap.get(dateStr)?.focus_minutes ?? 0
      if (focus > 0) {
        daysFocused++
        totalMinutes += focus
        maxMinutes = Math.max(maxMinutes, focus)
      }
    }

    const isCurrentMonth = isSameMonth(month, new Date())
    const daysInPeriod = isCurrentMonth ? new Date().getDate() : days.length

    return {
      totalMinutes,
      daysFocused,
      daysInPeriod,
      maxMinutes,
      avgMinutes: daysFocused > 0 ? totalMinutes / daysFocused : 0,
    }
  }, [days, logMap, month])

  const startPad = getMonthStartPad(month, settings.weekStartsOn)
  const weekdayLabels = getWeekdayLabels(settings.weekStartsOn)

  return (
    <Card className={cn(compact ? 'w-full border-0 bg-transparent p-0 shadow-none' : 'p-4')}>
      {!compact && (
        <div className="mb-3 flex items-center justify-between">
          {!viewMonth ? (
            <button
              type="button"
              onClick={() => setInternalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
          ) : (
            <span className="w-8" />
          )}
          <h4 className="text-sm font-semibold text-zinc-100">{format(month, 'MMMM yyyy')}</h4>
          {!viewMonth ? (
            <button
              type="button"
              onClick={() => setInternalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          ) : (
            <span className="w-8" />
          )}
        </div>
      )}

      <div className="w-full">
        <div className={cn('grid grid-cols-7 text-center text-zinc-500', compact ? 'mb-1 text-[9px]' : 'mb-1 text-[10px]')}>
          {weekdayLabels.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <div className={cn('grid grid-cols-7', compact ? 'gap-1' : 'gap-1')}>
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-${i}`} className={compact ? 'aspect-square' : undefined} />
          ))}
          {days.map((day) => {
            const dateStr = formatDate(day)
            const focus = logMap.get(dateStr)?.focus_minutes ?? 0
            const intensity =
              focus > 0 && monthStats.maxMinutes > 0 ? focus / monthStats.maxMinutes : 0
            const isToday = dateStr === today

            return (
              <div
                key={dateStr}
                title={focus > 0 ? `${format(day, 'MMM d')}: ${formatDuration(focus)}` : undefined}
                className={cn(
                  'flex aspect-square w-full items-center justify-center rounded-md border border-transparent text-[10px] font-medium tabular-nums',
                  focus > 0 ? 'text-zinc-100' : 'text-zinc-500',
                  isToday && 'ring-1 ring-[var(--accent-500)] ring-offset-1 ring-offset-zinc-900',
                )}
                style={{ backgroundColor: focusHeatBackground(intensity) }}
              >
                {format(day, 'd')}
              </div>
            )
          })}
        </div>
      </div>

      {!compact && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-[var(--accent-950)] px-2 py-2.5 text-center">
            <p className="text-[10px] text-zinc-500">Days Focused</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--accent-300)]">
              {monthStats.daysFocused} of {monthStats.daysInPeriod}
            </p>
          </div>
          <div className="rounded-lg bg-[var(--accent-950)] px-2 py-2.5 text-center">
            <p className="text-[10px] text-zinc-500">Avg Focus Day</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--accent-300)]">
              {monthStats.daysFocused > 0 ? formatDuration(Math.round(monthStats.avgMinutes)) : '—'}
            </p>
          </div>
          <div className="rounded-lg bg-[var(--accent-950)] px-2 py-2.5 text-center">
            <p className="text-[10px] text-zinc-500">Month total</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--accent-300)]">
              {monthStats.totalMinutes > 0 ? formatDuration(monthStats.totalMinutes) : '—'}
            </p>
          </div>
        </div>
      )}
    </Card>
  )
}
