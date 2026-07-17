import { useCallback, useEffect, useState } from 'react'
import {
  applyPulseFormula,
  getPulseConfig,
  getCurrentPulseFormula,
  isPulseConfigured,
  savePulseConfig,
  type PulseConfig,
  type PulseFormula,
} from '@/lib/pulseConfig'
import { formatDate } from '@/lib/utils'

export function usePulseConfig() {
  const [config, setConfig] = useState<PulseConfig>(() => getPulseConfig())

  useEffect(() => {
    const reload = () => setConfig(getPulseConfig())
    window.addEventListener('user-storage-ready', reload)
    return () => window.removeEventListener('user-storage-ready', reload)
  }, [])

  const configured = isPulseConfigured(config)
  const today = formatDate(new Date())
  const currentFormula = getCurrentPulseFormula(config, today)

  const saveFormula = useCallback(
    (formula: PulseFormula, asOfDate = today) => {
      const { next, isReconfigure } = applyPulseFormula(config, asOfDate, formula)
      savePulseConfig(next)
      setConfig(next)
      return { isReconfigure }
    },
    [config, today],
  )

  return {
    config,
    configured,
    currentFormula,
    saveFormula,
  }
}
