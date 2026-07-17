import { useEffect, useState } from 'react'
import { isPastScheduleEndHour } from '@/lib/utils'

/** Tracks whether local time has passed the user's schedule end hour; re-checks every minute. */
export function usePastScheduleEnd(endHour: number): boolean {
  const [passed, setPassed] = useState(() => isPastScheduleEndHour(endHour))

  useEffect(() => {
    const tick = () => setPassed(isPastScheduleEndHour(endHour))
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [endHour])

  return passed
}
