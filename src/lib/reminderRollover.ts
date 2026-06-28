import { localStore } from '@/lib/localStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

/** Move open reminders from past days onto today (forgot to shutdown). */
export async function rolloverStaleReminders(userId: string, today?: string): Promise<number> {
  const targetDate = today ?? formatDate(new Date())
  let rolled = 0

  if (isSupabaseConfigured) {
    const { fetchReminders, upsertReminder } = await import('@/lib/supabase')
    const reminders = await fetchReminders(userId)

    for (const reminder of reminders) {
      if (
        reminder.completed ||
        reminder.kind === 'note' ||
        reminder.due_date >= targetDate
      ) {
        continue
      }

      await upsertReminder({
        ...reminder,
        due_date: targetDate,
        rescheduled_from: reminder.rescheduled_from ?? reminder.due_date,
      })
      rolled++
    }
  } else {
    const reminders = localStore.getReminders()

    for (const reminder of reminders) {
      if (
        reminder.completed ||
        reminder.kind === 'note' ||
        reminder.due_date >= targetDate
      ) {
        continue
      }

      localStore.upsertReminder({
        ...reminder,
        due_date: targetDate,
        rescheduled_from: reminder.rescheduled_from ?? reminder.due_date,
      })
      rolled++
    }
  }

  return rolled
}
