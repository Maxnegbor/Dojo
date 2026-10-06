import { useCallback, useEffect, useRef, useState } from 'react'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-focus-one-thing'
export const FOCUS_ONE_THING_IDLE_MS = 60 * 60 * 1000

interface FocusAnswer {
  answer: string
  lastActivity: number
}

export function readFocusAnswer(now = Date.now()): FocusAnswer {
  try {
    const saved = JSON.parse(storageGetItem(STORAGE_KEY) ?? 'null') as FocusAnswer | null
    if (saved && typeof saved.answer === 'string' && Number.isFinite(saved.lastActivity)
      && now - saved.lastActivity < FOCUS_ONE_THING_IDLE_MS) return saved
  } catch { /* Ignore invalid saved data. */ }
  return { answer: '', lastActivity: now }
}

/** A running or paused session keeps the answer; idle answers expire after an hour. */
export function useFocusOneThing(timerActive: boolean) {
  const [saved, setSaved] = useState(readFocusAnswer)
  const savedRef = useRef(saved)
  const persist = useCallback((next: FocusAnswer) => {
    savedRef.current = next
    storageSetItem(STORAGE_KEY, JSON.stringify(next))
    setSaved(next)
  }, [])
  const setAnswer = useCallback((answer: string) => {
    persist({ answer: answer.trim(), lastActivity: Date.now() })
  }, [persist])

  useEffect(() => {
    const hydrate = () => {
      const next = readFocusAnswer()
      savedRef.current = next
      setSaved(next)
    }
    window.addEventListener('user-storage-ready', hydrate)
    return () => window.removeEventListener('user-storage-ready', hydrate)
  }, [])

  useEffect(() => {
    if (!timerActive) return
    const touch = () => {
      if (savedRef.current.answer) persist({ ...savedRef.current, lastActivity: Date.now() })
    }
    touch()
    const id = window.setInterval(touch, 60_000)
    // Start the idle hour when the timer stops or its page unmounts.
    return () => {
      window.clearInterval(id)
      touch()
    }
  }, [timerActive, persist])

  useEffect(() => {
    if (timerActive || !saved.answer) return
    const expire = () => {
      if (Date.now() - savedRef.current.lastActivity >= FOCUS_ONE_THING_IDLE_MS) setAnswer('')
    }
    const id = window.setTimeout(expire, Math.max(0, saved.lastActivity + FOCUS_ONE_THING_IDLE_MS - Date.now()))
    window.addEventListener('focus', expire)
    document.addEventListener('visibilitychange', expire)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('focus', expire)
      document.removeEventListener('visibilitychange', expire)
    }
  }, [timerActive, saved, setAnswer])

  return { answer: saved.answer, setAnswer }
}
