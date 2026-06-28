import { useEffect, useState } from 'react'
import { isToday, parseISO } from 'date-fns'
import { ALLOW_WEEKLY_SHUTDOWN_ANY_DAY, WEEKLY_SHUTDOWN_TEST_MODE } from '@/lib/devFlags'
import {
  getWeeklyReviewWeekDates,
  getWeeklyShutdownWeekDates,
  getWeeklyShutdownWeekKey,
  isWeeklyShutdownCompleted,
} from '@/lib/weeklyShutdown'
import type { WeekStartDay } from '@/types'

/** True on Sunday when viewing today and this week's shutdown hasn't been completed. */
export function useWeeklyShutdownAvailable(
  viewDate: string,
  weekStartsOn: WeekStartDay,
): boolean {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      if (WEEKLY_SHUTDOWN_TEST_MODE && isToday(parseISO(viewDate))) {
        setAvailable(true)
        return
      }
      if (!isToday(parseISO(viewDate))) {
        setAvailable(false)
        return
      }
      const weekDates = ALLOW_WEEKLY_SHUTDOWN_ANY_DAY
        ? getWeeklyReviewWeekDates(now, weekStartsOn)
        : getWeeklyShutdownWeekDates(now, weekStartsOn)
      if (weekDates.length === 0) {
        setAvailable(false)
        return
      }
      const weekKey = getWeeklyShutdownWeekKey(weekDates)
      setAvailable(!isWeeklyShutdownCompleted(weekKey))
    }
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [viewDate, weekStartsOn])

  return available
}
