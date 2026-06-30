import { useEffect, useState } from 'react'
import { isToday, parseISO } from 'date-fns'

/** True when viewing today — shutdown is available any time. */
export function useShutdownAvailable(viewDate: string): boolean {
  const [available, setAvailable] = useState(() => isToday(parseISO(viewDate)))

  useEffect(() => {
    const tick = () => setAvailable(isToday(parseISO(viewDate)))
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [viewDate])

  return available
}
