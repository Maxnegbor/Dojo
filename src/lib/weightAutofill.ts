import { addDays, parseISO } from 'date-fns'
import { getDraft, type DailyLogDraft } from '@/lib/dailyLogDraft'
import { localStore } from '@/lib/localStore'
import type { DailyLog } from '@/types'
import { formatDate } from '@/lib/utils'

/** Most recent weight before `date` — prefers yesterday's log, then draft, then walk back. */
export function resolvePriorWeight(date: string, logs: DailyLog[] = []): number | null {
  const prevDate = formatDate(addDays(parseISO(date), -1))

  const prevFromLogs = logs.find((l) => l.date === prevDate && l.weight != null)
  if (prevFromLogs) return prevFromLogs.weight

  const prevFromStore = localStore.getDailyLog(prevDate)
  if (prevFromStore?.weight != null) return prevFromStore.weight

  const prevDraft = getDraft(prevDate)
  if (prevDraft?.weight != null) return prevDraft.weight

  const pool =
    logs.length > 0
      ? logs
      : localStore.getDailyLogs(
          formatDate(addDays(parseISO(date), -90)),
          formatDate(addDays(parseISO(date), -1)),
        )

  const prior = pool
    .filter((l) => l.date < date && l.weight != null)
    .sort((a, b) => b.date.localeCompare(a.date))[0]

  return prior?.weight ?? null
}

export function applyWeightAutofill(
  draft: DailyLogDraft,
  date: string,
  logs: DailyLog[] = [],
): DailyLogDraft {
  if (draft.weight != null) return draft
  const prior = resolvePriorWeight(date, logs)
  if (prior == null) return draft
  return { ...draft, weight: prior }
}
