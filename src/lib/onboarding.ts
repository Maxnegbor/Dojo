import { normalizeGoal } from '@/lib/goals'
import { buildGoalPeriodFields } from '@/lib/goalPeriod'
import { saveFocusGoal } from '@/lib/focusGoalSync'
import { getFocusSettings } from '@/lib/focusStore'
import { getHabitTypes, slugifyHabitId, saveHabitTypes, type HabitTypeDefinition } from '@/lib/habitTypes'
import { enableMetricsSection, getEnabledMetricsSections, saveEnabledMetricsSections } from '@/lib/metricsSections'
import { localStore } from '@/lib/localStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  getWorkoutTypes,
  saveWorkoutTypes,
  slugifyWorkoutId,
  workoutMetricKey,
  WORKOUT_COLOR_PRESETS,
  type WorkoutTypeDefinition,
} from '@/lib/workoutTypes'
import { getSleepMetricsConfig, saveSleepMetricsConfig, type SleepMetricsConfig } from '@/lib/sleepMetrics'
import type { AccentColor, AppSettings, Goal, GoalPeriod, GoalTargetPeriod } from '@/types'
import { formatDate, generateId } from '@/lib/utils'
import type { WeightGoalMode } from '@/lib/weightGoal'
import { addDays } from 'date-fns'

export type OnboardingTrack =
  | 'sleep'
  | 'workouts'
  | 'focus'
  | 'habits'
  | 'measurements'
  | 'weight'

export const ONBOARDING_TRACK_OPTIONS: {
  id: OnboardingTrack
  label: string
  description: string
}[] = [
  { id: 'habits', label: 'Habits', description: 'Build healthy habits and break bad ones' },
  { id: 'focus', label: 'Focus', description: 'Track your focus' },
  { id: 'sleep', label: 'Sleep', description: 'Track sleep duration, timing, and how you feel' },
  { id: 'workouts', label: 'Workouts', description: 'Log sessions and optional weekly targets' },
  { id: 'weight', label: 'Weight Management', description: 'Bulk, cut, or maintain with a weekly weigh-in goal' },
  {
    id: 'measurements',
    label: 'Simple measurements',
    description: 'Log values over time without setting a target',
  },
]

export interface OnboardingPreferences {
  weekStartsOn: 0 | 1
  accentColor: AccentColor
}

export interface OnboardingWorkoutDraft {
  label: string
  color: string
  targetMinutes: number | null
  logPeriod: GoalPeriod
  targetPeriod: GoalTargetPeriod
  periodDays: number | null
  periodStartDate: string | null
  periodEndDate: string | null
}

export interface OnboardingMeasurementDraft {
  name: string
  unit: string
}

export interface OnboardingData {
  tracks: OnboardingTrack[]
  preferences: OnboardingPreferences
  sleepMetrics: SleepMetricsConfig
  focusTargetAmount: number
  focusTargetUnit: 'hours' | 'minutes'
  focusTargetPeriod: GoalPeriod
  habits: string[]
  workoutTypes: OnboardingWorkoutDraft[]
  measurements: OnboardingMeasurementDraft[]
  weightMode: WeightGoalMode
  weightStartKg: number | null
  weightTargetKg: number | null
  weightUseDates: boolean
  weightStartDate: string
  weightEndDate: string
}

export function createBlankWorkoutDraft(index: number): OnboardingWorkoutDraft {
  return {
    label: '',
    color: WORKOUT_COLOR_PRESETS[index % WORKOUT_COLOR_PRESETS.length],
    targetMinutes: null,
    logPeriod: 'daily',
    targetPeriod: 'weekly',
    periodDays: null,
    periodStartDate: null,
    periodEndDate: null,
  }
}

export const ONBOARDING_PREVIEW_KEY = 'dojo-onboarding-preview'

export function defaultOnboardingData(): OnboardingData {
  const today = formatDate(new Date())
  return {
    tracks: [],
    preferences: {
      weekStartsOn: 1,
      accentColor: 'amber',
    },
    sleepMetrics: {
      enabledIds: [],
      customMetrics: [],
      targets: {},
    },
    focusTargetAmount: 2,
    focusTargetUnit: 'hours',
    focusTargetPeriod: 'daily',
    habits: [''],
    workoutTypes: [createBlankWorkoutDraft(0)],
    measurements: [{ name: '', unit: '' }],
    weightMode: 'bulk',
    weightStartKg: null,
    weightTargetKg: null,
    weightUseDates: false,
    weightStartDate: today,
    weightEndDate: formatDate(addDays(new Date(), 84)),
  }
}

export function isOnboardingPreview(): boolean {
  try {
    return sessionStorage.getItem(ONBOARDING_PREVIEW_KEY) === '1'
  } catch {
    return false
  }
}

export function startOnboardingPreview(): void {
  sessionStorage.setItem(ONBOARDING_PREVIEW_KEY, '1')
}

export function stopOnboardingPreview(): void {
  sessionStorage.removeItem(ONBOARDING_PREVIEW_KEY)
}

/** True when the account already has metrics/config — skip first-run onboarding. */
export function hasExistingUserSetup(settings?: AppSettings): boolean {
  try {
    if (getHabitTypes().length > 0) return true
    if (getWorkoutTypes().length > 0) return true
    if (getEnabledMetricsSections().length > 0) return true
    if (localStore.getGoals().length > 0) return true

    const sleep = getSleepMetricsConfig()
    if (sleep.customMetrics.length > 0 || sleep.enabledIds.length > 0) return true

    if (settings) {
      if (settings.morningLogChecklist.length > 0) return true
      if (settings.dailyShutdownChecklist.length > 0) return true
      if (settings.weeklyShutdownChecklist.length > 0) return true
      if (settings.requireMorningLog || settings.requireShutdown) return true
      if (settings.showWorkoutMetrics) return true
      if (settings.memberSinceDate) return true
    }
  } catch {
    /* ignore */
  }
  return false
}

export function needsOnboarding(settings: AppSettings): boolean {
  if (isOnboardingPreview()) return false
  if (settings.onboardingCompleted === true) return false
  // Existing accounts with data must never be trapped in onboarding,
  // even if onboardingCompleted was left false after sign-up.
  if (hasExistingUserSetup(settings)) return false
  if (settings.onboardingCompleted === false) return true

  return true
}

/** Remote signals that local storage may not know about yet (Supabase goals/logs). */
export async function hasRemoteUserSetup(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false
  try {
    const { fetchGoals, fetchDailyLogs } = await import('@/lib/supabase')
    const goals = await fetchGoals(userId)
    if (goals.length > 0) return true
    const today = formatDate(new Date())
    const logs = await fetchDailyLogs(userId, '2000-01-01', today)
    return logs.length > 0
  } catch {
    return false
  }
}


async function upsertGoalForUser(userId: string, goal: Goal): Promise<void> {
  if (isSupabaseConfigured) {
    const { upsertGoal } = await import('@/lib/supabase')
    await upsertGoal(goal)
    return
  }
  localStore.setUserId(userId)
  localStore.upsertGoal(goal)
}

export async function applyOnboardingConfig(
  userId: string,
  data: OnboardingData,
): Promise<Partial<AppSettings>> {
  const sections = new Set<string>()
  const now = new Date().toISOString()

  if (data.tracks.includes('habits') && data.habits.length > 0) {
    const habits: HabitTypeDefinition[] = data.habits
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label) => ({ id: slugifyHabitId(label), label }))
    saveHabitTypes(habits)
    sections.add('habits')
  }

  if (data.tracks.includes('workouts') && data.workoutTypes.length > 0) {
    const types: WorkoutTypeDefinition[] = data.workoutTypes
      .map((draft) => ({
        id: slugifyWorkoutId(draft.label),
        label: draft.label.trim(),
        color: draft.color,
        unit: 'min',
        log_period: draft.logPeriod === 'weekly' ? ('weekly' as const) : ('daily' as const),
      }))
      .filter((t) => t.label)
    saveWorkoutTypes(types)
    sections.add('workouts')

    for (const draft of data.workoutTypes) {
      if (!draft.label.trim() || draft.targetMinutes == null || draft.targetMinutes <= 0) continue
      const id = slugifyWorkoutId(draft.label)
      const periodFields = buildGoalPeriodFields({
        targetPeriod: draft.targetPeriod,
        logPeriod: draft.logPeriod,
        periodDays: draft.periodDays ?? undefined,
        periodStartDate: draft.periodStartDate ?? undefined,
        periodEndDate: draft.periodEndDate ?? undefined,
      })
      await upsertGoalForUser(
        userId,
        normalizeGoal({
          id: generateId(),
          user_id: userId,
          metric_key: workoutMetricKey(id),
          name: draft.label.trim(),
          target_value: draft.targetMinutes,
          ...periodFields,
          goal_weight_start: null,
          goal_weight_target: null,
          unit: 'min',
          is_active: true,
          created_at: now,
        }),
      )
    }
  }

  if (data.tracks.includes('sleep')) {
    saveSleepMetricsConfig(data.sleepMetrics)
    sections.add('sleep')
  }

  if (data.tracks.includes('focus')) {
    await saveFocusGoal(userId, getFocusSettings(), {
      period: data.focusTargetPeriod,
      amount: data.focusTargetAmount,
      unit: data.focusTargetUnit,
    })
    sections.add('default')
  }

  if (data.tracks.includes('measurements') && data.measurements.length > 0) {
    sections.add('default')
    for (const draft of data.measurements) {
      if (!draft.name.trim()) continue
      const normalizedName = draft.name.trim()
      const slug = normalizedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
      const isWeight = slug === 'weight'
      await upsertGoalForUser(
        userId,
        normalizeGoal({
          id: generateId(),
          user_id: userId,
          metric_key: isWeight ? 'weight' : (`custom:${slug || 'measurement'}` as const),
          name: normalizedName,
          target_value: null,
          log_period: isWeight ? 'weekly' : 'daily',
          goal_weight_start: null,
          goal_weight_target: null,
          unit: draft.unit.trim() || (isWeight ? 'kg' : 'count'),
          is_active: true,
          created_at: now,
        }),
      )
    }
  }

  if (data.tracks.includes('weight')) {
    const maintainWeight =
      data.weightMode === 'maintain' ? data.weightTargetKg ?? data.weightStartKg : null
    const bulkCutReady = data.weightStartKg != null && data.weightTargetKg != null

    if ((data.weightMode === 'maintain' && maintainWeight != null) || bulkCutReady) {
      sections.add('weight')
      const startKg =
        data.weightMode === 'maintain' ? maintainWeight! : data.weightStartKg!
      const targetKg =
        data.weightMode === 'maintain' ? maintainWeight! : data.weightTargetKg!

      await upsertGoalForUser(
        userId,
        normalizeGoal({
          id: generateId(),
          user_id: userId,
          metric_key: 'weight',
          name: 'Weight',
          target_value: null,
          log_period: 'weekly',
          goal_weight_start: startKg,
          goal_weight_target: targetKg,
          ...(data.weightUseDates
            ? {
                period_start_date: data.weightStartDate,
                period_end_date: data.weightEndDate,
              }
            : {}),
          unit: 'kg',
          is_active: true,
          created_at: now,
        }),
      )
    }
  }

  if (sections.size > 0) {
    saveEnabledMetricsSections([...sections])
  } else {
    for (const track of data.tracks) {
      if (track === 'habits') enableMetricsSection('habits')
      if (track === 'workouts') enableMetricsSection('workouts')
      if (track === 'weight') enableMetricsSection('weight')
      if (track === 'sleep') enableMetricsSection('sleep')
      if (track === 'focus') enableMetricsSection('focus')
    }
  }

  // Push workout / hybrid targets onto the Goals page (OutcomeGoals).
  const { runOutcomeGoalsMigration } = await import('@/lib/outcomeGoals')
  await runOutcomeGoalsMigration(userId)

  const tomorrow = formatDate(addDays(new Date(), 1))

  return {
    weekStartsOn: data.preferences.weekStartsOn,
    accentColor: data.preferences.accentColor,
    showWorkoutMetrics: data.tracks.includes('workouts'),
    onboardingCompleted: true,
    requireMorningLog: false,

    requireShutdown: false,
    memberSinceDate: tomorrow,
    morningLogStartDate: tomorrow,
  }
}
