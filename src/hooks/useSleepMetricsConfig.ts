import { useCallback, useEffect, useState } from 'react'
import {
  getSleepMetricsConfig,
  saveSleepMetricsConfig,
  SLEEP_METRICS_CHANGED,
  type SleepMetricsConfig,
} from '@/lib/sleepMetrics'

export function useSleepMetricsConfig() {
  const [config, setConfig] = useState<SleepMetricsConfig>(() => getSleepMetricsConfig())

  useEffect(() => {
    const reload = () => setConfig(getSleepMetricsConfig())
    window.addEventListener(SLEEP_METRICS_CHANGED, reload)
    return () => window.removeEventListener(SLEEP_METRICS_CHANGED, reload)
  }, [])

  const saveConfig = useCallback((next: SleepMetricsConfig) => {
    saveSleepMetricsConfig(next)
    setConfig(next)
  }, [])

  return { config, saveConfig }
}
