import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { OverviewCategoryPanel } from '@/components/overview/OverviewCategoryPanel'
import { OverviewHome } from '@/components/overview/OverviewHome'
import { OverviewPeriodNav } from '@/components/overview/OverviewPeriodNav'
import { OverviewPeriodTabs } from '@/components/overview/OverviewPeriodTabs'
import { useSettings } from '@/context/SettingsContext'
import { useAuth, useDailyLog } from '@/hooks/useData'
import { usePulseConfig } from '@/hooks/usePulseConfig'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { localStore } from '@/lib/localStore'
import {
  getOverviewCategories,
  type OverviewCategory,
} from '@/lib/overviewCategories'
import { METRICS_SECTIONS_CHANGED } from '@/lib/metricsSections'
import type { OverviewPeriod } from '@/lib/overviewPeriods'
import {
  computeOverviewPeriodStats,
  formatOverviewNavLabel,
  getPeriodRange,
  getPreviousPeriodRange,
  isCurrentOverviewPeriod,
  overviewAsOfDate,
  overviewLoadRange,
} from '@/lib/overviewPeriods'
import { buildOverviewPulseHistory } from '@/lib/overviewPulse'
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
  const [detailCategory, setDetailCategory] = useState<OverviewCategory | null>(null)
  const [sectionsRevision, setSectionsRevision] = useState(0)
  const overviewCategories = useMemo(
    () => getOverviewCategories(),
    [sectionsRevision],
  )
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const { userId } = useAuth()
  const { settings } = useSettings()
  const { config: pulseConfig } = usePulseConfig()
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()

  useEffect(() => {
    const refresh = () => setSectionsRevision((n) => n + 1)
    window.addEventListener(METRICS_SECTIONS_CHANGED, refresh)
    return () => window.removeEventListener(METRICS_SECTIONS_CHANGED, refresh)
  }, [])

  useEffect(() => {
    if (detailCategory == null) return
    if (!overviewCategories.some((entry) => entry.id === detailCategory)) {
      setDetailCategory(null)
    }
  }, [overviewCategories, detailCategory])

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

  const previousRange = useMemo(
    () => getPreviousPeriodRange(period, settings.weekStartsOn, asOf),
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
    void load()
  }, [userId, load])

  const weekLogs = useMemo(() => {
    const weekDates = getWeekDates(asOf, settings.weekStartsOn)
    const prevWeekDates = getPreviousWeekDates(weekDates, settings.weekStartsOn)
    const dates = new Set([...prevWeekDates, ...weekDates])
    return logs.filter((l) => dates.has(l.date))
  }, [logs, asOf, settings.weekStartsOn])

  const weekWorkouts = useMemo(() => {
    const weekDates = getWeekDates(asOf, settings.weekStartsOn)
    const prevWeekDates = getPreviousWeekDates(weekDates, settings.weekStartsOn)
    const dates = new Set([...prevWeekDates, ...weekDates])
    return workouts.filter((w) => dates.has(w.date))
  }, [workouts, asOf, settings.weekStartsOn])

  const { stats } = useMemo(
    () =>
      computeOverviewPeriodStats(
        period,
        logs,
        workouts,
        settings.weekStartsOn,
        asOf,
      ),
    [period, logs, workouts, settings.weekStartsOn, asOf],
  )

  const pulseHistory = useMemo(
    () =>
      buildOverviewPulseHistory(
        period,
        range,
        previousRange,
        logs,
        goals,
        workouts,
        today,
        log,
        pulseConfig,
        sleepMetricsConfig,
      ),
    [
      period,
      range,
      previousRange,
      logs,
      goals,
      workouts,
      today,
      log,
      pulseConfig,
      sleepMetricsConfig,
    ],
  )

  const detailLabel =
    overviewCategories.find((entry) => entry.id === detailCategory)?.label ?? 'Detail'

  const panelProps = {
    period,
    category: detailCategory ?? 'fitness',
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
        {detailCategory ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDetailCategory(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100"
              aria-label="Back to overview"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Overview
              </p>
              <h2 className="truncate text-xl font-bold text-zinc-100 sm:text-2xl">
                {detailLabel}
              </h2>
            </div>
          </div>
        ) : (
          <h2 className="text-xl font-bold text-zinc-100 sm:text-2xl">Overview</h2>
        )}

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

      {detailCategory ? (
        <OverviewCategoryPanel {...panelProps} category={detailCategory} />
      ) : (
        <OverviewHome
          period={period}
          categories={overviewCategories}
          stats={stats}
          goals={goals}
          pulseHistory={pulseHistory}
          today={today}
          onOpenCategory={setDetailCategory}
        />
      )}
    </div>
  )
}
