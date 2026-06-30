import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Settings2, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CycleStepper, LongBreakSettings, MinuteSlider, SkipBreaksToggle } from '@/components/focus/TimerControls'
import { FocusGoalModal } from '@/components/focus/FocusGoalModal'
import { ToggleRow } from '@/components/settings/SettingsControls'
import { useFocus } from '@/context/FocusContext'
import { useSettings } from '@/context/SettingsContext'
import { useAuth } from '@/hooks/useData'
import { saveFocusGoal, syncFocusGoalFromSettings } from '@/lib/focusGoalSync'
import { getFocusSettings, saveFocusSettings } from '@/lib/focusStore'
import {
  getBreakMinutesAfterFocus,
  isLongBreakAfterFocus,
  remainingFocusMinutes,
  remainingSessionSeconds,
  totalFocusMinutes,
  totalSessionSeconds,
  type TimerPhase,
} from '@/lib/focusTimerLogic'
import { playTimerChime } from '@/lib/timerSound'
import { DEFAULT_FOCUS_SETTINGS, type FocusTimerSettings } from '@/types'
import { cn, formatDate, formatDuration } from '@/lib/utils'

type Phase = TimerPhase

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

export function FocusTimerPage() {
  const { focusToday, logFocusMinutes, setLiveFocusSeconds } = useFocus()
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
  const [showFocusGoalModal, setShowFocusGoalModal] = useState(false)

  const settingsRef = useRef(settings)
  const phaseRef = useRef(phase)
  const cycleRef = useRef(cycle)
  const activeBreakMinutesRef = useRef(activeBreakMinutes)

  settingsRef.current = settings
  phaseRef.current = phase
  cycleRef.current = cycle
  activeBreakMinutesRef.current = activeBreakMinutes

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

  const phaseDuration =
    phase === 'focus' ? settings.focusMinutes * 60 : activeBreakMinutes * 60
  const phaseStartRef = useRef(Date.now())

  // Keep countdown in sync with sliders when idle (before/during settings preview)
  useEffect(() => {
    if (running || sessionStarted) return
    setPhase('focus')
    setCycle(1)
    setActiveBreakMinutes(settings.breakMinutes)
    setRemaining(settings.focusMinutes * 60)
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
    return sessionStarted
      ? remainingFocusMinutes(settings, phase, cycle, remaining)
      : totalFocusMinutes(settings)
  }, [settings, phase, cycle, remaining, sessionStarted])

  useEffect(() => {
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
  }, [phase, sessionStarted, running, remaining, settings.focusMinutes, setLiveFocusSeconds])

  useEffect(() => () => setLiveFocusSeconds(0), [setLiveFocusSeconds])

  const advancePhase = useCallback(async () => {
    const s = settingsRef.current
    const p = phaseRef.current
    const c = cycleRef.current

    if (userPrefs.timerSoundEnabled) playTimerChime()

    if (p === 'focus') {
      const elapsed = Math.max(1, Math.round((Date.now() - phaseStartRef.current) / 60000))
      await logFocusMinutes(elapsed)

      if (s.skipBreaks) {
        if (c >= s.iterations) {
          setPhase('done')
          setRunning(false)
          setSessionStarted(false)
          return
        }
        setCycle(c + 1)
        setPhase('focus')
        setRemaining(s.focusMinutes * 60)
      } else {
        const breakMinutes = getBreakMinutesAfterFocus(s, c)
        setActiveBreakMinutes(breakMinutes)
        setPhase('break')
        setRemaining(breakMinutes * 60)
      }
    } else {
      if (c >= s.iterations) {
        setPhase('done')
        setRunning(false)
        setSessionStarted(false)
        return
      }
      setCycle(c + 1)
      setPhase('focus')
      setRemaining(s.focusMinutes * 60)
    }
    phaseStartRef.current = Date.now()
  }, [logFocusMinutes, userPrefs.timerSoundEnabled])

  useEffect(() => {
    if (!running || phase === 'done') return

    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          advancePhase()
          const nextPhase = phaseRef.current
          const nextSettings = settingsRef.current
          return nextPhase === 'focus'
            ? nextSettings.focusMinutes * 60
            : activeBreakMinutesRef.current * 60
        }
        return r - 1
      })
    }, 1000)

    return () => clearInterval(id)
  }, [running, phase, advancePhase])

  const endFocus = async () => {
    if (phase !== 'focus') return

    const elapsed = Math.max(1, Math.round((Date.now() - phaseStartRef.current) / 60000))
    await logFocusMinutes(elapsed)

    if (settings.skipBreaks) {
      if (cycle >= settings.iterations) {
        setPhase('done')
        setRunning(false)
        setSessionStarted(false)
        return
      }
      setCycle(cycle + 1)
      setPhase('focus')
      setRemaining(settings.focusMinutes * 60)
    } else {
      const breakMinutes = getBreakMinutesAfterFocus(settings, cycle)
      setActiveBreakMinutes(breakMinutes)
      setPhase('break')
      setRemaining(breakMinutes * 60)
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
    setRemaining(settings.focusMinutes * 60)
    setRunning(false)
    setSessionStarted(true)
    phaseStartRef.current = Date.now()
  }

  const start = () => {
    phaseStartRef.current = Date.now()
    setSessionStarted(true)
    setRunning(true)
  }

  const reset = () => {
    setRunning(false)
    setSessionStarted(false)
    setPhase('focus')
    setCycle(1)
    setActiveBreakMinutes(settings.breakMinutes)
    setRemaining(settings.focusMinutes * 60)
  }

  const onLongBreak = phase === 'break' && isLongBreakAfterFocus(settings, cycle)

  const isRest = phase === 'break'

  const progress =
    phaseDuration > 0
      ? Math.min(100, Math.max(0, ((phaseDuration - remaining) / phaseDuration) * 100))
      : 0
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60

  return (
    <div className={cn('mx-auto space-y-4', showSettings ? 'max-w-3xl' : 'max-w-lg')}>
      <header className="text-center">
        <h1 className="text-2xl font-bold text-zinc-100">Focus</h1>
        <p className="text-xs text-zinc-500">
          {formatDuration(focusToday)} focused today · {formatDate(new Date())}
        </p>
      </header>

      <div
        className={cn(
          'flex items-start gap-4',
          showSettings ? 'flex-col lg:flex-row lg:justify-center' : 'justify-center',
        )}
      >
        <Card
          className={cn(
            'flex h-[35rem] w-full max-w-[480px] flex-col items-center px-8 pt-8 pb-24',
            showSettings && 'lg:max-w-md',
          )}
        >
        <p
          className={cn(
            'mb-1 h-4 text-xs font-medium uppercase tracking-widest',
            phase === 'focus'
              ? 'text-[var(--accent-400)]'
              : isRest
                ? 'text-blue-400'
                : 'text-zinc-500',
          )}
        >
          {phase === 'done'
            ? 'Session complete'
            : phase === 'focus'
              ? `Focus · ${cycle}/${settings.iterations}`
              : onLongBreak
                ? `Long rest · ${cycle}/${settings.iterations}`
                : `Rest · ${cycle}/${settings.iterations}`}
        </p>

        <div className="relative mt-4 mb-6 h-60 w-60 shrink-0">
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
            <span className="select-none text-[3.75rem] font-extralight leading-none tabular-nums tracking-tight text-zinc-50">
              {String(minutes).padStart(2, '0')}
              <span className="text-zinc-500">:</span>
              {String(seconds).padStart(2, '0')}
            </span>
          </div>
        </div>

        {sessionEndAt && phase !== 'done' ? (
          <div className="mb-5 flex h-11 shrink-0 flex-wrap items-center justify-center gap-1.5">
            <div className="rounded-full border border-[var(--accent-ring)] bg-[var(--accent-950)] px-3 py-1 text-center">
              <p className="text-[9px] uppercase tracking-wide text-[var(--accent-300)]/70">Ends at</p>
              <p className="text-xs font-semibold text-[var(--accent-200)]">
                {formatTime(sessionEndAt)}
              </p>
            </div>
            <div className="rounded-full border border-[var(--accent-ring)] bg-[var(--accent-950)] px-3 py-1 text-center">
              <p className="text-[9px] uppercase tracking-wide text-[var(--accent-300)]/70">Focus time</p>
              <p className="text-xs font-semibold text-[var(--accent-200)]">
                {formatDuration(sessionFocusMinutes)}
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-5 h-11 shrink-0" aria-hidden />
        )}

        <div className="mb-3 flex h-12 w-full shrink-0 items-center justify-center">
          {!running ? (
            <Button
              size="lg"
              onClick={start}
              disabled={phase === 'done'}
              aria-label={sessionStarted ? 'Resume' : 'Start'}
              className={cn(
                'h-12 w-24 p-0 text-white',
                isRest && 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700',
              )}
            >
              <PlayIcon />
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => setRunning(false)}
              disabled={!settings.allowPause || phase === 'done'}
              aria-label="Pause"
              className={cn(
                'h-12 w-24 p-0 text-white',
                isRest
                  ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700'
                  : undefined,
                !settings.allowPause && 'opacity-30',
              )}
            >
              <PauseIcon />
            </Button>
          )}
        </div>

        <div className="flex h-12 shrink-0 items-center justify-center gap-2">
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

          <Button variant="ghost" onClick={reset} aria-label="Reset">
            <RotateCcw size={16} />
          </Button>
          <Button variant="ghost" onClick={() => setShowSettings(!showSettings)} aria-label="Quick timer settings">
            <Settings2 size={16} />
          </Button>
        </div>
      </Card>

        {showSettings && (
          <Card title="Timer settings" className="w-full shrink-0 space-y-5 lg:w-72">
            <MinuteSlider
              label="Focus duration"
              value={settings.focusMinutes}
              disabled={running || sessionStarted}
              onChange={(focusMinutes) => {
                updateTimerSettings({ focusMinutes })
                if (!running && !sessionStarted) {
                  setRemaining(focusMinutes * 60)
                }
              }}
            />
            <MinuteSlider
              label="Break duration"
              value={settings.breakMinutes}
              disabled={settings.skipBreaks || running || sessionStarted}
              onChange={(breakMinutes) => updateTimerSettings({ breakMinutes })}
            />
            <CycleStepper
              label="Cycles"
              value={settings.iterations}
              onChange={(iterations) => updateTimerSettings({ iterations })}
            />
            <SkipBreaksToggle
              checked={settings.skipBreaks}
              onChange={(skipBreaks) => updateTimerSettings({ skipBreaks })}
            />
            <ToggleRow
              label="Allow pause"
              compact
              checked={settings.allowPause}
              onChange={(allowPause) => updateTimerSettings({ allowPause })}
            />
            <LongBreakSettings
              enabled={settings.longBreakEnabled}
              afterCycles={settings.longBreakAfterCycles}
              minutes={settings.longBreakMinutes}
              disabled={settings.skipBreaks || running || sessionStarted}
              onEnabledChange={(longBreakEnabled) => updateTimerSettings({ longBreakEnabled })}
              onAfterCyclesChange={(longBreakAfterCycles) =>
                updateTimerSettings({ longBreakAfterCycles })
              }
              onMinutesChange={(longBreakMinutes) => updateTimerSettings({ longBreakMinutes })}
            />
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
          </Card>
        )}
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
    </div>
  )
}
