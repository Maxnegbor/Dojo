import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { DayRhythmStrip } from '@/components/pulse/DayRhythmStrip'
import { HabitConstellation } from '@/components/pulse/HabitConstellation'
import { PulseEchoes } from '@/components/pulse/PulseEchoes'
import { PulseHero } from '@/components/pulse/PulseHero'
import { PulseWaveform } from '@/components/pulse/PulseWaveform'
import { useSettings } from '@/context/SettingsContext'
import { useAuth, useDailyLog } from '@/hooks/useData'
import { localStore } from '@/lib/localStore'
import {
  buildHabitConstellation,
  computePulseSeries,
  computeWeekdayRhythm,
  generatePulseInsights,
  pulseLoadRange,
} from '@/lib/pulse'
import { isSupabaseConfigured } from '@/lib/supabase'
import { formatDate, getWeekDates } from '@/lib/utils'
import type { DailyLog, Goal, Workout } from '@/types'

export function PulsePage() {
  const today = formatDate(new Date())
  const { userId } = useAuth()
  const { settings } = useSettings()
  const { log: todayLog } = useDailyLog(today)
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])

  const load = useCallback(async () => {
    if (!userId) return
    const { start, end } = pulseLoadRange(today)

    if (isSupabaseConfigured) {
      const { fetchGoals, fetchDailyLogs, fetchWorkouts } = await import('@/lib/supabase')
      const [g, l, w] = await Promise.all([
        fetchGoals(userId),
        fetchDailyLogs(userId, start, end),
        fetchWorkouts(userId, start, end),
      ])
      setGoals(g)
      setLogs(l)
      setWorkouts(w)
    } else {
      setGoals(localStore.getGoals())
      setLogs(localStore.getDailyLogs(start, end))
      setWorkouts(localStore.getWorkouts(start, end))
    }
  }, [userId, today])

  useEffect(() => {
    void load()
  }, [load])

  const dateRange = useMemo(() => {
    const dates: string[] = []
    const { start } = pulseLoadRange(today)
    let cursor = parseISO(start + 'T12:00:00')
    const end = parseISO(today + 'T12:00:00')
    while (cursor <= end) {
      dates.push(formatDate(cursor))
      cursor = addDays(cursor, 1)
    }
    return dates
  }, [today])

  const series = useMemo(
    () =>
      computePulseSeries(
        dateRange,
        logs,
        goals,
        workouts,
        today,
        todayLog,
        settings.weekStartsOn,
      ),
    [dateRange, logs, goals, workouts, today, todayLog, settings.weekStartsOn],
  )

  const todayPulse = useMemo(
    () => series.find((d) => d.date === today) ?? { date: today, score: 0, habitRate: 0, focusRate: 0, metricRate: 0 },
    [series, today],
  )

  const weekDates = useMemo(
    () => getWeekDates(parseISO(today + 'T12:00:00'), settings.weekStartsOn),
    [today, settings.weekStartsOn],
  )

  const stars = useMemo(
    () => buildHabitConstellation(logs, weekDates, today, todayLog),
    [logs, weekDates, today, todayLog],
  )

  const weekdayRhythm = useMemo(
    () => computeWeekdayRhythm(series, settings.weekStartsOn),
    [series, settings.weekStartsOn],
  )

  const insights = useMemo(
    () => generatePulseInsights(series, logs, goals, workouts, today, todayLog),
    [series, logs, goals, workouts, today, todayLog],
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--accent-400)]">
          Pulse
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-50">Your rhythm</h1>
        <p className="max-w-lg text-sm text-zinc-500">
          Not charts — a living read on how aligned your days feel. Built from habits, focus, and
          the metrics you track.
        </p>
        <p className="text-[10px] text-zinc-600">{format(new Date(), 'EEEE, MMMM d')}</p>
      </header>

      <PulseHero
        score={todayPulse.score}
        habitRate={todayPulse.habitRate}
        focusRate={todayPulse.focusRate}
        metricRate={todayPulse.metricRate}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <PulseWaveform series={series} today={today} />
        <DayRhythmStrip rhythm={weekdayRhythm} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <HabitConstellation stars={stars} />
        <PulseEchoes insights={insights} />
      </div>
    </div>
  )
}
