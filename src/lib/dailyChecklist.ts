import type { DailyCheckGroup } from '@/types'

export function normalizeDailyChecklist(
  checklist: DailyCheckGroup[] | undefined,
): DailyCheckGroup[] {
  if (!checklist?.length) return []
  return checklist
    .filter((group) => group.label.trim())
    .map((group) => ({
      id: group.id,
      label: group.label.trim(),
      items: group.items
        .filter((item) => item.label.trim())
        .map((item) => ({ id: item.id, label: item.label.trim() })),
    }))
    .filter((group) => group.items.length > 0)
}

export function activeDailyChecklist(checklist: DailyCheckGroup[]): DailyCheckGroup[] {
  return normalizeDailyChecklist(checklist)
}

export function allDailyCheckItemIds(groups: DailyCheckGroup[]): string[] {
  return groups.flatMap((group) => group.items.map((item) => item.id))
}

export const DEFAULT_MORNING_CHECKLIST: DailyCheckGroup[] = []

export const DEFAULT_DAILY_SHUTDOWN_CHECKLIST: DailyCheckGroup[] = []
