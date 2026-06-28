import { useEffect, useState } from 'react'
import { isToday, parseISO } from 'date-fns'

const SHUTDOWN_HOUR = 18

/** True when viewing today and local time is 18:00 or later. */
export function useShutdownAvailable(viewDate: string): boolean {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setAvailable(isToday(parseISO(viewDate)) && now.getHours() >= SHUTDOWN_HOUR)
    }
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [viewDate])

  return available
}
