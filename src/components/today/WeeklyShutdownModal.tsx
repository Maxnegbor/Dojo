import { useMemo, useState } from 'react'
import { CalendarCheck, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GoalMetricInput } from '@/components/ui/GoalMetricInput'
import { WeightStepper } from '@/components/ui/WeightStepper'
import { HabitLogRow } from '@/components/today/HabitLogRow'
import { TodoistTasksPanel } from '@/components/today/TodoistTasksPanel'
import { useSettings } from '@/context/SettingsContext'
import { useHabitCompleteAnimation } from '@/hooks/useHabitCompleteAnimation'
import { getWeeklyShutdownLogGoals } from '@/lib/trackedLogsNet'
import { getHabitTargetLabel } from '@/lib/habitRamp'
import {
  getWeeklyLogHabitTypes,
  habitWeeklyLogKey,
  type HabitTypeDefinition,
} from '@/lib/habitTypes'
import { playHabitCheckSound } from '@/lib/timerSound'
import { isTodoistConnected } from '@/lib/todoistStore'
import {
  activeWeeklyShutdownChecklist,
  allWeeklyShutdownItemIds,
  getWeeklyShutdownWeekKey,
  weekDateRangeLabel,
} from '@/lib/weeklyShutdown'
import { resolvePriorWeeklyWeight } from '@/lib/weightAutofill'
import { getActiveWeightGoal, isWeightGoal } from '@/lib/weightGoal'
import { getWeeklyLog, setWeeklyLog } from '@/lib/weeklyLogStore'
import type { Goal } from '@/types'
import { cn, formatDate } from '@/lib/utils'
import { parseHrsMinToMinutes, usesTimedMetricInput } from '@/lib/timedMetrics'

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
  const weekKey = getWeeklyShutdownWeekKey(weekDates)
  const checklist = useMemo(
    () => activeWeeklyShutdownChecklist(settings.weeklyShutdownChecklist),
    [settings.weeklyShutdownChecklist],
  )
  const showTodoist = isTodoistConnected()
  const todoistDate = formatDate(new Date())
  const itemIds = useMemo(() => allWeeklyShutdownItemIds(checklist), [checklist])
  const weeklyLogGoals = useMemo(() => getWeeklyShutdownLogGoals(goals), [goals])
  const weightGoal = useMemo(() => getActiveWeightGoal(weeklyLogGoals), [weeklyLogGoals])
  const otherWeeklyGoals = useMemo(
    () => weeklyLogGoals.filter((g) => !isWeightGoal(g)),
    [weeklyLogGoals],
  )
  const weeklyLogHabits = useMemo(() => getWeeklyLogHabitTypes(), [])

  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const { getPhase, startComplete, clearPhase } = useHabitCompleteAnimation()
  const [weightKg, setWeightKg] = useState<number | null>(() => {
    const stored = getWeeklyLog(weekKey).weight
    if (stored != null) return stored
    return resolvePriorWeeklyWeight(weekDates, settings.weekStartsOn)
  })
  const [weeklyValues, setWeeklyValues] = useState<Record<string, string>>(() => {
    const stored = getWeeklyLog(weekKey)
    const initial: Record<string, string> = {}
    for (const goal of getWeeklyShutdownLogGoals(goals)) {
      if (isWeightGoal(goal)) continue
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

  const hasChecklist = itemIds.length > 0
  const allChecklistDone = !hasChecklist || itemIds.every((id) => checked.has(id))
  const weightComplete = !weightGoal || weightKg != null
  const otherWeeklyGoalsComplete =
    otherWeeklyGoals.length === 0 ||
    otherWeeklyGoals.every((g) => {
      const raw = weeklyValues[g.metric_key]?.trim()
      if (raw == null || raw === '') return false
      if (usesTimedMetricInput(g.unit, g.metric_key)) {
        return parseHrsMinToMinutes(raw) != null
      }
      return !Number.isNaN(parseFloat(raw))
    })
  const weeklyGoalInputsComplete = weightComplete && otherWeeklyGoalsComplete
  const allDone =
    weeklyGoalInputsComplete && allChecklistDone
  const rangeLabel = weekDateRangeLabel(weekDates)

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isHabitDone = (habitId: string) => weeklyValues[habitWeeklyLogKey(habitId)] === '1'

  const toggleWeeklyHabit = (habitId: string) => {
    const key = habitWeeklyLogKey(habitId)
    const done = isHabitDone(habitId)
    if (!done) {
      playHabitCheckSound()
      startComplete(habitId)
    } else {
      clearPhase(habitId)
    }
    setWeeklyValues((prev) => ({
      ...prev,
      [key]: done ? '0' : '1',
    }))
  }

  const renderWeeklyHabitRow = (habit: HabitTypeDefinition) => (
    <HabitLogRow
      habit={habit}
      done={isHabitDone(habit.id)}
      phase={getPhase(habit.id)}
      targetLabel={getHabitTargetLabel(habit)}
      streak={0}
      disabled={false}
      onToggle={() => toggleWeeklyHabit(habit.id)}
    />
  )

  const handleComplete = () => {
    const toSave: Record<string, number | null> = {}
    if (weightGoal && weightKg != null) {
      toSave.weight = weightKg
    }
    for (const goal of otherWeeklyGoals) {
      const raw = weeklyValues[goal.metric_key]?.trim()
      if (!raw) {
        toSave[goal.metric_key] = null
        continue
      }
      if (usesTimedMetricInput(goal.unit, goal.metric_key)) {
        toSave[goal.metric_key] = parseHrsMinToMinutes(raw)
        continue
      }
      toSave[goal.metric_key] = parseFloat(raw)
    }
    for (const habit of weeklyLogHabits) {
      const key = habitWeeklyLogKey(habit.id)
      const raw = weeklyValues[key]?.trim()
      toSave[key] = raw === '1' ? 1 : 0
    }
    setWeeklyLog(weekKey, toSave)
    onComplete()
  }

  const continueLabel = !weeklyGoalInputsComplete
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
            Log your weekly metrics, clear Todoist if needed, run through your checklist, then
            review how the week went.
          </p>

          {showTodoist && (
            <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
              <h3 className="mb-1 text-sm font-semibold text-[var(--accent-300)]">Todoist</h3>
              <p className="mb-3 text-xs text-zinc-500">
                Tick off leftover tasks or add anything for today.
              </p>
              <TodoistTasksPanel viewDate={todoistDate} hideHeader compact />
            </section>
          )}

          {weeklyLogHabits.length > 0 && (
            <section>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Weekly habits
              </p>
              <div className="space-y-1">
                {weeklyLogHabits.map((habit) => (
                  <div key={habit.id}>{renderWeeklyHabitRow(habit)}</div>
                ))}
              </div>
            </section>
          )}

          {weeklyLogGoals.length > 0 && (
            <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
              <h3 className="mb-1 text-sm font-semibold text-[var(--accent-300)]">Weekly log</h3>
              <p className="mb-4 text-xs text-zinc-500">Enter your weekly metrics.</p>
              <div className="space-y-4">
                {weightGoal && (
                  <WeightStepper
                    label={weightGoal.name}
                    valueKg={weightKg}
                    unit={settings.weightUnit}
                    onChange={setWeightKg}
                  />
                )}

                {otherWeeklyGoals.map((goal) => (
                  <GoalMetricInput
                    key={goal.id}
                    label={goal.name}
                    unit={goal.unit}
                    metricKey={goal.metric_key}
                    value={
                      weeklyValues[goal.metric_key]
                        ? usesTimedMetricInput(goal.unit, goal.metric_key)
                          ? parseHrsMinToMinutes(weeklyValues[goal.metric_key]!)
                          : parseFloat(weeklyValues[goal.metric_key]!)
                        : null
                    }
                    onChange={(value) =>
                      setWeeklyValues((prev) => ({
                        ...prev,
                        [goal.metric_key]: value != null ? String(value) : '',
                      }))
                    }
                    placeholder="0"
                  />
                ))}
              </div>
            </section>
          )}

          {showTodoist && (
            <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
              <h3 className="mb-1 text-sm font-semibold text-[var(--accent-300)]">Todoist</h3>
              <p className="mb-3 text-xs text-zinc-500">
                Clear today’s tasks or add anything left for the week.
              </p>
              <TodoistTasksPanel viewDate={todoistDate} compact hideHeader />
            </section>
          )}

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
