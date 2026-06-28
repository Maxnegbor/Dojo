import { useState } from 'react'
import { ClipboardList, Eye, EyeOff, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  BUILTIN_DAILY_LOG_METRICS,
  getHiddenDailyLogMetrics,
  setDailyLogMetricVisible,
  type DailyLogBuiltinMetric,
} from '@/lib/dailyLogConfig'
import type { Goal } from '@/types'
import { cn } from '@/lib/utils'

interface DailyLogMetricsModalProps {
  goals: Goal[]
  onClose: () => void
  onSaveGoal: (goal: Goal) => void
}

export function DailyLogMetricsModal({ goals, onClose, onSaveGoal }: DailyLogMetricsModalProps) {
  const [hidden, setHidden] = useState<DailyLogBuiltinMetric[]>(() => getHiddenDailyLogMetrics())

  const customGoals = goals.filter((g) => g.metric_key.startsWith('custom:'))

  const toggleBuiltin = (metric: DailyLogBuiltinMetric) => {
    const isVisible = !hidden.includes(metric)
    setDailyLogMetricVisible(metric, !isVisible)
    setHidden(getHiddenDailyLogMetrics())
  }

  const toggleCustomGoal = (goal: Goal) => {
    onSaveGoal({ ...goal, show_in_daily_log: !goal.show_in_daily_log })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="daily-log-metrics-title"
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700">
              <ClipboardList size={20} />
            </div>
            <div>
              <h2 id="daily-log-metrics-title" className="text-lg font-semibold text-zinc-100">
                Daily Log Metrics
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Choose which metrics appear on your daily log. Habits and workouts are managed separately.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Built-in metrics
            </h3>
            <div className="space-y-2">
              {BUILTIN_DAILY_LOG_METRICS.map((metric) => {
                const visible = !hidden.includes(metric.id)
                return (
                  <div
                    key={metric.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3"
                  >
                    <span className="text-sm text-zinc-200">{metric.label}</span>
                    <button
                      type="button"
                      onClick={() => toggleBuiltin(metric.id)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                        visible
                          ? 'text-emerald-400 hover:bg-emerald-950/40'
                          : 'text-zinc-500 hover:bg-zinc-800',
                      )}
                    >
                      {visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      {visible ? 'Visible' : 'Hidden'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>

          {customGoals.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Custom goals
              </h3>
              <div className="space-y-2">
                {customGoals.map((goal) => (
                  <div
                    key={goal.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3"
                  >
                    <span className="text-sm text-zinc-200">{goal.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleCustomGoal(goal)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                        goal.show_in_daily_log
                          ? 'text-emerald-400 hover:bg-emerald-950/40'
                          : 'text-zinc-500 hover:bg-zinc-800',
                      )}
                    >
                      {goal.show_in_daily_log ? <Eye size={14} /> : <EyeOff size={14} />}
                      {goal.show_in_daily_log ? 'Visible' : 'Hidden'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="flex justify-end border-t border-zinc-800/80 px-6 py-4">
          <Button className="min-w-[7rem]" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
