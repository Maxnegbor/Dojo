import { useCallback, useEffect, useRef, useState } from 'react'

export type ReminderDismissPhase = 'completing' | 'exiting'

export const REMINDER_COMPLETING_MS = 900
export const REMINDER_EXIT_MS = 420

interface UseReminderDismissAnimationOptions {
  onDismiss: (id: string) => void
}

export function useReminderDismissAnimation({ onDismiss }: UseReminderDismissAnimationOptions) {
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  const [dismissState, setDismissState] = useState<Map<string, ReminderDismissPhase>>(
    () => new Map(),
  )
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const finishedIdsRef = useRef<Set<string>>(new Set())

  const clearTimers = useCallback((id: string) => {
    for (const key of [`${id}:exit`, `${id}:exit-fallback`]) {
      const timer = timersRef.current.get(key)
      if (timer) window.clearTimeout(timer)
      timersRef.current.delete(key)
    }
  }, [])

  const finishDismiss = useCallback(
    (id: string) => {
      if (finishedIdsRef.current.has(id)) return
      finishedIdsRef.current.add(id)
      clearTimers(id)
      onDismissRef.current(id)
      setDismissState((prev) => {
        if (!prev.has(id)) return prev
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    },
    [clearTimers],
  )

  const startExit = useCallback(
    (id: string) => {
      setDismissState((prev) => {
        if (prev.get(id) !== 'completing') return prev
        return new Map(prev).set(id, 'exiting')
      })

      clearTimers(id)
      timersRef.current.set(
        `${id}:exit-fallback`,
        window.setTimeout(() => finishDismiss(id), REMINDER_EXIT_MS + 80),
      )
    },
    [clearTimers, finishDismiss],
  )

  const dismiss = useCallback(
    (id: string) => {
      finishedIdsRef.current.delete(id)
      setDismissState((prev) => {
        if (prev.has(id)) return prev
        return new Map(prev).set(id, 'completing')
      })

      clearTimers(id)
      timersRef.current.set(
        `${id}:exit`,
        window.setTimeout(() => startExit(id), REMINDER_COMPLETING_MS + 50),
      )
    },
    [clearTimers, startExit],
  )

  const onFillAnimationEnd = useCallback(
    (id: string) => {
      window.clearTimeout(timersRef.current.get(`${id}:exit`))
      timersRef.current.delete(`${id}:exit`)
      startExit(id)
    },
    [startExit],
  )

  const onExitTransitionEnd = useCallback(
    (id: string, propertyName: string) => {
      if (propertyName !== 'grid-template-rows') return
      finishDismiss(id)
    },
    [finishDismiss],
  )

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer)
      }
      timersRef.current.clear()
    }
  }, [])

  const getPhase = useCallback(
    (id: string): ReminderDismissPhase | undefined => dismissState.get(id),
    [dismissState],
  )

  const isDismissing = useCallback((id: string) => dismissState.has(id), [dismissState])

  return { dismiss, getPhase, isDismissing, onFillAnimationEnd, onExitTransitionEnd }
}
