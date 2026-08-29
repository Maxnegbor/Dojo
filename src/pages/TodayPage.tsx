import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { addDays, isToday, parseISO } from 'date-fns'
import { CalendarCheck, CalendarDays, ClipboardList, Moon, Sun } from 'lucide-react'
import { HomePulseCard } from '@/components/pulse/HomePulseCard'
import { DateNavigationHeader } from '@/components/today/DateNavigationHeader'
import { HourlyTimeline } from '@/components/today/HourlyTimeline'
import { ScheduleTemplateMenu } from '@/components/today/ScheduleTemplateMenu'
import { HabitifyHabitsCard } from '@/components/today/HabitifyHabitsCard'
import { TodoistTasksCard } from '@/components/today/TodoistTasksCard'
import { WorkoutLogCard } from '@/components/today/WorkoutLogCard'
import { ExperimentHomeCard } from '@/components/today/ExperimentHomeCard'
import { getDailyLogDraftForDate } from '@/components/today/DailyLogForm'
import { ExercisePlanCard } from '@/components/today/ExercisePlanCard'
import { HomeLogModal } from '@/components/today/HomeLogModal'
import { DailyChecklistModal } from '@/components/today/DailyChecklistModal'
import { MorningLogModal, type MorningLogSavePayload } from '@/components/today/MorningLogModal'
import { ShutdownModal } from '@/components/today/ShutdownModal'
import { WeeklyGoalRevealModal } from '@/components/today/WeeklyGoalRevealModal'
import { WeeklyPulseRevealModal } from '@/components/today/WeeklyPulseRevealModal'
import { WeeklyShutdownModal } from '@/components/today/WeeklyShutdownModal'
import { MonthCalendarModal } from '@/components/today/MonthCalendarModal'
import { HabitRampFailureModal } from '@/components/today/HabitRampFailureModal'
import { useAuth, useDailyLog } from '@/hooks/useData'
import { useDailyLogDraftRevision } from '@/hooks/useDailyLogDraftRevision'
import { usePulseConfig } from '@/hooks/usePulseConfig'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { useShutdownAvailable } from '@/hooks/useShutdownAvailable'
import { usePastScheduleEnd } from '@/hooks/usePastScheduleEnd'
import { useWeeklyShutdownAvailable } from '@/hooks/useWeeklyShutdownAvailable'
import { useEndOfDaySave } from '@/hooks/useEndOfDaySave'
import { markMorningLogSubmitted, isMorningLogSubmitted, MORNING_LOG_CHANGED } from '@/lib/morningLog'
import {
  isPastShutdownRequireTime,
  isShutdownSubmitted,
  markShutdownSubmitted,
  notifyShutdownFlowClosed,
  requestOpenShutdown,
  SHUTDOWN_OPEN_REQUESTED,
} from '@/lib/dailyShutdownRequire'
import { flushDraftToStore, getDraft, mergeLogWithDraftForDate, setDraft } from '@/lib/dailyLogDraft'
import { getHabitStreaksForDate } from '@/lib/habitStreaks'
import { normalizeDailyShutdownSteps } from '@/lib/dailyShutdownSteps'
import { activeDailyChecklist } from '@/lib/dailyChecklist'
import { getDailyLogHabitTypes, getHabitTypes, saveHabitTypes } from '@/lib/habitTypes'
import { computeDayPulse, PULSE_HEADER_SCALE, pulseCorePx } from '@/lib/pulse'
import { buildPulseContributors } from '@/lib/pulseBreakdown'
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
import {
  normalizeScheduleBlock,
  fetchScheduleBlocksForDate,
  cloneScheduleBlocksForDate,
  persistScheduleBlock,
  removeScheduleBlock,
  replaceScheduleBlocksForDate,
} from '@/lib/scheduleBlock'
import {
  scheduleBlocksFromTemplate,
  type ScheduleTemplate,
} from '@/lib/scheduleTemplates'
import {
  applyWorkoutTypeToScheduleBlock,
  placePlannedWorkoutOnSchedule,
  unlinkPlannedWorkoutByScheduleBlockId,
} from '@/lib/exercisePlan'
import { isWorkoutScheduleColor } from '@/lib/scheduleColors'
import { requestScheduleScrollToNow } from '@/lib/scheduleScroll'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { DailyLog, Goal, ScheduleBlock, Workout, WorkoutCategory } from '@/types'
import {
  buildWeeklyShutdownSummaries,
  buildWeeklyUntargetedStats,
  buildWeeklyHabitReviewSummaries,
  getWeeklyReviewWeekDates,
  getPendingWeeklyShutdownWeekDates,
  getWeeklyShutdownWeekKey,
  markWeeklyShutdownCompleted,
  weekDateRangeLabel,
  type WeeklyShutdownGoalSummary,
  type WeeklyReviewStat,
  type WeeklyHabitReviewSummary,
} from '@/lib/weeklyShutdown'
import { isWeeklyShutdownAnyDay } from '@/lib/devMode'
import { Button } from '@/components/ui/Button'
import { useSettings } from '@/context/SettingsContext'
import { useScreensaver } from '@/context/ScreensaverContext'
import { addDaysToDateString, cn, formatDate, getWeekDates } from '@/lib/utils'
import { getYesterdayDate } from '@/lib/dailyLog'
import { getWeeklyLog } from '@/lib/weeklyLogStore'
import { cleanupStaleGoals } from '@/lib/goalCleanup'
import { buildWeeklyPulseReview, type WeeklyPulseReview } from '@/lib/weeklyPulseReview'
import { getPreviousWeekDates } from '@/lib/weightGoal'

export function TodayPage() {
  const { settings } = useSettings()
  const location = useLocation()
  const navigate = useNavigate()
  const [viewDate, setViewDate] = useState(formatDate(new Date()))
  const { log, workouts, loading, refresh, syncFromStore, removeWorkout, addWorkout } = useDailyLog(viewDate)
  const { userId, storageReady } = useAuth()

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [tomorrowBlocks, setTomorrowBlocks] = useState<ScheduleBlock[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [weekWorkouts, setWeekWorkouts] = useState<Workout[]>([])
  const [streakLogs, setStreakLogs] = useState<DailyLog[]>([])
  const [showCalendar, setShowCalendar] = useState(false)
  const [showShutdown, setShowShutdown] = useState(false)
  const [showMorningLog, setShowMorningLog] = useState(false)
  const [showHomeLog, setShowHomeLog] = useState(false)
  const [morningLogDone, setMorningLogDone] = useState(() => isMorningLogSubmitted(viewDate))
  const [showShutdownChecklist, setShowShutdownChecklist] = useState(false)
  const [yesterdayLog, setYesterdayLog] = useState<DailyLog | null>(null)
  const [yesterdayWorkouts, setYesterdayWorkouts] = useState<Workout[]>([])
  const [showWeeklyShutdown, setShowWeeklyShutdown] = useState(false)
  const [showWeeklyPulse, setShowWeeklyPulse] = useState(false)
  const [showWeeklyReveal, setShowWeeklyReveal] = useState(false)
  const [weeklySummaries, setWeeklySummaries] = useState<WeeklyShutdownGoalSummary[]>([])
  const [weeklyStats, setWeeklyStats] = useState<WeeklyReviewStat[]>([])
  const [weeklyHabits, setWeeklyHabits] = useState<WeeklyHabitReviewSummary[]>([])
  const [weeklyPulseReview, setWeeklyPulseReview] = useState<WeeklyPulseReview | null>(null)
  const [weeklyWeekDates, setWeeklyWeekDates] = useState<string[]>([])
  const [weeklyWeekLogs, setWeeklyWeekLogs] = useState<DailyLog[]>([])
  const [weeklyWeekWorkouts, setWeeklyWeekWorkouts] = useState<Workout[]>([])
  const [rampFailurePrompts, setRampFailurePrompts] = useState<HabitRampFailurePrompt[]>([])
  const [rampPromptIndex, setRampPromptIndex] = useState(0)
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const { config: pulseConfig } = usePulseConfig()
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()
  const draftRevision = useDailyLogDraftRevision(viewDate)

  const isActiveDay = isToday(parseISO(viewDate))
  const screensaver = useScreensaver()

  useEffect(() => {
    if (location.pathname !== '/') return
    requestScheduleScrollToNow()
  }, [location.pathname, location.key, isActiveDay, viewDate])
  const dayPulse = useMemo(() => {
    const habits = getDailyLogHabitTypes()
    const formula = getPulseFormulaForDate(pulseConfig, viewDate)
    const effectiveLog = log ? mergeLogWithDraftForDate(log, viewDate, workouts) : undefined
    const dayWorkouts = workouts.filter((w) => w.date === viewDate)
    return computeDayPulse(
      viewDate,
      effectiveLog,
      habits,
      goals,
      dayWorkouts,
      formula,
      sleepMetricsConfig,
    )
  }, [viewDate, log, goals, workouts, pulseConfig, sleepMetricsConfig, draftRevision])

  const pulseContributors = useMemo(() => {
    const formula = getPulseFormulaForDate(pulseConfig, viewDate)
    const effectiveLog = log ? mergeLogWithDraftForDate(log, viewDate, workouts) : undefined
    const dayWorkouts = workouts.filter((w) => w.date === viewDate)
    return buildPulseContributors({
      date: viewDate,
      log: effectiveLog,
      goals,
      workouts: dayWorkouts,
      formula,
      sleepMetricsConfig,
    })
  }, [viewDate, log, goals, workouts, pulseConfig, sleepMetricsConfig, draftRevision])

  const headerPulseScore = dayPulse.score
  const headerPulseLayoutPx = pulseCorePx(PULSE_HEADER_SCALE) + 8
  const shutdownAvailable = useShutdownAvailable(viewDate)
  const pastScheduleEnd = usePastScheduleEnd(settings.timelineEndHour)
  const [pastShutdownRequire, setPastShutdownRequire] = useState(() =>
    isPastShutdownRequireTime(settings),
  )
  const [shutdownDone, setShutdownDone] = useState(() => isShutdownSubmitted(viewDate))
  const shutdownBreathing =
    isActiveDay && (settings.requireShutdown ? pastShutdownRequire && !shutdownDone : pastScheduleEnd)
  const shutdownRequired =
    isActiveDay && settings.requireShutdown && pastShutdownRequire && !shutdownDone
  const weeklyShutdownAvailable = useWeeklyShutdownAvailable(viewDate, settings.weekStartsOn)
  const tomorrowDate = addDaysToDateString(viewDate, 1)
  const yesterday = getYesterdayDate()

  const loadYesterdayLog = useCallback(async () => {
    if (!userId) return
    if (isSupabaseConfigured) {
      const { getOrCreateDailyLog } = await import('@/lib/supabase')
      try {
        setYesterdayLog(await getOrCreateDailyLog(userId, yesterday))
      } catch {
        setYesterdayLog(null)
      }
    } else {
      localStore.setUserId(userId)
      setYesterdayLog(localStore.getOrCreateDailyLog(yesterday))
    }
  }, [userId, yesterday])

  useEndOfDaySave({ userId, onFlushed: () => { refresh(); void loadYesterdayLog() } })
  useEffect(() => {
    void loadYesterdayLog()
  }, [loadYesterdayLog])

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
    if (!userId || !storageReady) return
    const streakStart = formatDate(addDays(parseISO(viewDate), -400))
    const weekDates = getWeekDates(parseISO(`${viewDate}T12:00:00`), settings.weekStartsOn)
    const weekStart = weekDates[0]!
    const weekEnd = weekDates[weekDates.length - 1]!

    if (isSupabaseConfigured) {
      const { fetchScheduleBlocks, fetchGoals, fetchDailyLogs, fetchWorkouts, upsertGoal } = await import('@/lib/supabase')
      setBlocks((await fetchScheduleBlocks(userId, viewDate)).map(normalizeScheduleBlock))
      const { goals: cleaned, toRetire } = cleanupStaleGoals(await fetchGoals(userId))
      setGoals(cleaned)
      for (const duplicate of toRetire) {
        await upsertGoal(duplicate)
      }
      setStreakLogs(await fetchDailyLogs(userId, streakStart, viewDate))
      setWeekWorkouts(await fetchWorkouts(userId, weekStart, weekEnd))
    } else {
      setBlocks(localStore.getScheduleBlocks(viewDate).map(normalizeScheduleBlock))
      const { goals: cleaned, toRetire } = cleanupStaleGoals(localStore.getGoals())
      setGoals(cleaned)
      for (const duplicate of toRetire) {
        localStore.upsertGoal(duplicate)
      }
      setStreakLogs(localStore.getDailyLogs(streakStart, viewDate))
      setWeekWorkouts(localStore.getWorkouts(weekStart, weekEnd))
    }
  }, [userId, storageReady, viewDate, settings.weekStartsOn])

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
    setMorningLogDone(isMorningLogSubmitted(viewDate))
  }, [viewDate])

  useEffect(() => {
    setShutdownDone(isShutdownSubmitted(viewDate))
  }, [viewDate])

  useEffect(() => {
    const tick = () => setPastShutdownRequire(isPastShutdownRequireTime(settings))
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [settings])

  useEffect(() => {
    const onOpenShutdown = () => {
      if (!isActiveDay) return
      setShowShutdown(true)
    }
    window.addEventListener(SHUTDOWN_OPEN_REQUESTED, onOpenShutdown)
    return () => window.removeEventListener(SHUTDOWN_OPEN_REQUESTED, onOpenShutdown)
  }, [isActiveDay])

  useEffect(() => {
    const state = location.state as { openShutdown?: boolean } | null
    if (!state?.openShutdown || !isActiveDay) return
    setShowShutdown(true)
    navigate('.', { replace: true, state: null })
  }, [location.state, isActiveDay, navigate])

  useEffect(() => {
    const onMorningLogChanged = () => {
      setMorningLogDone(isMorningLogSubmitted(viewDate))
      refresh()
      loadData()
    }
    window.addEventListener(MORNING_LOG_CHANGED, onMorningLogChanged)
    return () => window.removeEventListener(MORNING_LOG_CHANGED, onMorningLogChanged)
  }, [refresh, loadData, viewDate])

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
    const previous = blocks.find((b) => b.id === normalized.id)

    if (isSupabaseConfigured) {
      const { upsertScheduleBlock } = await import('@/lib/supabase')
      await upsertScheduleBlock(normalized)
    } else localStore.upsertScheduleBlock(normalized)

    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === normalized.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = normalized; return next }
      return [...prev, normalized]
    })

    if (
      previous &&
      isWorkoutScheduleColor(previous.activity_type) &&
      !isWorkoutScheduleColor(normalized.activity_type)
    ) {
      unlinkPlannedWorkoutByScheduleBlockId(normalized.id)
    }
  }

  const assignExerciseBlock = async (block: ScheduleBlock, category: string) => {
    const saved = await applyWorkoutTypeToScheduleBlock({ block, category })
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [...prev, saved]
    })
  }

  const removeBlock = async (id: string) => {
    if (isSupabaseConfigured) {
      const { deleteScheduleBlock } = await import('@/lib/supabase')
      await deleteScheduleBlock(id)
    } else localStore.deleteScheduleBlock(id)
    unlinkPlannedWorkoutByScheduleBlockId(id)
    setBlocks((prev) => prev.filter((b) => b.id !== id))
  }

  const refreshScheduleBlocks = useCallback(async () => {
    if (!userId) return
    if (isSupabaseConfigured) {
      const { fetchScheduleBlocks } = await import('@/lib/supabase')
      setBlocks((await fetchScheduleBlocks(userId, viewDate)).map(normalizeScheduleBlock))
    } else {
      setBlocks(localStore.getScheduleBlocks(viewDate).map(normalizeScheduleBlock))
    }
  }, [userId, viewDate])

  const dropPlannedWorkout = async (planId: string, startMinutes: number) => {
    if (!userId) return
    await placePlannedWorkoutOnSchedule({
      planId,
      startMinutes,
      userId,
      timelineEndHour: settings.timelineEndHour,
      date: viewDate,
    })
    await refreshScheduleBlocks()
  }

  const saveTomorrowBlock = async (block: ScheduleBlock) => {
    const previous = tomorrowBlocks.find((b) => b.id === block.id)
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

    if (
      previous &&
      isWorkoutScheduleColor(previous.activity_type) &&
      !isWorkoutScheduleColor(normalized.activity_type)
    ) {
      unlinkPlannedWorkoutByScheduleBlockId(normalized.id)
    }
  }

  const assignTomorrowExerciseBlock = async (block: ScheduleBlock, category: WorkoutCategory) => {
    const saved = await applyWorkoutTypeToScheduleBlock({
      block: { ...block, date: tomorrowDate },
      category,
    })
    setTomorrowBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [...prev, saved]
    })
  }

  const removeTomorrowBlock = async (id: string) => {
    await removeScheduleBlock(id)
    unlinkPlannedWorkoutByScheduleBlockId(id)
    setTomorrowBlocks((prev) => prev.filter((b) => b.id !== id))
  }

  const pasteTodayScheduleToTomorrow = async () => {
    if (!userId || blocks.length === 0) return
    const copies = cloneScheduleBlocksForDate(blocks, tomorrowDate, userId)
    const saved = await replaceScheduleBlocksForDate(tomorrowBlocks, copies)
    setTomorrowBlocks(saved)
  }

  const applyScheduleTemplateToDate = async (
    template: ScheduleTemplate,
    targetDate: string,
    existing: ScheduleBlock[],
    setTarget: (blocks: ScheduleBlock[]) => void,
  ) => {
    if (!userId || template.blocks.length === 0) return
    const next = scheduleBlocksFromTemplate(template, targetDate, userId)
    const saved = await replaceScheduleBlocksForDate(existing, next, {
      preservePlanLinkedForDate: targetDate,
    })
    setTarget(saved)
  }

  const applyTemplateToViewDate = async (template: ScheduleTemplate) => {
    if (!userId) return
    setApplyingTemplate(true)
    try {
      await applyScheduleTemplateToDate(template, viewDate, blocks, setBlocks)
    } finally {
      setApplyingTemplate(false)
    }
  }

  const applyTemplateToTomorrow = async (template: ScheduleTemplate) => {
    if (!userId) return
    setApplyingTemplate(true)
    try {
      await applyScheduleTemplateToDate(template, tomorrowDate, tomorrowBlocks, setTomorrowBlocks)
    } finally {
      setApplyingTemplate(false)
    }
  }

  const completeShutdown = async () => {
    if (!userId || !log) return

    const draft = getDailyLogDraftForDate(log, workouts)
    if (draft) setDraft(viewDate, draft)
    await flushDraftToStore(viewDate, userId)

    const showChecklistNext =
      activeDailyChecklist(settings.dailyShutdownChecklist).length > 0 &&
      !normalizeDailyShutdownSteps(settings.dailyShutdownSteps).includes('checklist')

    // Open checklist in the same paint as closing shutdown so the blur never drops.
    if (showChecklistNext) setShowShutdownChecklist(true)
    setShowShutdown(false)
    markShutdownSubmitted(viewDate)
    setShutdownDone(true)

    void refresh()
    void loadData()
  }

  const finishShutdownChecklist = () => {
    setShowShutdownChecklist(false)
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
      : getPendingWeeklyShutdownWeekDates(now, settings.weekStartsOn)
    if (weekDates.length === 0) return

    // Current week + previous week (for logs) + 3 prior weeks for pulse comparison.
    let rangeStart = weekDates[0]
    let cursor = weekDates
    for (let i = 0; i < 3; i++) {
      cursor = getPreviousWeekDates(cursor, settings.weekStartsOn)
      if (cursor.length === 0) break
      rangeStart = cursor[0]
    }
    const end = weekDates[weekDates.length - 1]

    let weekLogs: DailyLog[]
    let weekWorkouts: Workout[]

    if (isSupabaseConfigured) {
      const { fetchDailyLogs, fetchWorkouts } = await import('@/lib/supabase')
      ;[weekLogs, weekWorkouts] = await Promise.all([
        fetchDailyLogs(userId, rangeStart, end),
        fetchWorkouts(userId, rangeStart, end),
      ])
    } else {
      weekLogs = localStore.getDailyLogs(rangeStart, end)
      weekWorkouts = localStore.getWorkouts(rangeStart, end)
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

    const logsForReview =
      weeklyWeight != null && weeklyWeekDates.length > 0
        ? weeklyWeekLogs.map((l) =>
            l.date === weeklyWeekDates[weeklyWeekDates.length - 1]
              ? { ...l, weight: weeklyWeight }
              : l,
          )
        : weeklyWeekLogs

    setWeeklySummaries(
      buildWeeklyShutdownSummaries(
        goals,
        logsForReview,
        weeklyWeekWorkouts,
        weeklyWeekDates,
        settings.weightUnit,
        settings.weekStartsOn,
      ),
    )
    setWeeklyStats(
      buildWeeklyUntargetedStats(
        goals,
        logsForReview,
        weeklyWeekWorkouts,
        weeklyWeekDates,
        settings.weightUnit,
      ),
    )
    setWeeklyHabits(buildWeeklyHabitReviewSummaries(logsForReview, weeklyWeekDates))
    const pulseReview = buildWeeklyPulseReview(
      weeklyWeekDates,
      logsForReview,
      goals,
      weeklyWeekWorkouts,
      settings.weekStartsOn,
      pulseConfig,
      sleepMetricsConfig,
      { useDevDummyHistory: settings.devMode },
    )
    setWeeklyPulseReview(pulseReview)
    setShowWeeklyShutdown(false)
    if (pulseReview) {
      setShowWeeklyPulse(true)
    } else {
      setShowWeeklyReveal(true)
    }
  }

  const continueWeeklyPulse = () => {
    setShowWeeklyPulse(false)
    setShowWeeklyReveal(true)
  }

  const finishWeeklyShutdown = () => {
    const weekKey = getWeeklyShutdownWeekKey(weeklyWeekDates)
    captureWorkoutGoalSnapshotsForWeek(goals, weekKey)
    markWeeklyShutdownCompleted(weekKey)
    setShowWeeklyPulse(false)
    setShowWeeklyReveal(false)
    setWeeklySummaries([])
    setWeeklyStats([])
    setWeeklyHabits([])
    setWeeklyPulseReview(null)
    setWeeklyWeekDates([])
    setWeeklyWeekLogs([])
    setWeeklyWeekWorkouts([])
  }

  if (!userId || (loading && !log)) {
    return <div className="flex flex-1 items-center justify-center text-zinc-500">Loading…</div>
  }

  if (!log) {
    return null
  }

  return (
      <div
        className={cn(
          'relative z-10 flex h-full min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-visible home-stage',
          screensaver && 'home-stage--screensaver',
        )}
        style={{
          gap: screensaver ? '0px' : undefined,
          transition: 'gap 1200ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
      <div
        className={cn(
          'relative shrink-0 px-1 pt-1 pb-0.5 sm:px-2 sm:pt-1.5 sm:pb-1',
          'transition-[max-height,opacity,filter,padding] duration-[2000ms] ease-in-out',
          screensaver ? 'overflow-hidden' : 'overflow-visible',
          // Stay above the schedule grid so the lower half of the pulse stays hoverable.
          'z-40',
          screensaver && 'pointer-events-none opacity-0 blur-[1px]',
        )}
        style={{
          maxHeight: screensaver ? '0px' : `${headerPulseLayoutPx + 24}px`,
          paddingTop: screensaver ? '0px' : undefined,
          paddingBottom: screensaver ? '0px' : undefined,
        }}
      >
        <div
          className="relative flex items-center justify-between gap-2 overflow-visible"
          style={{ minHeight: headerPulseLayoutPx }}
        >
          <div className="relative z-10 min-w-0 flex-1 self-center">
            <DateNavigationHeader
              date={viewDate}
              onPrev={() => shiftDate(-1)}
              onNext={() => shiftDate(1)}
              onToday={() => setViewDate(formatDate(new Date()))}
            />
          </div>
          <div
            className={cn(
              'pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-visible',
            )}
          >
            {settings.showHomePulse && (
              <div className="pointer-events-auto">
                <HomePulseCard
                  score={headerPulseScore}
                  contributors={pulseContributors}
                />
              </div>
            )}
          </div>
          <div className="relative z-10 flex shrink-0 items-center gap-1.5 self-center">
            <button
              onClick={() => setShowCalendar(true)}
              className="home-cal-btn rounded-full border border-zinc-800/70 bg-zinc-950/60 p-2 text-zinc-500 backdrop-blur-sm transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200"
              aria-label="Month overview"
            >
              <CalendarDays size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="relative z-20 grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,min-content)] gap-3 overflow-hidden lg:grid-cols-[1fr_minmax(18rem,36rem)_1fr] lg:grid-rows-none lg:gap-4 xl:gap-5"
        style={{
          transition: 'gap 1200ms cubic-bezier(0.4,0,0.2,1)',
          gap: screensaver ? '0px' : undefined,
        }}
      >
        {/* Left: Exercise plan + workouts + Todoist */}
        <aside className={cn(
          'home-rail home-rail--left relative z-30 order-3 flex min-h-0 w-full min-w-0 flex-col gap-2.5 overflow-y-auto overscroll-contain scrollbar-hidden lg:order-1 lg:h-full lg:max-w-[17rem] lg:justify-self-end',
          'transition-[opacity,filter,visibility] duration-[1500ms] ease-in-out',
          screensaver && 'pointer-events-none invisible !opacity-0',
        )}>
          <ExercisePlanCard
            viewDate={viewDate}
            userId={userId}
            className="w-full"
            onScheduleChange={() => {
              void refreshScheduleBlocks()
            }}
            onRemoveLoggedWorkout={async (workoutId) => {
              await removeWorkout(workoutId)
            }}
            onVolumeLogged={() => {
              syncFromStore()
            }}
          />
          <WorkoutLogCard
            date={viewDate}
            userId={userId}
            goals={goals}
            weekWorkouts={weekWorkouts}
            workouts={workouts}
            disabled={!userId || loading}
            onAddWorkout={async (category, minutes) => {
              await addWorkout(category, minutes)
              const weekDates = getWeekDates(parseISO(`${viewDate}T12:00:00`), settings.weekStartsOn)
              const weekStart = weekDates[0]!
              const weekEnd = weekDates[weekDates.length - 1]!
              if (isSupabaseConfigured) {
                const { fetchWorkouts } = await import('@/lib/supabase')
                if (userId) setWeekWorkouts(await fetchWorkouts(userId, weekStart, weekEnd))
              } else {
                setWeekWorkouts(localStore.getWorkouts(weekStart, weekEnd))
              }
              syncFromStore()
            }}
            onWeekEdited={async () => {
              const weekDates = getWeekDates(parseISO(`${viewDate}T12:00:00`), settings.weekStartsOn)
              const weekStart = weekDates[0]!
              const weekEnd = weekDates[weekDates.length - 1]!
              if (isSupabaseConfigured) {
                const { fetchWorkouts } = await import('@/lib/supabase')
                if (userId) setWeekWorkouts(await fetchWorkouts(userId, weekStart, weekEnd))
              } else {
                setWeekWorkouts(localStore.getWorkouts(weekStart, weekEnd))
              }
              syncFromStore()
            }}
          />
          <TodoistTasksCard
            viewDate={viewDate}
            className="flex min-h-0 w-full flex-1 flex-col"
          />
        </aside>

        {/* Center: schedule */}
        <div
          data-schedule-height-host
          className="home-canvas order-1 mx-auto flex h-full min-h-0 w-full min-w-0 max-w-[36rem] flex-col overflow-hidden lg:order-2"
        >
          {!showShutdown && (
            <HourlyTimeline
              blocks={blocks}
              date={viewDate}
              userId={userId}
              isActiveDay={isActiveDay}
              startHour={settings.timelineStartHour}
              endHour={settings.timelineEndHour}
              onUpdate={saveBlock}
              onDelete={removeBlock}
              onCreate={saveBlock}
              onAssignExercise={assignExerciseBlock}
              onDropPlannedWorkout={dropPlannedWorkout}
              screensaver={screensaver}
              headerActions={
                <ScheduleTemplateMenu
                  iconOnly
                  applying={applyingTemplate}
                  onApply={applyTemplateToViewDate}
                />
              }
            />
          )}
        </div>

        {/* Right: Log / Shutdown + Habitify */}
        <aside className={cn(
          'home-rail home-rail--right relative z-30 order-2 flex min-h-0 w-full min-w-0 flex-col gap-2.5 overflow-y-auto overscroll-contain scrollbar-hidden lg:order-3 lg:h-full lg:max-w-[17rem] lg:justify-self-start',
          'transition-[opacity,filter,visibility] duration-[1500ms] ease-in-out',
          screensaver && 'pointer-events-none invisible !opacity-0',
        )}>
          {(log && userId) ||
          weeklyShutdownAvailable ||
          (isActiveDay &&
            ((!settings.requireMorningLog && !morningLogDone) || shutdownAvailable)) ? (
            <div className="home-action-tray flex flex-wrap gap-1.5 rounded-2xl border border-zinc-800/60 bg-zinc-950/40 p-1.5 backdrop-blur-sm">
              {log && userId && (
                <Button
                  size="sm"
                  className="relative z-30 min-w-0 flex-1 rounded-xl"
                  onClick={() => setShowHomeLog(true)}
                >
                  <ClipboardList size={14} />
                  Log
                </Button>
              )}
              {isActiveDay && !settings.requireMorningLog && !morningLogDone && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="relative z-30 min-w-0 flex-1 rounded-xl border-zinc-700/60 bg-zinc-900/80"
                  aria-label="Morning Log"
                  onClick={() => setShowMorningLog(true)}
                >
                  <Sun size={14} className="text-amber-400" />
                  Morning
                </Button>
              )}
              {isActiveDay && shutdownAvailable && (
                <Button
                  size="sm"
                  variant="secondary"
                  className={cn(
                    'relative z-30 min-w-0 flex-1 rounded-xl border-zinc-700/60 bg-zinc-900/80',
                    shutdownBreathing && 'today-btn-breathe-violet',
                  )}
                  onClick={() => requestOpenShutdown()}
                >
                  <Moon size={14} className="text-violet-400" /> Shutdown
                </Button>
              )}
              {weeklyShutdownAvailable && (
                <button
                  type="button"
                  onClick={prepareWeeklyShutdown}
                  className="today-btn-breathe-accent relative z-30 inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-500)] px-3 py-1.5 text-xs font-semibold text-black shadow-md shadow-[var(--accent-500)]/30 ring-1 ring-[var(--accent-400)]/50 transition-transform hover:bg-[var(--accent-400)] active:scale-[0.98]"
                >
                  <CalendarCheck size={14} strokeWidth={2.5} />
                  Weekly
                </button>
              )}
            </div>
          ) : null}
          <HabitifyHabitsCard
            viewDate={viewDate}
            className="w-full"
          />
          <ExperimentHomeCard date={viewDate} />
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

      {showWeeklyPulse && weeklyPulseReview && (
        <WeeklyPulseRevealModal
          review={weeklyPulseReview}
          weekLabel={weekDateRangeLabel(weeklyWeekDates)}
          onContinue={continueWeeklyPulse}
          onClose={finishWeeklyShutdown}
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

      {showHomeLog && userId && (
        <HomeLogModal
          date={viewDate}
          log={log}
          goals={goals}
          workouts={workouts}
          streakLogs={streakLogs}
          sleepMetricsConfig={sleepMetricsConfig}
          weekStartsOn={settings.weekStartsOn}
          userId={userId}
          onClose={() => setShowHomeLog(false)}
          onSaved={() => {
            syncFromStore()
            void refresh()
            void refreshStreakLogs()
          }}
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
          userId={userId}
          todayBlocks={blocks}
          tomorrowBlocks={tomorrowBlocks}
          onUpdateTomorrowBlock={saveTomorrowBlock}
          onDeleteTomorrowBlock={removeTomorrowBlock}
          onCreateTomorrowBlock={saveTomorrowBlock}
          onAssignTomorrowExercise={assignTomorrowExerciseBlock}
          onPasteTodaySchedule={pasteTodayScheduleToTomorrow}
          onApplyScheduleTemplate={applyTemplateToTomorrow}
          onClose={() => {
            setShowShutdown(false)
            notifyShutdownFlowClosed()
          }}
          onComplete={completeShutdown}
          onTomorrowScheduleChange={() => {
            void loadTomorrowBlocks().then(setTomorrowBlocks)
          }}
          onHabitsSaved={() => {
            syncFromStore()
            void refreshStreakLogs()
          }}
          required={shutdownRequired}
        />
      )}

      {activeRampPrompt && (
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
