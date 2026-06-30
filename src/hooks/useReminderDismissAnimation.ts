import { useCallback, useState } from 'react'

export type ReminderDismissPhase = 'completing' | 'exiting'

export const REMINDER_COMPLETING_MS = 900

const COMPLETING_MS = REMINDER_COMPLETING_MS
const EXIT_MS = 420

interface UseReminderDismissAnimationOptions {
  onDismiss: (id: string) => void
}

export function useReminderDismissAnimation({ onDismiss }: UseReminderDismissAnimationOptions) {
  const [dismissState, setDismissState] = useState<Map<string, ReminderDismissPhase>>(
    () => new Map(),
  )

  const dismiss = useCallback(
    (id: string) => {
      setDismissState((prev) => {
        if (prev.has(id)) return prev
        return new Map(prev).set(id, 'completing')
      })

      window.setTimeout(() => {
        setDismissState((prev) => new Map(prev).set(id, 'exiting'))
        window.setTimeout(() => {
          onDismiss(id)
          setDismissState((prev) => {
            const next = new Map(prev)
            next.delete(id)
            return next
          })
        }, EXIT_MS)
      }, COMPLETING_MS)
    },
    [onDismiss],
  )

  const getPhase = useCallback(
    (id: string): ReminderDismissPhase | undefined => dismissState.get(id),
    [dismissState],
  )

  const isDismissing = useCallback((id: string) => dismissState.has(id), [dismissState])

  return { dismiss, getPhase, isDismissing }
}
