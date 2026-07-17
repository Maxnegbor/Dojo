import { useCallback, useEffect, useState } from 'react'
import {
  getMorningLogYesterdayKeys,
  MORNING_LOG_YESTERDAY_CHANGED,
  saveMorningLogYesterdayKeys,
} from '@/lib/morningLogConfig'
import type { MetricKey } from '@/types'

export function useMorningLogYesterdayKeys() {
  const [yesterdayKeys, setYesterdayKeys] = useState<MetricKey[]>(() => getMorningLogYesterdayKeys())

  useEffect(() => {
    const reload = () => setYesterdayKeys(getMorningLogYesterdayKeys())
    window.addEventListener(MORNING_LOG_YESTERDAY_CHANGED, reload)
    return () => window.removeEventListener(MORNING_LOG_YESTERDAY_CHANGED, reload)
  }, [])

  const saveYesterdayKeys = useCallback((keys: MetricKey[]) => {
    saveMorningLogYesterdayKeys(keys)
    setYesterdayKeys(keys)
  }, [])

  return { yesterdayKeys, saveYesterdayKeys }
}
