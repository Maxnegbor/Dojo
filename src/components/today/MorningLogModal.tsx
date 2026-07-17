import { useMemo, useRef, useState } from 'react'
import { Check, Sun, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { MetricInput } from '@/components/ui/MetricInput'
import {
  DurationMetricInput,
  type DurationMetricInputHandle,
} from '@/components/ui/DurationMetricInput'
import { activeDailyChecklist } from '@/lib/dailyChecklist'
import { computeMorningLogFields, formatMorningMinutes } from '@/lib/morningLog'
import {
  getEnabledMorningLogMetrics,
  getMorningLogGoalValuesFromLog,
  getMorningLogHabitValuesFromLog,
  getMorningLogSleepMetrics,
  getMorningLogWorkoutValuesFromList,
  getMorningLogYesterdayGoalValuesFromLog,
  getMorningLogYesterdayHabitValuesFromLog,
  getMorningLogYesterdayDate,
  habitIdFromMorningLogKey,
  isMorningLogYesterdayKey,
} from '@/lib/morningLogConfig'
import {
  WEARABLE_SLEEP_PRESET_ID,
  formatSleepMetricUnit,
  getSleepMetricValue,
  type SleepMetricDefinition,
  type SleepMetricsConfig,
} from '@/lib/sleepMetrics'
import { GoalMetricInput } from '@/components/ui/GoalMetricInput'
import type { DailyCheckGroup, DailyLog, Goal, MorningLog, Workout } from '@/types'
import { cn, formatUnknownError } from '@/lib/utils'

type MorningLogStep = 'log' | 'checklist'

export interface MorningLogSavePayload {
  morningLog?: MorningLog | null
  sleepMetrics: Record<string, number | null>
  goalValues: Record<string, number | null>
  yesterdayGoalValues: Record<string, number | null>
  habitValues: Record<string, boolean>
  yesterdayHabitValues: Record<string, boolean>
}

interface MorningLogModalProps {
  date: string
  initial?: MorningLog | null
  initialLog?: DailyLog | null
  yesterdayLog?: DailyLog | null
  workouts?: Workout[]
  yesterdayWorkouts?: Workout[]
  goals: Goal[]
  sleepMetricsConfig: SleepMetricsConfig
  morningChecklist: DailyCheckGroup[]
  onClose: () => void
  onSave: (payload: MorningLogSavePayload) => void | Promise<void>
  /** When false, hide dismiss control (required morning log gate). */
  dismissible?: boolean
}

function renderMetricInput(
  metric: SleepMetricDefinition,
  value: string,
  onChange: (value: string) => void,
  sleepMinutes: number | null,
  onSleepMinutesChange: (value: number | null) => void,
  sleepDurationRef?: React.RefObject<DurationMetricInputHandle | null>,
) {
  switch (metric.id) {
    case 'sleep_duration':
      return (
        <DurationMetricInput
          key={metric.id}
          ref={sleepDurationRef}
          label={metric.label}
          value={sleepMinutes}
          onChange={onSleepMinutesChange}
        />
      )
    case 'bedtime':
    case 'wake_time':
      return (
        <MetricInput
          key={metric.id}
          label={metric.label}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'alertness':
      return (
        <MetricInput
          key={metric.id}
          label={metric.label}
          unit="/ 10"
          min={1}
          max={10}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    default:
      if (metric.unit === 'percent') {
        return (
          <MetricInput
            key={metric.id}
            label={metric.label}
            unit="%"
            min={0}
            max={100}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
      if (metric.unit === 'score10') {
        return (
          <MetricInput
            key={metric.id}
            label={metric.label}
            unit="/ 10"
            min={1}
            max={10}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
      return (
        <MetricInput
          key={metric.id}
          label={metric.label}
          unit={formatSleepMetricUnit(metric.unit)}
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

export function MorningLogModal({
  date,
  initial,
  initialLog,
  yesterdayLog,
  workouts = [],
  yesterdayWorkouts = [],
  goals,
  sleepMetricsConfig,
  morningChecklist,
  onClose,
  onSave,
  dismissible = true,
}: MorningLogModalProps) {
  const enabledMetrics = useMemo(
    () => getMorningLogSleepMetrics(sleepMetricsConfig),
    [sleepMetricsConfig],
  )
  const enabledMorningMetrics = useMemo(
    () => getEnabledMorningLogMetrics(goals),
    [goals],
  )
  const loggableMetrics = useMemo(
    () => enabledMetrics.filter((m) => m.id !== 'in_bed'),
    [enabledMetrics],
  )
  const showMorningFields = enabledMetrics.some((m) =>
    ['sleep_duration', 'bedtime', 'wake_time', 'alertness'].includes(m.id),
  )
  const showInBedSummary = enabledMetrics.some((m) => m.id === 'in_bed')

  const checklistGroups = useMemo(
    () => activeDailyChecklist(morningChecklist),
    [morningChecklist],
  )
  const hasChecklist = checklistGroups.length > 0

  const [step, setStep] = useState<MorningLogStep>('log')
  const [bedtime, setBedtime] = useState(initial?.bedtime ?? '23:00')
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(
    initial?.sleep_minutes ?? initialLog?.sleep_metrics?.sleep_duration ?? 420,
  )
  const [wakeTime, setWakeTime] = useState(initial?.wake_time ?? '07:00')
  const [alertness, setAlertness] = useState(
    String(initial?.alertness ?? initialLog?.sleep_metrics?.alertness ?? 7),
  )
  const [metricValues, setMetricValues] = useState<Record<string, string>>(() => {
    const values: Record<string, string> = {}
    for (const metric of loggableMetrics) {
      if (['sleep_duration', 'bedtime', 'wake_time', 'alertness'].includes(metric.id)) continue
      const existing = initialLog ? getSleepMetricValue(initialLog, metric) : null
      values[metric.id] = existing != null ? String(existing) : ''
    }
    return values
  })
  const [goalValues, setGoalValues] = useState<Record<string, number | null>>(() => ({
    ...getMorningLogGoalValuesFromLog(initialLog ?? undefined, goals),
    ...getMorningLogWorkoutValuesFromList(workouts, date, goals, 'today'),
    ...getMorningLogYesterdayGoalValuesFromLog(yesterdayLog ?? undefined, goals),
    ...getMorningLogWorkoutValuesFromList(
      yesterdayWorkouts,
      yesterdayLog?.date ?? getMorningLogYesterdayDate(date),
      goals,
      'yesterday',
    ),
  }))
  const [habitValues, setHabitValues] = useState<Record<string, boolean>>(() => ({
    ...getMorningLogHabitValuesFromLog(initialLog ?? undefined, goals),
    ...getMorningLogYesterdayHabitValuesFromLog(yesterdayLog ?? undefined, goals),
  }))
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const sleepDurationRef = useRef<DurationMetricInputHandle>(null)

  const resolveMorningLogForSave = () => {
    if (!showMorningFields) return null

    const committedSleepMinutes = sleepDurationRef.current?.commit()
    const resolvedSleepMinutes =
      committedSleepMinutes ?? sleepMinutes ?? initial?.sleep_minutes ?? 0

    return computeMorningLogFields({
      bedtime,
      wake_time: wakeTime,
      sleep_minutes: resolvedSleepMinutes,
      alertness: parseInt(alertness, 10) || 7,
    })
  }

  const preview = showMorningFields
    ? computeMorningLogFields({
        bedtime,
        wake_time: wakeTime,
        sleep_minutes: sleepMinutes ?? 0,
        alertness: parseInt(alertness, 10) || 7,
      })
    : null

  const stepIndex = step === 'log' ? 1 : 2
  const stepCount = hasChecklist ? 2 : 1

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const buildPayload = (): MorningLogSavePayload => {
    const sleepMetrics: Record<string, number | null> = {}
    const morningLog = showMorningFields ? resolveMorningLogForSave() : undefined

    for (const metric of loggableMetrics) {
      if (metric.id === WEARABLE_SLEEP_PRESET_ID || metric.unit === 'percent') {
        const raw = metricValues[metric.id]
        sleepMetrics[metric.id] = raw?.trim() ? Math.min(100, Math.max(0, Number(raw))) : null
        continue
      }
      if (metric.source === 'custom') {
        const raw = metricValues[metric.id]
        sleepMetrics[metric.id] = raw?.trim() ? Number(raw) : null
        continue
      }
    }

    if (morningLog) {
      if (enabledMetrics.some((m) => m.id === 'sleep_duration')) {
        sleepMetrics.sleep_duration = morningLog.sleep_minutes
      }
      if (enabledMetrics.some((m) => m.id === 'alertness')) {
        sleepMetrics.alertness = morningLog.alertness
      }
      if (enabledMetrics.some((m) => m.id === 'in_bed')) {
        sleepMetrics.in_bed = morningLog.in_bed_minutes
      }
    }

    const todayGoalValues: Record<string, number | null> = {}
    const yesterdayGoalValues: Record<string, number | null> = {}
    const todayHabitValues: Record<string, boolean> = {}
    const yesterdayHabitValues: Record<string, boolean> = {}

    for (const metric of enabledMorningMetrics) {
      if (isMorningLogYesterdayKey(metric.key)) {
        if (metric.section === 'habit') {
          yesterdayHabitValues[habitIdFromMorningLogKey(metric.key)] =
            habitValues[habitIdFromMorningLogKey(metric.key)] ?? false
        } else if (metric.section === 'goal' || metric.section === 'weight' || metric.section === 'workout') {
          yesterdayGoalValues[metric.key] = goalValues[metric.key] ?? null
        }
        continue
      }

      if (metric.section === 'habit') {
        todayHabitValues[habitIdFromMorningLogKey(metric.key)] =
          habitValues[habitIdFromMorningLogKey(metric.key)] ?? false
      } else {
        todayGoalValues[metric.key] = goalValues[metric.key] ?? null
      }
    }

    return {
      morningLog,
      sleepMetrics,
      goalValues: todayGoalValues,
      yesterdayGoalValues,
      habitValues: todayHabitValues,
      yesterdayHabitValues,
    }
  }

  const handleFinish = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(buildPayload())
    } catch (error) {
      setSaveError(formatUnknownError(error, 'Could not save morning log'))
    } finally {
      setSaving(false)
    }
  }

  const goNextFromLog = () => {
    if (hasChecklist) setStep('checklist')
    else void handleFinish()
  }

  const stepTitle = step === 'log' ? 'Morning log' : 'Morning checklist'
  const stepSubtitle = step === 'log' ? date : 'Optional — tap what you’ve done'

  const setMetricValue = (id: string, value: string) => {
    setMetricValues((prev) => ({ ...prev, [id]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl">
        {dismissible && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <X size={18} />
          </button>
        )}

        <div className={cn('border-b border-zinc-800/80 px-5 py-4', dismissible ? 'pr-12' : 'pr-5')}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-950">
              <Sun size={20} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">{stepTitle}</h2>
              <p className="text-xs text-zinc-400">{stepSubtitle}</p>
            </div>
          </div>
          {stepCount > 1 && (
            <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-600">
              Step {stepIndex} of {stepCount}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === 'log' && (
            <div className="space-y-3">
              {loggableMetrics.length === 0 && enabledMorningMetrics.length === 0 && (
                <p className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-3 text-sm text-zinc-400">
                  No morning log fields enabled. Choose metrics in Settings → Routines → Morning
                  log.
                </p>
              )}

              {loggableMetrics.map((metric) => {
                if (metric.id === 'sleep_duration') {
                  return renderMetricInput(
                    metric,
                    '',
                    () => {},
                    sleepMinutes,
                    setSleepMinutes,
                    sleepDurationRef,
                  )
                }
                if (metric.id === 'bedtime') {
                  return renderMetricInput(metric, bedtime, setBedtime, null, () => {})
                }
                if (metric.id === 'wake_time') {
                  return renderMetricInput(metric, wakeTime, setWakeTime, null, () => {})
                }
                if (metric.id === 'alertness') {
                  return renderMetricInput(metric, alertness, setAlertness, null, () => {})
                }
                return renderMetricInput(
                  metric,
                  metricValues[metric.id] ?? '',
                  (value) => setMetricValue(metric.id, value),
                  null,
                  () => {},
                )
              })}

              {enabledMorningMetrics.map((metric) => {
                if (metric.section === 'habit') {
                  const habitId = habitIdFromMorningLogKey(metric.key)
                  const done = habitValues[habitId] ?? false
                  const label = isMorningLogYesterdayKey(metric.key)
                    ? `${metric.label} (yesterday)`
                    : metric.label

                  return (
                    <label
                      key={metric.key}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2.5"
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={(e) =>
                          setHabitValues((prev) => ({ ...prev, [habitId]: e.target.checked }))
                        }
                        className="h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-900 text-[var(--accent-500)] focus:ring-[var(--accent-500)]/40"
                      />
                      <span className="text-sm text-zinc-200">{label}</span>
                    </label>
                  )
                }

                return (
                  <GoalMetricInput
                    key={metric.key}
                    label={
                      isMorningLogYesterdayKey(metric.key)
                        ? `${metric.label} (yesterday)`
                        : metric.label
                    }
                    unit={metric.unit}
                    metricKey={metric.key}
                    step={metric.key === 'sleep' ? '0.5' : undefined}
                    value={goalValues[metric.key] ?? null}
                    onChange={(value) =>
                      setGoalValues((prev) => ({ ...prev, [metric.key]: value }))
                    }
                  />
                )
              })}

              {preview && showInBedSummary && (
                <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
                  <p>
                    In bed:{' '}
                    <span className="font-medium text-zinc-200">
                      {formatMorningMinutes(preview.in_bed_minutes)}
                    </span>
                  </p>
                  {enabledMetrics.some((m) => m.id === 'sleep_duration') && (
                    <p className="mt-1">
                      Sleep:{' '}
                      <span className="font-medium text-zinc-200">
                        {formatMorningMinutes(preview.sleep_minutes)}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'checklist' && (
            <div className="space-y-4">
              {checklistGroups.map((group) => (
                <div key={group.id}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {group.label}
                  </p>
                  <ul className="space-y-2">
                    {group.items.map((item) => {
                      const done = checked.has(item.id)
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => toggleCheck(item.id)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                              done
                                ? 'border-[var(--accent-500)]/40 bg-[var(--accent-950)]/60'
                                : 'border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-700',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                                done
                                  ? 'border-[var(--accent-500)] bg-[var(--accent-500)] text-black'
                                  : 'border-zinc-600',
                              )}
                            >
                              {done && <Check size={12} strokeWidth={3} />}
                            </span>
                            <span className="text-sm text-zinc-200">{item.label}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800/80 px-5 py-4">
          {saveError && (
            <p className="mb-3 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {saveError}
            </p>
          )}
          {step === 'log' && (
            <Button
              onClick={goNextFromLog}
              className="w-full"
              disabled={
                saving ||
                (loggableMetrics.length === 0 && enabledMorningMetrics.length === 0)
              }
            >
              {saving
                ? 'Saving…'
                : hasChecklist
                  ? 'Continue'
                  : 'Finish morning log'}
            </Button>
          )}
          {step === 'checklist' && (
            <Button onClick={handleFinish} className="w-full" disabled={saving}>
              {saving ? 'Saving…' : 'Finish morning log'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
