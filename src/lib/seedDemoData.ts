import { addDays, differenceInCalendarDays, format, parseISO, startOfYear } from 'date-fns'
import type { DailyLog, Goal, Workout } from '@/types'
import { DEFAULT_FOCUS_SETTINGS } from '@/types'
import { saveCustomGoalCategories } from '@/lib/goalCategories'
import { saveFocusSettings } from '@/lib/focusStore'
import { saveHabitTypes } from '@/lib/habitTypes'
import { localStore } from '@/lib/localStore'
import { saveWorkoutTypes } from '@/lib/workoutTypes'
import { formatDate, generateId } from '@/lib/utils'

const HISTORY_DAYS = 420

function seededRandom(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0
  }
  return Math.abs(hash % 10_000) / 10_000
}

function pickRange(r: number, min: number, max: number): number {
  return Math.round(min + r * (max - min))
}

function isoAt(date: string, hour = 12): string {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).toISOString()
}

export function seedDemoData(userId: string): { logs: number; workouts: number } {
  localStore.setUserId(userId)

  saveHabitTypes([
    { id: 'meditation', label: 'Meditation' },
    { id: 'skincare', label: 'Skincare' },
    { id: 'social_event', label: 'Social Event', log_period: 'weekly' },
  ])

  saveWorkoutTypes([
    { id: 'hiit', label: 'HIIT', color: '#ef4444' },
    { id: 'zone2', label: 'Zone 2', color: '#3b82f6' },
  ])

  saveCustomGoalCategories([
    { id: 'business', label: 'Business' },
    { id: 'personal', label: 'Personal' },
  ])

  saveFocusSettings({
    ...DEFAULT_FOCUS_SETTINGS,
    focusGoalEnabled: true,
    focusGoalPeriod: 'daily',
    focusGoalAmount: 2,
    focusGoalUnit: 'hours',
  })

  const today = new Date()
  const todayStr = formatDate(today)
  const yearStart = formatDate(startOfYear(today))
  const historyStart = formatDate(addDays(today, -(HISTORY_DAYS - 1)))

  const dailyLogs: DailyLog[] = []
  const workouts: Workout[] = []

  let weight = 77.5
  const weightTargetEnd = 83.2

  for (let cursor = parseISO(historyStart); cursor <= today; cursor = addDays(cursor, 1)) {
    const date = formatDate(cursor)
    const daysFromToday = differenceInCalendarDays(today, cursor)
    const dayOfWeek = cursor.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const r = seededRandom(date)
    const r2 = seededRandom(`${date}-b`)

    if (r < 0.12 && daysFromToday > 7) continue

    const monthProgress =
      differenceInCalendarDays(cursor, parseISO(yearStart)) /
      Math.max(1, differenceInCalendarDays(today, parseISO(yearStart)))
    weight = 77.5 + (weightTargetEnd - 77.5) * Math.min(1, monthProgress * 1.1) + (r - 0.5) * 0.3

    const recentBoost = Math.max(0, 1 - daysFromToday / 90)
    const focusBase = isWeekend ? 25 : 55
    const focusMinutes = Math.round(
      focusBase + recentBoost * 70 + r * (isWeekend ? 35 : 65),
    )

    const sleepHours =
      r2 < 0.08
        ? pickRange(r, 5.2, 6.2)
        : pickRange(r2, isWeekend ? 7.2 : 6.8, isWeekend ? 9.2 : 8.4)

    const steps = isWeekend
      ? pickRange(r, 3500, 9000)
      : pickRange(r, 6000, 14000)

    const meditation = r > 0.22
    const skincare = r2 > 0.1

    const readingPages = r > 0.35 ? pickRange(r2, 5, 18) : null
    const revenue =
      dayOfWeek >= 1 && dayOfWeek <= 5 && r > 0.4 ? pickRange(r, 200, 900) : null

    dailyLogs.push({
      id: generateId(),
      user_id: userId,
      date,
      sleep_hours: Math.round(sleepHours * 10) / 10,
      weight: Math.round(weight * 10) / 10,
      steps,
      screen_time_minutes: pickRange(r2, 90, 280),
      focus_minutes: focusMinutes,
      notes: '',
      habits: {
        meditation,
        skincare,
        social_event: false,
      },
      custom_metrics: {
        ...(readingPages != null ? { 'custom:reading': readingPages } : {}),
        ...(revenue != null ? { 'custom:revenue': revenue } : {}),
      },
      created_at: isoAt(date, 8),
      updated_at: isoAt(date, 21),
    })

    const inPrior30Window = daysFromToday >= 30 && daysFromToday < 60
    const inCurrent30Window = daysFromToday < 30
    const workoutDay = [1, 2, 4, 5, 6].includes(dayOfWeek)

    if (workoutDay && (inPrior30Window || inCurrent30Window || r2 > 0.55)) {
      let chance = 0.18
      if (inCurrent30Window) chance = 0.38
      else if (inPrior30Window) chance = 0.24
      else if (daysFromToday < 120) chance = 0.28

      if (r < chance) {
        workouts.push({
          id: generateId(),
          user_id: userId,
          daily_log_id: null,
          date,
          category: r2 > 0.65 ? 'zone2' : 'hiit',
          duration_minutes: inCurrent30Window
            ? pickRange(r2, 28, 42)
            : inPrior30Window
              ? pickRange(r2, 18, 28)
              : pickRange(r2, 20, 35),
          notes: '',
          created_at: isoAt(date, 18),
        })
      }
    }
  }

  const todayIdx = dailyLogs.findIndex((l) => l.date === todayStr)
  const todayLog: DailyLog = {
    id: todayIdx >= 0 ? dailyLogs[todayIdx].id : generateId(),
    user_id: userId,
    date: todayStr,
    sleep_hours: 7.6,
    weight: Math.round(weight * 10) / 10,
    steps: 9840,
    screen_time_minutes: 142,
    focus_minutes: 95,
    notes: '',
    habits: { meditation: true, skincare: true, social_event: false },
    custom_metrics: { 'custom:reading': 12, 'custom:revenue': 450 },
    created_at: isoAt(todayStr, 8),
    updated_at: isoAt(todayStr, 21),
  }
  if (todayIdx >= 0) dailyLogs[todayIdx] = todayLog
  else dailyLogs.push(todayLog)

  const goals: Goal[] = [
    {
      id: generateId(),
      user_id: userId,
      metric_key: 'sleep',
      name: 'Sleep',
      target_value: 8,
      log_period: 'daily',
      target_period: 'daily',
      goal_weight_start: null,
      goal_weight_target: null,
      unit: 'hrs',
      is_active: true,
      created_at: isoAt(historyStart),
    },
    {
      id: generateId(),
      user_id: userId,
      metric_key: 'custom:reading',
      name: 'Reading',
      target_value: 10,
      log_period: 'daily',
      target_period: 'daily',
      goal_weight_start: null,
      goal_weight_target: null,
      unit: 'pages',
      is_active: true,
      created_at: isoAt(historyStart),
    },
    {
      id: generateId(),
      user_id: userId,
      metric_key: 'custom:revenue',
      name: 'Revenue',
      target_value: 10_000,
      log_period: 'daily',
      target_period: 'custom_date',
      period_end_date: format(addDays(today, 120), 'yyyy-MM-dd'),
      period_start_date: format(addDays(today, -30), 'yyyy-MM-dd'),
      goal_weight_start: null,
      goal_weight_target: null,
      unit: '€',
      is_active: true,
      category_id: 'business',
      created_at: isoAt(historyStart),
    },
    {
      id: generateId(),
      user_id: userId,
      metric_key: 'focus',
      name: 'Focus',
      target_value: 120,
      log_period: 'daily',
      target_period: 'daily',
      goal_weight_start: null,
      goal_weight_target: null,
      unit: 'min',
      is_active: true,
      created_at: isoAt(historyStart),
    },
    {
      id: generateId(),
      user_id: userId,
      metric_key: 'weight',
      name: 'Weight',
      target_value: null,
      log_period: 'weekly',
      goal_weight_start: 77.5,
      goal_weight_target: 87.5,
      period_start_date: yearStart,
      period_end_date: formatDate(addDays(parseISO(yearStart), 180)),
      unit: 'kg',
      is_active: true,
      created_at: isoAt(historyStart),
    },
    {
      id: generateId(),
      user_id: userId,
      metric_key: 'workout_hiit',
      name: 'HIIT',
      target_value: 90,
      log_period: 'daily',
      target_period: 'weekly',
      goal_weight_start: null,
      goal_weight_target: null,
      unit: 'min',
      is_active: true,
      created_at: isoAt(historyStart),
    },
  ]

  localStore.replaceStore({
    dailyLogs,
    workouts,
    goals,
    scheduleBlocks: [],
    reminders: [],
  })

  return { logs: dailyLogs.length, workouts: workouts.length }
}
