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
    description: 'Anything still missing today',
  },
  {
    id: 'todoist',
    label: 'Todoist',
    description: 'Tick off and add Todoist tasks (skipped if Todoist is not connected)',
  },
  {
    id: 'schedule',
    label: 'Plan tomorrow',
    description: 'Schedule and workouts for tomorrow',
  },
  {
    id: 'checklist',
    label: 'Checklist',
    description: 'Optional follow-up checkboxes from your shutdown checklist',
  },
  {
    id: 'experiments',
    label: 'Experiments',
    description: 'Confirm experiment days and tick confounders (shown when needed)',
  },
]

export const DEFAULT_DAILY_SHUTDOWN_STEPS: DailyShutdownStepId[] = [
  'wrap-up',
  'todoist',
  'schedule',
  'experiments',
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
    if (!isDailyShutdownStepId(step) || seen.has(step) || step === 'habits') continue
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
