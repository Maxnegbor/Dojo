import { useLocation } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { Sun } from 'lucide-react'
import { MorningLogModal } from '@/components/today/MorningLogModal'
import { Button } from '@/components/ui/Button'
import { useAuth, useDailyLog } from '@/hooks/useData'
import { useSettings } from '@/context/SettingsContext'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { markMorningLogSubmitted, MORNING_LOG_CHANGED } from '@/lib/morningLog'
import {
  getMorningLogYesterdayDate,
  isMorningLogComplete,
} from '@/lib/morningLogConfig'
import { persistMorningLogPayload } from '@/lib/morningLogSave'
import { isSupabaseConfigured } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import type { DailyLog, Goal } from '@/types'
import { useOnboardingTourActive } from '@/hooks/useOnboardingTourActive'
import type { MorningLogSavePayload } from '@/components/today/MorningLogModal'
import { formatDate } from '@/lib/utils'

interface MorningLogGateProps {
  children: React.ReactNode
}

export function MorningLogGate({ children }: MorningLogGateProps) {
  const { pathname } = useLocation()
  const { userId } = useAuth()
  const { settings } = useSettings()
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()
  const today = formatDate(new Date())
  const yesterday = getMorningLogYesterdayDate(today)
  const { log, workouts, loading, syncFromStore } = useDailyLog(today)

  const [showModal, setShowModal] = useState(false)
  const [goals, setGoals] = useState<Goal[]>([])
  const [goalsReady, setGoalsReady] = useState(false)
  const [yesterdayLog, setYesterdayLog] = useState<DailyLog | null>(null)
  const [yesterdayReady, setYesterdayReady] = useState(false)
  const [yesterdayWorkouts, setYesterdayWorkouts] = useState<import('@/types').Workout[]>([])

  const loadGoals = useCallback(async () => {
    if (!userId) {
      setGoals([])
      setGoalsReady(true)
      return
    }
    if (isSupabaseConfigured) {
      const { fetchGoals } = await import('@/lib/supabase')
      setGoals(await fetchGoals(userId))
    } else {
      setGoals(localStore.getGoals())
    }
    setGoalsReady(true)
  }, [userId])

  const loadYesterdayLog = useCallback(async () => {
    if (!userId) {
      setYesterdayLog(null)
      setYesterdayWorkouts([])
      setYesterdayReady(true)
      return
    }
    if (isSupabaseConfigured) {
      const { getOrCreateDailyLog, fetchWorkouts } = await import('@/lib/supabase')
      setYesterdayLog(await getOrCreateDailyLog(userId, yesterday))
      setYesterdayWorkouts(await fetchWorkouts(userId, yesterday, yesterday))
    } else {
      localStore.setUserId(userId)
      setYesterdayLog(localStore.getOrCreateDailyLog(yesterday))
      setYesterdayWorkouts(localStore.getWorkouts(yesterday, yesterday))
    }
    setYesterdayReady(true)
  }, [userId, yesterday])

  useEffect(() => {
    setGoalsReady(false)
    void loadGoals()
  }, [loadGoals])

  useEffect(() => {
    setYesterdayReady(false)
    void loadYesterdayLog()
  }, [loadYesterdayLog])

  useEffect(() => {
    const onMorningLogChanged = () => {
      syncFromStore()
      void loadYesterdayLog()
    }
    window.addEventListener(MORNING_LOG_CHANGED, onMorningLogChanged)
    return () => window.removeEventListener(MORNING_LOG_CHANGED, onMorningLogChanged)
  }, [syncFromStore, loadYesterdayLog])

  const tourActive = useOnboardingTourActive()

  const morningLogStartDate = settings.morningLogStartDate ?? settings.memberSinceDate
  const beforeMorningLogStart =
    morningLogStartDate != null && today < morningLogStartDate

  const morningLogPending =
    pathname !== '/settings' &&
    !tourActive &&
    !beforeMorningLogStart &&
    settings.requireMorningLog &&
    goalsReady &&
    yesterdayReady &&
    !loading &&
    !!userId &&
    !!log &&
    !isMorningLogComplete(log, sleepMetricsConfig, goals, yesterdayLog, today, workouts, yesterdayWorkouts)

  const saveMorningLog = async (payload: MorningLogSavePayload) => {
    if (!log || !userId) throw new Error('Daily log not loaded')
    await persistMorningLogPayload({
      userId,
      date: today,
      log,
      yesterdayLog,
      goals,
      sleepMetricsConfig,
      payload,
    })
    markMorningLogSubmitted(today)
    syncFromStore()
    await loadYesterdayLog()
    setShowModal(false)
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {children}

      {morningLogPending && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/50 p-6 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="morning-log-gate-title"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-950/80 ring-1 ring-amber-500/30">
            <Sun size={24} className="text-amber-400" />
          </div>
          <div className="max-w-xs text-center">
            <h2 id="morning-log-gate-title" className="text-base font-semibold text-zinc-100">
              Good morning
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Start your day by doing your morning log.
            </p>
          </div>
          <Button size="lg" onClick={() => setShowModal(true)} disabled={!goalsReady}>
            <Sun size={16} className="text-amber-300" />
            Morning Log
          </Button>
        </div>
      )}

      {showModal && userId && log && goalsReady && (
        <MorningLogModal
          date={today}
          initial={log.morning_log}
          initialLog={log}
          yesterdayLog={yesterdayLog}
          workouts={workouts}
          yesterdayWorkouts={yesterdayWorkouts}
          goals={goals}
          sleepMetricsConfig={sleepMetricsConfig}
          morningChecklist={settings.morningLogChecklist}
          dismissible={false}
          onClose={() => setShowModal(false)}
          onSave={saveMorningLog}
        />
      )}
    </div>
  )
}
