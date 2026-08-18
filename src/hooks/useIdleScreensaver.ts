import { useEffect, useRef, useState } from 'react'

const IDLE_MS = 10 * 1000 // 10 seconds

/** Returns true after IDLE_MS of no mouse/touch/keyboard activity on the page. */
export function useIdleScreensaver(): boolean {
  const [idle, setIdle] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (idle) setIdle(false)
      timerRef.current = setTimeout(() => setIdle(true), IDLE_MS)
    }

    reset()

    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel']
    for (const ev of events) window.addEventListener(ev, reset, { passive: true })

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const ev of events) window.removeEventListener(ev, reset)
    }
  }, [idle])

  return idle
}
