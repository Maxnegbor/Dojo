import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw, Settings2, SkipForward } from 'lucide-react'
import { FocusSessionHistory } from '@/components/focus/FocusSessionHistory'
import { Button } from '@/components/ui/Button'
import { FocusHourlyChart } from '@/components/focus/FocusHourlyChart'
import { FocusLabelPicker } from '@/components/focus/FocusLabelPicker'
import { FocusScheduleAgenda } from '@/components/focus/FocusScheduleAgenda'
import { FocusAlarmChecklistModal } from '@/components/focus/FocusAlarmChecklistModal'
import { FocusAlarmChecklistSettings } from '@/components/focus/FocusAlarmChecklistSettings'
import { FocusTimerAlarmModal } from '@/components/focus/FocusTimerAlarmModal'
import {
  FocusScorePrompt,
  type FocusScorePromptPayload,
} from '@/components/focus/FocusScorePrompt'
import { CycleStepper, LongBreakSettings, MinuteSlider, SkipBreaksToggle } from '@/components/focus/TimerControls'
import { FocusGoalModal } from '@/components/focus/FocusGoalModal'
import { ToggleRow } from '@/components/settings/SettingsControls'
import { useFocus } from '@/context/FocusContext'
import { useScreensaver } from '@/context/ScreensaverContext'
import { useSettings } from '@/context/SettingsContext'
import { useAuth } from '@/hooks/useData'
import { saveFocusGoal, syncFocusGoalFromSettings } from '@/lib/focusGoalSync'
import { getLastFocusLabelId, setLastFocusLabelId } from '@/lib/focusLabels'
import { addFocusScoreSession } from '@/lib/focusScores'
import { getFocusSettings, saveFocusSettings } from '@/lib/focusStore'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import {
  getBreakMinutesAfterFocus,
  isLongBreakAfterFocus,
  loggedFocusMinutes,
  remainingSessionSeconds,
  shouldSkipBreaks,
  totalFocusMinutes,
  totalSessionSeconds,
  type TimerPhase,
} from '@/lib/focusTimerLogic'
import { playTimerChime, startFocusTimerAlarm, stopFocusTimerAlarm, unlockAudio } from '@/lib/timerSound'
import { DEFAULT_FOCUS_SETTINGS, type FocusAlarmCheckItem, type FocusTimerSettings } from '@/types'
import { cn, formatDate, formatDuration } from '@/lib/utils'

type Phase = TimerPhase
type FocusClockMode = 'timer' | 'stopwatch'

const FOCUS_CLOCK_MODE_KEY = 'personal-os-focus-clock-mode'

function readClockMode(): FocusClockMode {
  return storageGetItem(FOCUS_CLOCK_MODE_KEY) === 'stopwatch' ? 'stopwatch' : 'timer'
}

interface PhaseHold {
  from: 'focus' | 'break'
  cycle: number
  score: FocusScorePromptPayload | null
}

function activeChecklist(
  enabled: boolean,
  items: FocusAlarmCheckItem[],
): FocusAlarmCheckItem[] {
  if (!enabled) return []
  return items.filter((item) => item.label.trim())
}

function activePreAlarmChecklist(settings: FocusTimerSettings): FocusAlarmCheckItem[] {
  return activeChecklist(settings.preAlarmChecklistEnabled, settings.preAlarmChecklist)
}

function activeAlarmChecklist(settings: FocusTimerSettings): FocusAlarmCheckItem[] {
  return activeChecklist(settings.alarmChecklistEnabled, settings.alarmChecklist)
}

function holdAlarmCopy(hold: PhaseHold, settings: FocusTimerSettings, checklistNext = false) {
  if (hold.from === 'break') {
    const done = hold.cycle >= settings.iterations
    return {
      title: 'Break over',
      subtitle: done ? 'Session complete.' : 'Time to focus again.',
      confirmLabel: done ? 'Done' : 'Start focus',
    }
  }
  if (shouldSkipBreaks(settings)) {
    const done = hold.cycle >= settings.iterations
    return {
      title: 'Focus complete',
      subtitle: checklistNext
        ? 'Checklist next.'
        : done
          ? 'Session complete.'
          : 'Next focus block is ready.',
      confirmLabel: checklistNext ? 'Continue' : done ? 'Done' : 'Start focus',
    }
  }
  const breakMinutes = getBreakMinutesAfterFocus(settings, hold.cycle)
  if (breakMinutes <= 0) {
    return {
      title: 'Focus complete',
      subtitle: checklistNext ? 'Checklist next.' : 'Session complete.',
      confirmLabel: checklistNext ? 'Continue' : 'Done',
    }
  }
  return {
    title: 'Focus complete',
    subtitle: checklistNext
      ? `${breakMinutes}-minute break starts after your checklist.`
      : `${breakMinutes}-minute break is ready.`,
    confirmLabel: checklistNext ? 'Continue' : 'Start break',
  }
}

function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="ml-0.5 shrink-0">
      <path d="M8 5.5v13l10.5-6.5L8 5.5z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <rect x="6" y="5" width="4.5" height="14" rx="1" fill="currentColor" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="1" fill="currentColor" />
    </svg>
  )
}

function TimerColon() {
  return (
    <span
      className="mx-[0.08em] inline-flex h-[0.55em] translate-y-[-0.04em] flex-col items-center justify-between align-middle"
      aria-hidden
    >
      <span className="size-[0.13em] shrink-0 rounded-full bg-current" />
      <span className="size-[0.13em] shrink-0 rounded-full bg-current" />
    </span>
  )
}

function FocusTimerFace({
  progress,
  isRest,
  totalSeconds,
  countUp = false,
  maskSeconds = false,
  className,
}: {
  progress: number
  isRest: boolean
  totalSeconds: number
  /** Stopwatch: show hours once the count passes 59:59. */
  countUp?: boolean
  /** Hide ticking seconds as two dashes (screensaver while the timer is running). */
  maskSeconds?: boolean
  className?: string
}) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const showHours = countUp && hours > 0
  const minutes = showHours ? Math.floor((safe % 3600) / 60) : Math.floor(safe / 60)
  const seconds = safe % 60
  const minuteLabel = String(minutes).padStart(2, '0')
  const secondLabel = String(seconds).padStart(2, '0')
  const hourLabel = String(hours)
  const sizeClass =
    showHours || minuteLabel.length > 2 ? 'text-[2.75rem]' : 'text-[3.75rem]'

  return (
    <div className={cn('relative h-60 w-60 shrink-0', className)}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="44" fill="none" stroke="#27272a" strokeWidth="5" />
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke={isRest ? '#3b82f6' : 'var(--accent-500)'}
          strokeWidth="5"
          strokeDasharray={`${progress * 2.76} 276`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            'select-none font-extralight leading-none tabular-nums tracking-tight text-zinc-50',
            sizeClass,
          )}
          aria-label={
            maskSeconds
              ? `${showHours ? `${hourLabel} hours ` : ''}${minuteLabel} minutes ${secondLabel} seconds`
              : undefined
          }
        >
          {showHours && (
            <>
              {hourLabel}
              <TimerColon />
            </>
          )}
          {minuteLabel}
          <TimerColon />
          {maskSeconds ? (
            <span className="inline-flex w-[2ch] tracking-normal" aria-hidden>
              <span className="flex w-[1ch] items-center justify-center">-</span>
              <span className="flex w-[1ch] items-center justify-center">-</span>
            </span>
          ) : (
            secondLabel
          )}
        </span>
      </div>
    </div>
  )
}

function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
    </svg>
  )
}

export function FocusTimerPage() {
  const {
    logFocusMinutes,
    updateFocusRecord,
    deleteFocusRecord,
    addFocusRecord,
    setLiveFocusSeconds,
    liveFocusSeconds,
    setTimerTabSeconds,
    setFocusImmersive,
    setFocusTimerActive,
  } = useFocus()
  const { active: screensaverActive, waking: screensaverWaking } = useScreensaver()
  const { userId } = useAuth()
  const { settings: userPrefs, formatTime } = useSettings()
  const [settings, setSettings] = useState<FocusTimerSettings>(getFocusSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [phase, setPhase] = useState<Phase>('focus')
  const [cycle, setCycle] = useState(1)
  const [remaining, setRemaining] = useState(settings.focusMinutes * 60)
  const [activeBreakMinutes, setActiveBreakMinutes] = useState(settings.breakMinutes)
  const [running, setRunning] = useState(false)
  const [sessionStarted, setSessionStarted] = useState(false)
  const [clockMode, setClockMode] = useState<FocusClockMode>(readClockMode)
  const [elapsed, setElapsed] = useState(0)
  const [showFocusGoalModal, setShowFocusGoalModal] = useState(false)
  const [scorePrompt, setScorePrompt] = useState<FocusScorePromptPayload | null>(null)
  const [phaseHold, setPhaseHold] = useState<PhaseHold | null>(null)
  const [preChecklistHold, setPreChecklistHold] = useState<{
    hold: PhaseHold
    items: FocusAlarmCheckItem[]
  } | null>(null)
  const [checklistHold, setChecklistHold] = useState<{
    hold: PhaseHold | null
    items: FocusAlarmCheckItem[]
  } | null>(null)
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(() => getLastFocusLabelId())

  const settingsRef = useRef(settings)
  const timerFaceRef = useRef<HTMLDivElement>(null)
  const scheduleSlotRef = useRef<HTMLDivElement>(null)
  const phaseRef = useRef(phase)
  const cycleRef = useRef(cycle)
  const remainingRef = useRef(remaining)
  const elapsedRef = useRef(elapsed)
  const clockModeRef = useRef(clockMode)
  const selectedLabelIdRef = useRef(selectedLabelId)
  const advancingRef = useRef(false)

  settingsRef.current = settings
  phaseRef.current = phase
  cycleRef.current = cycle
  elapsedRef.current = elapsed
  clockModeRef.current = clockMode
  selectedLabelIdRef.current = selectedLabelId

  const setPhaseRemaining = useCallback((seconds: number) => {
    remainingRef.current = seconds
    setRemaining(seconds)
  }, [])

  const selectLabel = useCallback((labelId: string | null) => {
    setSelectedLabelId(labelId)
    setLastFocusLabelId(labelId)
  }, [])

  const updateTimerSettings = useCallback((patch: Partial<FocusTimerSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveFocusSettings(next)
      return next
    })
  }, [])

  const resetTimerDefaults = useCallback(() => {
    setSettings(DEFAULT_FOCUS_SETTINGS)
    saveFocusSettings(DEFAULT_FOCUS_SETTINGS)
    if (userId) void syncFocusGoalFromSettings(userId, DEFAULT_FOCUS_SETTINGS)
  }, [userId])

  const handleSaveFocusGoal = useCallback(
    async (values: { period: typeof settings.focusGoalPeriod; amount: number; unit: typeof settings.focusGoalUnit }) => {
      if (!userId) return
      const { settings: next } = await saveFocusGoal(userId, settings, values)
      setSettings(next)
      saveFocusSettings(next)
    },
    [userId, settings],
  )

  useEffect(() => {
    if (showSettings) setSettings(getFocusSettings())
  }, [showSettings])

  useEffect(() => {
    const syncMode = () => {
      if (running || sessionStarted) return
      setClockMode(readClockMode())
    }
    window.addEventListener('user-storage-ready', syncMode)
    return () => window.removeEventListener('user-storage-ready', syncMode)
  }, [running, sessionStarted])

  const chooseClockMode = (next: FocusClockMode) => {
    if (next === clockMode || running || sessionStarted) return
    setClockMode(next)
    storageSetItem(FOCUS_CLOCK_MODE_KEY, next)
    elapsedRef.current = 0
    setElapsed(0)
    if (next === 'timer') {
      setPhase('focus')
      setCycle(1)
      setPhaseRemaining(settings.focusMinutes * 60)
    }
  }

  const phaseDuration =
    phase === 'focus' ? settings.focusMinutes * 60 : activeBreakMinutes * 60
  const phaseStartRef = useRef(Date.now())

  // Keep countdown in sync with sliders when idle (before/during settings preview)
  useEffect(() => {
    if (running || sessionStarted) return
    setPhase('focus')
    setCycle(1)
    setActiveBreakMinutes(settings.breakMinutes)
    setPhaseRemaining(settings.focusMinutes * 60)
  }, [
    settings.focusMinutes,
    settings.breakMinutes,
    settings.iterations,
    settings.skipBreaks,
    settings.longBreakEnabled,
    settings.longBreakAfterCycles,
    settings.longBreakMinutes,
    running,
    sessionStarted,
    setPhaseRemaining,
  ])

  const sessionEndAt = useMemo(() => {
    if (phase === 'done') return null

    const secs = sessionStarted
      ? remainingSessionSeconds(settings, phase, cycle, remaining)
      : totalSessionSeconds(settings)

    if (secs <= 0) return null
    return new Date(Date.now() + secs * 1000)
  }, [settings, phase, cycle, remaining, sessionStarted])

  const sessionFocusMinutes = useMemo(() => {
    if (phase === 'done') return 0
    return totalFocusMinutes(settings)
  }, [settings, phase])

  useEffect(() => {
    if (clockMode === 'stopwatch') {
      if (!sessionStarted) {
        setLiveFocusSeconds(0)
        return
      }
      if (running) {
        let raf = 0
        const loop = () => {
          setLiveFocusSeconds(Math.max(0, (Date.now() - phaseStartRef.current) / 1000))
          raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(raf)
      }
      setLiveFocusSeconds(elapsed)
      return
    }

    if (phase !== 'focus' || !sessionStarted) {
      setLiveFocusSeconds(0)
      return
    }

    if (running) {
      let raf = 0
      const loop = () => {
        setLiveFocusSeconds(Math.max(0, (Date.now() - phaseStartRef.current) / 1000))
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
      return () => cancelAnimationFrame(raf)
    }

    setLiveFocusSeconds(Math.max(0, settings.focusMinutes * 60 - remaining))
  }, [
    clockMode,
    phase,
    sessionStarted,
    running,
    remaining,
    elapsed,
    settings.focusMinutes,
    setLiveFocusSeconds,
  ])

  useEffect(() => () => setLiveFocusSeconds(0), [setLiveFocusSeconds])

  useEffect(() => () => setFocusImmersive(false), [setFocusImmersive])

  useEffect(() => {
    setFocusTimerActive(running || sessionStarted)
    return () => setFocusTimerActive(false)
  }, [running, sessionStarted, setFocusTimerActive])

  const maybePromptFocusScore = useCallback((startMs: number, minutes: number) => {
    if (!settingsRef.current.promptFocusScore) return
    const endMs = Date.now()
    setScorePrompt({
      date: formatDate(new Date()),
      startMs,
      endMs,
      minutes,
    })
  }, [])

  const advancePhase = useCallback(() => {
    const s = settingsRef.current
    const p = phaseRef.current
    const c = cycleRef.current

    try {
      if (p === 'focus') {
        const sessionStart = phaseStartRef.current
        const elapsed = loggedFocusMinutes(s.focusMinutes, 0, true)
        void logFocusMinutes(elapsed, undefined, sessionStart, selectedLabelIdRef.current).catch(
          () => {},
        )
        setRunning(false)
        const hold: PhaseHold = {
          from: 'focus',
          cycle: c,
          score: s.promptFocusScore
            ? {
                date: formatDate(new Date()),
                startMs: sessionStart,
                endMs: Date.now(),
                minutes: elapsed,
              }
            : null,
        }
        const before = activePreAlarmChecklist(s)
        if (before.length > 0) {
          setPreChecklistHold({ hold, items: before })
          return
        }
        setPhaseHold(hold)
        return
      }

      setRunning(false)
      setPhaseHold({ from: 'break', cycle: c, score: null })
    } finally {
      advancingRef.current = false
    }
  }, [logFocusMinutes])

  const continueAfterHold = useCallback(
    (hold: PhaseHold) => {
      const s = settingsRef.current
      const c = hold.cycle

      if (hold.from === 'focus') {
        if (shouldSkipBreaks(s)) {
          if (c >= s.iterations) {
            setPhase('done')
            setRunning(false)
            setSessionStarted(false)
            return
          }
          setCycle(c + 1)
          setPhase('focus')
          setPhaseRemaining(s.focusMinutes * 60)
          setRunning(true)
          setSessionStarted(true)
          phaseStartRef.current = Date.now()
          return
        }
        const breakMinutes = getBreakMinutesAfterFocus(s, c)
        if (breakMinutes <= 0) {
          setPhase('done')
          setRunning(false)
          setSessionStarted(false)
          return
        }
        setActiveBreakMinutes(breakMinutes)
        setPhase('break')
        setPhaseRemaining(breakMinutes * 60)
        setRunning(true)
        setSessionStarted(true)
        phaseStartRef.current = Date.now()
        return
      }

      if (c >= s.iterations) {
        setPhase('done')
        setRunning(false)
        setSessionStarted(false)
        return
      }
      if (userPrefs.timerSoundEnabled) playTimerChime()
      setCycle(c + 1)
      setPhase('focus')
      setPhaseRemaining(s.focusMinutes * 60)
      setRunning(true)
      setSessionStarted(true)
      phaseStartRef.current = Date.now()
    },
    [setPhaseRemaining, userPrefs.timerSoundEnabled],
  )

  const dismissPhaseHold = useCallback(
    (score?: number) => {
      const hold = phaseHold
      if (!hold) return
      if (score != null && hold.score) addFocusScoreSession({ ...hold.score, score })
      setPhaseHold(null)

      if (hold.from === 'focus') {
        const items = activeAlarmChecklist(settingsRef.current)
        if (items.length > 0) {
          setChecklistHold({ hold, items })
          return
        }
      }
      continueAfterHold(hold)
    },
    [phaseHold, continueAfterHold],
  )

  const finishPreChecklist = useCallback(() => {
    const pending = preChecklistHold
    if (!pending) return
    setPreChecklistHold(null)
    setPhaseHold(pending.hold)
  }, [preChecklistHold])

  const finishChecklist = useCallback(() => {
    const pending = checklistHold
    if (!pending) return
    setChecklistHold(null)
    if (pending.hold) continueAfterHold(pending.hold)
  }, [checklistHold, continueAfterHold])

  useEffect(() => {
    if (!running || phaseHold) return

    if (clockMode === 'stopwatch') {
      const id = window.setInterval(() => {
        const next = elapsedRef.current + 1
        elapsedRef.current = next
        setElapsed(next)
      }, 1000)
      return () => clearInterval(id)
    }

    if (phase === 'done') return

    const id = window.setInterval(() => {
      if (advancingRef.current) return
      if (remainingRef.current <= 0) return

      const next = remainingRef.current - 1
      if (next > 0) {
        setPhaseRemaining(next)
        return
      }

      advancingRef.current = true
      setPhaseRemaining(0)
      advancePhase()
    }, 1000)

    return () => clearInterval(id)
  }, [running, phase, phaseHold, clockMode, advancePhase, setPhaseRemaining])

  useEffect(() => {
    if (running && clockMode === 'stopwatch') {
      setTimerTabSeconds(elapsed)
    } else if (running && phase !== 'done') {
      setTimerTabSeconds(remaining)
    } else {
      setTimerTabSeconds(null)
    }
  }, [running, remaining, elapsed, phase, clockMode, setTimerTabSeconds])

  useEffect(() => {
    return () => {
      setTimerTabSeconds(null)
    }
  }, [setTimerTabSeconds])

  useEffect(() => {
    if (!phaseHold) {
      stopFocusTimerAlarm()
      return
    }
    startFocusTimerAlarm()
    return () => stopFocusTimerAlarm()
  }, [phaseHold])

  useEffect(() => {
    return () => stopFocusTimerAlarm()
  }, [])

  const endFocus = () => {
    if (phase !== 'focus') return

    const sessionStart = phaseStartRef.current
    const elapsed = loggedFocusMinutes(settings.focusMinutes, remaining, remaining <= 1)
    void logFocusMinutes(elapsed, undefined, sessionStart, selectedLabelIdRef.current).catch(
      () => {},
    )
    maybePromptFocusScore(sessionStart, elapsed)

    if (shouldSkipBreaks(settings)) {
      if (cycle >= settings.iterations) {
        setPhase('done')
        setRunning(false)
        setSessionStarted(false)
        return
      }
      setCycle(cycle + 1)
      setPhase('focus')
      setPhaseRemaining(settings.focusMinutes * 60)
    } else {
      const breakMinutes = getBreakMinutesAfterFocus(settings, cycle)
      setActiveBreakMinutes(breakMinutes)
      setPhase('break')
      setPhaseRemaining(breakMinutes * 60)
    }

    setRunning(false)
    setSessionStarted(true)
    phaseStartRef.current = Date.now()
  }

  const endBreak = () => {
    if (phase !== 'break') return

    if (cycle >= settings.iterations) {
      setPhase('done')
      setRunning(false)
      setSessionStarted(false)
      return
    }

    setCycle(cycle + 1)
    setPhase('focus')
    setPhaseRemaining(settings.focusMinutes * 60)
    setRunning(false)
    setSessionStarted(true)
    phaseStartRef.current = Date.now()
  }

  const start = () => {
    unlockAudio()
    if (clockMode === 'stopwatch') {
      phaseStartRef.current = Date.now() - elapsedRef.current * 1000
    } else {
      phaseStartRef.current = Date.now()
    }
    setSessionStarted(true)
    setRunning(true)
  }

  const stopStopwatch = () => {
    const seconds = elapsedRef.current
    const minutes = seconds <= 0 ? 0 : Math.max(1, Math.round(seconds / 60))
    const sessionStart = Date.now() - minutes * 60_000
    setRunning(false)
    setSessionStarted(false)
    elapsedRef.current = 0
    setElapsed(0)
    if (minutes <= 0) return
    void logFocusMinutes(minutes, undefined, sessionStart, selectedLabelIdRef.current).catch(
      () => {},
    )
    maybePromptFocusScore(sessionStart, minutes)
    const items = activeAlarmChecklist(settings)
    if (items.length > 0) setChecklistHold({ hold: null, items })
  }

  const reset = () => {
    advancingRef.current = false
    stopFocusTimerAlarm()
    setPhaseHold(null)
    setPreChecklistHold(null)
    setChecklistHold(null)
    setRunning(false)
    setSessionStarted(false)
    elapsedRef.current = 0
    setElapsed(0)
    setPhase('focus')
    setCycle(1)
    setActiveBreakMinutes(settings.breakMinutes)
    setPhaseRemaining(settings.focusMinutes * 60)
  }

  const onLongBreak = phase === 'break' && isLongBreakAfterFocus(settings, cycle)

  const isRest = phase === 'break'

  const liveFocusSession = useMemo(() => {
    if (clockMode === 'stopwatch') {
      if (!sessionStarted) return null
      const startMs = phaseStartRef.current
      const elapsedMs = running ? Date.now() - startMs : elapsed * 1000
      return { startMs, endMs: startMs + Math.max(0, elapsedMs) }
    }
    if (phase !== 'focus' || !sessionStarted) return null
    const startMs = phaseStartRef.current
    const elapsedMs = running
      ? Date.now() - startMs
      : (settings.focusMinutes * 60 - remaining) * 1000
    return { startMs, endMs: startMs + Math.max(0, elapsedMs) }
  }, [
    clockMode,
    phase,
    sessionStarted,
    running,
    remaining,
    elapsed,
    settings.focusMinutes,
    liveFocusSeconds,
  ])

  const formatHourLabel = useCallback(
    (date: Date) =>
      formatTime(new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), 0)),
    [formatTime],
  )

  const isStopwatch = clockMode === 'stopwatch'
  const progress = isStopwatch
    ? 0
    : phaseDuration > 0
      ? Math.min(100, Math.max(0, ((phaseDuration - remaining) / phaseDuration) * 100))
      : 0
  const faceSeconds = isStopwatch ? elapsed : remaining

  const showSchedule = userPrefs.showFocusSchedule && !!userId

  useLayoutEffect(() => {
    const face = timerFaceRef.current
    const slot = scheduleSlotRef.current
    const column = slot?.parentElement
    if (!face || !slot || !column || !showSchedule) return

    const align = () => {
      const faceRect = face.getBoundingClientRect()
      const columnTop = column.getBoundingClientRect().top
      const nowLine = slot.querySelector('[data-focus-now]')
      const nowOffset = nowLine
        ? nowLine.getBoundingClientRect().top - slot.getBoundingClientRect().top
        : 0
      const margin = faceRect.top + faceRect.height / 2 - columnTop - nowOffset
      slot.style.marginTop = `${Math.max(0, margin)}px`
    }

    align()
    const observer = new ResizeObserver(align)
    observer.observe(face)
    observer.observe(column)
    window.addEventListener('resize', align)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', align)
    }
  }, [showSchedule, screensaverActive])

  const focusScreensaverLayer =
    screensaverActive &&
    createPortal(
      <div
        className={cn(
          'fixed inset-0 z-[200] flex h-dvh items-center justify-center bg-[#06060b] transition-opacity duration-[1400ms] ease-in-out',
          screensaverWaking && 'pointer-events-none opacity-0',
        )}
      >
        <FocusTimerFace
          progress={progress}
          isRest={isRest}
          totalSeconds={faceSeconds}
          countUp={isStopwatch}
          maskSeconds={running}
        />
      </div>,
      document.body,
    )

  return (
    <>
      {focusScreensaverLayer}
      <div
        className={cn(
          'focus-stage relative mx-auto flex min-h-full w-full flex-col justify-start gap-4 py-6 transition-[gap,padding,opacity] duration-[1400ms] ease-in-out',
          screensaverActive && 'pointer-events-none opacity-0',
        )}
      >
      <div className="grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_28rem_minmax(0,1fr)]">
        <div
          className={cn(
            'min-w-0',
            showSettings ? 'order-3' : 'hidden lg:order-3 lg:block',
          )}
        >
          {showSettings && (
            <section
              className={cn(
                'w-full space-y-5 lg:mr-auto lg:max-w-72',
                screensaverActive && 'pointer-events-none max-h-0 overflow-hidden opacity-0',
              )}
            >
              <h3 className="text-sm font-semibold text-zinc-200">Timer settings</h3>
              {isStopwatch ? (
                <p className="text-sm leading-relaxed text-zinc-400">
                  Stopwatch counts up until you stop it. You can pause or stop at any time, and the time is saved to your focus history.
                </p>
              ) : (
                <>
                  <MinuteSlider
                    label="Focus duration"
                    value={settings.focusMinutes}
                    disabled={running || sessionStarted}
                    onChange={(focusMinutes) => {
                      updateTimerSettings({ focusMinutes })
                      if (!running && !sessionStarted) {
                        setPhaseRemaining(focusMinutes * 60)
                      }
                    }}
                  />
                  <MinuteSlider
                    label="Break duration"
                    value={settings.breakMinutes}
                    disabled={shouldSkipBreaks(settings) || running || sessionStarted}
                    onChange={(breakMinutes) => updateTimerSettings({ breakMinutes })}
                  />
                  <CycleStepper
                    label="Cycles"
                    value={settings.iterations}
                    onChange={(iterations) =>
                      updateTimerSettings({
                        iterations,
                        ...(iterations > 1 ? { skipBreaks: false } : {}),
                      })
                    }
                  />
                  {settings.iterations <= 1 && (
                    <SkipBreaksToggle
                      checked={settings.skipBreaks}
                      onChange={(skipBreaks) => updateTimerSettings({ skipBreaks })}
                    />
                  )}
                  <ToggleRow
                    label="Allow pause"
                    compact
                    checked={settings.allowPause}
                    onChange={(allowPause) => updateTimerSettings({ allowPause })}
                  />
                </>
              )}
              <ToggleRow
                label="Ask for focus score"
                description="After each focus block, rate how focused you felt (1–10)"
                compact
                checked={settings.promptFocusScore}
                onChange={(promptFocusScore) => updateTimerSettings({ promptFocusScore })}
              />
              {!isStopwatch && (
                <FocusAlarmChecklistSettings
                  label="Checklist before alarm"
                  description="When the timer ends, check every item before the alarm starts."
                  enabled={settings.preAlarmChecklistEnabled}
                  items={settings.preAlarmChecklist}
                  onEnabledChange={(preAlarmChecklistEnabled) =>
                    updateTimerSettings({ preAlarmChecklistEnabled })
                  }
                  onItemsChange={(preAlarmChecklist) => updateTimerSettings({ preAlarmChecklist })}
                />
              )}
              <FocusAlarmChecklistSettings
                label="Checklist after alarm"
                description={
                  isStopwatch
                    ? 'When you end the stopwatch, check every item.'
                    : 'After you dismiss the alarm, check every item before the break starts. Ending the stopwatch uses this list too.'
                }
                enabled={settings.alarmChecklistEnabled}
                items={settings.alarmChecklist}
                onEnabledChange={(alarmChecklistEnabled) => updateTimerSettings({ alarmChecklistEnabled })}
                onItemsChange={(alarmChecklist) => updateTimerSettings({ alarmChecklist })}
              />
              {!isStopwatch && (
                <LongBreakSettings
                  enabled={settings.longBreakEnabled}
                  afterCycles={settings.longBreakAfterCycles}
                  minutes={settings.longBreakMinutes}
                  disabled={shouldSkipBreaks(settings) || running || sessionStarted}
                  onEnabledChange={(longBreakEnabled) => updateTimerSettings({ longBreakEnabled })}
                  onAfterCyclesChange={(longBreakAfterCycles) =>
                    updateTimerSettings({ longBreakAfterCycles })
                  }
                  onMinutesChange={(longBreakMinutes) => updateTimerSettings({ longBreakMinutes })}
                />
              )}
              {!settings.focusGoalEnabled && (
                <div className="border-t border-zinc-800/80 pt-4">
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setShowFocusGoalModal(true)}
                  >
                    Set focus goal
                  </Button>
                </div>
              )}
              {!isStopwatch && (
                <div className="pt-1">
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={running || sessionStarted}
                    onClick={resetTimerDefaults}
                  >
                    Reset to defaults
                  </Button>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="order-1 mx-auto flex w-full min-w-0 max-w-[28rem] flex-col items-center lg:order-2">
          <div className="flex w-full flex-col items-center px-2 pt-2 pb-4 sm:px-4">
            <div
              className={cn(
                'mb-3 flex rounded-full border border-zinc-800 bg-zinc-950 p-0.5 transition-opacity duration-[1400ms] ease-in-out',
                screensaverActive && 'pointer-events-none opacity-0',
                (running || sessionStarted) && 'opacity-60',
              )}
              role="tablist"
              aria-label="Focus clock mode"
            >
              {(['timer', 'stopwatch'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={clockMode === option}
                  disabled={running || sessionStarted}
                  onClick={() => chooseClockMode(option)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
                    clockMode === option
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>

            <p
          className={cn(
            'mb-1 h-4 text-xs font-medium uppercase tracking-widest transition-opacity duration-[1400ms] ease-in-out',
            isStopwatch || phase === 'focus'
              ? 'text-[var(--accent-400)]'
              : isRest
                ? 'text-blue-400'
                : 'text-zinc-500',
            screensaverActive && 'pointer-events-none mb-0 h-0 overflow-hidden opacity-0',
          )}
        >
          {isStopwatch
            ? 'Stopwatch'
            : phase === 'done'
              ? 'Session complete'
              : phase === 'focus'
                ? `Focus · ${cycle}/${settings.iterations}`
                : onLongBreak
                  ? `Long rest · ${cycle}/${settings.iterations}`
                  : `Rest · ${cycle}/${settings.iterations}`}
        </p>

        <div ref={timerFaceRef} className="mt-4 mb-6">
          <FocusTimerFace
            progress={progress}
            isRest={isRest}
            totalSeconds={faceSeconds}
            countUp={isStopwatch}
          />
        </div>

        <FocusLabelPicker
          className={cn('mb-4 transition-opacity duration-[1400ms] ease-in-out', screensaverActive && 'pointer-events-none mb-0 max-h-0 overflow-hidden opacity-0')}
          value={selectedLabelId}
          onChange={selectLabel}
          disabled={phase === 'done'}
        />

        {!isStopwatch && sessionEndAt && phase !== 'done' ? (
          <div
            className={cn(
              'mb-5 flex h-11 shrink-0 flex-wrap items-center justify-center gap-1.5 transition-opacity duration-[1400ms] ease-in-out',
              screensaverActive && 'pointer-events-none mb-0 max-h-0 overflow-hidden opacity-0',
            )}
          >
            <div className="rounded-full border border-zinc-800 bg-transparent px-3 py-1 text-center">
              <p className="text-[9px] uppercase tracking-wide text-[var(--accent-300)]/70">Ends at</p>
              <p className="text-xs font-semibold text-[var(--accent-200)]">
                {formatTime(sessionEndAt)}
              </p>
            </div>
            <div className="rounded-full border border-zinc-800 bg-transparent px-3 py-1 text-center">
              <p className="text-[9px] uppercase tracking-wide text-[var(--accent-300)]/70">Focus time</p>
              <p className="text-xs font-semibold text-[var(--accent-200)]">
                {formatDuration(sessionFocusMinutes)}
              </p>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'mb-5 h-11 shrink-0 transition-all duration-[1400ms] ease-in-out',
              screensaverActive && 'mb-0 h-0',
            )}
            aria-hidden
          />
        )}

        <div
          className={cn(
            'mb-3 flex h-12 w-full shrink-0 items-center justify-center transition-opacity duration-[1400ms] ease-in-out',
            screensaverActive && 'pointer-events-none mb-0 max-h-0 overflow-hidden opacity-0',
          )}
        >
          {!running ? (
            <Button
              size="lg"
              onClick={start}
              disabled={!isStopwatch && phase === 'done'}
              aria-label={sessionStarted ? 'Resume' : 'Start'}
              className={cn(
                'h-12 w-24 p-0 text-white',
                !isStopwatch && isRest && 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700',
              )}
            >
              <PlayIcon />
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => setRunning(false)}
              disabled={(!isStopwatch && !settings.allowPause) || phase === 'done'}
              aria-label="Pause"
              className={cn(
                'h-12 w-24 p-0 text-white',
                !isStopwatch && isRest
                  ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700'
                  : undefined,
                !isStopwatch && !settings.allowPause && 'opacity-30',
              )}
            >
              <PauseIcon />
            </Button>
          )}
        </div>

        <div
          className={cn(
            'flex h-12 shrink-0 items-center justify-center gap-2 transition-opacity duration-[1400ms] ease-in-out',
            screensaverActive && 'pointer-events-none max-h-0 overflow-hidden opacity-0',
          )}
        >
          {isStopwatch ? (
            <Button
              variant="secondary"
              onClick={stopStopwatch}
              disabled={!sessionStarted}
              aria-label="Stop"
              className={cn(
                'h-12 w-12 p-0',
                !sessionStarted && 'opacity-30',
              )}
            >
              <StopIcon />
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => (phase === 'focus' ? endFocus() : endBreak())}
              disabled={!sessionStarted || phase === 'done'}
              aria-label="End"
              className={cn(
                'h-12 w-12 p-0',
                (!sessionStarted || phase === 'done') && 'opacity-30',
              )}
            >
              <SkipForward size={20} />
            </Button>
          )}

          <Button variant="ghost" onClick={reset} aria-label="Reset">
            <RotateCcw size={16} />
          </Button>
          <Button variant="ghost" onClick={() => setShowSettings(!showSettings)} aria-label="Quick timer settings">
            <Settings2 size={16} />
          </Button>
        </div>
          </div>

          <section
            className={cn(
              'w-full pt-2 transition-opacity duration-[1400ms] ease-in-out',
              screensaverActive && 'pointer-events-none max-h-0 overflow-hidden opacity-0',
            )}
          >
            <FocusHourlyChart
              userId={userId}
              formatHour={formatHourLabel}
              liveSession={liveFocusSession}
              useDevDummy={userPrefs.devMode}
            />
          </section>

          <FocusSessionHistory
            formatTime={formatTime}
            onUpdate={updateFocusRecord}
            onDelete={deleteFocusRecord}
            onCreate={addFocusRecord}
            className={cn(
              'pt-6 transition-opacity duration-[1400ms] ease-in-out',
              screensaverActive && 'pointer-events-none max-h-0 overflow-hidden opacity-0',
            )}
          />
        </div>

        <div
          ref={scheduleSlotRef}
          className={cn(
            'order-2 min-w-0 lg:order-1',
            !(showSchedule && userId) && 'hidden lg:block',
          )}
        >
        {showSchedule && userId && (
          <FocusScheduleAgenda
            userId={userId}
            formatTime={formatTime}
            className="mx-auto w-full lg:ml-auto lg:max-w-72"
          />
        )}
        </div>
      </div>

      {showFocusGoalModal && (
        <FocusGoalModal
          initial={{
            period: settings.focusGoalPeriod,
            amount: settings.focusGoalAmount,
            unit: settings.focusGoalUnit,
          }}
          onSave={handleSaveFocusGoal}
          onClose={() => setShowFocusGoalModal(false)}
        />
      )}

      {phaseHold && (
        <FocusTimerAlarmModal
          {...holdAlarmCopy(
            phaseHold,
            settings,
            phaseHold.from === 'focus' && activeAlarmChecklist(settings).length > 0,
          )}
          scorePayload={phaseHold.score}
          onDismiss={dismissPhaseHold}
        />
      )}

      {preChecklistHold && (
        <FocusAlarmChecklistModal
          kicker="Before the alarm"
          items={preChecklistHold.items}
          subtitle="Check every item. The alarm starts after this."
          onComplete={finishPreChecklist}
        />
      )}

      {checklistHold && (
        <FocusAlarmChecklistModal
          kicker="After the alarm"
          items={checklistHold.items}
          subtitle={
            checklistHold.hold &&
            !shouldSkipBreaks(settings) &&
            getBreakMinutesAfterFocus(settings, checklistHold.hold.cycle) > 0
              ? 'Check every item. The break starts after this.'
              : 'Check every item to continue.'
          }
          onComplete={finishChecklist}
        />
      )}

      {scorePrompt && !phaseHold && !checklistHold && (
        <FocusScorePrompt
          payload={scorePrompt}
          onSkip={() => setScorePrompt(null)}
          onSubmit={(score) => {
            addFocusScoreSession({ ...scorePrompt, score })
            setScorePrompt(null)
          }}
        />
      )}
    </div>
    </>
  )
}
