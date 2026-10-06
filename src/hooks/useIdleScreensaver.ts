import { useEffect, useRef, useState } from 'react'

const IDLE_MS = 60 * 1000 // 1 minute

/** Returns true after IDLE_MS of no mouse/touch/keyboard activity on the page. */
export function useIdleScreensaver(clickToWake = false): boolean {
  const [idle, setIdle] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let isIdle = false
    const reset = (event?: Event) => {
      if (isIdle && clickToWake && event?.type !== 'click') return
      isIdle = false
      if (timerRef.current) clearTimeout(timerRef.current)
      setIdle(false)
      timerRef.current = setTimeout(() => {
        isIdle = true
        setIdle(true)
      }, IDLE_MS)
    }

    reset()

    const events: (keyof WindowEventMap)[] = ['click', 'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel']
    for (const ev of events) window.addEventListener(ev, reset, { passive: true })

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const ev of events) window.removeEventListener(ev, reset)
    }
  }, [clickToWake])

  return idle
}
