import { useCallback, useEffect, useState } from 'react'
import {
  getShutdownLogGoalKeys,
  saveShutdownLogGoalKeys,
  SHUTDOWN_LOG_GOALS_CHANGED,
} from '@/lib/shutdownLogConfig'
import type { MetricKey } from '@/types'

export function useShutdownLogGoalKeys() {
  const [goalKeys, setGoalKeys] = useState<MetricKey[]>(() => getShutdownLogGoalKeys())

  useEffect(() => {
    const reload = () => setGoalKeys(getShutdownLogGoalKeys())
    window.addEventListener(SHUTDOWN_LOG_GOALS_CHANGED, reload)
    return () => window.removeEventListener(SHUTDOWN_LOG_GOALS_CHANGED, reload)
  }, [])

  const saveGoalKeys = useCallback((keys: MetricKey[]) => {
    saveShutdownLogGoalKeys(keys)
    setGoalKeys(keys)
  }, [])

  return { goalKeys, saveGoalKeys }
}
