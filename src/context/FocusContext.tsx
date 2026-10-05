import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  addFocusMinutes,
  adjustFocusMinutes,
  fetchFocusMinutesToday,
  fetchFocusMinutesWeekExceptToday,
} from '@/lib/focusStore'
import { recordFocusSession, removeRecordedFocusSession } from '@/lib/focusHourly'
import {
  addFocusSession,
  deleteFocusSession,
  getFocusSessions,
  updateFocusSession,
  type FocusSession,
  type FocusSessionDraft,
} from '@/lib/focusSessions'
import { reviseFocusScoreSession } from '@/lib/focusScores'
import { useAuth } from '@/hooks/useData'
import { useSettings } from '@/context/SettingsContext'
import { formatDate } from '@/lib/utils'

const DEFAULT_DOCUMENT_TITLE = 'Dojo'

function formatCountdownTitle(seconds: number): string {
  const mm = String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')
  const ss = String(Math.max(0, seconds) % 60).padStart(2, '0')
  return `${mm}:${ss} · ${DEFAULT_DOCUMENT_TITLE}`
}

interface FocusContextValue {
  focusToday: number
  focusWeekExceptToday: number
  liveFocusSeconds: number
  setLiveFocusSeconds: (seconds: number) => void
  /** Remaining countdown seconds while a timer is running; null when idle. */
  setTimerTabSeconds: (seconds: number | null) => void
  /** When true, Focus page hides the app sidebar for an immersive timer. */
  focusImmersive: boolean
  setFocusImmersive: (value: boolean) => void
  /** True while a focus timer session is in progress (running or paused mid-session). */
  focusTimerActive: boolean
  setFocusTimerActive: (value: boolean) => void
  refreshFocus: () => Promise<void>
  logFocusMinutes: (
    minutes: number,
    date?: string,
    sessionStartMs?: number,
    labelId?: string | null,
  ) => Promise<void>
  updateFocusRecord: (id: string, draft: FocusSessionDraft) => Promise<void>
  deleteFocusRecord: (id: string) => Promise<void>
  addFocusRecord: (draft: FocusSessionDraft) => Promise<void>
}

const FocusContext = createContext<FocusContextValue | null>(null)

export function FocusProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth()
  const { settings } = useSettings()
  const [focusToday, setFocusToday] = useState(0)
  const [focusWeekExceptToday, setFocusWeekExceptToday] = useState(0)
  const [liveFocusSeconds, setLiveFocusSeconds] = useState(0)
  const [focusImmersive, setFocusImmersive] = useState(false)
  const [focusTimerActive, setFocusTimerActive] = useState(false)

  const setTimerTabSeconds = useCallback((seconds: number | null) => {
    document.title =
      seconds == null ? DEFAULT_DOCUMENT_TITLE : formatCountdownTitle(seconds)
  }, [])

  const refreshFocus = useCallback(async () => {
    if (!userId) return
    const [today, weekExcept] = await Promise.all([
      fetchFocusMinutesToday(userId),
      fetchFocusMinutesWeekExceptToday(userId, settings.weekStartsOn),
    ])
    setFocusToday(today)
    setFocusWeekExceptToday(weekExcept)
  }, [userId, settings.weekStartsOn])

  useEffect(() => {
    void refreshFocus()
  }, [refreshFocus])

  useEffect(() => {
    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE
    }
  }, [])

  const logFocusMinutes = useCallback(
    async (
      minutes: number,
      date?: string,
      sessionStartMs?: number,
      labelId?: string | null,
    ) => {
      if (!userId || minutes <= 0) return
      const endMs = Date.now()
      const startMs = sessionStartMs ?? endMs - minutes * 60000
      recordFocusSession(startMs, endMs)
      const d = date ?? formatDate(new Date())
      addFocusSession({
        minutes,
        startMs,
        endMs,
        date: d,
        labelId: labelId ?? null,
      })
      const total = await addFocusMinutes(userId, d, minutes)
      if (d === formatDate(new Date())) {
        setFocusToday(total)
        void refreshFocus()
      }
    },
    [userId, refreshFocus],
  )

  const syncDailyFocus = useCallback(
    async (previous: FocusSession, next: FocusSession | null) => {
      if (!userId) return
      if (!next || next.date !== previous.date) {
        await adjustFocusMinutes(userId, previous.date, -previous.minutes)
        if (next) await adjustFocusMinutes(userId, next.date, next.minutes)
      } else if (next.minutes !== previous.minutes) {
        await adjustFocusMinutes(userId, next.date, next.minutes - previous.minutes)
      }
    },
    [userId],
  )

  const updateFocusRecord = useCallback(
    async (id: string, draft: FocusSessionDraft) => {
      const previous = getFocusSessions().find((session) => session.id === id)
      if (!previous) throw new Error('Focus session not found')
      const minutes = Math.round(draft.minutes)
      if (!Number.isFinite(minutes) || minutes < 1) throw new Error('Enter at least 1 minute')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) throw new Error('Enter a valid date')
      if (!Number.isFinite(draft.startMs) || !Number.isFinite(draft.endMs) || draft.endMs <= draft.startMs) {
        throw new Error('Enter a valid time')
      }

      const predicted: FocusSession = {
        ...previous,
        date: draft.date,
        startMs: draft.startMs,
        endMs: draft.endMs,
        minutes,
        label_id: draft.labelId?.trim() || null,
      }
      await syncDailyFocus(previous, predicted)
      const result = updateFocusSession(id, draft)
      if (!result) {
        await syncDailyFocus(predicted, previous)
        throw new Error('Could not update that focus session')
      }
      removeRecordedFocusSession(result.previous.startMs, result.previous.endMs)
      recordFocusSession(result.next.startMs, result.next.endMs)
      reviseFocusScoreSession(result.previous.startMs, {
        date: result.next.date,
        startMs: result.next.startMs,
        endMs: result.next.endMs,
        minutes: result.next.minutes,
      })
      await refreshFocus()
    },
    [refreshFocus, syncDailyFocus],
  )

  const addFocusRecord = useCallback(
    async (draft: FocusSessionDraft) => {
      const minutes = Math.round(draft.minutes)
      if (!Number.isFinite(minutes) || minutes < 1) throw new Error('Enter at least 1 minute')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) throw new Error('Enter a valid date')
      if (!Number.isFinite(draft.startMs) || !Number.isFinite(draft.endMs) || draft.endMs <= draft.startMs) {
        throw new Error('Enter a valid time')
      }
      if (userId) await adjustFocusMinutes(userId, draft.date, minutes)
      const session = addFocusSession({
        minutes,
        startMs: draft.startMs,
        endMs: draft.endMs,
        date: draft.date,
        labelId: draft.labelId,
      })
      if (!session) {
        if (userId) await adjustFocusMinutes(userId, draft.date, -minutes)
        throw new Error('Could not add that focus session')
      }
      recordFocusSession(session.startMs, session.endMs)
      await refreshFocus()
    },
    [userId, refreshFocus],
  )

  const deleteFocusRecord = useCallback(
    async (id: string) => {
      const previous = getFocusSessions().find((session) => session.id === id)
      if (!previous) return
      await syncDailyFocus(previous, null)
      const removed = deleteFocusSession(id)
      if (!removed) return
      removeRecordedFocusSession(removed.startMs, removed.endMs)
      reviseFocusScoreSession(removed.startMs, null)
      await refreshFocus()
    },
    [refreshFocus, syncDailyFocus],
  )

  return (
    <FocusContext.Provider
      value={{
        focusToday,
        focusWeekExceptToday,
        liveFocusSeconds,
        setLiveFocusSeconds,
        setTimerTabSeconds,
        focusImmersive,
        setFocusImmersive,
        focusTimerActive,
        setFocusTimerActive,
        refreshFocus,
        logFocusMinutes,
        updateFocusRecord,
        deleteFocusRecord,
        addFocusRecord,
      }}
    >
      {children}
    </FocusContext.Provider>
  )
}

export function useFocus() {
  const ctx = useContext(FocusContext)
  if (!ctx) throw new Error('useFocus must be used within FocusProvider')
  return ctx
}
