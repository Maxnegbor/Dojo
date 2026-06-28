import { useEffect, useRef } from 'react'
import {
  flushDueDrafts,
  msUntilMidnight,
} from '@/lib/dailyLogDraft'

interface UseEndOfDaySaveOptions {
  userId: string | null
  onFlushed?: (dates: string[]) => void
}

export function useEndOfDaySave({ userId, onFlushed }: UseEndOfDaySaveOptions) {
  const onFlushedRef = useRef(onFlushed)
  onFlushedRef.current = onFlushed

  useEffect(() => {
    if (!userId) return
    const uid = userId

    let cancelled = false
    let midnightTimer: number | null = null

    async function runDueFlush() {
      const flushed = await flushDueDrafts(uid)
      if (!cancelled && flushed.length > 0) {
        onFlushedRef.current?.(flushed)
      }
    }

    runDueFlush()

    function scheduleMidnightFlush() {
      midnightTimer = window.setTimeout(async () => {
        if (cancelled) return

        const flushed = await flushDueDrafts(uid)
        if (flushed.length > 0) {
          onFlushedRef.current?.(flushed)
        }

        scheduleMidnightFlush()
      }, msUntilMidnight())
    }

    scheduleMidnightFlush()

    return () => {
      cancelled = true
      if (midnightTimer) clearTimeout(midnightTimer)
    }
  }, [userId])
}
