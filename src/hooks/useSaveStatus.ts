import { useCallback, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved'

export function useSaveStatus() {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const savedTimeoutRef = useRef<number | null>(null)

  const markSaving = useCallback(() => {
    if (savedTimeoutRef.current) {
      clearTimeout(savedTimeoutRef.current)
      savedTimeoutRef.current = null
    }
    setStatus('saving')
  }, [])

  const markSaved = useCallback(() => {
    setStatus('saved')
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    savedTimeoutRef.current = window.setTimeout(() => setStatus('idle'), 2000)
  }, [])

  return { status, markSaving, markSaved }
}

export function useDebouncedCallback<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number,
): T {
  const timeoutRef = useRef<number | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => fnRef.current(...args), delay)
    }) as T,
    [delay],
  )
}
