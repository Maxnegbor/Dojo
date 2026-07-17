import { useCallback, useEffect, useState } from 'react'
import {
  getMorningLogSleepFieldIds,
  MORNING_LOG_SLEEP_CHANGED,
  saveMorningLogSleepFieldIds,
} from '@/lib/morningLogConfig'

export function useMorningLogSleepFieldIds() {
  const [sleepFieldIds, setSleepFieldIds] = useState<string[]>(() => getMorningLogSleepFieldIds())

  useEffect(() => {
    const reload = () => setSleepFieldIds(getMorningLogSleepFieldIds())
    window.addEventListener(MORNING_LOG_SLEEP_CHANGED, reload)
    return () => window.removeEventListener(MORNING_LOG_SLEEP_CHANGED, reload)
  }, [])

  const saveSleepFieldIds = useCallback((ids: string[]) => {
    saveMorningLogSleepFieldIds(ids)
    setSleepFieldIds(ids)
  }, [])

  return { sleepFieldIds, saveSleepFieldIds }
}
