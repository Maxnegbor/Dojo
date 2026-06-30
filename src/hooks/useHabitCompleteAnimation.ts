import { useCallback, useEffect, useRef, useState } from 'react'

export type HabitCompletePhase = 'filling' | 'exiting'

export const HABIT_FILL_MS = 900
export const HABIT_EXIT_MS = 420

export function useHabitCompleteAnimation(options?: { onExitComplete?: (id: string) => void }) {
  const onExitCompleteRef = useRef(options?.onExitComplete)
  onExitCompleteRef.current = options?.onExitComplete
  const [phases, setPhases] = useState<Map<string, HabitCompletePhase>>(() => new Map())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const clearTimers = useCallback((id: string) => {
    for (const key of [`${id}:fill`, `${id}:exit`]) {
      const timer = timersRef.current.get(key)
      if (timer) window.clearTimeout(timer)
      timersRef.current.delete(key)
    }
  }, [])

  const clearPhase = useCallback(
    (id: string) => {
      clearTimers(id)
      setPhases((prev) => {
        if (!prev.has(id)) return prev
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    },
    [clearTimers],
  )

  const startComplete = useCallback(
    (id: string) => {
      clearPhase(id)
      setPhases((prev) => new Map(prev).set(id, 'filling'))

      timersRef.current.set(
        `${id}:fill`,
        window.setTimeout(() => {
          setPhases((prev) => new Map(prev).set(id, 'exiting'))
          timersRef.current.set(
            `${id}:exit`,
            window.setTimeout(() => {
              onExitCompleteRef.current?.(id)
              clearPhase(id)
            }, HABIT_EXIT_MS),
          )
        }, HABIT_FILL_MS),
      )
    },
    [clearPhase],
  )

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer)
      }
      timersRef.current.clear()
    }
  }, [])

  const getPhase = useCallback((id: string) => phases.get(id), [phases])

  const isAnimating = useCallback((id: string) => phases.has(id), [phases])

  const resetAll = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      window.clearTimeout(timer)
    }
    timersRef.current.clear()
    setPhases(new Map())
  }, [])

  return { getPhase, isAnimating, startComplete, clearPhase, resetAll }
}
