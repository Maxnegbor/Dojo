import { useMemo, useState } from 'react'
import { CalendarCheck, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { WeeklyLogFields, useWeeklyLogDraft } from '@/components/today/WeeklyLogFields'
import { useSettings } from '@/context/SettingsContext'
import {
  activeWeeklyShutdownChecklist,
  allWeeklyShutdownItemIds,
  weekDateRangeLabel,
} from '@/lib/weeklyShutdown'
import type { Goal } from '@/types'
import { cn } from '@/lib/utils'

interface WeeklyShutdownModalProps {
  weekDates: string[]
  goals: Goal[]
  onClose: () => void
  onComplete: () => void
}

export function WeeklyShutdownModal({
  weekDates,
  goals,
  onClose,
  onComplete,
}: WeeklyShutdownModalProps) {
  const { settings } = useSettings()
  const checklist = useMemo(
    () => activeWeeklyShutdownChecklist(settings.weeklyShutdownChecklist),
    [settings.weeklyShutdownChecklist],
  )
  const itemIds = useMemo(() => allWeeklyShutdownItemIds(checklist), [checklist])
  const weeklyDraft = useWeeklyLogDraft(weekDates, goals)

  const [checked, setChecked] = useState<Set<string>>(() => new Set())

  const hasChecklist = itemIds.length > 0
  const allChecklistDone = !hasChecklist || itemIds.every((id) => checked.has(id))
  const allDone = weeklyDraft.inputsComplete && allChecklistDone
  const rangeLabel = weekDateRangeLabel(weekDates)

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleComplete = () => {
    weeklyDraft.persist()
    onComplete()
  }

  const continueLabel = !weeklyDraft.inputsComplete
    ? 'Fill in weekly log to continue'
    : !allChecklistDone
      ? 'Complete checklist to continue'
      : 'Review my week'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--accent-500)]/40 bg-[#0c0c14] shadow-2xl shadow-[var(--accent-500)]/10">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X size={18} />
        </button>

        <div className="border-b border-[var(--accent-500)]/20 bg-gradient-to-br from-[var(--accent-950)]/80 to-transparent px-6 py-6 pr-12">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-500)] shadow-lg shadow-[var(--accent-500)]/40">
              <CalendarCheck size={22} className="text-black" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-50">Weekly Shutdown</h2>
              <p className="text-xs text-[var(--accent-300)]">
                {rangeLabel ? `Week of ${rangeLabel}` : 'Close out your week'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <p className="text-sm text-zinc-400">
            Log your weekly metrics, run through your checklist, then review how the week went.
          </p>

          <WeeklyLogFields
            draft={weeklyDraft}
            heading="Weekly log"
            description="Enter your weekly metrics."
          />

          {checklist.map((group) => (
            <section key={group.id} className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-[var(--accent-300)]">{group.label}</h3>
              <ul className="space-y-2">
                {group.items.map((item) => {
                  const done = checked.has(item.id)
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => toggle(item.id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                          done
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                            done
                              ? 'border-emerald-500 bg-emerald-500 text-black'
                              : 'border-zinc-600 bg-transparent',
                          )}
                        >
                          {done && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className="text-sm">{item.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="border-t border-zinc-800/80 px-6 py-4">
          <Button
            onClick={handleComplete}
            disabled={!allDone}
            className="w-full bg-[var(--accent-500)] font-bold text-black shadow-lg shadow-[var(--accent-500)]/30 hover:bg-[var(--accent-400)] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
          >
            {continueLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
