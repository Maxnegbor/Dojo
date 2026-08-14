import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GoalMetricInput } from '@/components/ui/GoalMetricInput'
import type { DailyLog, Goal, MetricKey } from '@/types'
import {
  getDailyLogScalarGoals,
  getLogValueForGoal,
  markMissedLogsPrompted,
  type MissedLogDay,
} from '@/lib/dailyLog'
import { clearDraft } from '@/lib/dailyLogDraft'
import { cn } from '@/lib/utils'

interface MissedLogModalProps {
  days: MissedLogDay[]
  goals: Goal[]
  onSave: (date: string, updates: Partial<DailyLog>) => Promise<void>
  onDismissDay: (date: string) => void
  /** Called when every missed day has been saved or skipped. */
  onComplete: () => void
}

function formatMissedDayLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function goalsForKeys(goals: Goal[], keys: MetricKey[]): Goal[] {
  const keySet = new Set(keys)
  return getDailyLogScalarGoals(goals).filter((goal) => keySet.has(goal.metric_key))
}

function MissedLogDaySection({
  day,
  goals,
  expanded,
  onToggle,
  onSave,
  onSkip,
}: {
  day: MissedLogDay
  goals: Goal[]
  expanded: boolean
  onToggle: () => void
  onSave: (updates: Partial<DailyLog>) => Promise<void>
  onSkip: () => void
}) {
  const promptGoals = useMemo(
    () => goalsForKeys(goals, day.metricKeys),
    [goals, day.metricKeys],
  )
  const [values, setValues] = useState<Record<string, number | null>>(() => {
    const initial: Record<string, number | null> = {}
    for (const goal of promptGoals) {
      initial[goal.metric_key] = day.log ? getLogValueForGoal(day.log, goal) : null
    }
    return initial
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const initial: Record<string, number | null> = {}
    for (const goal of promptGoals) {
      initial[goal.metric_key] = day.log ? getLogValueForGoal(day.log, goal) : null
    }
    setValues(initial)
  }, [day.date, day.log, promptGoals])

  const finishPrompted = () => {
    markMissedLogsPrompted(
      day.date,
      promptGoals.map((goal) => goal.metric_key),
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updates: Partial<DailyLog> = {
        custom_metrics: { ...(day.log?.custom_metrics ?? {}) },
      }
      for (const goal of promptGoals) {
        const value = values[goal.metric_key] ?? null
        if (goal.metric_key.startsWith('custom:')) {
          updates.custom_metrics![goal.metric_key] = value
        } else if (goal.metric_key === 'weight') {
          updates.weight = value
        }
      }
      await onSave(updates)
      clearDraft(day.date)
      finishPrompted()
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = () => {
    finishPrompted()
    onSkip()
  }

  if (promptGoals.length === 0) return null

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        aria-expanded={expanded}
      >
        <span className="text-sm font-medium text-zinc-200">{formatMissedDayLabel(day.date)}</span>
        <ChevronDown
          size={16}
          className={cn(
            'shrink-0 text-zinc-500 transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-zinc-800/80 px-3 pb-3 pt-3">
          <p className="text-[11px] text-zinc-500">
            Leave blank if you didn’t track it — blanks won’t be asked again.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {promptGoals.map((goal) => (
              <GoalMetricInput
                key={goal.id}
                label={goal.name}
                unit={goal.unit}
                value={values[goal.metric_key] ?? null}
                onChange={(value) =>
                  setValues((prev) => ({ ...prev, [goal.metric_key]: value }))
                }
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="flex-1" onClick={handleSkip}>
              Skip
            </Button>
            <Button size="sm" className="flex-1" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function MissedLogModal({
  days,
  goals,
  onSave,
  onDismissDay,
  onComplete,
}: MissedLogModalProps) {
  const [expandedDate, setExpandedDate] = useState<string | null>(() => days[0]?.date ?? null)
  const [remaining, setRemaining] = useState(days)
  const completedRef = useRef(false)

  useEffect(() => {
    setRemaining(days)
    if (days.length > 0) completedRef.current = false
  }, [days])

  useEffect(() => {
    if (remaining.length === 0) {
      if (!completedRef.current) {
        completedRef.current = true
        onComplete()
      }
      return
    }
    setExpandedDate((current) =>
      current && remaining.some((d) => d.date === current) ? current : remaining[0].date,
    )
  }, [remaining, onComplete])

  const removeDay = (date: string) => {
    onDismissDay(date)
    setRemaining((prev) => {
      const next = prev.filter((d) => d.date !== date)
      return next
    })
  }

  if (remaining.length === 0) return null

  const dayLabel = remaining.length === 1 ? 'day' : 'days'

  return (
    <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="missed-log-title"
        className="flex max-h-[min(85vh,640px)] w-full max-w-md flex-col rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl"
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-zinc-800/80 p-5 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-950/60 text-amber-400">
            <AlertTriangle size={18} />
          </div>
          <div>
            <h2 id="missed-log-title" className="text-base font-semibold text-zinc-100">
              Missed logs
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {remaining.length} {dayLabel} without a daily shutdown. Fill in what you can — empty
              fields stay blank and won’t be asked again.
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {remaining.map((day) => (
              <MissedLogDaySection
                key={day.date}
                day={day}
                goals={goals}
                expanded={expandedDate === day.date}
                onToggle={() =>
                  setExpandedDate((current) => (current === day.date ? null : day.date))
                }
                onSave={async (updates) => {
                  await onSave(day.date, updates)
                  removeDay(day.date)
                }}
                onSkip={() => removeDay(day.date)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
