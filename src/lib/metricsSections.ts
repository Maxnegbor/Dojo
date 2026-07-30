import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import {
  DEFAULT_GOAL_CATEGORY_ID,
  DEFAULT_GOAL_CATEGORY_LABEL,
  getCustomGoalCategories,
  type GoalCategoryDefinition,
} from '@/lib/goalCategories'
import { localStore } from '@/lib/localStore'
import { getSleepMetricsConfig } from '@/lib/sleepMetrics'
import { isWeightGoal } from '@/lib/weightGoal'

const STORAGE_KEY = 'personal-os-metrics-sections'

export const METRICS_SECTIONS_CHANGED = 'personal-os-metrics-sections-changed'

/** Built-in metrics nav sections the user can add from the template picker. */
export type BuiltinMetricsSection = 'habits' | 'sleep' | 'focus' | 'default' | 'weight' | 'workouts'

export const BUILTIN_METRICS_SECTIONS: BuiltinMetricsSection[] = [
  'habits',
  'sleep',
  'focus',
  'weight',
  'workouts',
  'default',
]

export const METRICS_SECTION_LABELS: Record<BuiltinMetricsSection, string> = {
  habits: 'Habits',
  sleep: 'Sleep',
  focus: 'Focus',
  weight: 'Weight Goal',
  workouts: 'Workouts',
  default: DEFAULT_GOAL_CATEGORY_LABEL,
}

export const METRICS_SECTION_DESCRIPTIONS: Record<BuiltinMetricsSection, string> = {
  habits: 'Daily or weekly habits with optional ramping targets',
  sleep: 'Nightly hours goal and optional sleep metrics',
  focus: 'Deep work target tracked from your focus timer',
  default: 'Custom metrics like reading or protein',
  weight: 'Bulk, cut, or maintain — log daily or at weekly shutdown',
  workouts: 'Workout types with optional weekly minute targets',
}

function hasSleepMetricsActivity(): boolean {
  const config = getSleepMetricsConfig()
  return config.customMetrics.length > 0 || config.enabledIds.length > 0
}

function migrateSleepFocusSections(sections: string[]): string[] {
  const next = new Set(sections)
  let changed = false

  try {
    const goals = localStore.getGoals()
    if (goals.some((g) => g.is_active && g.metric_key === 'sleep') && !next.has('sleep')) {
      next.add('sleep')
      changed = true
    }
    if (goals.some((g) => g.is_active && g.metric_key === 'focus') && !next.has('focus')) {
      next.add('focus')
      changed = true
    }
  } catch {
    /* ignore */
  }

  if (hasSleepMetricsActivity() && !next.has('sleep')) {
    next.add('sleep')
    changed = true
  }

  if (!changed) return sections
  return [...next]
}

function inferLegacyEnabledSections(): string[] {
  const sections: string[] = []

  if (storageGetItem('personal-os-habit-types')) {
    sections.push('habits')
  }

  if (storageGetItem('personal-os-workout-types')) {
    sections.push('workouts')
  } else {
    try {
      const settingsRaw = storageGetItem('personal-os-app-settings')
      if (settingsRaw) {
        const parsed = JSON.parse(settingsRaw) as { showWorkoutMetrics?: boolean }
        if (parsed.showWorkoutMetrics === true) sections.push('workouts')
      }
    } catch {
      /* ignore */
    }
  }

  const categoryRaw = storageGetItem('personal-os-goal-categories')
  if (categoryRaw) {
    sections.push('default')
    try {
      const parsed = JSON.parse(categoryRaw) as { id: string }[]
      if (Array.isArray(parsed)) {
        for (const category of parsed) {
          if (category?.id) sections.push(category.id)
        }
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const goals = localStore.getGoals()
    if (goals.some(isWeightGoal) && !sections.includes('weight')) {
      sections.push('weight')
    }
    if (goals.some((g) => g.is_active && g.metric_key === 'sleep') && !sections.includes('sleep')) {
      sections.push('sleep')
    }
    if (goals.some((g) => g.is_active && g.metric_key === 'focus') && !sections.includes('focus')) {
      sections.push('focus')
    }
    if (hasSleepMetricsActivity() && !sections.includes('sleep')) {
      sections.push('sleep')
    }
    if (
      goals.some(
        (goal) =>
          !goal.metric_key.startsWith('workout_') &&
          !isWeightGoal(goal) &&
          goal.metric_key !== 'sleep' &&
          goal.metric_key !== 'focus',
      ) &&
      !sections.includes('default')
    ) {
      sections.push('default')
    }
  } catch {
    /* ignore */
  }

  return sections
}

export function getEnabledMetricsSections(): string[] {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return migrateSleepFocusSections(parsed.filter((id): id is string => typeof id === 'string'))
      }
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { sections?: string[] }).sections)) {
        return migrateSleepFocusSections((parsed as { sections: string[] }).sections)
      }
    }
  } catch {
    /* ignore */
  }

  return migrateSleepFocusSections(inferLegacyEnabledSections())
}

export function saveEnabledMetricsSections(sections: string[]): void {
  storageSetItem(STORAGE_KEY, JSON.stringify(sections))
  window.dispatchEvent(new Event(METRICS_SECTIONS_CHANGED))
}

export function enableMetricsSection(sectionId: string): void {
  const current = getEnabledMetricsSections()
  if (current.includes(sectionId)) return
  saveEnabledMetricsSections([...current, sectionId])
}

export function disableMetricsSection(sectionId: string): void {
  saveEnabledMetricsSections(getEnabledMetricsSections().filter((id) => id !== sectionId))
}

export function isBuiltinMetricsSection(id: string): id is BuiltinMetricsSection {
  return BUILTIN_METRICS_SECTIONS.includes(id as BuiltinMetricsSection)
}

export function getVisibleGoalCategories(): GoalCategoryDefinition[] {
  const enabled = getEnabledMetricsSections()
  const categories: GoalCategoryDefinition[] = []
  if (enabled.includes('default')) {
    categories.push({ id: DEFAULT_GOAL_CATEGORY_ID, label: DEFAULT_GOAL_CATEGORY_LABEL })
  }
  for (const category of getCustomGoalCategories()) {
    if (enabled.includes(category.id)) categories.push(category)
  }
  return categories
}

export function getAvailableMetricTemplates(options?: {
  /** When false, Workouts is offered even if the section id is already enabled. */
  showWorkoutMetrics?: boolean
}): Array<{
  kind: 'builtin'
  id: BuiltinMetricsSection
  label: string
  description: string
}> {
  const enabled = new Set(getEnabledMetricsSections())
  const showWorkoutMetrics = options?.showWorkoutMetrics ?? true
  const templates: Array<{
    kind: 'builtin'
    id: BuiltinMetricsSection
    label: string
    description: string
  }> = []

  for (const id of BUILTIN_METRICS_SECTIONS) {
    const visible =
      id === 'workouts'
        ? enabled.has('workouts') && showWorkoutMetrics
        : enabled.has(id)
    if (!visible) {
      templates.push({
        kind: 'builtin',
        id,
        label: METRICS_SECTION_LABELS[id],
        description: METRICS_SECTION_DESCRIPTIONS[id],
      })
    }
  }

  return templates
}
