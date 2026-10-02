import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useData'
import { useSettings } from '@/context/SettingsContext'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { ONE_THING_HORIZONS, oneThingPeriod, completeRightNow, type OneThingGoal, type OneThingHorizon } from '@/lib/oneThingPeriods'

const KEY = 'personal-os-one-thing'
const CHANGED = 'personal-os-one-thing-changed'
function readGoals(): OneThingGoal[] {
  try {
    const raw: unknown = JSON.parse(storageGetItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((goal): goal is OneThingGoal => goal &&
      (goal.horizon === 'fiveYear' || ONE_THING_HORIZONS.some(h => h.id === goal.horizon)) &&
      typeof goal.period === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(goal.period) &&
      typeof goal.text === 'string' && Boolean(goal.text.trim()) &&
      typeof goal.nextAction === 'string' && typeof goal.updatedAt === 'string')
  } catch { return [] }
}

export function useOneThing() {
  const { userId, storageReady } = useAuth()
  const { settings } = useSettings()
  const [goals, setGoals] = useState<OneThingGoal[]>([])
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => {
      setGoals(storageReady ? readGoals() : [])
      setNow(new Date())
    }
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener(CHANGED, refresh)
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('user-storage-ready', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener(CHANGED, refresh)
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('user-storage-ready', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [storageReady, userId])
  const save = useCallback((horizon: OneThingHorizon, text: string, nextAction = '') => {
    if (!storageReady || !text.trim()) return false
    // Resolve the period at save time, even if the editor stayed open overnight.
    const date = new Date()
    const period = oneThingPeriod(horizon, date, settings.weekStartsOn).key
    const goal: OneThingGoal = { horizon, period, text: text.trim(), nextAction: nextAction.trim(), updatedAt: date.toISOString() }
    storageSetItem(KEY, JSON.stringify([...readGoals().filter(g => g.horizon !== horizon || g.period !== period || Boolean(g.completedAt)), goal]))
    window.dispatchEvent(new Event(CHANGED))
    return true
  }, [storageReady, settings.weekStartsOn])
  const complete = useCallback(() => {
    if (!storageReady) return false
    const previous = readGoals()
    const next = completeRightNow(previous, new Date(), settings.weekStartsOn)
    if (next === previous) return false
    storageSetItem(KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(CHANGED))
    return true
  }, [storageReady, settings.weekStartsOn])
  return { complete, goals, now, weekStartsOn: settings.weekStartsOn, ready: storageReady, save }
}
