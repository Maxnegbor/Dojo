import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  startOfMonth,
} from 'date-fns'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { mergeLogWithDraftForDate } from '@/lib/dailyLogDraft'
import { getDailyLogHabitTypes } from '@/lib/habitTypes'
import { HABITIFY_JOURNAL_CHANGED } from '@/lib/habitifyStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import { computeDayPulse, pulseCalendarCellVisuals } from '@/lib/pulse'
import { getPulseFormulaForDate } from '@/lib/pulseConfig'
import { usePulseConfig } from '@/hooks/usePulseConfig'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { useDailyLogDraftRevision } from '@/hooks/useDailyLogDraftRevision'
import type { DailyLog, Goal, Workout } from '@/types'
import { useSettings } from '@/context/SettingsContext'
import { cn, formatDate, getMonthStartPad, getWeekdayLabels } from '@/lib/utils'

interface MonthCalendarModalProps {
  month: Date
  goals: Goal[]
  userId: string
  todayLog: DailyLog | null
  todayWorkouts: Workout[]
  onClose: () => void
  onSelectDate: (date: string) => void
}

export function MonthCalendarModal({
  month: initialMonth,
  goals,
  userId,
  todayLog,
  todayWorkouts,
  onClose,
  onSelectDate,
}: MonthCalendarModalProps) {
  const { settings } = useSettings()
  const { config: pulseConfig } = usePulseConfig()
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()
  const [month, setMonth] = useState(initialMonth)
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const today = formatDate(new Date())
  const draftRevision = useDailyLogDraftRevision(today)
  const [habitifyRevision, setHabitifyRevision] = useState(0)

  useEffect(() => {
    const bump = () => setHabitifyRevision((n) => n + 1)
    window.addEventListener(HABITIFY_JOURNAL_CHANGED, bump)
    return () => window.removeEventListener(HABITIFY_JOURNAL_CHANGED, bump)
  }, [])

  const days = useMemo(() => {
    const start = startOfMonth(month)
    const end = endOfMonth(month)
    return eachDayOfInterval({ start, end })
  }, [month])

  const loadMonthData = useCallback(async () => {
    setLoading(true)
    const monthStart = formatDate(startOfMonth(month))
    const monthEnd = formatDate(endOfMonth(month))
    try {
      if (isSupabaseConfigured) {
        const { fetchDailyLogs, fetchWorkouts } = await import('@/lib/supabase')
        const [nextLogs, nextWorkouts] = await Promise.all([
          fetchDailyLogs(userId, monthStart, monthEnd),
          fetchWorkouts(userId, monthStart, monthEnd),
        ])
        setLogs(nextLogs)
        setWorkouts(nextWorkouts)
      } else {
        setLogs(localStore.getDailyLogs(monthStart, monthEnd))
        setWorkouts(localStore.getWorkouts(monthStart, monthEnd))
      }
    } finally {
      setLoading(false)
    }
  }, [month, userId])

  useEffect(() => {
    void loadMonthData()
  }, [loadMonthData])

  const logMap = useMemo(() => new Map(logs.map((l) => [l.date, l])), [logs])

  const workoutsByDate = useMemo(() => {
    const map = new Map<string, Workout[]>()
    for (const workout of workouts) {
      const list = map.get(workout.date) ?? []
      list.push(workout)
      map.set(workout.date, list)
    }
    if (todayLog) {
      const todayList = todayWorkouts.filter((w) => w.date === today)
      if (todayList.length > 0) map.set(today, todayList)
    }
    return map
  }, [workouts, today, todayLog, todayWorkouts])

  const pulseByDate = useMemo(() => {
    const habits = getDailyLogHabitTypes()
    const map = new Map<string, number>()
    for (const day of days) {
      const dateStr = formatDate(day)
      const formula = getPulseFormulaForDate(pulseConfig, dateStr)
      const log =
        dateStr === today && todayLog
          ? mergeLogWithDraftForDate(todayLog, today, todayWorkouts)
          : logMap.get(dateStr)
      const dayWorkouts = workoutsByDate.get(dateStr) ?? []
      const pulse = computeDayPulse(
        dateStr,
        log,
        habits,
        goals,
        dayWorkouts,
        formula,
        sleepMetricsConfig,
      )
      map.set(dateStr, pulse.score)
    }
    return map
  }, [
    days,
    pulseConfig,
    sleepMetricsConfig,
    goals,
    logMap,
    workoutsByDate,
    today,
    todayLog,
    todayWorkouts,
    draftRevision,
    habitifyRevision,
  ])

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

        <div className={cn('grid grid-cols-7 gap-1', loading && 'opacity-60')}>
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {days.map((day) => {
            const dateStr = formatDate(day)
            const score = pulseByDate.get(dateStr) ?? 0
            const { ringStyle, scoreColor } = pulseCalendarCellVisuals(score)
            const inMonth = isSameMonth(day, month)
            const isFuture = dateStr > today
            const isToday = dateStr === today

            return (
              <button
                key={dateStr}
                onClick={() => {
                  onSelectDate(dateStr)
                  onClose()
                }}
                className={cn(
                  'relative flex min-h-[52px] flex-col items-center justify-center rounded-lg p-1 text-[10px] transition-colors hover:bg-zinc-800/80',
                  isToday && 'bg-indigo-950/25',
                  !inMonth && 'opacity-40',
                )}
              >
                <div
                  className="pointer-events-none absolute h-9 w-9 rounded-full border border-solid"
                  style={ringStyle}
                />
                <span className="relative z-10 font-medium text-zinc-300">{format(day, 'd')}</span>
                {!isFuture && (
                  <span
                    className="relative z-10 text-[9px] font-medium tabular-nums"
                    style={{ color: scoreColor }}
                  >
                    {score}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
