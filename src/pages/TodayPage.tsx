import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { addDays, isToday, parseISO } from 'date-fns'
import { CalendarCheck, CalendarDays, Moon, Sun } from 'lucide-react'
import { HomePulseCard } from '@/components/pulse/HomePulseCard'
import { PulseRadiantBurst } from '@/components/pulse/PulseRadiantBurst'
import { DateNavigationHeader } from '@/components/today/DateNavigationHeader'
import { HourlyTimeline } from '@/components/today/HourlyTimeline'
import { ScheduleTemplateMenu } from '@/components/today/ScheduleTemplateMenu'
import { NotesAndReminders } from '@/components/today/NotesAndReminders'
import { TodoistTasksCard } from '@/components/today/TodoistTasksCard'
import { DailyLogForm, getDailyLogDraftForDate } from '@/components/today/DailyLogForm'
import { WorkoutLogCard } from '@/components/today/WorkoutLogCard'
import { ExercisePlanCard } from '@/components/today/ExercisePlanCard'
import { DailyChecklistModal } from '@/components/today/DailyChecklistModal'
import { MorningLogModal, type MorningLogSavePayload } from '@/components/today/MorningLogModal'
import { ShutdownModal } from '@/components/today/ShutdownModal'
import { WeeklyGoalRevealModal } from '@/components/today/WeeklyGoalRevealModal'
import { WeeklyPulseRevealModal } from '@/components/today/WeeklyPulseRevealModal'
import { WeeklyShutdownModal } from '@/components/today/WeeklyShutdownModal'
import { MonthCalendarModal } from '@/components/today/MonthCalendarModal'
import { MissedLogModal } from '@/components/today/MissedLogModal'
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
import { rolloverStaleReminders } from '@/lib/reminderRollover'
import { activeDailyChecklist } from '@/lib/dailyChecklist'
import { normalizeDailyShutdownSteps } from '@/lib/dailyShutdownSteps'
import { getDailyLogHabitTypes, getHabitTypes, saveHabitTypes } from '@/lib/habitTypes'
import { computeDayPulse, PULSE_HEADER_SCALE, pulseCorePx } from '@/lib/pulse'
import { buildPulseContributors } from '@/lib/pulseBreakdown'
import {
  consumePulseRadiantTestPending,
  hasPlayedPulseRadiantBurst,
  markPulseRadiantBurstPlayed,
  PULSE_RADIANT_TEST_REQUESTED,
} from '@/lib/pulseRadiantBurst'
import {
  playPulseRadiantSlamSound,
} from '@/lib/timerSound'
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
  attachScheduleBlockToExercisePlan,
  removePlannedWorkoutByScheduleBlockId,
  syncPlannedWorkoutFromScheduleBlock,
} from '@/lib/exercisePlan'
import { isWorkoutScheduleColor } from '@/lib/scheduleColors'
import { requestScheduleScrollToNow } from '@/lib/scheduleScroll'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { DailyLog, Goal, Reminder, ScheduleBlock, Workout } from '@/types'
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
import { cleanupStaleGoals } from '@/lib/goalCleanup'
import { buildWeeklyPulseReview, type WeeklyPulseReview } from '@/lib/weeklyPulseReview'
import { getPreviousWeekDates } from '@/lib/weightGoal'

export function TodayPage() {
  const { settings } = useSettings()
  const location = useLocation()
  const navigate = useNavigate()
  const [viewDate, setViewDate] = useState(formatDate(new Date()))
  const { log, workouts, loading, updateLog, refresh, syncFromStore, addWorkout, removeWorkout } = useDailyLog(viewDate)
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
  const [morningLogDone, setMorningLogDone] = useState(() => isMorningLogSubmitted(viewDate))
  const [showShutdownChecklist, setShowShutdownChecklist] = useState(false)
  const [yesterdayLog, setYesterdayLog] = useState<DailyLog | null>(null)
  const [yesterdayWorkouts, setYesterdayWorkouts] = useState<Workout[]>([])
  const [missedDays, setMissedDays] = useState<MissedLogDay[]>([])
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
  const [weekWorkouts, setWeekWorkouts] = useState<Workout[]>([])
  const [rampFailurePrompts, setRampFailurePrompts] = useState<HabitRampFailurePrompt[]>([])
  const [rampPromptIndex, setRampPromptIndex] = useState(0)
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  /** Dev slam test only — never shown as a homepage preview panel. */
  const [testPulseScore, setTestPulseScore] = useState<number | null>(null)
  const [radiantTestActive, setRadiantTestActive] = useState(false)
  const { config: pulseConfig } = usePulseConfig()
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()
  const draftRevision = useDailyLogDraftRevision(viewDate)

  const isActiveDay = isToday(parseISO(viewDate))

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

  const pulseContributors = useMemo(() => {
    const formula = getPulseFormulaForDate(pulseConfig, viewDate)
    const effectiveLog = log ? mergeLogWithDraftForDate(log, viewDate, workouts) : undefined
    return buildPulseContributors({
      date: viewDate,
      log: effectiveLog,
      goals,
      workouts,
      formula,
      sleepMetricsConfig,
    })
  }, [viewDate, log, goals, workouts, pulseConfig, sleepMetricsConfig, draftRevision])

  const headerPulseScore = testPulseScore ?? dayPulse.score
  const headerPulseLayoutPx = pulseCorePx(PULSE_HEADER_SCALE) + 40
  const pulseAnchorRef = useRef<HTMLDivElement>(null)
  const [radiantSlamKey, setRadiantSlamKey] = useState(0)
  const [pulseCelebrating, setPulseCelebrating] = useState(false)
  const [pulseBreakdownOpen, setPulseBreakdownOpen] = useState(false)
  const [radiantBurst, setRadiantBurst] = useState<{
    key: number
    x: number
    y: number
  } | null>(null)
  const radiantBurstArmedRef = useRef(false)
  const radiantBurstKeyRef = useRef(0)

  const celebrateRadiant =
    settings.showHomePulse &&
    isActiveDay &&
    (radiantTestActive || !hasPlayedPulseRadiantBurst(viewDate))

  const playRadiantBurst = useCallback(() => {
    const el = pulseAnchorRef.current
    if (!el) {
      radiantBurstArmedRef.current = false
      return
    }
    const rect = el.getBoundingClientRect()
    radiantBurstArmedRef.current = true
    radiantBurstKeyRef.current += 1
    setRadiantBurst({
      key: radiantBurstKeyRef.current,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
  }, [])

  const requestRadiantCelebration = useCallback(() => {
    radiantBurstArmedRef.current = false
    setRadiantSlamKey((key) => key + 1)
  }, [])

  const clearRadiantTest = useCallback(() => {
    setTestPulseScore(null)
    setRadiantTestActive(false)
  }, [])

  const runPulseRadiantTest = useCallback(() => {
    if (!settings.devMode || !settings.showHomePulse || !isActiveDay) return
    radiantBurstArmedRef.current = false
    setRadiantTestActive(true)
    const alreadyHundred = (testPulseScore ?? dayPulse.score) >= 100
    setTestPulseScore(100)
    if (alreadyHundred) requestRadiantCelebration()
  }, [
    dayPulse.score,
    isActiveDay,
    requestRadiantCelebration,
    settings.devMode,
    settings.showHomePulse,
    testPulseScore,
  ])

  useEffect(() => {
    if (!settings.devMode) {
      clearRadiantTest()
      return
    }

    const onTest = () => runPulseRadiantTest()
    window.addEventListener(PULSE_RADIANT_TEST_REQUESTED, onTest)

    if (consumePulseRadiantTestPending()) {
      const frame = window.requestAnimationFrame(() => runPulseRadiantTest())
      return () => {
        window.cancelAnimationFrame(frame)
        window.removeEventListener(PULSE_RADIANT_TEST_REQUESTED, onTest)
      }
    }

    return () => window.removeEventListener(PULSE_RADIANT_TEST_REQUESTED, onTest)
  }, [clearRadiantTest, runPulseRadiantTest, settings.devMode])

  const handleRadiantImpact = useCallback(() => {
    // Play before any early returns — same call site pattern as habit SFX.
    playPulseRadiantSlamSound()

    if (!settings.showHomePulse || !isActiveDay) return
    if (radiantBurst || radiantBurstArmedRef.current) return

    if (radiantTestActive) {
      playRadiantBurst()
      return
    }
    if (hasPlayedPulseRadiantBurst(viewDate)) return

    playRadiantBurst()
    markPulseRadiantBurstPlayed(viewDate)
  }, [
    isActiveDay,
    playRadiantBurst,
    radiantBurst,
    radiantTestActive,
    settings.showHomePulse,
    viewDate,
  ])
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
      const { fetchScheduleBlocks, fetchReminders, fetchGoals, fetchDailyLogs, upsertGoal } = await import('@/lib/supabase')
      setBlocks((await fetchScheduleBlocks(userId, viewDate)).map(normalizeScheduleBlock))
      setReminders((await fetchReminders(userId)).map((r) => ({ ...r, kind: r.kind ?? 'task' })))
      const { goals: cleaned, toRetire } = cleanupStaleGoals(await fetchGoals(userId))
      setGoals(cleaned)
      for (const duplicate of toRetire) {
        await upsertGoal(duplicate)
      }
      setStreakLogs(await fetchDailyLogs(userId, streakStart, viewDate))
    } else {
      setBlocks(localStore.getScheduleBlocks(viewDate).map(normalizeScheduleBlock))
      setReminders(localStore.getReminders().map((r) => ({ ...r, kind: r.kind ?? 'task' })))
      const { goals: cleaned, toRetire } = cleanupStaleGoals(localStore.getGoals())
      setGoals(cleaned)
      for (const duplicate of toRetire) {
        localStore.upsertGoal(duplicate)
      }
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
      removePlannedWorkoutByScheduleBlockId(normalized.id)
    } else if (isWorkoutScheduleColor(normalized.activity_type)) {
      syncPlannedWorkoutFromScheduleBlock(normalized)
    }
  }

  const assignExerciseBlock = async (block: ScheduleBlock, category: string) => {
    const saved = await attachScheduleBlockToExercisePlan({ block, category })
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
    removePlannedWorkoutByScheduleBlockId(id)
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
    const saved = await replaceScheduleBlocksForDate(existing, next)
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
      <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden sm:gap-3">
      {radiantBurst && (
        <PulseRadiantBurst
          key={radiantBurst.key}
          origin={{ x: radiantBurst.x, y: radiantBurst.y }}
          onComplete={() => {
            setRadiantBurst(null)
            clearRadiantTest()
          }}
        />
      )}
      <div
        className={cn(
          'relative shrink-0 overflow-visible px-1 py-1 sm:px-2 sm:py-1.5',
          pulseCelebrating || pulseBreakdownOpen ? 'z-40' : 'z-20',
        )}
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
              'pointer-events-none absolute inset-0 flex -translate-x-2 items-center justify-center overflow-visible',
              pulseCelebrating || pulseBreakdownOpen ? 'z-40' : 'z-20',
            )}
          >
            {settings.showHomePulse && (
              <div ref={pulseAnchorRef} className="pointer-events-auto">
                <HomePulseCard
                  score={headerPulseScore}
                  contributors={pulseContributors}
                  celebrateRadiant={celebrateRadiant}
                  onRadiantImpact={handleRadiantImpact}
                  radiantSlamKey={radiantSlamKey}
                  onCelebratingChange={setPulseCelebrating}
                  onBreakdownOpenChange={setPulseBreakdownOpen}
                  meterClassName={cn(
                    !pulseCelebrating &&
                      '[mask-image:linear-gradient(to_bottom,transparent_0%,black_18%,black_82%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,black_18%,black_82%,transparent_100%)]',
                  )}
                />
              </div>
            )}
          </div>
          <div className="relative z-10 flex shrink-0 items-center gap-1.5 self-center">
            <button
              onClick={() => setShowCalendar(true)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Month overview"
            >
              <CalendarDays size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="relative z-30 grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,min-content)] gap-4 overflow-hidden lg:grid-cols-2 lg:grid-rows-none lg:gap-5">
        <div data-schedule-height-host className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
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
        <aside className="relative z-30 flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto overscroll-contain scrollbar-hidden lg:h-full">
          {weeklyShutdownAvailable && (
            <button
              type="button"
              onClick={prepareWeeklyShutdown}
              className="today-btn-breathe-accent relative z-30 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-500)] px-4 py-3.5 text-sm font-bold text-black shadow-lg shadow-[var(--accent-500)]/35 ring-2 ring-[var(--accent-400)]/60 transition-transform hover:bg-[var(--accent-400)] active:scale-[0.98]"
            >
              <CalendarCheck size={18} strokeWidth={2.5} />
              Weekly Shutdown
            </button>
          )}
          {isActiveDay &&
            ((!settings.requireMorningLog && !morningLogDone) || shutdownAvailable) && (
            <div className="relative z-10 flex gap-2">
              {!settings.requireMorningLog && !morningLogDone && (
                <Button
                  variant="secondary"
                  className="flex-1"
                  aria-label="Morning Log"
                  onClick={() => setShowMorningLog(true)}
                >
                  <Sun size={14} className="text-amber-400" />
                  <span>Morning Log</span>
                </Button>
              )}
              {shutdownAvailable && (
                <Button
                  variant="secondary"
                  className={cn(
                    'flex-1 transition-[flex-grow] duration-300 ease-out',
                    shutdownBreathing && 'today-btn-breathe-violet',
                  )}
                  onClick={() => requestOpenShutdown()}
                >
                  <Moon size={14} className="text-violet-400" /> Shutdown
                </Button>
              )}
            </div>
          )}
          <ExercisePlanCard
            viewDate={viewDate}
            userId={userId}
            onScheduleChange={() => {
              void refreshScheduleBlocks()
            }}
            onRemoveLoggedWorkout={async (workoutId) => {
              await removeWorkout(workoutId)
            }}
            onVolumeLogged={() => {
              syncFromStore()
              void refreshWeekWorkouts()
            }}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
            <div className="flex min-w-0 flex-col gap-3">
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
            </div>
            <div className="min-w-0">
              <NotesAndReminders
                items={reminders}
                viewDate={viewDate}
                userId={userId}
                onAdd={addReminder}
                onUpdate={updateReminder}
                onRemove={removeReminder}
              />
            </div>
            <div className="min-w-0">
              <TodoistTasksCard viewDate={viewDate} />
            </div>
          </div>
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
          onApplyScheduleTemplate={applyTemplateToTomorrow}
          onClose={() => {
            setShowShutdown(false)
            notifyShutdownFlowClosed()
          }}
          onComplete={completeShutdown}
          onCompleteReminder={removeReminder}
          onAddReminder={addReminder}
          onUpdateReminder={updateReminder}
          onRemoveReminder={removeReminder}
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
