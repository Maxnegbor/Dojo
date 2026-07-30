import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { PulseConfigureModal } from '@/components/pulse/PulseConfigureModal'
import { PulseEchoes } from '@/components/pulse/PulseEchoes'
import { PulseDevPreviewControls } from '@/components/pulse/PulseDevPreviewControls'
import { PulseHero } from '@/components/pulse/PulseHero'
import { PulseWaveform } from '@/components/pulse/PulseWaveform'
import { Button } from '@/components/ui/Button'
import { useSettings } from '@/context/SettingsContext'
import { useAuth, useDailyLog } from '@/hooks/useData'
import { usePulseConfig } from '@/hooks/usePulseConfig'
import { usePulseDevPreview } from '@/hooks/usePulseDevPreview'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { localStore } from '@/lib/localStore'
import {
  computePulseSeries,
  generatePulseInsights,
  previewPulseBreakdown,
  pulseLoadRange,
} from '@/lib/pulse'
import type { PulseFormula } from '@/lib/pulseConfig'
import { isSupabaseConfigured } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import type { DailyLog, Goal, Workout } from '@/types'

export function PulsePage() {
  const today = formatDate(new Date())
  const { userId } = useAuth()
  const { settings } = useSettings()
  const { log: todayLog } = useDailyLog(today)
  const { config, configured, currentFormula, saveFormula } = usePulseConfig()
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [previewScore, setPreviewScore] = usePulseDevPreview()
  const [showConfigure, setShowConfigure] = useState(false)
  const [formulaNotice, setFormulaNotice] = useState(false)

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
      computePulseSeries(dateRange, logs, goals, workouts, today, todayLog, config, sleepMetricsConfig),
    [dateRange, logs, goals, workouts, today, todayLog, config, sleepMetricsConfig],
  )

  const todayPulse = useMemo(
    () =>
      series.find((d) => d.date === today) ?? {
        date: today,
        score: 0,
        habitRate: 0,
        focusRate: 0,
        sleepRate: 0,
        exerciseRate: 0,
        metricRates: {},
      },
    [series, today],
  )

  const insights = useMemo(
    () => generatePulseInsights(series, logs, goals, workouts, today, todayLog),
    [series, logs, goals, workouts, today, todayLog],
  )

  const heroPulse = useMemo(() => {
    if (previewScore == null) return todayPulse
    return {
      ...todayPulse,
      score: previewScore,
      ...previewPulseBreakdown(previewScore),
    }
  }, [previewScore, todayPulse])

  const handleSaveFormula = (formula: PulseFormula) => {
    const { isReconfigure } = saveFormula(formula)
    setShowConfigure(false)
    if (isReconfigure) {
      setFormulaNotice(true)
    }
  }

  return (
    <div className="space-y-4">
      {settings.devMode && (
        <PulseDevPreviewControls
          previewScore={previewScore}
          onPreviewScoreChange={setPreviewScore}
        />
      )}

      <header className="space-y-2">
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--accent-400)]">
            Pulse
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">Your rhythm</h1>
          <p className="max-w-lg text-sm text-zinc-500">
            A living read on how aligned your days feel — shaped by the formula you choose.
          </p>
          <p className="text-[10px] text-zinc-600">{format(new Date(), 'EEEE, MMMM d')}</p>
        </div>
        {!configured && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowConfigure(true)}
          >
            Configure Pulse
          </Button>
        )}
      </header>

      {formulaNotice && (
        <p className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-400">
          Formula updated — past days keep their old weights.
          <button
            type="button"
            className="ml-2 text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
            onClick={() => setFormulaNotice(false)}
          >
            Dismiss
          </button>
        </p>
      )}

      <PulseHero score={heroPulse.score} configured={configured} />

      <div className="grid gap-4 lg:grid-cols-2">
        <PulseWaveform series={series} today={today} />
        <PulseEchoes insights={insights} />
      </div>

      {showConfigure && (
        <PulseConfigureModal
          goals={goals}
          initialFormula={currentFormula}
          isReconfigure={configured}
          onClose={() => setShowConfigure(false)}
          onSave={handleSaveFormula}
        />
      )}
    </div>
  )
}
