import { useMemo, useState } from 'react'
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  startOfMonth,
} from 'date-fns'
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { isMandatoryLogComplete } from '@/lib/dailyLog'
import { getDraft } from '@/lib/dailyLogDraft'
import type { DailyLog } from '@/types'
import { useSettings } from '@/context/SettingsContext'
import { cn, formatDate, formatDuration, getMonthStartPad, getWeekdayLabels } from '@/lib/utils'

interface MonthCalendarModalProps {
  month: Date
  logs: DailyLog[]
  onClose: () => void
  onSelectDate: (date: string) => void
}

export function MonthCalendarModal({
  month: initialMonth,
  logs,
  onClose,
  onSelectDate,
}: MonthCalendarModalProps) {
  const { settings } = useSettings()
  const [month, setMonth] = useState(initialMonth)
  const today = formatDate(new Date())

  const days = useMemo(() => {
    const start = startOfMonth(month)
    const end = endOfMonth(month)
    return eachDayOfInterval({ start, end })
  }, [month])

  const logMap = useMemo(() => new Map(logs.map((l) => [l.date, l])), [logs])

  const getDayStatus = (dateStr: string) => {
    const log = logMap.get(dateStr)
    const draft = getDraft(dateStr)
    const merged = log && draft ? { ...log, ...draft } : log
    if (!merged) return dateStr < today ? 'incomplete' : 'empty'
    if (isMandatoryLogComplete(merged)) return 'complete'
    return dateStr < today ? 'incomplete' : 'partial'
  }

  const startPad = getMonthStartPad(month, settings.weekStartsOn)
  const weekdayLabels = getWeekdayLabels(settings.weekStartsOn)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-zinc-100">{format(month, 'MMMM yyyy')}</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800"
            >
              <ChevronRight size={16} />
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="mb-1 grid grid-cols-7 text-center text-[10px] text-zinc-500">
          {weekdayLabels.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {days.map((day) => {
            const dateStr = formatDate(day)
            const status = getDayStatus(dateStr)
            const log = logMap.get(dateStr)
            const focus = log?.focus_minutes ?? 0
            const inMonth = isSameMonth(day, month)

            return (
              <button
                key={dateStr}
                onClick={() => {
                  onSelectDate(dateStr)
                  onClose()
                }}
                className={cn(
                  'flex min-h-[52px] flex-col items-center rounded-lg border p-1 text-[10px] transition-colors hover:bg-zinc-800/80',
                  dateStr === today && 'border-indigo-500/50 bg-indigo-950/20',
                  !inMonth && 'opacity-40',
                  status === 'complete' && 'border-emerald-900/40',
                  status === 'incomplete' && 'border-red-900/40',
                )}
              >
                <span className="font-medium text-zinc-300">{format(day, 'd')}</span>
                {focus > 0 && (
                  <span className="text-[9px] text-indigo-400">{formatDuration(focus)}</span>
                )}
                {status === 'complete' && (
                  <Check size={10} className="text-emerald-400" />
                )}
                {status === 'incomplete' && (
                  <span className="text-[11px] font-bold text-red-400">✕</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <Check size={10} className="text-emerald-400" /> Logged
          </span>
          <span className="flex items-center gap-1">
            <span className="text-red-400">✕</span> Incomplete
          </span>
          <span className="text-indigo-400">Focus minutes shown</span>
        </div>
      </div>
    </div>
  )
}
