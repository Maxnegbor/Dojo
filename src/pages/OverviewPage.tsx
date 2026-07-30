import { useCallback, useEffect, useMemo, useState } from 'react'
import { OverviewCategoryNav } from '@/components/overview/OverviewCategoryNav'
import { MonthlyOverviewPanel } from '@/components/overview/MonthlyOverviewPanel'
import { OverviewPeriodNav } from '@/components/overview/OverviewPeriodNav'
import { OverviewPeriodTabs } from '@/components/overview/OverviewPeriodTabs'
import { WeeklyOverviewPanel } from '@/components/overview/WeeklyOverviewPanel'
import { YearlyOverviewPanel } from '@/components/overview/YearlyOverviewPanel'
import { useSettings } from '@/context/SettingsContext'
import { useAuth, useDailyLog } from '@/hooks/useData'
import { localStore } from '@/lib/localStore'
import {
  getOverviewCategories,
  type OverviewCategory,
} from '@/lib/overviewCategories'
import { METRICS_SECTIONS_CHANGED } from '@/lib/metricsSections'
import type { OverviewPeriod } from '@/lib/overviewPeriods'
import {
  formatOverviewNavLabel,
  getPeriodRange,
  isCurrentOverviewPeriod,
  overviewAsOfDate,
  overviewLoadRange,
} from '@/lib/overviewPeriods'
import { seedDemoData } from '@/lib/seedDemoData'
import { isSupabaseConfigured } from '@/lib/supabase'
import { formatDate, getWeekDates } from '@/lib/utils'
import { getPreviousWeekDates } from '@/lib/weightGoal'
import type { DailyLog, Goal, Workout } from '@/types'

export function OverviewPage() {
  const today = formatDate(new Date())
  const { log } = useDailyLog(today)
  const [period, setPeriod] = useState<OverviewPeriod>('week')
  const [periodOffset, setPeriodOffset] = useState(0)
  const [sectionsRevision, setSectionsRevision] = useState(0)
  const overviewCategories = useMemo(
    () => getOverviewCategories(),
    [sectionsRevision],
  )
  const [category, setCategory] = useState<OverviewCategory>(
    () => getOverviewCategories()[0]?.id ?? 'fitness',
  )
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const { userId } = useAuth()
  const { settings } = useSettings()

  useEffect(() => {
    const refresh = () => setSectionsRevision((n) => n + 1)
    window.addEventListener(METRICS_SECTIONS_CHANGED, refresh)
    return () => window.removeEventListener(METRICS_SECTIONS_CHANGED, refresh)
  }, [])

  useEffect(() => {
    if (overviewCategories.length === 0) return
    if (!overviewCategories.some((entry) => entry.id === category)) {
      setCategory(overviewCategories[0].id)
    }
  }, [overviewCategories, category])

  useEffect(() => {
    setPeriodOffset(0)
  }, [period])

  const asOf = useMemo(
    () => overviewAsOfDate(period, periodOffset, settings.weekStartsOn),
    [period, periodOffset, settings.weekStartsOn],
  )

  const range = useMemo(
    () => getPeriodRange(period, settings.weekStartsOn, asOf),
    [period, settings.weekStartsOn, asOf],
  )

  const isCurrent = useMemo(
    () => isCurrentOverviewPeriod(period, asOf, settings.weekStartsOn),
    [period, asOf, settings.weekStartsOn],
  )

  const navLabel = useMemo(
    () => formatOverviewNavLabel(period, range, isCurrent),
    [period, range, isCurrent],
  )

  const dataRange = useMemo(
    () => overviewLoadRange(settings.weekStartsOn, asOf),
    [settings.weekStartsOn, asOf],
  )

  const periodLogs = useMemo(
    () => logs.filter((l) => l.date >= range.start && l.date <= range.end),
    [logs, range.start, range.end],
  )

  const referenceLog = useMemo(() => {
    if (period === 'week') {
      return periodLogs.find((l) => l.date === range.end) ?? log ?? undefined
    }
    return log ?? undefined
  }, [period, periodLogs, range.end, log])

  const load = useCallback(async () => {
    if (!userId) return
    const { start, end } = dataRange

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
  }, [userId, dataRange])

  useEffect(() => {
    if (!userId) return
    if (!isSupabaseConfigured) {
      const params = new URLSearchParams(window.location.search)
      if (params.get('seed') === 'demo') {
        seedDemoData(userId)
        params.delete('seed')
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`
        window.history.replaceState({}, '', next)
      }
    }
    load()
  }, [userId, load])

  const weekLogs = useMemo(() => {
    if (period !== 'week') return logs
    const weekDates = getWeekDates(asOf, settings.weekStartsOn)
    const prevWeekDates = getPreviousWeekDates(weekDates, settings.weekStartsOn)
    const dates = new Set([...prevWeekDates, ...weekDates])
    return logs.filter((l) => dates.has(l.date))
  }, [period, logs, asOf, settings.weekStartsOn])

  const weekWorkouts = useMemo(() => {
    if (period !== 'week') return workouts
    const weekDates = getWeekDates(asOf, settings.weekStartsOn)
    const prevWeekDates = getPreviousWeekDates(weekDates, settings.weekStartsOn)
    const dates = new Set([...prevWeekDates, ...weekDates])
    return workouts.filter((w) => dates.has(w.date))
  }, [period, workouts, asOf, settings.weekStartsOn])

  const panelProps = {
    category,
    logs: periodLogs,
    allLogs: logs,
    workouts,
    goals,
    log: referenceLog,
    weekLogs,
    weekWorkouts,
    date: range.end,
    weekStartsOn: settings.weekStartsOn,
    asOf,
    range,
    isCurrentPeriod: isCurrent,
  }

  return (
    <div className="w-full space-y-5 sm:space-y-6">
      <header className="space-y-3">
        <h2 className="text-xl font-bold text-zinc-100 sm:text-2xl">Overview</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-3xl">
          <OverviewPeriodTabs value={period} onChange={setPeriod} />
          <OverviewPeriodNav
            label={navLabel}
            canGoPrev
            canGoNext={periodOffset < 0}
            onPrev={() => setPeriodOffset((offset) => offset - 1)}
            onNext={() => setPeriodOffset((offset) => Math.min(0, offset + 1))}
          />
        </div>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-10 xl:gap-12">
        <OverviewCategoryNav
          value={category}
          onChange={setCategory}
          categories={overviewCategories}
        />
        <div className="min-w-0 flex-1 lg:max-w-none">
          {period === 'week' && <WeeklyOverviewPanel {...panelProps} />}
          {period === 'month' && <MonthlyOverviewPanel {...panelProps} />}
          {period === 'year' && <YearlyOverviewPanel {...panelProps} />}
        </div>
      </div>
    </div>
  )
}
