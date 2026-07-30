import {
  getEnabledMetricsSections,
  getVisibleGoalCategories,
  METRICS_SECTION_LABELS,
  type BuiltinMetricsSection,
} from '@/lib/metricsSections'

/** Overview sidebar tab id — builtins plus any enabled goal-category section. */
export type OverviewCategory = string

export type OverviewCategoryItem = {
  id: OverviewCategory
  label: string
}

const BUILTIN_OVERVIEW_ORDER: Array<{
  id: OverviewCategory
  sectionIds: BuiltinMetricsSection[]
  label: string
}> = [
  { id: 'fitness', sectionIds: ['weight', 'workouts'], label: 'Fitness' },
  { id: 'sleep', sectionIds: ['sleep'], label: METRICS_SECTION_LABELS.sleep },
  { id: 'habits', sectionIds: ['habits'], label: METRICS_SECTION_LABELS.habits },
  { id: 'focus', sectionIds: ['focus'], label: METRICS_SECTION_LABELS.focus },
]

/** Built-in overview tabs that have dedicated panels (not goal-category grids). */
export const BUILTIN_OVERVIEW_CATEGORY_IDS = new Set(
  BUILTIN_OVERVIEW_ORDER.map((entry) => entry.id),
)

/**
 * Overview tabs mirror enabled Metrics sections:
 * Fitness (weight/workouts), Sleep, Habits, Focus, then each goal category.
 * The old catch-all "Goals" tab is intentionally omitted.
 */
export function getOverviewCategories(): OverviewCategoryItem[] {
  const enabled = new Set(getEnabledMetricsSections())
  const categories: OverviewCategoryItem[] = []

  for (const entry of BUILTIN_OVERVIEW_ORDER) {
    if (entry.sectionIds.some((sectionId) => enabled.has(sectionId))) {
      categories.push({ id: entry.id, label: entry.label })
    }
  }

  for (const category of getVisibleGoalCategories()) {
    categories.push({ id: category.id, label: category.label })
  }

  return categories
}

export function isBuiltinOverviewCategory(id: OverviewCategory): boolean {
  return BUILTIN_OVERVIEW_CATEGORY_IDS.has(id)
}
