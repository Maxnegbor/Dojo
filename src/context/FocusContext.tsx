import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  addFocusMinutes,
  fetchFocusMinutesToday,
  fetchFocusMinutesWeekExceptToday,
} from '@/lib/focusStore'
import { recordFocusSession } from '@/lib/focusHourly'
import { addFocusSession } from '@/lib/focusSessions'
import { useAuth } from '@/hooks/useData'
import { useSettings } from '@/context/SettingsContext'
import { formatDate } from '@/lib/utils'

interface FocusContextValue {
  focusToday: number
  focusWeekExceptToday: number
  liveFocusSeconds: number
  setLiveFocusSeconds: (seconds: number) => void
  /** When true, Focus page hides the app sidebar for an immersive timer. */
  focusImmersive: boolean
  setFocusImmersive: (value: boolean) => void
  refreshFocus: () => Promise<void>
  logFocusMinutes: (
    minutes: number,
    date?: string,
    sessionStartMs?: number,
    labelId?: string | null,
  ) => Promise<void>
}

const FocusContext = createContext<FocusContextValue | null>(null)

export function FocusProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth()
  const { settings } = useSettings()
  const [focusToday, setFocusToday] = useState(0)
  const [focusWeekExceptToday, setFocusWeekExceptToday] = useState(0)
  const [liveFocusSeconds, setLiveFocusSeconds] = useState(0)
  const [focusImmersive, setFocusImmersive] = useState(false)

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

  return (
    <FocusContext.Provider
      value={{
        focusToday,
        focusWeekExceptToday,
        liveFocusSeconds,
        setLiveFocusSeconds,
        focusImmersive,
        setFocusImmersive,
        refreshFocus,
        logFocusMinutes,
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
