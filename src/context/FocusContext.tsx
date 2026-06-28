import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { addFocusMinutes, fetchFocusMinutesToday } from '@/lib/focusStore'
import { useAuth } from '@/hooks/useData'
import { formatDate } from '@/lib/utils'

interface FocusContextValue {
  focusToday: number
  refreshFocus: () => Promise<void>
  logFocusMinutes: (minutes: number, date?: string) => Promise<void>
}

const FocusContext = createContext<FocusContextValue | null>(null)

export function FocusProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth()
  const [focusToday, setFocusToday] = useState(0)

  const refreshFocus = useCallback(async () => {
    if (!userId) return
    setFocusToday(await fetchFocusMinutesToday(userId))
  }, [userId])

  useEffect(() => {
    refreshFocus()
  }, [refreshFocus])

  const logFocusMinutes = useCallback(
    async (minutes: number, date?: string) => {
      if (!userId || minutes <= 0) return
      const d = date ?? formatDate(new Date())
      const total = await addFocusMinutes(userId, d, minutes)
      if (d === formatDate(new Date())) setFocusToday(total)
    },
    [userId],
  )

  return (
    <FocusContext.Provider value={{ focusToday, refreshFocus, logFocusMinutes }}>
      {children}
    </FocusContext.Provider>
  )
}

export function useFocus() {
  const ctx = useContext(FocusContext)
  if (!ctx) throw new Error('useFocus must be used within FocusProvider')
  return ctx
}
