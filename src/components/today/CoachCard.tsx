import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { generateCoachAdvice } from '@/lib/coach'
import { buildDayCoachSnapshot } from '@/lib/coachContext'
import {
  COACH_CHANGED,
  COACH_SLOT_LABELS,
  COACH_SLOTS,
  getCoachSchedule,
  getCoachSlotAdvice,
  getDueCoachSlots,
  getNextCoachSlot,
  hasUnreadCoachAdvice,
  isCoachSlotDue,
  markCoachAdviceRead,
  msUntilCoachSlot,
  type CoachAdvice,
  type CoachSchedule,
  type CoachSlot,
} from '@/lib/coachStore'
import { OpenAIApiError } from '@/lib/openaiApi'
import { isOpenAIConnected, OPENAI_CHANGED } from '@/lib/openaiStore'
import { buildTodoistFilter, fetchTodoistTasks, type TodoistTask } from '@/lib/todoistApi'
import { isTodoistConnected, TODOIST_CHANGED } from '@/lib/todoistStore'
import type { PulseContributor } from '@/lib/pulseBreakdown'
import { cn, formatDate, parseTimeToMinutes } from '@/lib/utils'
import { useSettings } from '@/context/SettingsContext'
import { useScreensaver } from '@/context/ScreensaverContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { DailyLog, Goal, ScheduleBlock, Workout } from '@/types'

interface CoachCardProps {
  viewDate: string
  log: DailyLog | undefined
  goals: Goal[]
  workouts: Workout[]
  logs: DailyLog[]
  blocks: ScheduleBlock[]
  contributors: PulseContributor[]
  pulseScore: number
}

function formatSlotTime(hhmm: string, timeFormat: '12h' | '24h'): string {
  const minutes = parseTimeToMinutes(hhmm)
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60)
  return timeFormat === '24h' ? format(date, 'HH:mm') : format(date, 'h:mm a')
}

function latestSlotWithAdvice(bySlot: Partial<Record<CoachSlot, CoachAdvice>>): CoachSlot | null {
  for (let i = COACH_SLOTS.length - 1; i >= 0; i -= 1) {
    const slot = COACH_SLOTS[i]!
    if (bySlot[slot]) return slot
  }
  return null
}

export function CoachAdviceBody({ advice }: { advice: CoachAdvice }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-100">{advice.headline}</p>
      {advice.body ? (
        <p className="text-[12px] leading-relaxed text-zinc-400">{advice.body}</p>
      ) : null}
      {advice.bullets.length > 0 ? (
        <ul className="space-y-1.5">
          {advice.bullets.map((bullet, index) => (
            <li
              key={`${bullet.title}-${index}`}
              className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-2.5 py-2"
            >
              <p className="text-[12px] font-medium text-zinc-200">{bullet.title}</p>
              {bullet.detail ? (
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{bullet.detail}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function CoachCard({
  viewDate,
  log,
  goals,
  workouts,
  logs,
  blocks,
  contributors,
  pulseScore,
}: CoachCardProps) {
  const { settings } = useSettings()
  const { active: screensaver } = useScreensaver()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState(() => isOpenAIConnected())
  const [schedule, setSchedule] = useState<CoachSchedule>(() => getCoachSchedule())
  const [bySlot, setBySlot] = useState<Partial<Record<CoachSlot, CoachAdvice>>>(() =>
    getCoachSlotAdvice(viewDate),
  )
  const [unread, setUnread] = useState(() => hasUnreadCoachAdvice(viewDate))
  const [busy, setBusy] = useState<CoachSlot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const snapshotRef = useRef({ viewDate, log, goals, workouts, logs, blocks, contributors, pulseScore })
  const generatingRef = useRef(new Set<CoachSlot>())
  const panelRef = useRef<HTMLDivElement>(null)

  snapshotRef.current = { viewDate, log, goals, workouts, logs, blocks, contributors, pulseScore }

  useEffect(() => {
    const sync = () => {
      setConnected(isOpenAIConnected())
      setSchedule(getCoachSchedule())
      setBySlot(getCoachSlotAdvice(viewDate))
      setUnread(hasUnreadCoachAdvice(viewDate))
    }
    window.addEventListener(OPENAI_CHANGED, sync)
    window.addEventListener(COACH_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    window.addEventListener(TODOIST_CHANGED, sync)
    return () => {
      window.removeEventListener(OPENAI_CHANGED, sync)
      window.removeEventListener(COACH_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
      window.removeEventListener(TODOIST_CHANGED, sync)
    }
  }, [viewDate])

  useEffect(() => {
    setBySlot(getCoachSlotAdvice(viewDate))
    setUnread(hasUnreadCoachAdvice(viewDate))
    setError(null)
    setOpen(false)
  }, [viewDate])

  const generateSlot = async (slot: CoachSlot, force = false) => {
    if (!isOpenAIConnected()) return
    const started = snapshotRef.current
    if (!force && getCoachSlotAdvice(started.viewDate)[slot]) return
    if (generatingRef.current.has(slot)) return
    generatingRef.current.add(slot)
    setBusy(slot)
    setError(null)
    try {
      let todoist: TodoistTask[] = []
      if (isTodoistConnected()) {
        try {
          const today = formatDate(new Date())
          todoist = await fetchTodoistTasks(buildTodoistFilter(started.viewDate, today))
        } catch {
          todoist = []
        }
      }
      const snapshot = buildDayCoachSnapshot({
        date: started.viewDate,
        log: started.log,
        goals: started.goals,
        workouts: started.workouts,
        logs: started.logs,
        blocks: started.blocks,
        contributors: started.contributors,
        pulseScore: started.pulseScore,
        todoist,
        slot,
      })
      const next = await generateCoachAdvice(slot, snapshot)
      if (snapshotRef.current.viewDate === started.viewDate) {
        setBySlot((prev) => ({ ...prev, [slot]: next }))
      }
    } catch (err) {
      const message =
        err instanceof OpenAIApiError || err instanceof Error
          ? err.message
          : 'Could not get coaching right now'
      if (snapshotRef.current.viewDate === started.viewDate) setError(message)
    } finally {
      generatingRef.current.delete(slot)
      setBusy((current) => (current === slot ? null : current))
    }
  }

  useEffect(() => {
    if (!connected) return
    const today = formatDate(new Date())
    if (viewDate !== today) return

    let cancelled = false
    const runDue = async () => {
      const due = getDueCoachSlots(viewDate, new Date(), schedule)
      for (const slot of due) {
        if (cancelled) return
        await generateSlot(slot)
      }
    }
    void runDue()

    const nextSlot = getNextCoachSlot(viewDate, new Date(), schedule)
    if (!nextSlot) return
    const wait = Math.min(msUntilCoachSlot(nextSlot, new Date(), schedule), 6 * 60 * 60 * 1000)
    const timer = window.setTimeout(() => {
      if (cancelled) return
      void generateSlot(nextSlot)
    }, Math.max(250, wait))
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [connected, viewDate, schedule.morning, schedule.midday, schedule.evening])

  const visibleSlot = useMemo(() => {
    const withAdvice = latestSlotWithAdvice(bySlot)
    if (withAdvice) return withAdvice
    if (busy) return busy
    const due = getDueCoachSlots(viewDate, new Date(), schedule)
    if (due.length > 0) return due[0]!
    return getNextCoachSlot(viewDate, new Date(), schedule) ?? 'morning'
  }, [bySlot, busy, viewDate, schedule])

  const advice = bySlot[visibleSlot] ?? null
  const due = isCoachSlotDue(visibleSlot, viewDate, new Date(), schedule)
  const generating = busy === visibleSlot
  const isToday = viewDate === formatDate(new Date())

  useEffect(() => {
    if (!open || !advice) return
    markCoachAdviceRead(advice)
    setUnread(false)
  }, [open, advice?.date, advice?.kind, advice?.generatedAt])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [open])

  if (screensaver) return null

  return (
    <div
      ref={panelRef}
      className={cn(
        'pointer-events-auto fixed z-50 flex flex-col items-end gap-3',
        isMobile
          ? 'right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))]'
          : 'right-6 bottom-6',
      )}
    >
      {open ? (
        <section
          role="dialog"
          aria-labelledby="coach-panel-title"
          className="flex max-h-[min(70vh,32rem)] w-[min(calc(100vw-2rem),22rem)] flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl shadow-black/50"
        >
          <header className="flex items-start justify-between gap-3 border-b border-zinc-800/80 px-4 py-3">
            <div className="min-w-0">
              <h2 id="coach-panel-title" className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100">
                <Sparkles size={14} className="shrink-0 text-[var(--accent-400)]" />
                Coach
              </h2>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {COACH_SLOT_LABELS[visibleSlot]} · {formatSlotTime(schedule[visibleSlot], settings.timeFormat)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {connected && due ? (
                <button
                  type="button"
                  onClick={() => void generateSlot(visibleSlot, true)}
                  disabled={generating}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                  aria-label={advice ? `Refresh ${COACH_SLOT_LABELS[visibleSlot]} coaching` : `Generate ${COACH_SLOT_LABELS[visibleSlot]} coaching`}
                >
                  {generating ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <RefreshCw size={11} />
                  )}
                  {advice ? 'Refresh' : 'Generate'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Close coach"
              >
                <X size={14} />
              </button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {!connected ? (
              <p className="text-[12px] leading-relaxed text-zinc-500">
                Connect ChatGPT in{' '}
                <Link
                  to="/settings"
                  state={{ settingsSection: 'integrations' }}
                  className="text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-zinc-100"
                >
                  Settings → Integrations
                </Link>{' '}
                for morning, midday, and evening coaching. Set the times in{' '}
                <Link
                  to="/settings"
                  state={{ settingsSection: 'coach' }}
                  className="text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-zinc-100"
                >
                  Settings → Coach
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-3">
                {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
                {advice ? (
                  <CoachAdviceBody advice={advice} />
                ) : generating ? (
                  <p className="text-[12px] text-zinc-500">Writing this check-in…</p>
                ) : due ? (
                  <p className="text-[12px] text-zinc-500">
                    {isToday
                      ? 'Ready to generate this check-in.'
                      : 'No check-in saved for this day.'}
                  </p>
                ) : (
                  <p className="text-[12px] text-zinc-500">
                    Generates at {formatSlotTime(schedule[visibleSlot], settings.timeFormat)}.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-500)] text-black shadow-lg shadow-black/40 ring-1 ring-black/10 transition-transform hover:bg-[var(--accent-400)] active:scale-95"
        aria-label={open ? 'Close coach' : unread ? 'Open coach, unread check-in' : 'Open coach'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {busy && !open ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <Sparkles size={20} />
        )}
        {unread && !open ? (
          <span
            className="absolute top-0.5 right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#06060b]"
            aria-hidden
          />
        ) : null}
      </button>
    </div>
  )
}
