import { useCallback, useEffect, useState } from 'react'
import {
  getMorningLogGoalKeys,
  MORNING_LOG_GOALS_CHANGED,
  saveMorningLogGoalKeys,
  toggleMorningLogGoalKey,
} from '@/lib/morningLogConfig'
import type { MetricKey } from '@/types'

export function useMorningLogGoalKeys() {
  const [goalKeys, setGoalKeys] = useState<MetricKey[]>(() => getMorningLogGoalKeys())

  useEffect(() => {
    const reload = () => setGoalKeys(getMorningLogGoalKeys())
    window.addEventListener(MORNING_LOG_GOALS_CHANGED, reload)
    return () => window.removeEventListener(MORNING_LOG_GOALS_CHANGED, reload)
  }, [])

  const saveGoalKeys = useCallback((keys: MetricKey[]) => {
    saveMorningLogGoalKeys(keys)
    setGoalKeys(keys)
  }, [])

  const toggleGoalKey = useCallback((key: MetricKey, enabled: boolean) => {
    toggleMorningLogGoalKey(key, enabled)
    setGoalKeys(getMorningLogGoalKeys())
  }, [])

  return { goalKeys, saveGoalKeys, toggleGoalKey }
}
