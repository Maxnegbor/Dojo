import { useEffect, useState } from 'react'
import { isToday, parseISO } from 'date-fns'
import { WEEKLY_SHUTDOWN_TEST_MODE } from '@/lib/devFlags'
import {
  getPendingWeeklyShutdownWeekDates,
  getWeeklyShutdownWeekKey,
  isWeeklyShutdownCompleted,
  WEEKLY_SHUTDOWN_CHANGED,
} from '@/lib/weeklyShutdown'
import type { WeekStartDay } from '@/types'

/** True when viewing today and a weekly shutdown is still due (from Sunday until completed). */
export function useWeeklyShutdownAvailable(
  viewDate: string,
  weekStartsOn: WeekStartDay,
): boolean {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      if (!isToday(parseISO(viewDate))) {
        setAvailable(false)
        return
      }
      if (WEEKLY_SHUTDOWN_TEST_MODE) {
        setAvailable(true)
        return
      }
      const weekDates = getPendingWeeklyShutdownWeekDates(now, weekStartsOn)
      if (weekDates.length === 0) {
        setAvailable(false)
        return
      }
      const weekKey = getWeeklyShutdownWeekKey(weekDates)
      setAvailable(!isWeeklyShutdownCompleted(weekKey))
    }
    tick()
    const id = window.setInterval(tick, 60_000)
    window.addEventListener(WEEKLY_SHUTDOWN_CHANGED, tick)
    window.addEventListener('user-storage-ready', tick)
    return () => {
      clearInterval(id)
      window.removeEventListener(WEEKLY_SHUTDOWN_CHANGED, tick)
      window.removeEventListener('user-storage-ready', tick)
    }
  }, [viewDate, weekStartsOn])

  return available
}
