import { useCallback, useEffect, useState } from 'react'
import {
  getShutdownLogSleepFieldIds,
  saveShutdownLogSleepFieldIds,
  SHUTDOWN_LOG_SLEEP_CHANGED,
} from '@/lib/shutdownLogConfig'
export function useShutdownLogSleepFieldIds() {
  const [sleepFieldIds, setSleepFieldIds] = useState<string[]>(() => getShutdownLogSleepFieldIds())

  useEffect(() => {
    const reload = () => setSleepFieldIds(getShutdownLogSleepFieldIds())
    window.addEventListener(SHUTDOWN_LOG_SLEEP_CHANGED, reload)
    return () => window.removeEventListener(SHUTDOWN_LOG_SLEEP_CHANGED, reload)
  }, [])

  const saveSleepFieldIds = useCallback((ids: string[]) => {
    saveShutdownLogSleepFieldIds(ids)
    setSleepFieldIds(ids)
  }, [])

  return { sleepFieldIds, saveSleepFieldIds }
}
