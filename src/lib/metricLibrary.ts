import {
  DEFAULT_GOAL_CATEGORY_ID,
  getCustomGoalCategories,
  saveCustomGoalCategories,
  slugifyGoalCategoryId,
  type GoalCategoryDefinition,
} from '@/lib/goalCategories'
import { getHabitTypes, saveHabitTypes } from '@/lib/habitTypes'
import { getSleepMetricsConfig, saveSleepMetricsConfig } from '@/lib/sleepMetrics'
import { localStore } from '@/lib/localStore'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { getWorkoutTypes, saveWorkoutTypes } from '@/lib/workoutTypes'

export const UNGROUPED_CATEGORY_ID = DEFAULT_GOAL_CATEGORY_ID
export const UNGROUPED_CATEGORY_LABEL = 'Ungrouped'

const MIGRATION_KEY = 'personal-os-metric-library-cats-v1'

export const KIND_CATEGORY_FALLBACK = {
  habit: 'habits',
  sleep: 'sleep',
  focus: 'focus',
  weight: 'weight',
  workout: 'workouts',
  goal: UNGROUPED_CATEGORY_ID,
} as const

export const KIND_CATEGORY_LABELS: Record<string, string> = {
  habits: 'Habits',
  habitify: 'Habitify',
  sleep: 'Sleep',
  focus: 'Focus',
  weight: 'Weight',
  workouts: 'Workouts',
  [UNGROUPED_CATEGORY_ID]: UNGROUPED_CATEGORY_LABEL,
}

export function resolveLibraryCategoryId(stored?: string | null): string {
  const id = stored?.trim()
  if (!id || id === UNGROUPED_CATEGORY_ID) return UNGROUPED_CATEGORY_ID
  return id
}

export function storedLibraryCategoryId(categoryId: string): string | null {
  return !categoryId || categoryId === UNGROUPED_CATEGORY_ID ? null : categoryId
}

export function getMetricLibraryCategories(): GoalCategoryDefinition[] {
  return [
    ...getCustomGoalCategories(),
    {
      id: UNGROUPED_CATEGORY_ID,
      label: UNGROUPED_CATEGORY_LABEL,
    },
  ]
}

export function ungroupMetricsInCategory(categoryId: string): void {
  if (!categoryId || categoryId === UNGROUPED_CATEGORY_ID) return

  saveHabitTypes(
    getHabitTypes().map((h) =>
      h.category_id === categoryId ? { ...h, category_id: undefined } : h,
    ),
  )
  saveWorkoutTypes(
    getWorkoutTypes().map((w) =>
      w.category_id === categoryId ? { ...w, category_id: undefined } : w,
    ),
  )
  const sleep = getSleepMetricsConfig()
  if (sleep.categories) {
    const categories = { ...sleep.categories }
    let changed = false
    for (const [id, value] of Object.entries(categories)) {
      if (value === categoryId) {
        delete categories[id]
        changed = true
      }
    }
    if (changed) saveSleepMetricsConfig({ ...sleep, categories })
  }
  try {
    for (const goal of localStore.getGoals()) {
      if (goal.category_id === categoryId) {
        localStore.upsertGoal({ ...goal, category_id: null })
      }
    }
  } catch {
    /* ignore */
  }
  saveCustomGoalCategories(getCustomGoalCategories().filter((c) => c.id !== categoryId))
}

function ensureCategory(categories: GoalCategoryDefinition[], id: string, label: string) {
  if (id === UNGROUPED_CATEGORY_ID) return
  if (categories.some((c) => c.id === id)) return
  categories.push({ id, label })
}

/** One-shot: former Metrics sections become grouping categories, not separate types. */
export function migrateMetricLibraryCategories(): void {
  if (storageGetItem(MIGRATION_KEY) === '1') return
  storageSetItem(MIGRATION_KEY, '1')

  const categories = getCustomGoalCategories()

  const habits = getHabitTypes()
  if (habits.some((h) => !h.category_id)) {
    ensureCategory(categories, 'habits', KIND_CATEGORY_LABELS.habits)
    saveHabitTypes(
      habits.map((h) =>
        h.category_id ? h : { ...h, category_id: KIND_CATEGORY_FALLBACK.habit },
      ),
    )
  }

  const workouts = getWorkoutTypes()
  if (workouts.some((w) => !w.category_id)) {
    ensureCategory(categories, 'workouts', KIND_CATEGORY_LABELS.workouts)
    saveWorkoutTypes(
      workouts.map((w) =>
        w.category_id ? w : { ...w, category_id: KIND_CATEGORY_FALLBACK.workout },
      ),
    )
  }

  const sleep = getSleepMetricsConfig()
  if (sleep.enabledIds.length > 0) {
    const nextCats = { ...(sleep.categories ?? {}) }
    let changed = false
    for (const id of sleep.enabledIds) {
      if (!nextCats[id]) {
        nextCats[id] = KIND_CATEGORY_FALLBACK.sleep
        changed = true
      }
    }
    if (changed) {
      ensureCategory(categories, 'sleep', KIND_CATEGORY_LABELS.sleep)
      saveSleepMetricsConfig({ ...sleep, categories: nextCats })
    }
  }

  try {
    const goals = localStore.getGoals()
    for (const goal of goals) {
      if (!goal.is_active || goal.category_id) continue
      if (goal.metric_key === 'weight') {
        ensureCategory(categories, 'weight', KIND_CATEGORY_LABELS.weight)
        localStore.upsertGoal({ ...goal, category_id: KIND_CATEGORY_FALLBACK.weight })
      } else if (goal.metric_key === 'focus') {
        ensureCategory(categories, 'focus', KIND_CATEGORY_LABELS.focus)
        localStore.upsertGoal({ ...goal, category_id: KIND_CATEGORY_FALLBACK.focus })
      } else if (goal.metric_key === 'sleep') {
        ensureCategory(categories, 'sleep', KIND_CATEGORY_LABELS.sleep)
        localStore.upsertGoal({ ...goal, category_id: KIND_CATEGORY_FALLBACK.sleep })
      }
    }
  } catch {
    /* ignore */
  }

  saveCustomGoalCategories(categories)
}

export function createMetricCategory(label: string): GoalCategoryDefinition | null {
  const trimmed = label.trim()
  if (!trimmed) return null
  let id = slugifyGoalCategoryId(trimmed)
  const existing = getCustomGoalCategories()
  let n = 2
  while (existing.some((c) => c.id === id) || id === UNGROUPED_CATEGORY_ID) {
    id = `${slugifyGoalCategoryId(trimmed)}_${n}`
    n++
  }
  const next = { id, label: trimmed }
  saveCustomGoalCategories([...existing, next])
  return next
}
