export interface GoalCategoryDefinition {
  id: string
  label: string
}

import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-goal-categories'

export const DEFAULT_GOAL_CATEGORY_ID = 'default'
export const DEFAULT_GOAL_CATEGORY_LABEL = 'Custom'

export function slugifyGoalCategoryId(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return slug || 'category'
}

export function resolveGoalCategoryId(categoryId?: string | null): string {
  if (!categoryId || categoryId === DEFAULT_GOAL_CATEGORY_ID) {
    return DEFAULT_GOAL_CATEGORY_ID
  }
  return categoryId
}

export function getCustomGoalCategories(): GoalCategoryDefinition[] {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as GoalCategoryDefinition[]
      if (Array.isArray(parsed)) {
        return parsed.map((c) => ({
          id: slugifyGoalCategoryId(c.id || c.label),
          label: c.label?.trim() || c.id,
        }))
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

export function getAllGoalCategories(): GoalCategoryDefinition[] {
  return [
    { id: DEFAULT_GOAL_CATEGORY_ID, label: DEFAULT_GOAL_CATEGORY_LABEL },
    ...getCustomGoalCategories(),
  ]
}

export function saveCustomGoalCategories(categories: GoalCategoryDefinition[]) {
  storageSetItem(STORAGE_KEY, JSON.stringify(categories))
}

export function getGoalCategoryLabel(categoryId?: string | null): string {
  const resolved = resolveGoalCategoryId(categoryId)
  if (resolved === DEFAULT_GOAL_CATEGORY_ID) return DEFAULT_GOAL_CATEGORY_LABEL
  return getCustomGoalCategories().find((c) => c.id === resolved)?.label ?? resolved
}

export function isDefaultGoalCategory(categoryId: string): boolean {
  return categoryId === DEFAULT_GOAL_CATEGORY_ID
}
