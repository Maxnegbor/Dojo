import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardList, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DailyLogForm } from '@/components/today/DailyLogForm'
import { WeeklyLogFields, useWeeklyLogDraft } from '@/components/today/WeeklyLogFields'
import { SleepMetricField } from '@/components/today/SleepMetricField'
import { flushDraftToStore } from '@/lib/dailyLogDraft'
import { isSupabaseConfigured } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import {
  getHomeLogDailyFilter,
  getHomeLogSleepMetrics,
  hasWeeklyLogItems,
} from '@/lib/trackedLogsNet'
import {
  buildEditLogDaySleepUpdates,
  getSleepMetricValue,
  type SleepMetricsConfig,
} from '@/lib/sleepMetrics'
import type { DailyLog, Goal, Workout } from '@/types'
import { cn, getWeekDates } from '@/lib/utils'

interface HomeLogModalProps {
  date: string
  log: DailyLog
  goals: Goal[]
  workouts: Workout[]
  streakLogs?: DailyLog[]
  sleepMetricsConfig: SleepMetricsConfig
  weekStartsOn: 0 | 1
  userId: string
  onClose: () => void
  onSaved: () => void
}

export function HomeLogModal({
  date,
  log,
  goals,
  workouts,
  streakLogs = [],
  sleepMetricsConfig,
  weekStartsOn,
  userId,
  onClose,
  onSaved,
}: HomeLogModalProps) {
  const [view, setView] = useState<'daily' | 'weekly'>('daily')
  const [saving, setSaving] = useState(false)
  const sleepMetrics = useMemo(
    () => getHomeLogSleepMetrics(sleepMetricsConfig),
    [sleepMetricsConfig],
  )
  const dailyFilter = useMemo(
    () => getHomeLogDailyFilter(goals, sleepMetricsConfig),
    [goals, sleepMetricsConfig],
  )
  const weekDates = useMemo(
    () => getWeekDates(new Date(`${date}T12:00:00`), weekStartsOn),
    [date, weekStartsOn],
  )
  const showWeekly = hasWeeklyLogItems(goals, sleepMetricsConfig)
  const hasDailyFormItems =
    dailyFilter.habitIds.size > 0 ||
    dailyFilter.goalKeys.size > 0 ||
    dailyFilter.workoutCategories.size > 0
  const weeklyDraft = useWeeklyLogDraft(weekDates, goals)

  const [sleepValues, setSleepValues] = useState<Record<string, number | null>>(() => {
    const values: Record<string, number | null> = {}
    for (const metric of getHomeLogSleepMetrics(sleepMetricsConfig)) {
      values[metric.id] = getSleepMetricValue(log, metric)
    }
    return values
  })

  const persistSleep = async () => {
    if (sleepMetrics.length === 0) return
    const updates = buildEditLogDaySleepUpdates(log, sleepValues, sleepMetrics)
    if (isSupabaseConfigured) {
      const { updateDailyLogForDate } = await import('@/lib/supabase')
      await updateDailyLogForDate(userId, date, updates)
    } else {
      localStore.updateDailyLog(date, updates)
    }
  }

  const handleSaveDaily = async () => {
    setSaving(true)
    try {
      await flushDraftToStore(date, userId)
      await persistSleep()
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleSaveWeekly = () => {
    weeklyDraft.persist()
    setView('daily')
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="border-b border-zinc-800/80 px-5 py-4 pr-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800">
              <ClipboardList size={18} className="text-zinc-200" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-50">
                {view === 'weekly' ? 'This week' : 'Log'}
              </h2>
              <p className="text-xs text-zinc-500">
                {view === 'weekly'
                  ? 'Weekly items are also asked at weekly shutdown.'
                  : 'Daily metrics from your library.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {view === 'daily' ? (
            <div className="space-y-4">
              {sleepMetrics.length > 0 && (
                <section>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Sleep
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {sleepMetrics.map((metric) => (
                      <SleepMetricField
                        key={metric.id}
                        metric={metric}
                        value={sleepValues[metric.id] ?? null}
                        onChange={(value) =>
                          setSleepValues((prev) => ({ ...prev, [metric.id]: value }))
                        }
                      />
                    ))}
                  </div>
                </section>
              )}
              {hasDailyFormItems ? (
                <DailyLogForm
                  log={log}
                  goals={goals}
                  workouts={workouts}
                  streakLogs={streakLogs}
                  userId={userId}
                  embedded
                  hideWeeklyHabits
                  metricsFilter={dailyFilter}
                  onSaved={onSaved}
                />
              ) : sleepMetrics.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-6 text-center text-sm text-zinc-500">
                  Add daily metrics on the Metrics page to log them here.
                </p>
              ) : null}
            </div>
          ) : (
            <WeeklyLogFields
              draft={weeklyDraft}
              heading="Weekly log"
              description="Edit this week early. Weekly shutdown will still review them."
            />
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-zinc-800/80 px-5 py-3">
          {view === 'daily' ? (
            <>
              {showWeekly && (
                <button
                  type="button"
                  onClick={() => setView('weekly')}
                  className={cn(
                    'shrink-0 rounded-md px-2 py-1.5 text-[11px] font-medium',
                    'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300',
                  )}
                >
                  This week
                </button>
              )}
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void handleSaveDaily()} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setView('daily')}>
                Back
              </Button>
              <div className="flex-1" />
              <Button size="sm" onClick={handleSaveWeekly}>
                Save week
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
