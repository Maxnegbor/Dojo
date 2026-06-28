import { useMemo, useState } from 'react'
import { CalendarCheck, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { MetricInput } from '@/components/ui/MetricInput'
import { getWeeklyLogGoals } from '@/lib/goals'
import {
  getWeeklyLogHabitTypes,
  habitWeeklyLogKey,
} from '@/lib/habitTypes'
import {
  WEEKLY_SHUTDOWN_CHECKLIST,
  getWeeklyShutdownWeekKey,
  weekDateRangeLabel,
  type WeeklyShutdownCheckGroup,
} from '@/lib/weeklyShutdown'
import { getWeeklyLog, setWeeklyLog } from '@/lib/weeklyLogStore'
import type { Goal } from '@/types'
import { cn } from '@/lib/utils'

interface WeeklyShutdownModalProps {
  weekDates: string[]
  goals: Goal[]
  onClose: () => void
  onComplete: () => void
}

function allItemIds(groups: WeeklyShutdownCheckGroup[]): string[] {
  return groups.flatMap((g) => g.items.map((i) => i.id))
}

export function WeeklyShutdownModal({
  weekDates,
  goals,
  onClose,
  onComplete,
}: WeeklyShutdownModalProps) {
  const weekKey = getWeeklyShutdownWeekKey(weekDates)
  const weeklyLogGoals = useMemo(() => getWeeklyLogGoals(goals), [goals])
  const weeklyLogHabits = useMemo(() => getWeeklyLogHabitTypes(), [])
  const itemIds = useMemo(() => allItemIds(WEEKLY_SHUTDOWN_CHECKLIST), [])

  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const [weeklyValues, setWeeklyValues] = useState<Record<string, string>>(() => {
    const stored = getWeeklyLog(weekKey)
    const initial: Record<string, string> = {}
    for (const goal of getWeeklyLogGoals(goals)) {
      const v = stored[goal.metric_key]
      if (v != null) initial[goal.metric_key] = String(v)
    }
    for (const habit of getWeeklyLogHabitTypes()) {
      const key = habitWeeklyLogKey(habit.id)
      const v = stored[key]
      initial[key] = v != null ? String(v) : '0'
    }
    return initial
  })

  const allChecklistDone = itemIds.every((id) => checked.has(id))
  const weeklyGoalInputsComplete =
    weeklyLogGoals.length === 0 ||
    weeklyLogGoals.every((g) => {
      const raw = weeklyValues[g.metric_key]?.trim()
      return raw != null && raw !== '' && !Number.isNaN(parseFloat(raw))
    })
  const hasWeeklyLogItems = weeklyLogGoals.length > 0 || weeklyLogHabits.length > 0
  const allDone = allChecklistDone && weeklyGoalInputsComplete
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
    const toSave: Record<string, number | null> = {}
    for (const goal of weeklyLogGoals) {
      const raw = weeklyValues[goal.metric_key]?.trim()
      toSave[goal.metric_key] = raw ? parseFloat(raw) : null
    }
    for (const habit of weeklyLogHabits) {
      const key = habitWeeklyLogKey(habit.id)
      const raw = weeklyValues[key]?.trim()
      toSave[key] = raw === '1' ? 1 : 0
    }
    setWeeklyLog(weekKey, toSave)
    onComplete()
  }

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
            Run through your Macrofactor checklist before reviewing this week&apos;s goals.
          </p>

          {WEEKLY_SHUTDOWN_CHECKLIST.map((group) => (
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

          {hasWeeklyLogItems && (
            <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
              <h3 className="mb-1 text-sm font-semibold text-[var(--accent-300)]">
                {weeklyLogGoals.length > 0 ? 'Weekly log' : 'Weekly habits'}
              </h3>
              <p className="mb-4 text-xs text-zinc-500">
                {weeklyLogGoals.length > 0 && weeklyLogHabits.length > 0
                  ? 'Enter any weekly-only metrics and mark weekly habits before reviewing your goals.'
                  : weeklyLogGoals.length > 0
                    ? 'Enter any weekly-only metrics before reviewing your goals.'
                    : 'Mark weekly habits before reviewing your goals.'}
              </p>
              <div className="space-y-4">
                {weeklyLogGoals.map((goal) => (
                  <MetricInput
                    key={goal.id}
                    label={goal.name}
                    value={weeklyValues[goal.metric_key] ?? ''}
                    onChange={(e) =>
                      setWeeklyValues((prev) => ({
                        ...prev,
                        [goal.metric_key]: e.target.value,
                      }))
                    }
                    unit={goal.unit}
                    placeholder="0"
                  />
                ))}

                {weeklyLogHabits.length > 0 && (
                  <div className="space-y-2">
                    {weeklyLogHabits.length > 0 && weeklyLogGoals.length > 0 && (
                      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        Weekly habits
                      </p>
                    )}
                    {weeklyLogHabits.map((habit) => {
                      const key = habitWeeklyLogKey(habit.id)
                      const done = weeklyValues[key] === '1'
                      return (
                        <button
                          key={habit.id}
                          type="button"
                          onClick={() =>
                            setWeeklyValues((prev) => ({
                              ...prev,
                              [key]: done ? '0' : '1',
                            }))
                          }
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
                          <span className="text-sm">{habit.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="border-t border-zinc-800/80 px-6 py-4">
          <Button
            onClick={handleComplete}
            disabled={!allDone}
            className="w-full bg-[var(--accent-500)] font-bold text-black shadow-lg shadow-[var(--accent-500)]/30 hover:bg-[var(--accent-400)] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
          >
            {!allChecklistDone
              ? 'Complete checklist to continue'
              : !weeklyGoalInputsComplete
                ? 'Fill in weekly log to continue'
                : 'Review my week'}
          </Button>
        </div>
      </div>
    </div>
  )
}
