import { useMemo, useState } from 'react'
import { addDays, parseISO } from 'date-fns'
import { FlaskConical, Moon, Play } from 'lucide-react'
import { GoalProgressModal } from '@/components/today/GoalProgressModal'
import { ShutdownModal } from '@/components/today/ShutdownModal'
import { Button } from '@/components/ui/Button'
import { MetricInput } from '@/components/ui/MetricInput'
import { DurationMetricInput } from '@/components/ui/DurationMetricInput'
import { SettingsSection } from '@/components/settings/SettingsControls'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import {
  buildPreviewDailyLog,
  buildPreviewWorkouts,
  computeDailyShutdownPreview,
  computeDailyShutdownPreviewFromDraft,
  dailyShutdownValuesToDraft,
  DEFAULT_SHUTDOWN_AFTER,
  DEFAULT_SHUTDOWN_BEFORE,
  emptyWorkoutDurations,
  getPreviewStreakLogs,
  loadTodayShutdownValues,
  mergeWorkoutDurationMaps,
  type DailyShutdownMetricValues,
  type DailyShutdownPreviewResult,
} from '@/lib/devDailyShutdown'
import { clearDraft, getDraft, setDraft } from '@/lib/dailyLogDraft'
import { getDailyLogHabitTypes } from '@/lib/habitTypes'
import { localStore } from '@/lib/localStore'
import {
  cloneScheduleBlocksForDate,
  fetchScheduleBlocksForDate,
  persistScheduleBlock,
  removeScheduleBlock,
} from '@/lib/scheduleBlock'
import { getWorkoutTypes } from '@/lib/workoutTypes'
import type { DailyLog, Goal, Reminder, ScheduleBlock } from '@/types'
import { normalizeHabits } from '@/types'
import { addDaysToDateString, cn, formatDate } from '@/lib/utils'

function parseOptionalFloat(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const value = parseFloat(trimmed)
  return Number.isNaN(value) ? null : value
}

function parseOptionalInt(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const value = parseInt(trimmed, 10)
  return Number.isNaN(value) ? null : value
}

type MetricFields = {
  sleep: string
  steps: string
  screenMinutes: number | null
  focus: string
  reading: string
  workouts: Record<string, string>
}

function valuesToFields(values: DailyShutdownMetricValues): MetricFields {
  return {
    sleep: values.sleep_hours?.toString() ?? '',
    steps: values.steps?.toString() ?? '',
    screenMinutes: values.screen_time_minutes ?? null,
    focus: values.focus_minutes?.toString() ?? '0',
    reading: values.custom_metrics?.['custom:reading']?.toString() ?? '',
    workouts: Object.fromEntries(
      Object.entries(values.workouts).map(([id, minutes]) => [id, minutes != null ? String(minutes) : '']),
    ),
  }
}

function fieldsToValues(
  fields: MetricFields,
  habits: DailyShutdownMetricValues['habits'],
): DailyShutdownMetricValues {
  const workouts: Record<string, number | null> = emptyWorkoutDurations()
  for (const [id, raw] of Object.entries(fields.workouts)) {
    workouts[id] = parseOptionalInt(raw)
  }
  const reading = parseOptionalInt(fields.reading)
  return {
    sleep_hours: parseOptionalFloat(fields.sleep),
    steps: parseOptionalInt(fields.steps),
    screen_time_minutes: fields.screenMinutes,
    focus_minutes: parseOptionalFloat(fields.focus) ?? 0,
    habits,
    workouts,
    custom_metrics: reading != null ? { 'custom:reading': reading } : {},
  }
}

function withDefaultWorkouts(values: DailyShutdownMetricValues): DailyShutdownMetricValues {
  return {
    ...values,
    workouts: { ...emptyWorkoutDurations(), ...values.workouts },
  }
}

interface MetricColumnProps {
  title: string
  fields: MetricFields
  workoutTypes: ReturnType<typeof getWorkoutTypes>
  workoutsSectionLabel?: string
  focusLabel?: string
  onChange: (fields: MetricFields) => void
}

function MetricColumn({
  title,
  fields,
  workoutTypes,
  workoutsSectionLabel,
  focusLabel,
  onChange,
}: MetricColumnProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-zinc-400">{title}</p>
      <MetricInput
        label="Sleep"
        unit="hrs"
        step="0.5"
        value={fields.sleep}
        onChange={(e) => onChange({ ...fields, sleep: e.target.value })}
      />
      <MetricInput
        label="Steps"
        unit="steps"
        value={fields.steps}
        onChange={(e) => onChange({ ...fields, steps: e.target.value })}
      />
      <DurationMetricInput
        label="Screentime"
        value={fields.screenMinutes}
        onChange={(screenMinutes) => onChange({ ...fields, screenMinutes })}
      />
      <MetricInput
        label={focusLabel ?? 'Focus'}
        unit="min"
        value={fields.focus}
        onChange={(e) => onChange({ ...fields, focus: e.target.value })}
      />
      <MetricInput
        label="Reading"
        unit="pages"
        value={fields.reading}
        onChange={(e) => onChange({ ...fields, reading: e.target.value })}
      />
      {workoutTypes.length > 0 && (
        <div className="space-y-2 border-t border-zinc-800/80 pt-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            {workoutsSectionLabel ?? 'Workouts'}
          </p>
          {workoutTypes.map((type) => (
            <MetricInput
              key={type.id}
              label={type.label}
              unit="min"
              value={fields.workouts[type.id] ?? ''}
              onChange={(e) =>
                onChange({
                  ...fields,
                  workouts: { ...fields.workouts, [type.id]: e.target.value },
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function SettingsDeveloperDailyShutdown() {
  const { userId } = useAuth()
  const { settings } = useSettings()
  const today = formatDate(new Date())
  const tomorrow = addDaysToDateString(today, 1)
  const workoutTypes = useMemo(() => getWorkoutTypes(), [])

  const [beforeFields, setBeforeFields] = useState(() =>
    valuesToFields(withDefaultWorkouts(DEFAULT_SHUTDOWN_BEFORE)),
  )
  const [afterFields, setAfterFields] = useState(() =>
    valuesToFields(withDefaultWorkouts(DEFAULT_SHUTDOWN_AFTER)),
  )
  const [afterHabits, setAfterHabits] = useState(() => normalizeHabits(DEFAULT_SHUTDOWN_AFTER.habits))
  const [previewProgress, setPreviewProgress] = useState<DailyShutdownPreviewResult | null>(null)
  const [showShutdown, setShowShutdown] = useState(false)
  const [shutdownLog, setShutdownLog] = useState<DailyLog | null>(null)
  const [savedDraft, setSavedDraft] = useState<ReturnType<typeof getDraft>>(null)
  const [previewTodayBlocks, setPreviewTodayBlocks] = useState<ScheduleBlock[]>([])
  const [previewTomorrowBlocks, setPreviewTomorrowBlocks] = useState<ScheduleBlock[]>([])

  const dailyHabits = useMemo(() => getDailyLogHabitTypes(), [])

  const getGoals = (): Goal[] => {
    if (!userId) return []
    localStore.setUserId(userId)
    return localStore.getGoals()
  }

  const getContext = () => {
    if (!userId) return null
    localStore.setUserId(userId)
    const goals = getGoals()
    const existingLogs = localStore.getDailyLogs(
      formatDate(addDays(parseISO(today), -400)),
      today,
    )
    const weekWorkouts = localStore.getWorkouts(
      formatDate(addDays(parseISO(today), -6)),
      today,
    )
    const beforeValues = fieldsToValues(beforeFields, defaultHabits())
    const afterValues = fieldsToValues(afterFields, afterHabits)
    const before = buildPreviewDailyLog(today, userId, beforeValues)
    const after = buildPreviewDailyLog(today, userId, {
      ...afterValues,
      focus_minutes: beforeValues.focus_minutes + afterValues.focus_minutes,
    })
    const workoutsBefore = buildPreviewWorkouts(today, userId, beforeValues.workouts, weekWorkouts)
    const afterTotals = mergeWorkoutDurationMaps(beforeValues.workouts, afterValues.workouts)
    const workoutsAfter = buildPreviewWorkouts(today, userId, afterTotals, weekWorkouts)
    return { goals, existingLogs, before, after, workoutsBefore, workoutsAfter }
  }

  const runProgressPreview = () => {
    const context = getContext()
    if (!context) return
    const result = computeDailyShutdownPreview(
      today,
      context.goals,
      context.before,
      context.after,
      settings.weekStartsOn,
      context.existingLogs,
      context.workoutsBefore,
      context.workoutsAfter,
    )
    setPreviewProgress(result)
  }

  const openShutdownPreview = async () => {
    const context = getContext()
    if (!context || !userId) return
    const previousDraft = getDraft(today)
    setSavedDraft(previousDraft)
    setDraft(today, dailyShutdownValuesToDraft(fieldsToValues(afterFields, afterHabits)))
    setShutdownLog(context.before)
    setPreviewTodayBlocks(await fetchScheduleBlocksForDate(userId, today))
    setPreviewTomorrowBlocks(await fetchScheduleBlocksForDate(userId, tomorrow))
    setShowShutdown(true)
  }

  const closeShutdownPreview = () => {
    if (savedDraft) setDraft(today, savedDraft)
    else clearDraft(today)
    setSavedDraft(null)
    setShutdownLog(null)
    setShowShutdown(false)
  }

  const completeShutdownPreview = async () => {
    const context = getContext()
    if (!context || !shutdownLog || !userId) return
    const draft = getDraft(today)
    const result = computeDailyShutdownPreviewFromDraft(
      today,
      context.goals,
      shutdownLog,
      draft ?? dailyShutdownValuesToDraft(fieldsToValues(afterFields, afterHabits)),
      settings.weekStartsOn,
      context.existingLogs,
      context.workoutsBefore,
      userId,
    )
    closeShutdownPreview()
    setPreviewProgress(result)
  }

  const applyPreset = (kind: 'progress' | 'flat' | 'today') => {
    if (kind === 'progress') {
      setBeforeFields(valuesToFields(withDefaultWorkouts(DEFAULT_SHUTDOWN_BEFORE)))
      setAfterFields(valuesToFields(withDefaultWorkouts(DEFAULT_SHUTDOWN_AFTER)))
      setAfterHabits(normalizeHabits(DEFAULT_SHUTDOWN_AFTER.habits))
      return
    }
    if (kind === 'flat') {
      setAfterFields({
        ...beforeFields,
        focus: '',
        reading: '',
        workouts: Object.fromEntries(workoutTypes.map((type) => [type.id, ''])),
      })
      setAfterHabits(normalizeHabits(fieldsToValues(beforeFields, defaultHabits()).habits))
      return
    }
    if (!userId) return
    localStore.setUserId(userId)
    const log = localStore.getOrCreateDailyLog(today)
    const loaded = loadTodayShutdownValues(
      log,
      getDraft(today),
      localStore.getWorkouts(today, today),
      today,
    )
    setBeforeFields(valuesToFields(withDefaultWorkouts(loaded.before)))
    setAfterFields(valuesToFields(withDefaultWorkouts(loaded.after)))
    setAfterHabits(normalizeHabits(loaded.after.habits))
  }

  const resetValues = () => {
    setBeforeFields(valuesToFields(withDefaultWorkouts(DEFAULT_SHUTDOWN_BEFORE)))
    setAfterFields(valuesToFields(withDefaultWorkouts(DEFAULT_SHUTDOWN_AFTER)))
    setAfterHabits(normalizeHabits({}))
  }

  const toggleAfterHabit = (habitId: string) => {
    setAfterHabits((prev) => ({ ...prev, [habitId]: !prev[habitId] }))
  }

  const previewReminders: Reminder[] = [
    {
      id: 'dev-reminder-1',
      user_id: userId ?? 'preview',
      title: 'Preview reminder',
      due_date: today,
      due_time: null,
      completed: false,
      rescheduled_from: null,
      kind: 'task',
      created_at: new Date().toISOString(),
    },
  ]

  const shutdownPreviewWorkouts = getContext()?.workoutsBefore ?? []

  return (
    <>
      <SettingsSection
        title="Daily shutdown"
        description="Preview shutdown and progress summary with custom before/after daily log and workout values. Nothing is saved."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <MetricColumn
            title="Before shutdown"
            fields={beforeFields}
            workoutTypes={workoutTypes}
            workoutsSectionLabel="Logged before shutdown"
            focusLabel="Focus logged before shutdown"
            onChange={setBeforeFields}
          />
          <MetricColumn
            title="At shutdown"
            fields={afterFields}
            workoutTypes={workoutTypes}
            workoutsSectionLabel="Add at shutdown"
            focusLabel="Add focus at shutdown"
            onChange={setAfterFields}
          />
        </div>

        {dailyHabits.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-400">Habits completed after shutdown</p>
            <div className="flex flex-wrap gap-2">
              {dailyHabits.map((habit) => {
                const done = afterHabits[habit.id]
                return (
                  <button
                    key={habit.id}
                    type="button"
                    onClick={() => toggleAfterHabit(habit.id)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs transition-colors',
                      done
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600',
                    )}
                  >
                    {habit.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => applyPreset('progress')}>
            Good day preset
          </Button>
          <Button variant="secondary" size="sm" onClick={() => applyPreset('flat')}>
            No change preset
          </Button>
          <Button variant="secondary" size="sm" onClick={() => applyPreset('today')}>
            Load from today
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={runProgressPreview} disabled={!userId}>
            <Play size={14} />
            Preview progress summary
          </Button>
          <Button variant="secondary" size="sm" onClick={openShutdownPreview} disabled={!userId}>
            <Moon size={14} />
            Preview shutdown flow
          </Button>
          <Button variant="secondary" size="sm" onClick={resetValues}>
            <FlaskConical size={14} />
            Reset values
          </Button>
        </div>
      </SettingsSection>

      {showShutdown && shutdownLog && userId && (
        <ShutdownModal
          log={shutdownLog}
          goals={getGoals()}
          workouts={shutdownPreviewWorkouts}
          streakLogs={getPreviewStreakLogs(
            localStore.getDailyLogs(formatDate(addDays(parseISO(today), -400)), today),
            today,
          )}
          viewDate={today}
          tomorrowDate={tomorrow}
          reminders={previewReminders}
          userId={userId}
          todayBlocks={previewTodayBlocks}
          tomorrowBlocks={previewTomorrowBlocks}
          onUpdateTomorrowBlock={async (block) => {
            const normalized = await persistScheduleBlock({ ...block, date: tomorrow })
            setPreviewTomorrowBlocks((prev) => {
              const idx = prev.findIndex((b) => b.id === normalized.id)
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = normalized
                return next
              }
              return [...prev, normalized]
            })
          }}
          onDeleteTomorrowBlock={async (id) => {
            await removeScheduleBlock(id)
            setPreviewTomorrowBlocks((prev) => prev.filter((b) => b.id !== id))
          }}
          onCreateTomorrowBlock={async (block) => {
            const normalized = await persistScheduleBlock({ ...block, date: tomorrow })
            setPreviewTomorrowBlocks((prev) => [...prev, normalized])
          }}
          onPasteTodaySchedule={async () => {
            if (previewTodayBlocks.length === 0) return
            for (const block of previewTomorrowBlocks) {
              await removeScheduleBlock(block.id)
            }
            const copies = cloneScheduleBlocksForDate(previewTodayBlocks, tomorrow, userId)
            const saved: ScheduleBlock[] = []
            for (const block of copies) {
              saved.push(await persistScheduleBlock(block))
            }
            setPreviewTomorrowBlocks(saved)
          }}
          onApplyScheduleTemplate={async (template) => {
            const { scheduleBlocksFromTemplate } = await import('@/lib/scheduleTemplates')
            const { replaceScheduleBlocksForDate } = await import('@/lib/scheduleBlock')
            const next = scheduleBlocksFromTemplate(template, tomorrow, userId)
            const saved = await replaceScheduleBlocksForDate(previewTomorrowBlocks, next)
            setPreviewTomorrowBlocks(saved)
          }}
          onClose={closeShutdownPreview}
          onComplete={completeShutdownPreview}
          onCompleteReminder={() => undefined}
        />
      )}

      {previewProgress && (
        <GoalProgressModal
          deltas={previewProgress.deltas}
          untrackedFocusMinutes={previewProgress.untrackedFocusMinutes}
          completedHabits={previewProgress.completedHabits}
          title="Day complete!"
          subtitle="Developer preview — here's how today moved your goals"
          buttonLabel="Close preview"
          onClose={() => setPreviewProgress(null)}
        />
      )}
    </>
  )
}

function defaultHabits() {
  return normalizeHabits({})
}
