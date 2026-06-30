import { useCallback, useEffect, useState } from 'react'
import { addDays, isToday, parseISO } from 'date-fns'
import { CalendarCheck, CalendarDays, Moon, Sun } from 'lucide-react'
import { DateNavigationHeader } from '@/components/today/DateNavigationHeader'
import { HourlyTimeline } from '@/components/today/HourlyTimeline'
import { NotesAndReminders } from '@/components/today/NotesAndReminders'
import { DailyLogForm, getDailyLogDraftForDate } from '@/components/today/DailyLogForm'
import { GoalProgressModal, type CompletedHabitSummary } from '@/components/today/GoalProgressModal'
import { MorningLogModal } from '@/components/today/MorningLogModal'
import { DailyChecklistModal } from '@/components/today/DailyChecklistModal'
import { ShutdownModal } from '@/components/today/ShutdownModal'
import { WeeklyGoalRevealModal } from '@/components/today/WeeklyGoalRevealModal'
import { WeeklyShutdownModal } from '@/components/today/WeeklyShutdownModal'
import { MonthCalendarModal } from '@/components/today/MonthCalendarModal'
import { MissedLogModal, shouldShowMissedLogModal } from '@/components/today/MissedLogModal'
import { HabitRampFailureModal } from '@/components/today/HabitRampFailureModal'
import { useAuth, useDailyLog, useStreak } from '@/hooks/useData'
import { useShutdownAvailable } from '@/hooks/useShutdownAvailable'
import { useWeeklyShutdownAvailable } from '@/hooks/useWeeklyShutdownAvailable'
import { useEndOfDaySave } from '@/hooks/useEndOfDaySave'
import { getYesterdayDate } from '@/lib/dailyLog'
import { flushDailyLogAndGetProgressDeltas, filterShutdownProgressDeltas } from '@/lib/dailyLogProgress'
import { getHabitStreaksForDate } from '@/lib/habitStreaks'
import { rolloverStaleReminders } from '@/lib/reminderRollover'
import { getDraft } from '@/lib/dailyLogDraft'
import { activeDailyChecklist } from '@/lib/dailyChecklist'
import { getDailyLogHabitTypes, getHabitTypes, saveHabitTypes } from '@/lib/habitTypes'
import {
  applyRampLevelSync,
  decreaseHabitRampLevel,
  dismissRampFailurePrompt,
  getHabitRampFailurePrompts,
  markRampFailureDecreased,
  type HabitRampFailurePrompt,
} from '@/lib/habitRamp'
import { captureWorkoutGoalSnapshotsForWeek } from '@/lib/goalTargetSnapshots'
import { localStore } from '@/lib/localStore'
import type { ProgressDelta } from '@/lib/metrics'
import { normalizeScheduleBlock, fetchScheduleBlocksForDate, cloneScheduleBlocksForDate, persistScheduleBlock, removeScheduleBlock } from '@/lib/scheduleBlock'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { DailyLog, Goal, MorningLog, Reminder, ScheduleBlock, Workout } from '@/types'
import {
  buildWeeklyShutdownSummaries,
  buildWeeklyUntargetedStats,
  buildWeeklyHabitReviewSummaries,
  getWeeklyReviewWeekDates,
  getWeeklyShutdownWeekDates,
  getWeeklyShutdownWeekKey,
  markWeeklyShutdownCompleted,
  weekDateRangeLabel,
  type WeeklyShutdownGoalSummary,
  type WeeklyReviewStat,
  type WeeklyHabitReviewSummary,
} from '@/lib/weeklyShutdown'
import { isWeeklyShutdownAnyDay } from '@/lib/devMode'
import { normalizeHabits } from '@/types'
import { Button } from '@/components/ui/Button'
import { useSettings } from '@/context/SettingsContext'
import { formatDate } from '@/lib/utils'
import { getWeeklyLog } from '@/lib/weeklyLogStore'
import { getPreviousWeekDates } from '@/lib/weightGoal'

export function TodayPage() {
  const { settings } = useSettings()
  const [viewDate, setViewDate] = useState(formatDate(new Date()))
  const { log, workouts, loading, updateLog, refresh } = useDailyLog(viewDate)
  const streak = useStreak()
  const { userId } = useAuth()

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [tomorrowBlocks, setTomorrowBlocks] = useState<ScheduleBlock[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [monthLogs, setMonthLogs] = useState<DailyLog[]>([])
  const [streakLogs, setStreakLogs] = useState<DailyLog[]>([])
  const [showMissedModal, setShowMissedModal] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [showShutdown, setShowShutdown] = useState(false)
  const [showMorningLog, setShowMorningLog] = useState(false)
  const [showShutdownChecklist, setShowShutdownChecklist] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [progressDeltas, setProgressDeltas] = useState<ProgressDelta[]>([])
  const [untrackedFocusMinutes, setUntrackedFocusMinutes] = useState<number | null>(null)
  const [completedHabits, setCompletedHabits] = useState<CompletedHabitSummary[]>([])
  const [yesterdayLog, setYesterdayLog] = useState<DailyLog | null>(null)
  const [showWeeklyShutdown, setShowWeeklyShutdown] = useState(false)
  const [showWeeklyReveal, setShowWeeklyReveal] = useState(false)
  const [weeklySummaries, setWeeklySummaries] = useState<WeeklyShutdownGoalSummary[]>([])
  const [weeklyStats, setWeeklyStats] = useState<WeeklyReviewStat[]>([])
  const [weeklyHabits, setWeeklyHabits] = useState<WeeklyHabitReviewSummary[]>([])
  const [weeklyWeekDates, setWeeklyWeekDates] = useState<string[]>([])
  const [weeklyWeekLogs, setWeeklyWeekLogs] = useState<DailyLog[]>([])
  const [weeklyWeekWorkouts, setWeeklyWeekWorkouts] = useState<Workout[]>([])
  const [rampFailurePrompts, setRampFailurePrompts] = useState<HabitRampFailurePrompt[]>([])
  const [rampPromptIndex, setRampPromptIndex] = useState(0)

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

  const checkRampFailures = useCallback(() => {
    if (!isActiveDay) return

    const today = formatDate(new Date())
    const draft = getDraft(today)
    const streakByHabit = getHabitStreaksForDate(streakLogs, today, draft?.habits)
    const { habits: syncedHabits, changed } = applyRampLevelSync(getHabitTypes(), streakByHabit)
    if (changed) saveHabitTypes(syncedHabits)

    const prompts = getHabitRampFailurePrompts(
      getDailyLogHabitTypes(),
      yesterday,
      yesterdayLog,
      streakLogs,
      today,
      draft?.habits,
    )
    setRampFailurePrompts(prompts)
    setRampPromptIndex(0)
  }, [isActiveDay, streakLogs, yesterday, yesterdayLog])

  useEffect(() => {
    checkRampFailures()
  }, [checkRampFailures])

  const activeRampPrompt = rampFailurePrompts[rampPromptIndex] ?? null

  const advanceRampPrompt = () => {
    setRampPromptIndex((index) => index + 1)
  }

  const handleRampKeepLevel = () => {
    if (!activeRampPrompt) return
    dismissRampFailurePrompt(activeRampPrompt.habitId, activeRampPrompt.failedDate)
    advanceRampPrompt()
  }

  const handleRampStepDown = () => {
    if (!activeRampPrompt) return
    const updated = getHabitTypes().map((habit) =>
      habit.id === activeRampPrompt.habitId ? decreaseHabitRampLevel(habit) : habit,
    )
    saveHabitTypes(updated)
    markRampFailureDecreased(activeRampPrompt.habitId, activeRampPrompt.failedDate)
    advanceRampPrompt()
  }

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

  const loadTomorrowBlocks = useCallback(async () => {
    if (!userId) return []
    return fetchScheduleBlocksForDate(userId, tomorrowDate)
  }, [userId, tomorrowDate])

  useEffect(() => {
    if (!showShutdown || !userId) return
    void loadTomorrowBlocks().then(setTomorrowBlocks)
  }, [showShutdown, userId, loadTomorrowBlocks])

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

  const saveTomorrowBlock = async (block: ScheduleBlock) => {
    const normalized = await persistScheduleBlock(block)
    setTomorrowBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === normalized.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = normalized
        return next
      }
      return [...prev, normalized]
    })
  }

  const removeTomorrowBlock = async (id: string) => {
    await removeScheduleBlock(id)
    setTomorrowBlocks((prev) => prev.filter((b) => b.id !== id))
  }

  const pasteTodayScheduleToTomorrow = async () => {
    if (!userId || blocks.length === 0) return
    for (const block of tomorrowBlocks) {
      await removeScheduleBlock(block.id)
    }
    const copies = cloneScheduleBlocksForDate(blocks, tomorrowDate, userId)
    const saved: ScheduleBlock[] = []
    for (const block of copies) {
      saved.push(await persistScheduleBlock(block))
    }
    setTomorrowBlocks(saved)
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
    const draft = getDailyLogDraftForDate(log, workouts)
    const deltas = await flushDailyLogAndGetProgressDeltas(
      viewDate,
      userId,
      goals,
      logBefore,
      settings.weekStartsOn,
      draft,
    )

    const logAfter = localStore.getOrCreateDailyLog(viewDate)
    const { deltas: summary, untrackedFocusMinutes: untrackedFocus } = filterShutdownProgressDeltas(
      deltas,
      logAfter.focus_minutes ?? 0,
    )
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
    setUntrackedFocusMinutes(untrackedFocus)
    setCompletedHabits(habitsDone)

    if (activeDailyChecklist(settings.dailyShutdownChecklist).length > 0) {
      setShowShutdownChecklist(true)
    } else {
      setShowProgress(true)
    }
  }

  const finishShutdownChecklist = () => {
    setShowShutdownChecklist(false)
    setShowProgress(true)
  }

  const saveMorningLog = async (morningLog: MorningLog) => {
    if (!userId || !log) return
    const updates = {
      morning_log: morningLog,
      sleep_hours: morningLog.sleep_minutes / 60,
    }
    if (isSupabaseConfigured) {
      const { updateDailyLog } = await import('@/lib/supabase')
      await updateDailyLog(log.id, updates)
    } else {
      localStore.updateDailyLog(viewDate, updates)
    }
    setShowMorningLog(false)
    await refresh()
    await loadData()
  }

  const prepareWeeklyShutdown = async () => {
    if (!userId) return
    const now = new Date()
    const weekDates = isWeeklyShutdownAnyDay(settings)
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

  const completeWeeklyChecklist = async () => {
    const weekKey = getWeeklyShutdownWeekKey(weeklyWeekDates)
    const weeklyWeight = getWeeklyLog(weekKey).weight
    if (weeklyWeight != null && weeklyWeekDates.length > 0 && userId) {
      const lastDay = weeklyWeekDates[weeklyWeekDates.length - 1]
      setWeeklyWeekLogs((prev) =>
        prev.map((l) => (l.date === lastDay ? { ...l, weight: weeklyWeight } : l)),
      )
      if (isSupabaseConfigured) {
        const { getOrCreateDailyLog, updateDailyLog } = await import('@/lib/supabase')
        const dayLog = await getOrCreateDailyLog(userId, lastDay)
        await updateDailyLog(dayLog.id, { weight: weeklyWeight })
      } else {
        localStore.updateDailyLog(lastDay, { weight: weeklyWeight })
      }
    }

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
    setWeeklyHabits(buildWeeklyHabitReviewSummaries(weeklyWeekLogs, weeklyWeekDates))
    setShowWeeklyShutdown(false)
    setShowWeeklyReveal(true)
  }

  const finishWeeklyShutdown = () => {
    const weekKey = getWeeklyShutdownWeekKey(weeklyWeekDates)
    captureWorkoutGoalSnapshotsForWeek(goals, weekKey)
    markWeeklyShutdownCompleted(weekKey)
    setShowWeeklyReveal(false)
    setWeeklySummaries([])
    setWeeklyStats([])
    setWeeklyHabits([])
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
    return <div className="flex flex-1 items-center justify-center text-zinc-500">Loading…</div>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:h-0 lg:overflow-hidden">
      <div className="flex shrink-0 items-start justify-between gap-2">
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

      <div className="flex h-0 min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:grid lg:h-0 lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_340px] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:overflow-hidden xl:grid-cols-[1fr_380px]">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:max-h-[calc(100dvh-11rem)] lg:min-h-0">
          <HourlyTimeline blocks={blocks} date={viewDate} userId={userId} isActiveDay={isActiveDay} startHour={settings.timelineStartHour} endHour={settings.timelineEndHour} onUpdate={saveBlock} onDelete={removeBlock} onCreate={saveBlock} />
        </div>
        <aside className="flex shrink-0 flex-col gap-4 lg:min-h-0 lg:overflow-y-auto">
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
          {isActiveDay && (
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setShowMorningLog(true)}>
                <Sun size={14} className="text-amber-400" /> Morning Log
              </Button>
              {shutdownAvailable && (
                <Button variant="secondary" className="flex-1" onClick={() => setShowShutdown(true)}>
                  <Moon size={14} className="text-violet-400" /> Shutdown
                </Button>
              )}
            </div>
          )}
          <NotesAndReminders items={reminders} viewDate={viewDate} userId={userId} onAdd={addReminder} onRemove={removeReminder} />
          {isActiveDay && (
            <DailyLogForm
              log={log}
              goals={goals}
              workouts={workouts}
              streakLogs={streakLogs}
              userId={userId}
              habitsOnly
              onSaved={() => {
                refresh()
                loadData()
              }}
            />
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
          habitSummaries={weeklyHabits}
          weekLabel={weekDateRangeLabel(weeklyWeekDates)}
          onClose={finishWeeklyShutdown}
        />
      )}

      {showMorningLog && (
        <MorningLogModal
          date={viewDate}
          initial={log.morning_log}
          morningChecklist={settings.morningLogChecklist}
          blocks={blocks}
          userId={userId}
          isActiveDay={isActiveDay}
          timelineStartHour={settings.timelineStartHour}
          timelineEndHour={settings.timelineEndHour}
          onUpdateBlock={saveBlock}
          onDeleteBlock={removeBlock}
          onCreateBlock={saveBlock}
          onClose={() => setShowMorningLog(false)}
          onSave={saveMorningLog}
        />
      )}

      {showShutdownChecklist && (
        <DailyChecklistModal
          title="Shutdown checklist"
          subtitle="Optional items before you wrap up"
          checklist={settings.dailyShutdownChecklist}
          buttonLabel="Continue"
          onClose={() => setShowShutdownChecklist(false)}
          onComplete={finishShutdownChecklist}
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
          userId={userId}
          todayBlocks={blocks}
          tomorrowBlocks={tomorrowBlocks}
          onUpdateTomorrowBlock={saveTomorrowBlock}
          onDeleteTomorrowBlock={removeTomorrowBlock}
          onCreateTomorrowBlock={saveTomorrowBlock}
          onPasteTodaySchedule={pasteTodayScheduleToTomorrow}
          onClose={() => setShowShutdown(false)}
          onComplete={completeShutdown}
          onCompleteReminder={removeReminder}
        />
      )}

      {showProgress && (
        <GoalProgressModal
          deltas={progressDeltas}
          untrackedFocusMinutes={untrackedFocusMinutes}
          completedHabits={completedHabits}
          title="Day complete!"
          subtitle="Here's how today moved your goals"
          buttonLabel="Good night"
          onClose={() => {
            setShowProgress(false)
            setUntrackedFocusMinutes(null)
          }}
        />
      )}

      {showMissedModal && (
        <MissedLogModal date={yesterday} log={yesterdayLog} onSave={saveYesterdayLog} onDismiss={() => setShowMissedModal(false)} />
      )}

      {activeRampPrompt && !showMissedModal && (
        <HabitRampFailureModal
          prompt={activeRampPrompt}
          onDecrease={handleRampStepDown}
          onKeep={handleRampKeepLevel}
        />
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
