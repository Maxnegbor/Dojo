import { useState } from 'react'
import { ArrowRight, Check, Moon, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { DailyLogForm } from '@/components/today/DailyLogForm'
import type { DailyLog, Goal, Reminder, Workout } from '@/types'
import { cn } from '@/lib/utils'

interface ShutdownModalProps {
  log: DailyLog
  goals: Goal[]
  workouts: Workout[]
  streakLogs: DailyLog[]
  viewDate: string
  tomorrowDate: string
  reminders: Reminder[]
  onClose: () => void
  onComplete: (deferredIds: string[]) => void | Promise<void>
  onCompleteReminder: (id: string) => void
}

export function ShutdownModal({
  log,
  goals,
  workouts,
  streakLogs,
  viewDate,
  tomorrowDate,
  reminders,
  onClose,
  onComplete,
  onCompleteReminder,
}: ShutdownModalProps) {
  const [deferredIds, setDeferredIds] = useState<Set<string>>(() => new Set())
  const [finishing, setFinishing] = useState(false)

  const openReminders = reminders.filter(
    (r) => !r.completed && r.due_date <= viewDate && r.kind !== 'note',
  )
  const tomorrowLabel = format(parseISO(tomorrowDate), 'EEEE, MMM d')

  const toggleDefer = (id: string) => {
    setDeferredIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDone = async () => {
    setFinishing(true)
    try {
      await onComplete([...deferredIds])
    } finally {
      setFinishing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X size={18} />
        </button>

        <div className="border-b border-zinc-800/80 px-6 py-5 pr-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-950">
              <Moon size={20} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">Shutdown</h2>
              <p className="text-xs text-zinc-400">
                Log today, then clear or carry reminders into tomorrow.
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-zinc-200">Daily Log</h3>
            <DailyLogForm log={log} goals={goals} workouts={workouts} streakLogs={streakLogs} embedded />
          </section>

          <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
            <h3 className="mb-3 text-sm font-semibold text-zinc-200">Reminders</h3>

            {openReminders.length === 0 ? (
              <p className="py-2 text-center text-xs text-zinc-500">All clear for today</p>
            ) : (
              <ul className="space-y-2">
                {openReminders.map((item) => {
                  const deferred = deferredIds.has(item.id)
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-2 py-2 transition-colors',
                        deferred ? 'bg-zinc-900/30' : 'bg-zinc-900/60',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onCompleteReminder(item.id)}
                        aria-label={`Complete ${item.title}`}
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          deferred
                            ? 'border-zinc-700 text-transparent opacity-50'
                            : 'border-zinc-600 text-transparent hover:border-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-400',
                        )}
                      >
                        <Check size={11} />
                      </button>
                      <p
                        className={cn(
                          'min-w-0 flex-1 truncate text-sm transition-colors',
                          deferred ? 'text-zinc-500' : 'text-zinc-200',
                        )}
                      >
                        {item.title}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleDefer(item.id)}
                        aria-label={
                          deferred
                            ? `Keep ${item.title} on today`
                            : `Move ${item.title} to tomorrow`
                        }
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors',
                          deferred
                            ? 'border-amber-500/60 bg-amber-500/25 text-amber-400'
                            : 'border-zinc-700 bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-200',
                        )}
                      >
                        <ArrowRight size={14} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {openReminders.length > 0 && (
              <p className="mt-3 text-[10px] text-zinc-600">
                Tap the arrow to mark a reminder for {tomorrowLabel}. Done for tonight applies
                those moves.
              </p>
            )}
          </section>
        </div>

        <div className="border-t border-zinc-800/80 px-6 py-4">
          <Button onClick={handleDone} className="w-full" disabled={finishing}>
            {finishing ? 'Wrapping up…' : 'Done for tonight'}
          </Button>
        </div>
      </div>
    </div>
  )
}
