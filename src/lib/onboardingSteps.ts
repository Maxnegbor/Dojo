import type { OnboardingData, OnboardingTrack } from '@/lib/onboarding'

export type OnboardingStepId =
  | 'tracks'
  | 'preferences'
  | 'sleep'
  | 'focus'
  | 'habits'
  | 'workouts'
  | 'measurements'
  | 'weight'
  | 'tour'

/** Top-bar progress: tracks → preferences → goals (substeps) → tour */
export const MAIN_ONBOARDING_STEP_COUNT = 4

export function isGoalSubstep(step: OnboardingStepId): boolean {
  return step !== 'tracks' && step !== 'preferences' && step !== 'tour'
}

export function getMainProgressStep(step: OnboardingStepId): number {
  if (step === 'tracks') return 0
  if (step === 'preferences') return 1
  if (step === 'tour') return 3
  return 2
}

export function buildGoalSubsteps(data: OnboardingData): OnboardingStepId[] {
  const steps: OnboardingStepId[] = []

  if (data.tracks.includes('sleep')) steps.push('sleep')
  if (data.tracks.includes('focus')) steps.push('focus')
  if (data.tracks.includes('habits')) steps.push('habits')
  if (data.tracks.includes('workouts')) steps.push('workouts')
  if (data.tracks.includes('measurements')) steps.push('measurements')
  if (data.tracks.includes('weight')) steps.push('weight')

  return steps
}

export function buildOnboardingSteps(data: OnboardingData): OnboardingStepId[] {
  return ['tracks', 'preferences', ...buildGoalSubsteps(data), 'tour']
}

/** Track removed when the user skips a goal-setting substep. */
export function getSkippedTrackForStep(step: OnboardingStepId): OnboardingTrack | null {
  switch (step) {
    case 'sleep':
      return 'sleep'
    case 'focus':
      return 'focus'
    case 'habits':
      return 'habits'
    case 'workouts':
      return 'workouts'
    case 'measurements':
      return 'measurements'
    case 'weight':
      return 'weight'
    default:
      return null
  }
}

export function skipGoalCategory(data: OnboardingData, step: OnboardingStepId): OnboardingData {
  const track = getSkippedTrackForStep(step)
  if (!track) return data
  return {
    ...data,
    tracks: data.tracks.filter((t) => t !== track),
  }
}

export function getOnboardingStepMeta(
  step: OnboardingStepId,
  _data: OnboardingData,
): { title: string; subtitle?: string } {
  switch (step) {
    case 'tracks':
      return {
        title: 'Welcome to Dojo',
        subtitle: 'What would you like Dojo to mean to you?',
      }
    case 'preferences':
      return {
        title: 'A few preferences',
        subtitle: 'Small choices that shape how the app feels day to day.',
      }
    case 'sleep':
      return {
        title: 'Sleep',
        subtitle: 'Choose optional sleep metrics to track each morning.',
      }
    case 'focus':
      return {
        title: 'Focus goal',
        subtitle: 'Set a daily or weekly focus target.',
      }
    case 'habits':
      return {
        title: 'Habits',
        subtitle: 'What habits do you want to build or track?',
      }
    case 'workouts':
      return {
        title: 'Workout types',
        subtitle: 'Add the workouts you log and optional targets.',
      }
    case 'measurements':
      return {
        title: 'Simple measurements',
        subtitle: 'Track values over time — no target required.',
      }
    case 'weight':
      return {
        title: 'Weight goal',
        subtitle: 'Set your starting point, target, and optional date range.',
      }
    case 'tour':
      return {
        title: 'Quick tour',
        subtitle: 'Taking you into Dojo…',
      }
  }
}

function isWorkoutDraftValid(
  workout: OnboardingData['workoutTypes'][number],
): boolean {
  if (!workout.label.trim()) return false
  if (workout.targetPeriod === 'custom_duration') {
    if (workout.targetMinutes != null && workout.targetMinutes > 0) {
      return workout.periodDays != null && workout.periodDays > 0
    }
  }
  if (workout.targetPeriod === 'custom_date') {
    if (workout.targetMinutes != null && workout.targetMinutes > 0) {
      return (
        Boolean(workout.periodStartDate) &&
        Boolean(workout.periodEndDate) &&
        workout.periodEndDate! >= workout.periodStartDate!
      )
    }
  }
  return true
}

export function canContinueOnboardingStep(step: OnboardingStepId, data: OnboardingData): boolean {
  switch (step) {
    case 'tracks':
      return data.tracks.length > 0
    case 'sleep':
      return true
    case 'focus':
      return data.focusTargetAmount > 0
    case 'habits':
      return data.habits.some((h) => h.trim().length > 0)
    case 'workouts':
      return data.workoutTypes.some((w) => w.label.trim().length > 0 && isWorkoutDraftValid(w))
    case 'measurements':
      return data.measurements.some((m) => m.name.trim().length > 0)
    case 'weight': {
      const hasTarget = data.weightTargetKg != null && data.weightTargetKg > 0
      const hasStart =
        data.weightMode === 'maintain' ||
        (data.weightStartKg != null && data.weightStartKg > 0)
      const datesOk =
        !data.weightUseDates ||
        (Boolean(data.weightStartDate) &&
          Boolean(data.weightEndDate) &&
          data.weightEndDate >= data.weightStartDate)
      return hasTarget && hasStart && datesOk
    }
    default:
      return true
  }
}
