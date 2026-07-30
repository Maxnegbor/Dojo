import type { DailyShutdownStepId } from '@/types'

export interface DailyShutdownStepPreset {
  id: DailyShutdownStepId
  label: string
  description: string
}

export const DAILY_SHUTDOWN_STEP_PRESETS: DailyShutdownStepPreset[] = [
  {
    id: 'wrap-up',
    label: 'Wrap up',
    description: 'Daily log and handle today’s reminders',
  },
  {
    id: 'habits',
    label: 'Habits',
    description: 'Finish incomplete habits (skipped automatically if none are pending)',
  },
  {
    id: 'schedule',
    label: 'Plan tomorrow',
    description: 'Schedule, workouts, and reminders for tomorrow',
  },
  {
    id: 'checklist',
    label: 'Checklist',
    description: 'Optional follow-up checkboxes from your shutdown checklist',
  },
]

export const DEFAULT_DAILY_SHUTDOWN_STEPS: DailyShutdownStepId[] = [
  'wrap-up',
  'habits',
  'schedule',
]

const PRESET_IDS = new Set<DailyShutdownStepId>(DAILY_SHUTDOWN_STEP_PRESETS.map((p) => p.id))

export function isDailyShutdownStepId(value: unknown): value is DailyShutdownStepId {
  return typeof value === 'string' && PRESET_IDS.has(value as DailyShutdownStepId)
}

export function normalizeDailyShutdownSteps(
  steps: DailyShutdownStepId[] | undefined,
): DailyShutdownStepId[] {
  if (!steps?.length) return [...DEFAULT_DAILY_SHUTDOWN_STEPS]
  const seen = new Set<DailyShutdownStepId>()
  const next: DailyShutdownStepId[] = []
  for (const step of steps) {
    if (!isDailyShutdownStepId(step) || seen.has(step)) continue
    seen.add(step)
    next.push(step)
  }
  return next.length > 0 ? next : [...DEFAULT_DAILY_SHUTDOWN_STEPS]
}

export function getDailyShutdownStepPreset(
  id: DailyShutdownStepId,
): DailyShutdownStepPreset | undefined {
  return DAILY_SHUTDOWN_STEP_PRESETS.find((p) => p.id === id)
}

export function availableDailyShutdownStepPresets(
  enabled: DailyShutdownStepId[],
): DailyShutdownStepPreset[] {
  const enabledSet = new Set(enabled)
  return DAILY_SHUTDOWN_STEP_PRESETS.filter((p) => !enabledSet.has(p.id))
}
