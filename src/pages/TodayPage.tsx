import { useCallback, useEffect, useState } from 'react'
import { addDays, isToday, parseISO } from 'date-fns'
import { CalendarCheck, CalendarDays, Moon } from 'lucide-react'
import { DateNavigationHeader } from '@/components/today/DateNavigationHeader'
import { HourlyTimeline } from '@/components/today/HourlyTimeline'
import { NotesAndReminders } from '@/components/today/NotesAndReminders'
import { DailyLogForm, getDailyLogDraftForDate } from '@/components/today/DailyLogForm'
import { GoalProgressModal, type CompletedHabitSummary } from '@/components/today/GoalProgressModal'
import { ShutdownModal } from '@/components/today/ShutdownModal'
import { WeeklyGoalRevealModal } from '@/components/today/WeeklyGoalRevealModal'
import { WeeklyShutdownModal } from '@/components/today/WeeklyShutdownModal'
import { MonthCalendarModal } from '@/components/today/MonthCalendarModal'
import { MissedLogModal, shouldShowMissedLogModal } from '@/components/today/MissedLogModal'
import { useAuth, useDailyLog, useStreak } from '@/hooks/useData'
import { useShutdownAvailable } from '@/hooks/useShutdownAvailable'
import { useWeeklyShutdownAvailable } from '@/hooks/useWeeklyShutdownAvailable'
import { useEndOfDaySave } from '@/hooks/useEndOfDaySave'
import { getYesterdayDate } from '@/lib/dailyLog'
import { flushDailyLogAndGetProgressDeltas, filterShutdownProgressDeltas } from '@/lib/dailyLogProgress'
import { getHabitStreaksForDate } from '@/lib/habitStreaks'
import { rolloverStaleReminders } from '@/lib/reminderRollover'
import { getDraft } from '@/lib/dailyLogDraft'
import { getDailyLogHabitTypes } from '@/lib/habitTypes'
import { localStore } from '@/lib/localStore'
import type { ProgressDelta } from '@/lib/metrics'
import { normalizeScheduleBlock } from '@/lib/scheduleBlock'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { DailyLog, Goal, Reminder, ScheduleBlock, Workout } from '@/types'
import {
  buildWeeklyShutdownSummaries,
  buildWeeklyUntargetedStats,
  getWeeklyReviewWeekDates,
  getWeeklyShutdownWeekDates,
  getWeeklyShutdownWeekKey,
  markWeeklyShutdownCompleted,
  weekDateRangeLabel,
  type WeeklyShutdownGoalSummary,
  type WeeklyReviewStat,
} from '@/lib/weeklyShutdown'
import { ALLOW_WEEKLY_SHUTDOWN_ANY_DAY } from '@/lib/devFlags'
import { normalizeHabits } from '@/types'
import { Button } from '@/components/ui/Button'
import { useSettings } from '@/context/SettingsContext'
import { formatDate } from '@/lib/utils'
import { getPreviousWeekDates } from '@/lib/weightGoal'

export function TodayPage() {
  const { settings } = useSettings()
  const [viewDate, setViewDate] = useState(formatDate(new Date()))
  const { log, workouts, loading, updateLog, refresh } = useDailyLog(viewDate)
  const streak = useStreak()
  const { userId } = useAuth()

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [monthLogs, setMonthLogs] = useState<DailyLog[]>([])
  const [streakLogs, setStreakLogs] = useState<DailyLog[]>([])
  const [showMissedModal, setShowMissedModal] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [showShutdown, setShowShutdown] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [progressDeltas, setProgressDeltas] = useState<ProgressDelta[]>([])
  const [completedHabits, setCompletedHabits] = useState<CompletedHabitSummary[]>([])
  const [yesterdayLog, setYesterdayLog] = useState<DailyLog | null>(null)
  const [showWeeklyShutdown, setShowWeeklyShutdown] = useState(false)
  const [showWeeklyReveal, setShowWeeklyReveal] = useState(false)
  const [weeklySummaries, setWeeklySummaries] = useState<WeeklyShutdownGoalSummary[]>([])
  const [weeklyStats, setWeeklyStats] = useState<WeeklyReviewStat[]>([])
  const [weeklyWeekDates, setWeeklyWeekDates] = useState<string[]>([])
  const [weeklyWeekLogs, setWeeklyWeekLogs] = useState<DailyLog[]>([])
  const [weeklyWeekWorkouts, setWeeklyWeekWorkouts] = useState<Workout[]>([])

  const isActiveDay = isToday(parseISO(viewDate))
  const shutdownAvailable = useShutdownAvailable(viewDate)
  const weeklyShutdownAvailable = useWeeklyShutdownAvailable(viewDate, settings.weekStartsOn)
  const tomorrowDate = formatDate(addDays(parseISO(viewDate), 1))
  const yesterday = getYesterdayDate()

  const checkMissedLog = useCallback(async () => {
    if (!userId) return
    let yLog: DailyLog | null = null
    if (isSupabaseConfigured) {
      const { getOrCreateDailyLog } = await import('@/lib/supabase')
      try { yLog = await getOrCreateDailyLog(userId, yesterday) } catch { /* ignore */ }
    } else {
      yLog = localStore.getOrCreateDailyLog(yesterday)
    }
    setYesterdayLog(yLog)
    const draft = getDraft(yesterday)
    const effective =
      yLog && draft
        ? {
            ...yLog,
            ...draft,
            habits: normalizeHabits({ ...yLog.habits, ...draft.habits }),
          }
        : yLog
    setShowMissedModal(shouldShowMissedLogModal(yesterday, effective))
  }, [userId, yesterday])

  useEndOfDaySave({ userId, onFlushed: () => { refresh(); checkMissedLog() } })
  useEffect(() => { checkMissedLog() }, [checkMissedLog])

  const loadData = useCallback(async () => {
    if (!userId) return
    const today = formatDate(new Date())
    const monthStart = formatDate(new Date(new Date(viewDate).getFullYear(), new Date(viewDate).getMonth(), 1))
    const monthEnd = formatDate(new Date(new Date(viewDate).getFullYear(), new Date(viewDate).getMonth() + 1, 0))
    const streakStart = formatDate(addDays(parseISO(viewDate), -400))

    if (isActiveDay && viewDate === today) {
      await rolloverStaleReminders(userId, today)
    }

    if (isSupabaseConfigured) {
      const { fetchScheduleBlocks, fetchReminders, fetchGoals, fetchDailyLogs } = await import('@/lib/supabase')
      setBlocks((await fetchScheduleBlocks(userId, viewDate)).map(normalizeScheduleBlock))
      setReminders((await fetchReminders(userId)).map((r) => ({ ...r, kind: r.kind ?? 'task' })))
      setGoals(await fetchGoals(userId))
      setMonthLogs(await fetchDailyLogs(userId, monthStart, monthEnd))
      setStreakLogs(await fetchDailyLogs(userId, streakStart, viewDate))
    } else {
      setBlocks(localStore.getScheduleBlocks(viewDate).map(normalizeScheduleBlock))
      setReminders(localStore.getReminders().map((r) => ({ ...r, kind: r.kind ?? 'task' })))
      setGoals(localStore.getGoals())
      setMonthLogs(localStore.getDailyLogs(monthStart, monthEnd))
      setStreakLogs(localStore.getDailyLogs(streakStart, viewDate))
    }
  }, [userId, viewDate, isActiveDay])

  useEffect(() => { loadData() }, [loadData])

  const shiftDate = (days: number) => {
    const d = new Date(viewDate + 'T12:00:00')
    d.setDate(d.getDate() + days)
    setViewDate(formatDate(d))
  }

  const saveBlock = async (block: ScheduleBlock) => {
    const normalized = normalizeScheduleBlock(block)
    if (isSupabaseConfigured) {
      const { upsertScheduleBlock } = await import('@/lib/supabase')
      await upsertScheduleBlock(normalized)
    } else localStore.upsertScheduleBlock(normalized)
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === normalized.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = normalized; return next }
      return [...prev, normalized]
    })
  }

  const removeBlock = async (id: string) => {
    if (isSupabaseConfigured) {
      const { deleteScheduleBlock } = await import('@/lib/supabase')
      await deleteScheduleBlock(id)
    } else localStore.deleteScheduleBlock(id)
    setBlocks((prev) => prev.filter((b) => b.id !== id))
  }

  const addReminder = async (item: Reminder) => {
    if (isSupabaseConfigured) {
      const { upsertReminder } = await import('@/lib/supabase')
      await upsertReminder(item)
    } else localStore.upsertReminder(item)
    setReminders((prev) => [...prev, item])
  }

  const removeReminder = async (id: string) => {
    if (isSupabaseConfigured) {
      const { deleteReminder } = await import('@/lib/supabase')
      await deleteReminder(id)
    } else localStore.deleteReminder(id)
    setReminders((prev) => prev.filter((r) => r.id !== id))
  }

  const updateReminder = async (item: Reminder) => {
    if (isSupabaseConfigured) {
      const { upsertReminder } = await import('@/lib/supabase')
      await upsertReminder(item)
    } else localStore.upsertReminder(item)
    setReminders((prev) => {
      const idx = prev.findIndex((r) => r.id === item.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = item
        return next
      }
      return [...prev, item]
    })
  }

  const applyShutdownDeferrals = async (ids: string[]) => {
    for (const id of ids) {
      const item = reminders.find((r) => r.id === id)
      if (!item) continue
      await updateReminder({
        ...item,
        due_date: tomorrowDate,
        rescheduled_from: viewDate,
      })
    }
  }

  const completeShutdown = async (deferredIds: string[]) => {
    if (!userId || !log) return

    await applyShutdownDeferrals(deferredIds)

    const logBefore = { ...log }
    const draft = getDailyLogDraftForDate(log, workouts, streakLogs)
    const deltas = await flushDailyLogAndGetProgressDeltas(
      viewDate,
      userId,
      goals,
      logBefore,
      settings.weekStartsOn,
      draft,
    )

    const logAfter = localStore.getOrCreateDailyLog(viewDate)
    const summary = filterShutdownProgressDeltas(deltas, logAfter.focus_minutes ?? 0)
    const savedHabits = normalizeHabits(logAfter.habits)
    const streaksAfterSave = getHabitStreaksForDate(
      localStore.getDailyLogs(formatDate(addDays(parseISO(viewDate), -400)), viewDate),
      viewDate,
      savedHabits,
    )
    const habitsDone = getDailyLogHabitTypes()
      .filter((type) => savedHabits[type.id])
      .map((type) => ({
        label: type.label,
        streak: streaksAfterSave[type.id] ?? 0,
      }))

    setShowShutdown(false)
    await refresh()
    await loadData()
    setProgressDeltas(summary)
    setCompletedHabits(habitsDone)
    setShowProgress(true)
  }

  const prepareWeeklyShutdown = async () => {
    if (!userId) return
    const now = new Date()
    const weekDates = ALLOW_WEEKLY_SHUTDOWN_ANY_DAY
      ? getWeeklyReviewWeekDates(now, settings.weekStartsOn)
      : getWeeklyShutdownWeekDates(now, settings.weekStartsOn)
    if (weekDates.length === 0) return

    const prevWeekDates = getPreviousWeekDates(weekDates, settings.weekStartsOn)
    const start = prevWeekDates[0] ?? weekDates[0]
    const end = weekDates[weekDates.length - 1]

    let weekLogs: DailyLog[]
    let weekWorkouts: Workout[]

    if (isSupabaseConfigured) {
      const { fetchDailyLogs, fetchWorkouts } = await import('@/lib/supabase')
      ;[weekLogs, weekWorkouts] = await Promise.all([
        fetchDailyLogs(userId, start, end),
        fetchWorkouts(userId, start, end),
      ])
    } else {
      weekLogs = localStore.getDailyLogs(start, end)
      weekWorkouts = localStore.getWorkouts(start, end)
    }

    setWeeklyWeekDates(weekDates)
    setWeeklyWeekLogs(weekLogs)
    setWeeklyWeekWorkouts(weekWorkouts)
    setShowWeeklyShutdown(true)
  }

  const completeWeeklyChecklist = () => {
    setWeeklySummaries(
      buildWeeklyShutdownSummaries(
        goals,
        weeklyWeekLogs,
        weeklyWeekWorkouts,
        weeklyWeekDates,
        settings.weightUnit,
        settings.weekStartsOn,
      ),
    )
    setWeeklyStats(
      buildWeeklyUntargetedStats(
        goals,
        weeklyWeekLogs,
        weeklyWeekWorkouts,
        weeklyWeekDates,
        settings.weightUnit,
      ),
    )
    setShowWeeklyShutdown(false)
    setShowWeeklyReveal(true)
  }

  const finishWeeklyShutdown = () => {
    const weekKey = getWeeklyShutdownWeekKey(weeklyWeekDates)
    markWeeklyShutdownCompleted(weekKey)
    setShowWeeklyReveal(false)
    setWeeklySummaries([])
    setWeeklyStats([])
    setWeeklyWeekDates([])
    setWeeklyWeekLogs([])
    setWeeklyWeekWorkouts([])
  }

  const saveYesterdayLog = async (updates: Parameters<typeof updateLog>[0]) => {
    if (!userId) return
    if (isSupabaseConfigured && yesterdayLog) {
      const { updateDailyLog } = await import('@/lib/supabase')
      await updateDailyLog(yesterdayLog.id, updates)
    } else localStore.updateDailyLog(yesterday, updates)
  }

  if (!userId || loading || !log) {
    return <div className="flex h-64 items-center justify-center text-zinc-500">Loading…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <DateNavigationHeader
          date={viewDate}
          streak={streak}
          onPrev={() => shiftDate(-1)}
          onNext={() => shiftDate(1)}
          onToday={() => setViewDate(formatDate(new Date()))}
        />
        <button
          onClick={() => setShowCalendar(true)}
          className="mt-1 rounded-lg border border-zinc-800 p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Month overview"
        >
          <CalendarDays size={18} />
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px]">
        <HourlyTimeline blocks={blocks} date={viewDate} userId={userId} isActiveDay={isActiveDay} startHour={settings.timelineStartHour} endHour={settings.timelineEndHour} onUpdate={saveBlock} onDelete={removeBlock} onCreate={saveBlock} />
        <aside className="flex flex-col gap-4">
          {weeklyShutdownAvailable && (
            <button
              type="button"
              onClick={prepareWeeklyShutdown}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-500)] px-4 py-3.5 text-sm font-bold text-black shadow-lg shadow-[var(--accent-500)]/35 ring-2 ring-[var(--accent-400)]/60 transition-transform hover:bg-[var(--accent-400)] active:scale-[0.98]"
            >
              <CalendarCheck size={18} strokeWidth={2.5} />
              Weekly Shutdown
            </button>
          )}
          <NotesAndReminders items={reminders} viewDate={viewDate} userId={userId} onAdd={addReminder} onRemove={removeReminder} />
          <DailyLogForm
            log={log}
            goals={goals}
            workouts={workouts}
            streakLogs={streakLogs}
            userId={userId}
            onSaved={() => {
              refresh()
              loadData()
            }}
          />
          {shutdownAvailable && (
            <Button variant="secondary" className="w-full" onClick={() => setShowShutdown(true)}>
              <Moon size={14} className="text-violet-400" /> Shutdown
            </Button>
          )}
        </aside>
      </div>

      {showWeeklyShutdown && (
        <WeeklyShutdownModal
          weekDates={weeklyWeekDates}
          goals={goals}
          onClose={() => setShowWeeklyShutdown(false)}
          onComplete={completeWeeklyChecklist}
        />
      )}

      {showWeeklyReveal && (
        <WeeklyGoalRevealModal
          summaries={weeklySummaries}
          untargetedStats={weeklyStats}
          weekLabel={weekDateRangeLabel(weeklyWeekDates)}
          onClose={finishWeeklyShutdown}
        />
      )}

      {showShutdown && (
        <ShutdownModal
          log={log}
          goals={goals}
          workouts={workouts}
          streakLogs={streakLogs}
          viewDate={viewDate}
          tomorrowDate={tomorrowDate}
          reminders={reminders}
          onClose={() => setShowShutdown(false)}
          onComplete={completeShutdown}
          onCompleteReminder={removeReminder}
        />
      )}

      {showProgress && (
        <GoalProgressModal
          deltas={progressDeltas}
          completedHabits={completedHabits}
          title="Day complete!"
          subtitle="Here's how today moved your goals"
          buttonLabel="Good night"
          onClose={() => setShowProgress(false)}
        />
      )}

      {showMissedModal && (
        <MissedLogModal date={yesterday} log={yesterdayLog} onSave={saveYesterdayLog} onDismiss={() => setShowMissedModal(false)} />
      )}

      {showCalendar && (
        <MonthCalendarModal
          month={parseISO(viewDate)}
          logs={monthLogs}
          onClose={() => setShowCalendar(false)}
          onSelectDate={setViewDate}
        />
      )}
    </div>
  )
}
