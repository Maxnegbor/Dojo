import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { MissedLogModal } from '@/components/today/MissedLogModal'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useData'
import { useSettings } from '@/context/SettingsContext'
import {
  buildMissedLogDays,
  enumerateDatesInclusive,
  getMissedLogScanStart,
  getYesterdayDate,
  MISSED_LOG_CHANGED,
  type MissedLogDay,
} from '@/lib/dailyLog'
import { getDraft } from '@/lib/dailyLogDraft'
import { isSupabaseConfigured } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import type { DailyLog, Goal } from '@/types'
import { normalizeHabits } from '@/types'

interface MissedLogGateProps {
  children?: React.ReactNode
}

async function loadMissedLogDays(
  userId: string,
  goals: Goal[],
  memberSinceDate?: string | null,
): Promise<MissedLogDay[]> {
  const until = getYesterdayDate()
  const start = getMissedLogScanStart(memberSinceDate, until)

  let logs: DailyLog[] = []
  if (isSupabaseConfigured) {
    const { fetchDailyLogs } = await import('@/lib/supabase')
    try {
      logs = await fetchDailyLogs(userId, start, until)
    } catch {
      /* ignore */
    }
  } else {
    localStore.setUserId(userId)
    logs = localStore.getDailyLogs(start, until)
  }

  const logsByDate = new Map<string, DailyLog | null>()
  for (const entry of logs) {
    logsByDate.set(entry.date, entry)
  }

  for (const date of enumerateDatesInclusive(start, until)) {
    const base = logsByDate.get(date) ?? null
    const draft = getDraft(date)
    const effective =
      base && draft
        ? {
            ...base,
            ...draft,
            habits: normalizeHabits({ ...base.habits, ...draft.habits }),
            custom_metrics: { ...base.custom_metrics, ...draft.custom_metrics },
          }
        : base
    logsByDate.set(date, effective)
  }

  return buildMissedLogDays(logsByDate, goals, memberSinceDate)
}

export function MissedLogGate(_props: MissedLogGateProps) {
  const { pathname } = useLocation()
  const { userId } = useAuth()
  const { settings } = useSettings()

  const [goals, setGoals] = useState<Goal[]>([])
  const [goalsReady, setGoalsReady] = useState(false)
  const [missedDays, setMissedDays] = useState<MissedLogDay[]>([])
  const [scanReady, setScanReady] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const [showModal, setShowModal] = useState(false)

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
      localStore.setUserId(userId)
      setGoals(localStore.getGoals())
    }
    setGoalsReady(true)
  }, [userId])

  const refreshMissed = useCallback(async () => {
    if (!userId || !goalsReady) {
      setMissedDays([])
      setScanReady(false)
      return
    }
    setScanReady(false)
    const missed = await loadMissedLogDays(userId, goals, settings.memberSinceDate)
    setMissedDays(missed)
    setScanReady(true)
    if (missed.length === 0) {
      setShowModal(false)
      setShowIntro(true)
    }
  }, [userId, goals, goalsReady, settings.memberSinceDate])

  useEffect(() => {
    setGoalsReady(false)
    void loadGoals()
  }, [loadGoals])

  useEffect(() => {
    void refreshMissed()
  }, [refreshMissed])

  useEffect(() => {
    const onChanged = () => {
      void refreshMissed()
    }
    window.addEventListener(MISSED_LOG_CHANGED, onChanged)
    return () => window.removeEventListener(MISSED_LOG_CHANGED, onChanged)
  }, [refreshMissed])

  const pending =
    pathname !== '/settings' &&
    goalsReady &&
    scanReady &&
    !!userId &&
    missedDays.length > 0

  const saveMissedLog = async (date: string, updates: Partial<DailyLog>) => {
    if (!userId) return
    if (isSupabaseConfigured) {
      const { getOrCreateDailyLog, updateDailyLog } = await import('@/lib/supabase')
      const dayLog = await getOrCreateDailyLog(userId, date)
      await updateDailyLog(dayLog.id, updates)
    } else {
      localStore.setUserId(userId)
      localStore.updateDailyLog(date, updates)
    }
  }

  const removeMissedDay = useCallback((date: string) => {
    setMissedDays((prev) => prev.filter((d) => d.date !== date))
  }, [])

  const handleComplete = useCallback(() => {
    setShowModal(false)
    setShowIntro(true)
    void refreshMissed()
  }, [refreshMissed])

  return (
    <>
      {pending &&
        showIntro &&
        !showModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 bg-black/50 p-6 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="missed-log-gate-title"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-950/80 ring-1 ring-amber-500/30">
              <AlertTriangle size={24} className="text-amber-400" />
            </div>
            <div className="max-w-xs text-center">
              <h2 id="missed-log-gate-title" className="text-base font-semibold text-zinc-100">
                Missed logs
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                {missedDays.length === 1
                  ? 'You have a day without a daily shutdown. Catch up before your morning log.'
                  : `You have ${missedDays.length} days without a daily shutdown. Catch up before your morning log.`}
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => {
                setShowIntro(false)
                setShowModal(true)
              }}
            >
              <AlertTriangle size={16} className="text-amber-300" />
              Fill missed logs
            </Button>
          </div>,
          document.body,
        )}

      {pending && showModal && (
        <MissedLogModal
          days={missedDays}
          goals={goals}
          onSave={saveMissedLog}
          onDismissDay={removeMissedDay}
          onComplete={handleComplete}
        />
      )}
    </>
  )
}

/** True while missed-log gate should block morning log / other gates. */
export function useMissedLogPending(): boolean {
  const { pathname } = useLocation()
  const { userId } = useAuth()
  const { settings } = useSettings()
  const [pending, setPending] = useState(false)

  const refresh = useCallback(async () => {
    if (!userId || pathname === '/settings') {
      setPending(false)
      return
    }
    let goals: Goal[] = []
    if (isSupabaseConfigured) {
      const { fetchGoals } = await import('@/lib/supabase')
      goals = await fetchGoals(userId)
    } else {
      localStore.setUserId(userId)
      goals = localStore.getGoals()
    }
    const missed = await loadMissedLogDays(userId, goals, settings.memberSinceDate)
    setPending(missed.length > 0)
  }, [userId, pathname, settings.memberSinceDate])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onChanged = () => {
      void refresh()
    }
    window.addEventListener(MISSED_LOG_CHANGED, onChanged)
    return () => window.removeEventListener(MISSED_LOG_CHANGED, onChanged)
  }, [refresh])

  return pending
}
