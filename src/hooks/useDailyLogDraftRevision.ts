import { useEffect, useState } from 'react'
import { DAILY_LOG_DRAFT_CHANGED } from '@/lib/dailyLogDraft'

/** Bumps when the daily log draft for `date` changes (habits, focus, etc.). */
export function useDailyLogDraftRevision(date: string): number {
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const onDraftChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ date?: string }>).detail
      if (!detail?.date || detail.date === date) {
        setRevision((value) => value + 1)
      }
    }

    window.addEventListener(DAILY_LOG_DRAFT_CHANGED, onDraftChanged)
    return () => window.removeEventListener(DAILY_LOG_DRAFT_CHANGED, onDraftChanged)
  }, [date])

  return revision
}
