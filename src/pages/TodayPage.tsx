import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { addDays, isToday, parseISO } from 'date-fns'
import { CalendarCheck, CalendarDays, Moon, Sun } from 'lucide-react'
import { HomePulseCard } from '@/components/pulse/HomePulseCard'
import { PulseDevPreviewControls } from '@/components/pulse/PulseDevPreviewControls'
import { DateNavigationHeader } from '@/components/today/DateNavigationHeader'
import { HourlyTimeline } from '@/components/today/HourlyTimeline'
import { NotesAndReminders } from '@/components/today/NotesAndReminders'
import { DailyLogForm, getDailyLogDraftForDate } from '@/components/today/DailyLogForm'
import { WorkoutLogCard } from '@/components/today/WorkoutLogCard'
import { GoalProgressModal, type CompletedHabitSummary } from '@/components/today/GoalProgressModal'
import { MorningLogModal, type MorningLogSavePayload } from '@/components/today/MorningLogModal'
import { DailyChecklistModal } from '@/components/today/DailyChecklistModal'
import { ShutdownModal } from '@/components/today/ShutdownModal'
import { WeeklyGoalRevealModal } from '@/components/today/WeeklyGoalRevealModal'
import { WeeklyShutdownModal } from '@/components/today/WeeklyShutdownModal'
import { MonthCalendarModal } from '@/components/today/MonthCalendarModal'
import { MissedLogModal } from '@/components/today/MissedLogModal'
import { HabitRampFailureModal } from '@/components/today/HabitRampFailureModal'
import { useAuth, useDailyLog } from '@/hooks/useData'
import { usePulseDevPreview } from '@/hooks/usePulseDevPreview'
import { useDailyLogDraftRevision } from '@/hooks/useDailyLogDraftRevision'
import { usePulseConfig } from '@/hooks/usePulseConfig'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { useShutdownAvailable } from '@/hooks/useShutdownAvailable'
import { usePastScheduleEnd } from '@/hooks/usePastScheduleEnd'
import { useWeeklyShutdownAvailable } from '@/hooks/useWeeklyShutdownAvailable'
import { useEndOfDaySave } from '@/hooks/useEndOfDaySave'
import { markMorningLogSubmitted, MORNING_LOG_CHANGED } from '@/lib/morningLog'
import { flushDailyLogAndGetProgressDeltas, filterShutdownProgressDeltas } from '@/lib/dailyLogProgress'
import { getHabitStreaksForDate } from '@/lib/habitStreaks'
import { rolloverStaleReminders } from '@/lib/reminderRollover'
import { getDraft, mergeLogWithDraftForDate } from '@/lib/dailyLogDraft'
import { activeDailyChecklist } from '@/lib/dailyChecklist'
import { getDailyLogHabitTypes, getHabitTypes, saveHabitTypes } from '@/lib/habitTypes'
import { computeDayPulse } from '@/lib/pulse'
import { getPulseFormulaForDate } from '@/lib/pulseConfig'
import { getMorningLogYesterdayDate } from '@/lib/morningLogConfig'
import { persistMorningLogPayload } from '@/lib/morningLogSave'
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
import { requestScheduleScrollToNow } from '@/lib/scheduleScroll'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { DailyLog, Goal, Reminder, ScheduleBlock, Workout } from '@/types'
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
import { addDaysToDateString, cn, formatDate, getWeekDates } from '@/lib/utils'
import {
  buildMissedLogDays,
  enumerateDatesInclusive,
  getMissedLogScanStart,
  getYesterdayDate,
  type MissedLogDay,
} from '@/lib/dailyLog'
import { getWeeklyLog } from '@/lib/weeklyLogStore'
import { getPreviousWeekDates } from '@/lib/weightGoal'

export function TodayPage() {
  const { settings } = useSettings()
  const [viewDate, setViewDate] = useState(formatDate(new Date()))
  const { log, workouts, loading, updateLog, refresh, syncFromStore, addWorkout } = useDailyLog(viewDate)
  const { userId } = useAuth()

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [tomorrowBlocks, setTomorrowBlocks] = useState<ScheduleBlock[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
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
  const [yesterdayWorkouts, setYesterdayWorkouts] = useState<Workout[]>([])
  const [missedDays, setMissedDays] = useState<MissedLogDay[]>([])
  const [showWeeklyShutdown, setShowWeeklyShutdown] = useState(false)
  const [showWeeklyReveal, setShowWeeklyReveal] = useState(false)
  const [weeklySummaries, setWeeklySummaries] = useState<WeeklyShutdownGoalSummary[]>([])
  const [weeklyStats, setWeeklyStats] = useState<WeeklyReviewStat[]>([])
  const [weeklyHabits, setWeeklyHabits] = useState<WeeklyHabitReviewSummary[]>([])
  const [weeklyWeekDates, setWeeklyWeekDates] = useState<string[]>([])
  const [weeklyWeekLogs, setWeeklyWeekLogs] = useState<DailyLog[]>([])
  const [weeklyWeekWorkouts, setWeeklyWeekWorkouts] = useState<Workout[]>([])
  const [weekWorkouts, setWeekWorkouts] = useState<Workout[]>([])
  const [rampFailurePrompts, setRampFailurePrompts] = useState<HabitRampFailurePrompt[]>([])
  const [rampPromptIndex, setRampPromptIndex] = useState(0)
  const [previewPulseScore, setPreviewPulseScore] = usePulseDevPreview()
  const { config: pulseConfig } = usePulseConfig()
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()
  const draftRevision = useDailyLogDraftRevision(viewDate)

  const isActiveDay = isToday(parseISO(viewDate))
  const location = useLocation()

  useEffect(() => {
    if (location.pathname !== '/') return
    requestScheduleScrollToNow()
  }, [location.pathname, location.key, isActiveDay, viewDate])
  const dayPulse = useMemo(() => {
    const habits = getDailyLogHabitTypes()
    const formula = getPulseFormulaForDate(pulseConfig, viewDate)
    const effectiveLog = log ? mergeLogWithDraftForDate(log, viewDate, workouts) : undefined
    return computeDayPulse(
      viewDate,
      effectiveLog,
      habits,
      goals,
      workouts,
      formula,
      sleepMetricsConfig,
    )
  }, [viewDate, log, goals, workouts, pulseConfig, sleepMetricsConfig, draftRevision])
  const headerPulseScore =
    settings.devMode && previewPulseScore != null ? previewPulseScore : dayPulse.score
  const shutdownAvailable = useShutdownAvailable(viewDate)
  const pastScheduleEnd = usePastScheduleEnd(settings.timelineEndHour)
  const shutdownBreathing = isActiveDay && pastScheduleEnd
  const weeklyShutdownAvailable = useWeeklyShutdownAvailable(viewDate, settings.weekStartsOn)
  const tomorrowDate = addDaysToDateString(viewDate, 1)
  const yesterday = getYesterdayDate()

  const removeMissedDay = useCallback((date: string) => {
    setMissedDays((prev) => {
      const next = prev.filter((d) => d.date !== date)
      if (next.length === 0) setShowMissedModal(false)
      return next
    })
  }, [])

  const checkMissedLog = useCallback(async () => {
    if (!userId) return

    const until = getYesterdayDate()
    const start = getMissedLogScanStart(settings.memberSinceDate, until)

    let logs: DailyLog[] = []
    if (isSupabaseConfigured) {
      const { fetchDailyLogs } = await import('@/lib/supabase')
      try {
        logs = await fetchDailyLogs(userId, start, until)
      } catch {
        /* ignore */
      }
    } else {
      logs = localStore.getDailyLogs(start, until)
    }

    const logsByDate = new Map<string, DailyLog | null>()
    for (const entry of logs) {
      logsByDate.set(entry.date, entry)
    }

    for (const date of enumerateDatesInclusive(start, until)) {
      const base = logsByDate.get(date) ?? null
      const draft = getDraft(date)
      const effective =
        base && draft
          ? {
              ...base,
              ...draft,
              habits: normalizeHabits({ ...base.habits, ...draft.habits }),
            }
          : base
      logsByDate.set(date, effective)
    }

    setYesterdayLog(logsByDate.get(yesterday) ?? null)

    const missed = buildMissedLogDays(logsByDate, goals, settings.memberSinceDate)
    setMissedDays(missed)
    setShowMissedModal(missed.length > 0)
  }, [userId, yesterday, goals, settings.memberSinceDate])

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

  const refreshWeekWorkouts = useCallback(async () => {
    if (!userId || !isActiveDay) {
      setWeekWorkouts([])
      return
    }
    const weekDates = getWeekDates(parseISO(`${viewDate}T12:00:00`), settings.weekStartsOn)
    const start = weekDates[0]
    const end = weekDates[weekDates.length - 1]
    if (!start || !end) {
      setWeekWorkouts([])
      return
    }
    if (isSupabaseConfigured) {
      const { fetchWorkouts } = await import('@/lib/supabase')
      setWeekWorkouts(await fetchWorkouts(userId, start, end))
    } else {
      localStore.setUserId(userId)
      setWeekWorkouts(localStore.getWorkouts(start, end))
    }
  }, [userId, viewDate, settings.weekStartsOn, isActiveDay])

  const loadData = useCallback(async () => {
    if (!userId) return
    const today = formatDate(new Date())
    const streakStart = formatDate(addDays(parseISO(viewDate), -400))

    if (isActiveDay && viewDate === today) {
      await rolloverStaleReminders(userId, today)
    }

    if (isSupabaseConfigured) {
      const { fetchScheduleBlocks, fetchReminders, fetchGoals, fetchDailyLogs } = await import('@/lib/supabase')
      setBlocks((await fetchScheduleBlocks(userId, viewDate)).map(normalizeScheduleBlock))
      setReminders((await fetchReminders(userId)).map((r) => ({ ...r, kind: r.kind ?? 'task' })))
      setGoals(await fetchGoals(userId))
      setStreakLogs(await fetchDailyLogs(userId, streakStart, viewDate))
    } else {
      setBlocks(localStore.getScheduleBlocks(viewDate).map(normalizeScheduleBlock))
      setReminders(localStore.getReminders().map((r) => ({ ...r, kind: r.kind ?? 'task' })))
      setGoals(localStore.getGoals())
      setStreakLogs(localStore.getDailyLogs(streakStart, viewDate))
    }

    await refreshWeekWorkouts()
  }, [userId, viewDate, isActiveDay, refreshWeekWorkouts])

  const refreshStreakLogs = useCallback(async () => {
    if (!userId) return
    const streakStart = formatDate(addDays(parseISO(viewDate), -400))
    if (isSupabaseConfigured) {
      const { fetchDailyLogs } = await import('@/lib/supabase')
      setStreakLogs(await fetchDailyLogs(userId, streakStart, viewDate))
    } else {
      setStreakLogs(localStore.getDailyLogs(streakStart, viewDate))
    }
  }, [userId, viewDate])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const onMorningLogChanged = () => {
      refresh()
      loadData()
    }
    window.addEventListener(MORNING_LOG_CHANGED, onMorningLogChanged)
    return () => window.removeEventListener(MORNING_LOG_CHANGED, onMorningLogChanged)
  }, [refresh, loadData])

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
    const normalized = await persistScheduleBlock({ ...block, date: tomorrowDate })
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

  useEffect(() => {
    if (!showMorningLog || !userId) return
    const yesterdayDate = getMorningLogYesterdayDate(viewDate)
    void (async () => {
      if (isSupabaseConfigured) {
        const { fetchWorkouts } = await import('@/lib/supabase')
        setYesterdayWorkouts(await fetchWorkouts(userId, yesterdayDate, yesterdayDate))
      } else {
        localStore.setUserId(userId)
        setYesterdayWorkouts(localStore.getWorkouts(yesterdayDate, yesterdayDate))
      }
    })()
  }, [showMorningLog, userId, viewDate])

  const saveMorningLog = async (payload: MorningLogSavePayload) => {
    if (!userId || !log) throw new Error('Daily log not loaded')
    await persistMorningLogPayload({
      userId,
      date: viewDate,
      log,
      yesterdayLog,
      goals,
      sleepMetricsConfig,
      payload,
    })
    markMorningLogSubmitted(viewDate)
    setShowMorningLog(false)
    syncFromStore()
    const yesterdayDate = getMorningLogYesterdayDate(viewDate)
    if (isSupabaseConfigured) {
      const { getOrCreateDailyLog, fetchWorkouts } = await import('@/lib/supabase')
      setYesterdayLog(await getOrCreateDailyLog(userId, yesterdayDate))
      setYesterdayWorkouts(await fetchWorkouts(userId, yesterdayDate, yesterdayDate))
    } else {
      setYesterdayLog(localStore.getOrCreateDailyLog(yesterdayDate))
      setYesterdayWorkouts(localStore.getWorkouts(yesterdayDate, yesterdayDate))
    }
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

  const saveMissedLog = async (date: string, updates: Parameters<typeof updateLog>[0]) => {
    if (!userId) return
    if (isSupabaseConfigured) {
      const { getOrCreateDailyLog, updateDailyLog } = await import('@/lib/supabase')
      const dayLog = await getOrCreateDailyLog(userId, date)
      await updateDailyLog(dayLog.id, updates)
    } else {
      localStore.updateDailyLog(date, updates)
    }
    removeMissedDay(date)
  }

  if (!userId || (loading && !log)) {
    return <div className="flex flex-1 items-center justify-center text-zinc-500">Loading…</div>
  }

  if (!log) {
    return null
  }

  return (
      <div className="flex flex-col gap-4" data-tour="today-content">
      <div className="relative shrink-0 overflow-visible px-1 pb-2 pt-1 sm:px-2 sm:pb-3 sm:pt-2">
        <div className="relative flex min-h-[6.5rem] items-center justify-between gap-2 sm:min-h-[7rem]">
          <div className="relative z-10 min-w-0 flex-1 self-center">
            <DateNavigationHeader
              date={viewDate}
              onPrev={() => shiftDate(-1)}
              onNext={() => shiftDate(1)}
              onToday={() => setViewDate(formatDate(new Date()))}
            />
          </div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible">
            <HomePulseCard
              score={headerPulseScore}
              className="pointer-events-auto"
            />
          </div>
          <button
            onClick={() => setShowCalendar(true)}
            className="relative z-10 shrink-0 self-center rounded-lg border border-zinc-800 p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Month overview"
          >
            <CalendarDays size={18} />
          </button>
        </div>
        {settings.devMode && (
          <PulseDevPreviewControls
            compact
            className="relative z-10 mx-auto mt-2 max-w-2xl"
            previewScore={previewPulseScore}
            onPreviewScoreChange={setPreviewPulseScore}
          />
        )}
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start xl:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          {!showShutdown && (
            <HourlyTimeline blocks={blocks} date={viewDate} userId={userId} isActiveDay={isActiveDay} startHour={settings.timelineStartHour} endHour={settings.timelineEndHour} onUpdate={saveBlock} onDelete={removeBlock} onCreate={saveBlock} />
          )}
        </div>
        <aside className="flex shrink-0 flex-col gap-4">
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
          {isActiveDay && (!settings.requireMorningLog || shutdownAvailable) && (
            <div className="flex gap-2">
              {!settings.requireMorningLog && (
                <Button variant="secondary" className="flex-1" onClick={() => setShowMorningLog(true)}>
                  <Sun size={14} className="text-amber-400" /> Morning Log
                </Button>
              )}
              {shutdownAvailable && (
                <Button
                  variant="secondary"
                  className={cn('flex-1', shutdownBreathing && 'today-btn-breathe-violet')}
                  onClick={() => setShowShutdown(true)}
                >
                  <Moon size={14} className="text-violet-400" /> Shutdown
                </Button>
              )}
            </div>
          )}
          <NotesAndReminders items={reminders} viewDate={viewDate} userId={userId} onAdd={addReminder} onUpdate={updateReminder} onRemove={removeReminder} />
          {isActiveDay && (
            <DailyLogForm
              log={log}
              goals={goals}
              workouts={workouts}
              streakLogs={streakLogs}
              userId={userId}
              habitsOnly
              onSaved={() => {
                syncFromStore()
                void refreshStreakLogs()
              }}
            />
          )}
          {isActiveDay && (
            <WorkoutLogCard
              date={viewDate}
              goals={goals}
              weekWorkouts={weekWorkouts}
              workouts={workouts}
              disabled={!userId}
              onAddWorkout={async (category, minutes) => {
                await addWorkout(category, minutes)
                await refreshWeekWorkouts()
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
          initialLog={log}
          yesterdayLog={yesterdayLog}
          workouts={workouts}
          yesterdayWorkouts={yesterdayWorkouts}
          goals={goals}
          sleepMetricsConfig={sleepMetricsConfig}
          morningChecklist={settings.morningLogChecklist}
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

      {showMissedModal && missedDays.length > 0 && (
        <MissedLogModal
          days={missedDays}
          goals={goals}
          onSave={saveMissedLog}
          onDismissDay={removeMissedDay}
          onClose={() => setShowMissedModal(false)}
        />
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
          goals={goals}
          userId={userId}
          todayLog={log}
          todayWorkouts={workouts}
          onClose={() => setShowCalendar(false)}
          onSelectDate={setViewDate}
        />
      )}
    </div>
  )
}
