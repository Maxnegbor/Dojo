import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Settings2, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CycleStepper, LongBreakSettings, MinuteSlider, SkipBreaksToggle } from '@/components/focus/TimerControls'
import { ToggleRow } from '@/components/settings/SettingsControls'
import { useFocus } from '@/context/FocusContext'
import { useSettings } from '@/context/SettingsContext'
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
import { cn, formatDate } from '@/lib/utils'

type Phase = TimerPhase

export function FocusTimerPage() {
  const { focusToday, logFocusMinutes } = useFocus()
  const { settings: userPrefs, formatTime } = useSettings()
  const [settings, setSettings] = useState<FocusTimerSettings>(getFocusSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [phase, setPhase] = useState<Phase>('focus')
  const [cycle, setCycle] = useState(1)
  const [remaining, setRemaining] = useState(settings.focusMinutes * 60)
  const [activeBreakMinutes, setActiveBreakMinutes] = useState(settings.breakMinutes)
  const [running, setRunning] = useState(false)
  const [sessionStarted, setSessionStarted] = useState(false)

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
  }, [])

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

  const stopEarly = async () => {
    if (phase === 'focus') {
      const elapsed = Math.max(1, Math.round((Date.now() - phaseStartRef.current) / 60000))
      await logFocusMinutes(elapsed)
    }
    setRunning(false)
    setSessionStarted(false)
    setPhase('focus')
    setCycle(1)
    setActiveBreakMinutes(settings.breakMinutes)
    setRemaining(settings.focusMinutes * 60)
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
          {focusToday} min focused today · {formatDate(new Date())}
        </p>
      </header>

      <div
        className={cn(
          'flex items-start gap-4',
          showSettings ? 'flex-col lg:flex-row lg:justify-center' : 'justify-center',
        )}
      >
        <Card className={cn('flex flex-col items-center py-8', showSettings && 'w-full lg:max-w-md')}>
        <p
          className={cn(
            'mb-1 text-xs font-medium uppercase tracking-widest',
            phase === 'focus' ? 'text-[var(--accent-400)]' : phase === 'break' ? 'text-emerald-400' : 'text-zinc-500',
          )}
        >
          {phase === 'done'
            ? 'Session complete'
            : phase === 'focus'
              ? `Focus · ${cycle}/${settings.iterations}`
              : onLongBreak
                ? `Long break · ${cycle}/${settings.iterations}`
                : `Break · ${cycle}/${settings.iterations}`}
        </p>

        <div className="relative my-6 flex h-48 w-48 items-center justify-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="#27272a" strokeWidth="5" />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke={phase === 'break' ? '#10b981' : 'var(--accent-500)'}
              strokeWidth="5"
              strokeDasharray={`${progress * 2.76} 276`}
              strokeLinecap="round"
            />
          </svg>
          <span className="select-none text-[3.25rem] font-extralight leading-none tracking-tight tabular-nums text-zinc-50">
            {String(minutes).padStart(2, '0')}
            <span className="mx-0.5 text-zinc-500">:</span>
            {String(seconds).padStart(2, '0')}
          </span>
        </div>

        {sessionEndAt && phase !== 'done' && (
          <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
            <div className="rounded-full border border-[var(--accent-ring)] bg-[var(--accent-950)] px-4 py-1.5 text-center">
              <p className="text-[10px] uppercase tracking-wide text-[var(--accent-300)]/70">Ends at</p>
              <p className="text-sm font-semibold text-[var(--accent-200)]">
                {formatTime(sessionEndAt)}
              </p>
            </div>
            <div className="rounded-full border border-[var(--accent-ring)] bg-[var(--accent-950)] px-4 py-1.5 text-center">
              <p className="text-[10px] uppercase tracking-wide text-[var(--accent-300)]/70">Focus time</p>
              <p className="text-sm font-semibold text-[var(--accent-200)]">
                {sessionFocusMinutes} min
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-2">
          {!running && (
            <Button size="lg" onClick={start} disabled={phase === 'done'}>
              <Play size={18} /> {sessionStarted ? 'Resume' : 'Start'}
            </Button>
          )}
          {running && settings.allowPause && (
            <Button size="lg" variant="secondary" onClick={() => setRunning(false)}>
              <Pause size={18} /> Pause
            </Button>
          )}
          <Button
            variant="secondary"
            className="hover:border-red-500/70 hover:bg-red-950/30 hover:text-red-300"
            onClick={stopEarly}
          >
            <SkipForward size={16} /> End early
          </Button>
          <Button variant="ghost" onClick={reset}>
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
    </div>
  )
}
