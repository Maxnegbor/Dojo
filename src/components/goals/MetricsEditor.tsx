import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Trash2, Check, X, ChevronDown, History, Brain, Moon, Repeat, Scale, Dumbbell, Shapes } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SlidingNavList } from '@/components/ui/SlidingNavList'
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl'
import { Card } from '@/components/ui/Card'
import { MetricInput } from '@/components/ui/MetricInput'
import { DurationMetricInput } from '@/components/ui/DurationMetricInput'
import { HabitMetricsReorderList } from '@/components/goals/HabitMetricsReorderList'
import { AddGhostCard } from '@/components/goals/AddGhostCard'
import { EditLogsModal } from '@/components/goals/EditLogsModal'
import { MetricHistoryModal } from '@/components/goals/MetricHistoryModal'
import type { MetricHistoryTarget } from '@/lib/metricHistory'
import { SleepMetricTemplatePicker } from '@/components/goals/SleepMetricTemplatePicker'
import { ToggleRow } from '@/components/settings/SettingsControls'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { DatePickerField } from '@/components/ui/DatePickerField'
import type { Goal, GoalPeriod, GoalTargetPeriod, MetricKey } from '@/types'
import {
  defaultUnitForMetric,
  getActiveGoalByMetricKey,
  goalLogPeriod,
  goalLogWhen,
  goalMorningDay,
  hasTarget,
  normalizeGoal,
  type GoalLogWhen,
  type GoalMorningDay,
} from '@/lib/goals'
import {
  addDays,
  buildGoalPeriodFields,
  formValuesFromPeriodDays,
  formatGoalScheduleLabel,
  goalTargetPeriod,
  periodDaysFromForm,
  targetPeriodLabel,
} from '@/lib/goalPeriod'
import {
  habitLogPeriod,
  habitLogWhen,
  habitMorningDay,
  saveHabitTypes,
  slugifyHabitId,
  useHabitTypes,
  type HabitTypeDefinition,
  type HabitRampConfig,
  type HabitLogWhen,
  type HabitMorningDay,
} from '@/lib/habitTypes'
import {
  formatHabitRampTarget,
  normalizeHabitRamp,
} from '@/lib/habitRamp'
import {
  clearFocusGoalInSettings,
  formatFocusGoalTarget,
  goalToFocusGoalFormValues,
  saveFocusGoal,
} from '@/lib/focusGoalSync'
import {
  formatGoalTargetLabel,
  METRIC_UNIT_OPTIONS,
  usesTimedMetricInput,
} from '@/lib/timedMetrics'
import { getFocusSettings, saveFocusSettings } from '@/lib/focusStore'
import {
  WORKOUT_COLOR_PRESETS,
  WORKOUT_UNIT_OPTIONS,
  DEFAULT_WORKOUT_UNIT,
  getWorkoutTypes,
  normalizeWorkoutUnit,
  saveWorkoutTypes,
  slugifyWorkoutId,
  workoutGoalUnitLabel,
  workoutLogWhen,
  workoutLogPeriod,
  workoutMetricKey,
  workoutMorningDay,
  type WorkoutTypeDefinition,
  type WorkoutLogWhen,
  type WorkoutMorningDay,
} from '@/lib/workoutTypes'
import { cn, generateId, formatDate } from '@/lib/utils'
import { displayToKg, kgToDisplay } from '@/lib/settingsStore'
import { formatWeightGoalRange, formatWeightGoalDateRange, getActiveWeightGoal, getDuplicateActiveWeightGoals, isWeightGoal, weightGoalMode, weightGoalModeLabel, type WeightGoalMode } from '@/lib/weightGoal'
import {
  getMorningLogGoalKeys,
  getMorningLogYesterdayKeys,
  pruneMorningLogAssignments,
  removeSleepFieldFromMorningLog,
  saveMorningLogGoalKeys,
  saveMorningLogSleepFieldIds,
  saveMorningLogYesterdayKeys,
} from '@/lib/morningLogConfig'
import {
  pruneShutdownLogAssignments,
  removeSleepFieldFromShutdownLog,
  getShutdownLogGoalKeys,
  saveShutdownLogGoalKeys,
  saveShutdownLogSleepFieldIds,
} from '@/lib/shutdownLogConfig'
import { useSettings } from '@/context/SettingsContext'
import {
  DEFAULT_GOAL_CATEGORY_ID,
  DEFAULT_GOAL_CATEGORY_LABEL,
  getCustomGoalCategories,
  isDefaultGoalCategory,
  resolveGoalCategoryId,
  saveCustomGoalCategories,
  type GoalCategoryDefinition,
} from '@/lib/goalCategories'
import {
  BUILTIN_METRICS_SECTIONS,
  METRICS_SECTIONS_CHANGED,
  disableMetricsSection,
  enableMetricsSection,
  getAvailableMetricTemplates,
  getEnabledMetricsSections,
  getVisibleGoalCategories,
} from '@/lib/metricsSections'
import {
  sleepMetricDisplayUnit,
  sleepMetricSupportsTarget,
  sleepMetricTargetFromInputValue,
  sleepMetricTargetInputUnit,
  sleepMetricTargetToInputValue,
  isClockSleepMetric,
  formatSleepMetricDisplay,
  getEnabledSleepMetrics,
  getSleepMetricTarget,
  removeCustomSleepMetric,
  setSleepMetricTarget,
  toggleSleepMetric,
  type SleepMetricDefinition,
} from '@/lib/sleepMetrics'

type MetricKind = 'habit' | 'goal' | 'workout' | 'weight' | 'focus' | 'sleep'
type MetricsSection = 'habits' | 'sleep' | 'focus' | 'weight' | 'workouts' | string
type CustomPeriodMode = 'duration' | 'date'

interface MetricsEditorProps {
  goals: Goal[]
  userId: string
  onSaveGoal: (goal: Goal) => void
  onDeleteGoal: (goal: Goal) => void
}

type PendingMetricDelete =
  | { kind: 'goal'; id: string }
  | { kind: 'workout'; id: string }
  | { kind: 'habit'; id: string }

function MetricDeleteConfirmInline({
  name,
  onConfirm,
  onCancel,
}: {
  name: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <p className="text-xs leading-relaxed text-red-300">
        Delete <span className="font-medium text-zinc-100">{name}</span>? All logged data for this
        metric will be permanently lost.
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm}>
          Delete
        </Button>
      </div>
    </div>
  )
}

interface MetricFormState {
  mode: 'add' | 'edit'
  kind: MetricKind
  categoryId: string
  habitId?: string
  goalId?: string
  workoutId?: string
  name: string
  logPeriod: GoalPeriod
  habitLogWhen: HabitLogWhen
  habitMorningDay: HabitMorningDay
  goalLogWhen: GoalLogWhen
  goalMorningDay: GoalMorningDay
  workoutLogWhen: WorkoutLogWhen
  workoutMorningDay: WorkoutMorningDay
  /** Comma-separated plan subtitles (e.g. Push, Pull, Legs). */
  workoutSubtypes: string
  targetPeriod: GoalTargetPeriod
  customPeriodMode: CustomPeriodMode
  periodAmount: string
  periodUnit: 'days' | 'weeks'
  periodEndDate: string
  periodRecurring: boolean
  setTarget: boolean
  targetValue: string
  unit: string
  color: string
  weightMode: WeightGoalMode
  weightStart: string
  weightTarget: string
  weightStartDate: string
  weightTargetDate: string
  rampEnabled: boolean
  rampStartValue: string
  rampTargetValue: string
  rampStepValue: string
  rampIntervalStreakDays: string
  rampUnit: string
  rampLevel: number
  habitDurationEnabled: boolean
  habitDurationValue: string
  habitDurationUnit: string
  focusUnit: 'hours' | 'minutes'
}

function goalKeyFromName(name: string): MetricKey {
  return `custom:${slugifyWorkoutId(name)}` as MetricKey
}

function SegmentPicker<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <SlidingSegmentedControl
        className="min-w-0 flex-1"
        value={value}
        options={options}
        onChange={onChange}
      />
    </div>
  )
}

function PeriodPicker({
  value,
  onChange,
  label,
}: {
  value: GoalPeriod
  onChange: (period: GoalPeriod) => void
  label: string
}) {
  return (
    <SegmentPicker
      label={label}
      value={value}
      onChange={onChange}
      options={[
        { value: 'daily', label: 'daily' },
        { value: 'weekly', label: 'weekly' },
      ]}
    />
  )
}

function applyCustomPeriodMode(
  form: MetricFormState,
  customPeriodMode: CustomPeriodMode,
): MetricFormState {
  const today = formatDate(new Date())
  return {
    ...form,
    customPeriodMode,
    targetPeriod: customPeriodMode === 'date' ? 'custom_date' : 'custom_duration',
    periodEndDate:
      customPeriodMode === 'date' && !form.periodEndDate
        ? addDays(today, 13)
        : form.periodEndDate,
  }
}

function applyTargetPeriod(form: MetricFormState, targetPeriod: GoalTargetPeriod): MetricFormState {
  if (targetPeriod === 'custom_date') return applyCustomPeriodMode(form, 'date')
  if (targetPeriod === 'custom_duration') return applyCustomPeriodMode(form, 'duration')
  return { ...form, targetPeriod }
}

function TargetPeriodPicker({
  value,
  onChange,
  customMode,
  onCustomModeChange,
  periodAmount,
  onPeriodAmountChange,
  periodUnit,
  onPeriodUnitChange,
  periodEndDate,
  onPeriodEndDateChange,
}: {
  value: GoalTargetPeriod
  onChange: (period: GoalTargetPeriod) => void
  customMode: CustomPeriodMode
  onCustomModeChange: (mode: CustomPeriodMode) => void
  periodAmount: string
  onPeriodAmountChange: (amount: string) => void
  periodUnit: 'days' | 'weeks'
  onPeriodUnitChange: (unit: 'days' | 'weeks') => void
  periodEndDate: string
  onPeriodEndDateChange: (date: string) => void
}) {
  const isCustom = value === 'custom_duration' || value === 'custom_date'
  const showDatePicker = value === 'custom_date'
  const customModeValue = showDatePicker ? 'date' : 'duration'

  const selectCustomMode = (mode: CustomPeriodMode) => {
    onCustomModeChange(mode)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Target
        </span>
        <SlidingSegmentedControl
          className="min-w-0 flex-1"
          value={isCustom ? 'custom' : value}
          options={[
            { value: 'daily', label: 'daily' },
            { value: 'weekly', label: 'weekly' },
            { value: 'custom', label: 'custom' },
          ]}
          onChange={(next) => {
            if (next === 'custom') {
              onChange(customMode === 'date' ? 'custom_date' : 'custom_duration')
              return
            }
            onChange(next)
          }}
        />
      </div>

      {isCustom && (
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
          <SlidingSegmentedControl
            value={customModeValue}
            options={[
              { value: 'duration', label: 'Duration' },
              { value: 'date', label: 'By date' },
            ]}
            onChange={(mode) => selectCustomMode(mode)}
          />

          {showDatePicker ? (
            <DatePickerField
              value={periodEndDate}
              onChange={onPeriodEndDateChange}
              minDate={formatDate(new Date())}
              placeholder="Pick end date"
            />
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-1.5">
              <input
                type="number"
                min={1}
                value={periodAmount}
                onChange={(e) => onPeriodAmountChange(e.target.value)}
                placeholder="2"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none"
              />
              <SlidingSegmentedControl
                value={periodUnit}
                options={[
                  { value: 'days', label: 'days' },
                  { value: 'weeks', label: 'weeks' },
                ]}
                onChange={onPeriodUnitChange}
                className="gap-0 rounded-md border border-zinc-700 bg-zinc-900 p-0"
                buttonClassName="px-2 py-1.5 text-[10px] flex-none"
                equalWidth={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function targetLabelForForm(form: MetricFormState): string {
  if (form.targetPeriod === 'custom_duration') {
    const amount = parseFloat(form.periodAmount)
    if (!Number.isNaN(amount) && amount > 0) {
      return targetPeriodLabel('custom_duration', {
        periodDays: periodDaysFromForm(amount, form.periodUnit),
      })
    }
    return 'custom'
  }
  if (form.targetPeriod === 'custom_date' && form.periodEndDate) {
    return targetPeriodLabel('custom_date', { periodEndDate: form.periodEndDate })
  }
  return form.targetPeriod
}

function periodFieldsFromForm(
  form: MetricFormState,
  existing?: Goal,
): Pick<Goal, 'log_period' | 'target_period' | 'period_days' | 'period_start_date' | 'period_end_date' | 'period_recurring'> {
  if (!form.setTarget) {
    return buildGoalPeriodFields({ targetPeriod: 'daily', logPeriod: 'daily' })
  }

  const logPeriod = form.logPeriod
  const periodRecurring = form.periodRecurring

  if (form.targetPeriod === 'custom_duration') {
    const amount = parseFloat(form.periodAmount)
    return buildGoalPeriodFields({
      targetPeriod: 'custom_duration',
      logPeriod,
      periodRecurring,
      periodDays: periodDaysFromForm(amount, form.periodUnit),
      periodStartDate: existing?.period_start_date,
      createdAt: existing?.created_at,
    })
  }

  if (form.targetPeriod === 'custom_date') {
    return buildGoalPeriodFields({
      targetPeriod: 'custom_date',
      logPeriod,
      periodRecurring,
      periodStartDate: existing?.period_start_date,
      periodEndDate: form.periodEndDate,
      createdAt: existing?.created_at,
    })
  }

  return buildGoalPeriodFields({ targetPeriod: form.targetPeriod, logPeriod })
}

function goalToFormPeriod(goal: Goal): Pick<
  MetricFormState,
  'targetPeriod' | 'customPeriodMode' | 'periodAmount' | 'periodUnit' | 'periodEndDate' | 'periodRecurring'
> {
  const targetPeriod = goalTargetPeriod(goal)
  const periodRecurring = goal.period_recurring ?? false
  if (targetPeriod === 'custom_date') {
    return {
      targetPeriod,
      customPeriodMode: 'date',
      periodAmount: '2',
      periodUnit: 'weeks',
      periodEndDate: goal.period_end_date ?? '',
      periodRecurring,
    }
  }
  if (targetPeriod === 'custom_duration' && goal.period_days) {
    const { amount, unit } = formValuesFromPeriodDays(goal.period_days)
    return {
      targetPeriod,
      customPeriodMode: 'duration',
      periodAmount: amount,
      periodUnit: unit,
      periodEndDate: '',
      periodRecurring,
    }
  }
  return {
    targetPeriod: targetPeriod === 'weekly' ? 'weekly' : 'daily',
    customPeriodMode: 'duration',
    periodAmount: '2',
    periodUnit: 'weeks',
    periodEndDate: '',
    periodRecurring: false,
  }
}

function GoalCategoryPicker({
  value,
  categories,
  open,
  onOpenChange,
  onChange,
}: {
  value: string
  categories: GoalCategoryDefinition[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (categoryId: string) => void
}) {
  const selected =
    categories.find((category) => category.id === value) ??
    categories.find((category) => category.id === DEFAULT_GOAL_CATEGORY_ID) ??
    categories[0]

  return (
    <div>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition-colors',
          'border-[var(--accent-500)]/40 bg-[var(--accent-950)] text-[var(--accent-300)] hover:border-[var(--accent-500)]/70',
        )}
        aria-expanded={open}
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Category</span>
        <span>{selected?.label ?? 'Custom'}</span>
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                onChange(category.id)
                onOpenChange(false)
              }}
              className={cn(
                'rounded-md border px-2 py-0.5 text-[11px] transition-colors',
                value === category.id
                  ? 'border-[var(--accent-500)] bg-[var(--accent-950)] text-[var(--accent-300)]'
                  : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
              )}
            >
              {category.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function WeightModePicker({
  value,
  onChange,
}: {
  value: WeightGoalMode
  onChange: (mode: WeightGoalMode) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        Goal
      </span>
      <SlidingSegmentedControl
        className="min-w-0 flex-1"
        value={value}
        options={[
          { value: 'bulk', label: 'Bulk' },
          { value: 'cut', label: 'Cut' },
          { value: 'maintain', label: 'Maintain' },
        ]}
        onChange={onChange}
      />
    </div>
  )
}

const METRIC_TEMPLATE_ICONS = {
  habits: Repeat,
  sleep: Moon,
  focus: Brain,
  weight: Scale,
  workouts: Dumbbell,
  default: Shapes,
} as const

function emptyForm(
  kind: MetricKind = 'goal',
  mode: 'add' | 'edit' = 'add',
  categoryId: string = DEFAULT_GOAL_CATEGORY_ID,
): MetricFormState {
  const today = formatDate(new Date())
  return {
    mode,
    kind,
    categoryId,
    name: kind === 'weight' ? 'Weight' : kind === 'focus' ? 'Focus' : kind === 'sleep' ? 'Sleep' : '',
    logPeriod: kind === 'weight' ? 'weekly' : 'daily',
    habitLogWhen: 'home',
    habitMorningDay: 'today',
    goalLogWhen: 'home',
    goalMorningDay: 'today',
    workoutLogWhen: 'home',
    workoutMorningDay: 'today',
    workoutSubtypes: '',
    targetPeriod: kind === 'workout' ? 'weekly' : 'daily',
    customPeriodMode: 'duration',
    periodAmount: '2',
    periodUnit: 'weeks',
    periodEndDate: '',
    periodRecurring: false,
    setTarget: kind !== 'habit',
    targetValue: kind === 'focus' ? '1' : kind === 'sleep' ? '8' : '',
    unit: kind === 'workout' ? 'min' : kind === 'weight' ? 'kg' : kind === 'sleep' ? 'hrs' : '',
    color: WORKOUT_COLOR_PRESETS[0],
    weightMode: 'bulk',
    weightStart: '',
    weightTarget: '',
    weightStartDate: kind === 'weight' ? today : '',
    weightTargetDate: kind === 'weight' ? addDays(today, 84) : '',
    rampEnabled: false,
    rampStartValue: '5',
    rampTargetValue: '30',
    rampStepValue: '5',
    rampIntervalStreakDays: '7',
    rampUnit: 'min',
    rampLevel: 0,
    habitDurationEnabled: false,
    habitDurationValue: '',
    habitDurationUnit: 'min',
    focusUnit: 'hours',
  }
}

function habitDurationFromForm(form: MetricFormState): Pick<HabitTypeDefinition, 'duration_value' | 'duration_unit'> | undefined {
  if (!form.habitDurationEnabled) return undefined
  const value = parseFloat(form.habitDurationValue)
  if (Number.isNaN(value) || value <= 0) return undefined
  return {
    duration_value: value,
    duration_unit: form.habitDurationUnit.trim() || 'min',
  }
}

function isValidHabitDurationForm(form: MetricFormState): boolean {
  if (!form.habitDurationEnabled) return true
  return habitDurationFromForm(form) != null
}

function habitRampFromForm(form: MetricFormState): HabitRampConfig | undefined {
  if (!form.rampEnabled) return undefined

  return normalizeHabitRamp({
    enabled: true,
    start_value: parseFloat(form.rampStartValue),
    target_value: parseFloat(form.rampTargetValue),
    step_value: parseFloat(form.rampStepValue),
    interval_streak_days: parseFloat(form.rampIntervalStreakDays),
    level: form.rampLevel,
    unit: form.rampUnit.trim() || 'min',
  })
}

function isValidHabitRampForm(form: MetricFormState): boolean {
  if (!form.rampEnabled) return true
  return habitRampFromForm(form) != null
}

function applyHabitDurationFields(habit: HabitTypeDefinition, form: MetricFormState): HabitTypeDefinition {
  const duration = habitDurationFromForm(form)
  if (duration) {
    habit.duration_value = duration.duration_value
    habit.duration_unit = duration.duration_unit
  } else {
    delete habit.duration_value
    delete habit.duration_unit
  }
  return habit
}

function goalAskFieldsFromForm(
  form: MetricFormState,
): Pick<Goal, 'log_when' | 'morning_day'> | { log_when?: undefined; morning_day?: undefined } {
  const logPeriod = form.setTarget ? form.logPeriod : 'daily'
  if (logPeriod !== 'daily') {
    return { log_when: undefined, morning_day: undefined }
  }
  return {
    log_when: form.goalLogWhen,
    morning_day: form.goalLogWhen === 'morning' ? form.goalMorningDay : undefined,
  }
}

function buildHabitFields(form: MetricFormState): HabitTypeDefinition {
  const ramp = habitRampFromForm(form)
  const habit: HabitTypeDefinition = {
    id: form.habitId ?? '',
    label: form.name.trim(),
    log_period: form.logPeriod,
  }
  if (form.logPeriod === 'daily') {
    habit.log_when = form.habitLogWhen
    if (form.habitLogWhen === 'morning') {
      habit.morning_day = form.habitMorningDay
    }
  }
  if (ramp) habit.ramp = ramp
  return applyHabitDurationFields(habit, form)
}

function applyHabitFormFields(
  existing: HabitTypeDefinition,
  form: MetricFormState,
): HabitTypeDefinition {
  const ramp = habitRampFromForm(form)
  const next: HabitTypeDefinition = {
    ...existing,
    label: form.name.trim(),
    log_period: form.logPeriod,
  }
  if (form.logPeriod === 'daily') {
    next.log_when = form.habitLogWhen
    if (form.habitLogWhen === 'morning') {
      next.morning_day = form.habitMorningDay
    } else {
      delete next.morning_day
    }
  } else {
    delete next.log_when
    delete next.morning_day
  }
  if (ramp) {
    next.ramp = ramp
  } else {
    delete next.ramp
  }
  return applyHabitDurationFields(next, form)
}

export function MetricsEditor({
  goals,
  userId,
  onSaveGoal,
  onDeleteGoal,
}: MetricsEditorProps) {
  const { settings, updateSettings } = useSettings()
  const { config: sleepMetricsConfig, saveConfig: saveSleepMetricsConfig } = useSleepMetricsConfig()

  useEffect(() => {
    pruneMorningLogAssignments(goals, sleepMetricsConfig)
    pruneShutdownLogAssignments(goals, sleepMetricsConfig)
  }, [goals, sleepMetricsConfig])

  const migratedSleepTargetRef = useRef(false)
  const showWorkouts = settings.showWorkoutMetrics
  const today = formatDate(new Date())
  const habits = useHabitTypes()
  const [workoutTypes, setWorkoutTypes] = useState<WorkoutTypeDefinition[]>(() => getWorkoutTypes())
  const [goalCategories, setGoalCategories] = useState<GoalCategoryDefinition[]>(() =>
    getVisibleGoalCategories(),
  )
  const [enabledSections, setEnabledSections] = useState<string[]>(() =>
    getEnabledMetricsSections(),
  )
  const [form, setForm] = useState<MetricFormState | null>(null)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [sectionDeleteConfirm, setSectionDeleteConfirm] = useState<MetricsSection | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingMetricDelete | null>(null)
  const [editLogsOpen, setEditLogsOpen] = useState(false)
  const [historyTarget, setHistoryTarget] = useState<MetricHistoryTarget | null>(null)
  const [editingSleepMetricId, setEditingSleepMetricId] = useState<string | null>(null)
  const [addingSleepMetric, setAddingSleepMetric] = useState(false)
  const [activeSection, setActiveSection] = useState<MetricsSection>('habits')

  const customGoals = goals.filter(
    (g) =>
      !g.metric_key.startsWith('workout_') &&
      !isWeightGoal(g) &&
      g.metric_key !== 'sleep' &&
      g.metric_key !== 'focus',
  )
  const activeWeightGoal = getActiveWeightGoal(goals)
  const activeSleepGoal = getActiveGoalByMetricKey(goals, 'sleep')
  const activeFocusGoal = getActiveGoalByMetricKey(goals, 'focus')

  const refreshWorkouts = useCallback(() => setWorkoutTypes(getWorkoutTypes()), [])
  const refreshCategories = useCallback(() => setGoalCategories(getVisibleGoalCategories()), [])
  const refreshEnabledSections = useCallback(
    () => setEnabledSections(getEnabledMetricsSections()),
    [],
  )

  useEffect(() => {
    const refresh = () => {
      refreshEnabledSections()
      refreshCategories()
    }
    window.addEventListener(METRICS_SECTIONS_CHANGED, refresh)
    return () => window.removeEventListener(METRICS_SECTIONS_CHANGED, refresh)
  }, [refreshCategories, refreshEnabledSections])

  useEffect(() => {
    if (migratedSleepTargetRef.current) return
    const goal = activeSleepGoal
    if (!goal || !hasTarget(goal) || goal.target_value == null) {
      migratedSleepTargetRef.current = true
      return
    }
    if (getSleepMetricTarget(sleepMetricsConfig, 'sleep_duration') != null) {
      migratedSleepTargetRef.current = true
      return
    }
    migratedSleepTargetRef.current = true
    let next = sleepMetricsConfig
    if (!next.enabledIds.includes('sleep_duration')) {
      next = toggleSleepMetric(next, 'sleep_duration', true)
    }
    saveSleepMetricsConfig(setSleepMetricTarget(next, 'sleep_duration', goal.target_value * 60))
  }, [activeSleepGoal, sleepMetricsConfig, saveSleepMetricsConfig])

  const goalsForCategory = (categoryId: string) =>
    customGoals.filter((g) => resolveGoalCategoryId(g.category_id) === categoryId)

  const persistCategories = (custom: GoalCategoryDefinition[]) => {
    saveCustomGoalCategories(custom)
    refreshCategories()
  }

  const renameCategory = (categoryId: string, label: string) => {
    const trimmed = label.trim()
    if (!trimmed || isDefaultGoalCategory(categoryId)) return
    persistCategories(
      getCustomGoalCategories().map((c) =>
        c.id === categoryId ? { ...c, label: trimmed } : c,
      ),
    )
  }

  const workoutGoal = (typeId: string) =>
    getActiveGoalByMetricKey(goals, workoutMetricKey(typeId))

  const closeForm = () => {
    setForm(null)
    setCategoryPickerOpen(false)
  }

  const isPendingDelete = (kind: PendingMetricDelete['kind'], id: string) =>
    pendingDelete?.kind === kind && pendingDelete.id === id

  const requestDelete = (entry: PendingMetricDelete) => {
    closeForm()
    setPendingDelete(entry)
  }

  const openAddHabit = () => {
    setForm(emptyForm('habit', 'add'))
  }

  const openAddWeight = () => {
    setForm(emptyForm('weight', 'add'))
  }

  const openAddFocus = () => {
    setForm(emptyForm('focus', 'add'))
  }

  const openAdd = (categoryId: string = DEFAULT_GOAL_CATEGORY_ID) => {
    setForm(emptyForm('goal', 'add', categoryId))
    setCategoryPickerOpen(false)
  }

  const openAddWorkout = () => {
    setForm(emptyForm('workout', 'add'))
  }

  const openMetricHistory = (target: MetricHistoryTarget) => {
    setHistoryTarget(target)
    setEditingSleepMetricId(null)
  }

  const openEditHabit = (habit: HabitTypeDefinition) => {
    setForm({
      ...emptyForm('habit', 'edit'),
      habitId: habit.id,
      name: habit.label,
      logPeriod: habitLogPeriod(habit),
      habitLogWhen: habitLogWhen(habit),
      habitMorningDay: habitMorningDay(habit),
      setTarget: false,
      rampEnabled: habit.ramp?.enabled ?? false,
      rampStartValue: habit.ramp ? String(habit.ramp.start_value) : '5',
      rampTargetValue: habit.ramp ? String(habit.ramp.target_value) : '30',
      rampStepValue: habit.ramp ? String(habit.ramp.step_value) : '5',
      rampIntervalStreakDays: habit.ramp
        ? String(habit.ramp.interval_streak_days ?? habit.ramp.interval_days ?? 7)
        : '7',
      rampUnit: habit.ramp?.unit ?? 'min',
      rampLevel: habit.ramp?.level ?? 0,
      habitDurationEnabled: habit.duration_value != null && habit.duration_value > 0,
      habitDurationValue:
        habit.duration_value != null && habit.duration_value > 0
          ? String(habit.duration_value)
          : '',
      habitDurationUnit: habit.duration_unit ?? 'min',
    })
  }

  const openEditWeight = (goal: Goal) => {
    const unit = settings.weightUnit
    setForm({
      ...emptyForm('weight', 'edit'),
      goalId: goal.id,
      unit,
      logPeriod: goalLogPeriod(goal),
      goalLogWhen: goalLogWhen(goal),
      goalMorningDay: goalMorningDay(goal),
      weightMode: weightGoalMode(goal),
      weightStart:
        goal.goal_weight_start != null
          ? String(kgToDisplay(goal.goal_weight_start, unit))
          : '',
      weightTarget:
        goal.goal_weight_target != null
          ? String(kgToDisplay(goal.goal_weight_target, unit))
          : '',
      weightStartDate: goal.period_start_date ?? formatDate(new Date()),
      weightTargetDate:
        goal.period_end_date ?? addDays(formatDate(new Date()), 84),
    })
  }

  const openEditGoal = (goal: Goal) => {
    if (goal.metric_key === 'focus') {
      const values = goalToFocusGoalFormValues(goal)
      setCategoryPickerOpen(false)
      setForm({
        ...emptyForm('focus', 'edit'),
        goalId: goal.id,
        name: 'Focus',
        logPeriod: values.period,
        targetValue: String(values.amount),
        focusUnit: values.unit,
        setTarget: true,
      })
      return
    }

    if (goal.metric_key === 'sleep') {
      setCategoryPickerOpen(false)
      setForm({
        ...emptyForm('sleep', 'edit'),
        goalId: goal.id,
        name: 'Sleep',
        logPeriod: goalLogPeriod(goal),
        ...goalToFormPeriod(goal),
        setTarget: hasTarget(goal),
        targetValue: goal.target_value != null ? String(goal.target_value) : '8',
        unit: goal.unit || 'hrs',
        goalLogWhen: goalLogWhen(goal),
        goalMorningDay: goalMorningDay(goal),
      })
      return
    }

    setCategoryPickerOpen(false)
    setForm({
      ...emptyForm('goal', 'edit', resolveGoalCategoryId(goal.category_id)),
      goalId: goal.id,
      name: goal.name,
      logPeriod: goalLogPeriod(goal),
      goalLogWhen: goalLogWhen(goal),
      goalMorningDay: goalMorningDay(goal),
      ...goalToFormPeriod(goal),
      setTarget: hasTarget(goal),
      targetValue: goal.target_value != null ? String(goal.target_value) : '',
      unit: goal.unit,
    })
  }

  const openEditWorkout = (type: WorkoutTypeDefinition) => {
    const goal = workoutGoal(type.id)
    const logPeriod =
      goal && hasTarget(goal) ? goalLogPeriod(goal) : workoutLogPeriod(type)
    setForm({
      ...emptyForm('workout', 'edit'),
      workoutId: type.id,
      name: type.label,
      logPeriod,
      ...(goal ? goalToFormPeriod(goal) : { targetPeriod: 'weekly' as GoalTargetPeriod }),
      setTarget: goal ? hasTarget(goal) : false,
      targetValue: goal?.target_value != null ? String(goal.target_value) : '',
      unit: normalizeWorkoutUnit(goal?.unit || type.unit),
      color: type.color,
      workoutLogWhen: logPeriod === 'weekly' ? 'home' : workoutLogWhen(type),
      workoutMorningDay: workoutMorningDay(type),
      workoutSubtypes: (type.subtypes ?? []).join(', '),
    })
  }

  const persistHabit = (next: HabitTypeDefinition[]) => {
    saveHabitTypes(next)
  }

  const persistWorkoutTypes = (next: WorkoutTypeDefinition[]) => {
    saveWorkoutTypes(next)
    refreshWorkouts()
  }

  const saveWorkoutGoal = (
    typeId: string,
    label: string,
    setTarget: boolean,
    targetRaw: string,
    formState: MetricFormState,
    existingGoal?: Goal,
  ) => {
    const existing = existingGoal ?? workoutGoal(typeId)
    const value = parseFloat(targetRaw)
    const unit = normalizeWorkoutUnit(formState.unit || DEFAULT_WORKOUT_UNIT)

    if (!setTarget || !targetRaw.trim() || Number.isNaN(value) || value <= 0) {
      if (existing) onDeleteGoal(existing)
      return
    }

    onSaveGoal(
      normalizeGoal({
        id: existing?.id ?? generateId(),
        user_id: userId,
        metric_key: workoutMetricKey(typeId),
        name: label,
        target_value: value,
        ...periodFieldsFromForm(formState, existing),
        goal_weight_start: null,
        goal_weight_target: null,
        unit,
        is_active: true,
        created_at: existing?.created_at ?? new Date().toISOString(),
      }),
    )
  }

  const handleSave = async () => {
    if (!form) return
    const name = form.name.trim()
    if (!name && form.kind !== 'weight' && form.kind !== 'focus' && form.kind !== 'sleep') return

    if (form.kind === 'focus') {
      const parsed = parseFloat(form.targetValue)
      if (Number.isNaN(parsed) || parsed <= 0) return
      const amount =
        form.focusUnit === 'hours'
          ? Math.min(12, Math.max(1, Math.round(parsed)))
          : Math.min(480, Math.max(1, Math.round(parsed)))
      await handleSaveFocusGoal({
        period: form.logPeriod,
        amount,
        unit: form.focusUnit,
      })
      closeForm()
      return
    }

    if (form.kind === 'habit') {
      if (!isValidHabitRampForm(form)) return
      if (!isValidHabitDurationForm(form)) return

      if (form.mode === 'edit' && form.habitId) {
        persistHabit(
          habits.map((h) =>
            h.id === form.habitId
              ? applyHabitFormFields(h, form)
              : h,
          ),
        )
      } else {
        let id = slugifyHabitId(name)
        let n = 2
        while (habits.some((h) => h.id === id)) {
          id = `${slugifyHabitId(name)}_${n}`
          n++
        }
        const created = buildHabitFields(form)
        persistHabit([...habits, { ...created, id }])
      }
      closeForm()
      return
    }

    if (form.kind === 'sleep') {
      const value = form.setTarget ? parseFloat(form.targetValue) : null
      if (form.setTarget && (value == null || Number.isNaN(value) || value <= 0)) return

      const existing =
        form.mode === 'edit' && form.goalId
          ? goals.find((g) => g.id === form.goalId)
          : activeSleepGoal

      const nextSleep: Goal = {
        id: existing?.id ?? generateId(),
        user_id: userId,
        metric_key: 'sleep',
        name: 'Sleep',
        target_value: form.setTarget ? value : null,
        ...periodFieldsFromForm(form, existing),
        goal_weight_start: null,
        goal_weight_target: null,
        unit: 'hrs',
        is_active: true,
        created_at: existing?.created_at ?? new Date().toISOString(),
      }
      delete nextSleep.log_when
      delete nextSleep.morning_day
      if (form.logPeriod === 'daily') {
        nextSleep.log_when = form.goalLogWhen
        if (form.goalLogWhen === 'morning') nextSleep.morning_day = form.goalMorningDay
      }

      onSaveGoal(normalizeGoal(nextSleep))
      closeForm()
      return
    }

    if (form.kind === 'goal') {
      const value = form.setTarget ? parseFloat(form.targetValue) : null
      if (form.setTarget && (value == null || Number.isNaN(value))) return

      const askFields = goalAskFieldsFromForm(form)

      if (form.mode === 'edit' && form.goalId) {
        const existing = goals.find((g) => g.id === form.goalId)
        if (!existing) return
        const nextGoal: Goal = {
          ...existing,
          name,
          ...periodFieldsFromForm(form, existing),
          target_value: form.setTarget ? value : null,
          unit: form.unit.trim() || existing.unit,
          category_id:
            form.categoryId === DEFAULT_GOAL_CATEGORY_ID ? null : form.categoryId,
        }
        delete nextGoal.log_when
        delete nextGoal.morning_day
        if (askFields.log_when) {
          nextGoal.log_when = askFields.log_when
          if (askFields.morning_day) nextGoal.morning_day = askFields.morning_day
        }
        onSaveGoal(normalizeGoal(nextGoal))
      } else {
        const resolvedKey = goalKeyFromName(name)
        const nextGoal: Goal = {
          id: generateId(),
          user_id: userId,
          metric_key: resolvedKey,
          name,
          target_value: form.setTarget ? value : null,
          ...periodFieldsFromForm(form),
          goal_weight_start: null,
          goal_weight_target: null,
          unit: form.unit.trim() || defaultUnitForMetric(resolvedKey),
          category_id:
            form.categoryId === DEFAULT_GOAL_CATEGORY_ID ? null : form.categoryId,
          is_active: true,
          created_at: new Date().toISOString(),
        }
        if (askFields.log_when) {
          nextGoal.log_when = askFields.log_when
          if (askFields.morning_day) nextGoal.morning_day = askFields.morning_day
        }
        onSaveGoal(normalizeGoal(nextGoal))
      }
      closeForm()
      return
    }

    if (form.kind === 'weight') {
      const unit = settings.weightUnit
      const startDisplay = parseFloat(form.weightStart)
      const targetDisplay = parseFloat(form.weightTarget)
      if (form.weightMode === 'maintain') {
        if (Number.isNaN(targetDisplay) || targetDisplay <= 0) return
      } else if (
        Number.isNaN(startDisplay) ||
        startDisplay <= 0 ||
        Number.isNaN(targetDisplay) ||
        targetDisplay <= 0
      ) {
        return
      }
      if (form.weightMode === 'bulk' && targetDisplay <= startDisplay) return
      if (form.weightMode === 'cut' && targetDisplay >= startDisplay) return

      const startKg =
        form.weightMode === 'maintain'
          ? displayToKg(targetDisplay, unit)
          : displayToKg(startDisplay, unit)
      const targetKg =
        form.weightMode === 'maintain'
          ? displayToKg(targetDisplay, unit)
          : displayToKg(targetDisplay, unit)
      const existing = form.mode === 'edit' && form.goalId
        ? goals.find((g) => g.id === form.goalId)
        : activeWeightGoal

      const savedWeightGoal = normalizeGoal({
        id: existing?.id ?? generateId(),
        user_id: userId,
        metric_key: 'weight',
        name: 'Weight',
        target_value: null,
        log_period: form.logPeriod,
        ...(form.logPeriod === 'daily'
          ? {
              log_when: form.goalLogWhen,
              ...(form.goalLogWhen === 'morning'
                ? { morning_day: form.goalMorningDay }
                : {}),
            }
          : {}),
        goal_weight_start: startKg,
        goal_weight_target: targetKg,
        period_start_date: form.weightStartDate,
        period_end_date: form.weightTargetDate,
        unit,
        is_active: true,
        created_at: existing?.created_at ?? new Date().toISOString(),
      })
      onSaveGoal(savedWeightGoal)
      // Weekly weight can't live on the morning log — clear any leftover assignment.
      if (form.logPeriod === 'weekly') {
        saveMorningLogGoalKeys(getMorningLogGoalKeys().filter((key) => key !== 'weight'))
        saveMorningLogYesterdayKeys(
          getMorningLogYesterdayKeys().filter((key) => key !== 'weight'),
        )
      }
      // Only one weight campaign should be active — retire stale duplicates.
      for (const duplicate of getDuplicateActiveWeightGoals(goals, savedWeightGoal.id)) {
        onSaveGoal({ ...duplicate, is_active: false })
      }
      closeForm()
      return
    }

    if (form.kind === 'workout') {
      if (form.setTarget) {
        const value = parseFloat(form.targetValue)
        if (Number.isNaN(value) || value <= 0) return
      }

      const logPeriod = form.setTarget ? form.logPeriod : 'daily'
      const askFields =
        logPeriod === 'weekly'
          ? { log_period: 'weekly' as const }
          : {
              log_period: 'daily' as const,
              log_when: form.workoutLogWhen,
              ...(form.workoutLogWhen === 'morning'
                ? { morning_day: form.workoutMorningDay }
                : {}),
            }
      const subtypes = form.workoutSubtypes
        .split(/[,;\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 12)

      if (form.mode === 'edit' && form.workoutId) {
        const unit = normalizeWorkoutUnit(form.unit || DEFAULT_WORKOUT_UNIT)
        const updated = workoutTypes.map((t) =>
          t.id === form.workoutId
            ? {
                ...t,
                label: name,
                unit,
                ...askFields,
                subtypes: subtypes.length > 0 ? subtypes : undefined,
              }
            : t,
        )
        persistWorkoutTypes(updated)
        saveWorkoutGoal(form.workoutId, name, form.setTarget, form.targetValue, form, workoutGoal(form.workoutId))
      } else {
        let id = slugifyWorkoutId(name)
        let n = 2
        while (workoutTypes.some((t) => t.id === id)) {
          id = `${slugifyWorkoutId(name)}_${n}`
          n++
        }
        const unit = normalizeWorkoutUnit(form.unit || DEFAULT_WORKOUT_UNIT)

        persistWorkoutTypes([
          ...workoutTypes,
          {
            id,
            label: name,
            color: WORKOUT_COLOR_PRESETS[0],
            unit,
            ...askFields,
            ...(subtypes.length > 0 ? { subtypes } : {}),
          },
        ])
        saveWorkoutGoal(id, name, form.setTarget, form.targetValue, form)
      }
      closeForm()
    }
  }

  const deleteHabit = (habit: HabitTypeDefinition) => {
    if (habits.length <= 1) return
    persistHabit(habits.filter((h) => h.id !== habit.id))
    setPendingDelete(null)
  }

  const deleteWorkout = (type: WorkoutTypeDefinition) => {
    const goal = workoutGoal(type.id)
    if (goal) onDeleteGoal(goal)
    persistWorkoutTypes(workoutTypes.filter((t) => t.id !== type.id))
    setPendingDelete(null)
  }

  const deleteFocusGoal = (goal: Goal) => {
    onDeleteGoal(goal)
    clearFocusGoalInSettings()
    setPendingDelete(null)
  }

  const deleteGoalInSection = (goal: Goal) => {
    if (goal.metric_key === 'focus') {
      deleteFocusGoal(goal)
    } else {
      onDeleteGoal(goal)
      saveMorningLogGoalKeys(getMorningLogGoalKeys().filter((key) => key !== goal.metric_key))
      saveMorningLogYesterdayKeys(
        getMorningLogYesterdayKeys().filter((key) => key !== goal.metric_key),
      )
      saveShutdownLogGoalKeys(getShutdownLogGoalKeys().filter((key) => key !== goal.metric_key))
      setPendingDelete(null)
    }
  }

  const sectionItemCount = (sectionId: MetricsSection): number => {
    switch (sectionId) {
      case 'habits':
        return habits.length
      case 'sleep':
        return sleepMetricsConfig.enabledIds.length
      case 'focus':
        return activeFocusGoal ? 1 : 0
      case 'weight':
        return goals.filter(isWeightGoal).length
      case 'workouts':
        return workoutTypes.length
      case DEFAULT_GOAL_CATEGORY_ID:
        return goalsForCategory(DEFAULT_GOAL_CATEGORY_ID).length
      default:
        return goalsForCategory(sectionId).length
    }
  }

  const executeDeleteSection = (sectionId: MetricsSection) => {
    closeForm()
    setSectionDeleteConfirm(null)
    setEditingCategoryId(null)

    switch (sectionId) {
      case 'habits':
        persistHabit([])
        break
      case 'sleep':
        if (activeSleepGoal) deleteGoalInSection(activeSleepGoal)
        saveSleepMetricsConfig({
          ...sleepMetricsConfig,
          enabledIds: [],
          customMetrics: [],
          targets: {},
        })
        saveMorningLogSleepFieldIds([])
        saveShutdownLogSleepFieldIds([])
        break
      case 'focus':
        if (activeFocusGoal) deleteFocusGoal(activeFocusGoal)
        break
      case 'weight':
        goals.filter(isWeightGoal).forEach(deleteGoalInSection)
        break
      case 'workouts':
        [...workoutTypes].forEach(deleteWorkout)
        updateSettings({ showWorkoutMetrics: false })
        break
      case DEFAULT_GOAL_CATEGORY_ID:
        goalsForCategory(DEFAULT_GOAL_CATEGORY_ID).forEach(deleteGoalInSection)
        break
      default:
        goalsForCategory(sectionId).forEach(deleteGoalInSection)
        if (!isDefaultGoalCategory(sectionId)) {
          persistCategories(getCustomGoalCategories().filter((c) => c.id !== sectionId))
        }
        break
    }

    disableMetricsSection(sectionId)
    refreshEnabledSections()
    refreshCategories()

    const remaining = getEnabledMetricsSections()
    if (activeSection === sectionId || !remaining.includes(activeSection)) {
      setActiveSection((remaining[0] as MetricsSection | undefined) ?? 'habits')
    }
  }

  const handleSaveFocusGoal = async (values: Parameters<typeof saveFocusGoal>[2]) => {
    const { settings: next, goal } = await saveFocusGoal(userId, getFocusSettings(), values)
    saveFocusSettings(next)
    onSaveGoal(goal)
  }

  const handleFocusUnitChange = (nextUnit: 'hours' | 'minutes') => {
    if (!form || form.kind !== 'focus' || nextUnit === form.focusUnit) return
    const parsed = parseFloat(form.targetValue)
    if (nextUnit === 'hours') {
      const hrs = Number.isFinite(parsed)
        ? Math.max(1, Math.min(12, Math.round(parsed / 60) || 1))
        : 1
      setForm({ ...form, focusUnit: 'hours', targetValue: String(hrs) })
      return
    }
    const mins = Number.isFinite(parsed)
      ? Math.max(1, Math.min(480, Math.round(parsed * 60)))
      : 60
    setForm({ ...form, focusUnit: 'minutes', targetValue: String(mins) })
  }

  const renderGoalCard = (goal: Goal) => {
    const isTimerFocusGoal = goal.metric_key === 'focus'
    const isEditing =
      (form?.kind === 'goal' || form?.kind === 'focus' || form?.kind === 'sleep') &&
      form.goalId === goal.id

    if (isEditing) {
      return renderInlineFormCard(goal.id)
    }

    if (isPendingDelete('goal', goal.id)) {
      return (
        <Card key={goal.id} className="border-red-900/40 bg-red-950/20">
          <MetricDeleteConfirmInline
            name={goal.name}
            onCancel={() => setPendingDelete(null)}
            onConfirm={() =>
              isTimerFocusGoal ? deleteFocusGoal(goal) : deleteGoalInSection(goal)
            }
          />
        </Card>
      )
    }

    return (
      <Card key={goal.id} onClick={() => openMetricHistory({ kind: 'goal', goalId: goal.id })}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-zinc-200">{goal.name}</h3>
            <p className="text-[10px] text-zinc-500">
              {formatGoalScheduleLabel(goal, today)}
              {hasTarget(goal) && goal.target_value != null
                ? ` · ${isTimerFocusGoal ? formatFocusGoalTarget(goal.target_value) : formatGoalTargetLabel(goal.target_value, goal.unit, goal.metric_key)}`
                : ' · track only'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openEditGoal(goal)
              }}
              className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
              aria-label={`Edit ${goal.name} settings`}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                requestDelete({ kind: 'goal', id: goal.id })
              }}
              className="rounded-lg p-1.5 text-zinc-600 hover:text-red-400"
              aria-label={`Delete ${goal.name}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </Card>
    )
  }

  const renderWorkoutCard = (type: WorkoutTypeDefinition) => {
    const goal = workoutGoal(type.id)
    const isEditing = form?.kind === 'workout' && form.workoutId === type.id

    if (isEditing) {
      return renderInlineFormCard(type.id)
    }

    if (isPendingDelete('workout', type.id)) {
      return (
        <Card key={type.id} className="border-red-900/40 bg-red-950/20">
          <MetricDeleteConfirmInline
            name={type.label}
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => deleteWorkout(type)}
          />
        </Card>
      )
    }

    return (
      <Card
        key={type.id}
        onClick={() => openMetricHistory({ kind: 'workout', workoutTypeId: type.id })}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-[var(--accent-500)]" />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-zinc-200">{type.label}</h3>
              <p className="text-[10px] text-zinc-500">
                {goal && hasTarget(goal)
                  ? `${formatGoalScheduleLabel(goal, today)} · ${goal.target_value} ${workoutGoalUnitLabel(goal.unit || type.unit, goalLogPeriod(goal))}`
                  : `${type.unit || DEFAULT_WORKOUT_UNIT} · track only`}
                {type.subtypes && type.subtypes.length > 0
                  ? ` · ${type.subtypes.join(' / ')}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openEditWorkout(type)
              }}
              className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
              aria-label={`Edit ${type.label} settings`}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                requestDelete({ kind: 'workout', id: type.id })
              }}
              className="rounded-lg p-1.5 text-zinc-600 hover:text-red-400"
              aria-label={`Delete ${type.label}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </Card>
    )
  }

  const renderWeightCard = (goal: Goal) => {
    const unit = settings.weightUnit
    const mode = weightGoalMode(goal)
    const range =
      goal.goal_weight_start != null && goal.goal_weight_target != null
        ? formatWeightGoalRange(goal.goal_weight_start, goal.goal_weight_target, unit)
        : null
    const dateRange = formatWeightGoalDateRange(goal)
    const isEditing = form?.kind === 'weight' && form.goalId === goal.id

    if (isEditing) {
      return renderInlineFormCard(goal.id)
    }

    if (isPendingDelete('goal', goal.id)) {
      return (
        <Card key={goal.id} className="border-red-900/40 bg-red-950/20">
          <MetricDeleteConfirmInline
            name="Weight"
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => deleteGoalInSection(goal)}
          />
        </Card>
      )
    }

    return (
      <Card key={goal.id} onClick={() => openMetricHistory({ kind: 'weight', goalId: goal.id })}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {weightGoalModeLabel(mode)} goal · {goalLogPeriod(goal) === 'daily' ? 'daily' : 'weekly'}
            </p>
            {range && (
              <p className="mt-1 text-lg font-semibold tabular-nums leading-tight text-zinc-100">
                {range}
              </p>
            )}
            {dateRange && (
              <p className="mt-0.5 text-[10px] text-zinc-500">{dateRange}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openEditWeight(goal)
              }}
              className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
              aria-label="Edit weight goal settings"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                requestDelete({ kind: 'goal', id: goal.id })
              }}
              className="rounded-lg p-1.5 text-zinc-600 hover:text-red-400"
              aria-label="Delete weight goal"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </Card>
    )
  }

  const canSaveForm = (() => {
    if (!form) return false
    if (form.kind === 'weight') {
      const start = parseFloat(form.weightStart)
      const target = parseFloat(form.weightTarget)
      if (Number.isNaN(target) || target <= 0) return false
      if (!form.weightStartDate.trim() || !form.weightTargetDate.trim()) return false
      if (form.weightStartDate >= form.weightTargetDate) return false
      if (form.weightMode === 'maintain') return true
      if (Number.isNaN(start) || start <= 0) return false
      if (form.weightMode === 'bulk') return target > start
      if (form.weightMode === 'cut') return target < start
      return false
    }
    if (form.kind === 'focus') {
      const v = parseFloat(form.targetValue)
      return !Number.isNaN(v) && v > 0
    }
    if (form.kind === 'sleep') {
      if (!form.setTarget) return true
      const v = parseFloat(form.targetValue)
      return !Number.isNaN(v) && v > 0
    }
    if (
      (form.kind === 'habit' || form.kind === 'goal' || form.kind === 'workout') &&
      !form.name.trim()
    ) {
      return false
    }
    if (form.kind === 'habit') {
      if (!isValidHabitRampForm(form)) return false
      if (!isValidHabitDurationForm(form)) return false
      return true
    }
    if (form.kind === 'goal' || form.kind === 'workout') {
      if (!form.setTarget) return true
      const v = parseFloat(form.targetValue)
      if (Number.isNaN(v) || v <= 0) return false
      if (form.targetPeriod === 'custom_duration') {
        const amount = parseFloat(form.periodAmount)
        return !Number.isNaN(amount) && amount > 0
      }
      if (form.targetPeriod === 'custom_date') {
        return form.periodEndDate.trim().length > 0
      }
      return true
    }
    return false
  })()

  const navItems = useMemo((): { id: MetricsSection; label: string }[] => {
    const items: { id: MetricsSection; label: string }[] = []
    const enabled = new Set(enabledSections)

    if (enabled.has('habits')) {
      items.push({ id: 'habits', label: 'Habits' })
    }

    if (enabled.has('sleep')) {
      items.push({ id: 'sleep', label: 'Sleep' })
    }

    if (enabled.has('focus')) {
      items.push({ id: 'focus', label: 'Focus' })
    }

    if (enabled.has('weight')) {
      items.push({ id: 'weight', label: 'Weight Goal' })
    }

    if (enabled.has('workouts') && showWorkouts) {
      items.push({ id: 'workouts', label: 'Workouts' })
    }

    for (const category of goalCategories) {
      if (!isDefaultGoalCategory(category.id) && enabled.has(category.id)) {
        items.push({ id: category.id, label: category.label })
      }
    }

    if (enabled.has('default')) {
      items.push({ id: 'default', label: DEFAULT_GOAL_CATEGORY_LABEL })
    }

    return items
  }, [enabledSections, goalCategories, showWorkouts])

  const activeNavLabel =
    navItems.find((item) => item.id === activeSection)?.label ?? 'Metrics'

  useEffect(() => {
    if (navItems.length === 0) return
    if (!navItems.some((item) => item.id === activeSection)) {
      setActiveSection(navItems[0].id)
    }
  }, [navItems, activeSection])

  useEffect(() => {
    setForm(null)
    setCategoryPickerOpen(false)
    setSectionDeleteConfirm(null)
    setAddingSleepMetric(false)
  }, [activeSection])

  const isAddingInSection =
    !!form &&
    form.mode === 'add' &&
    ((activeSection === 'habits' && form.kind === 'habit') ||
      (activeSection === 'sleep' && form.kind === 'sleep') ||
      (activeSection === 'focus' && form.kind === 'focus') ||
      (activeSection === 'weight' && form.kind === 'weight') ||
      (activeSection === 'workouts' && form.kind === 'workout') ||
      (form.kind === 'goal' && form.categoryId === activeSection))

  const renderInlineForm = () => {
    if (!form) return null

    return (
      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
        {form.kind === 'workout' && (
          <MetricInput
            compact
            label="Name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. HIIT, Zone 2"
          />
        )}

        {form.kind !== 'workout' && form.kind !== 'weight' && form.kind !== 'focus' && form.kind !== 'sleep' && (
          <MetricInput
            compact
            label="Name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={
              form.kind === 'habit'
                ? 'e.g. Meditation, Skincare'
                : 'e.g. Reading, Protein'
            }
          />
        )}

        {form.kind === 'goal' && (
          <GoalCategoryPicker
            value={form.categoryId}
            categories={goalCategories}
            open={categoryPickerOpen}
            onOpenChange={setCategoryPickerOpen}
            onChange={(categoryId) => setForm({ ...form, categoryId })}
          />
        )}

        {form.kind === 'focus' && (
          <>
            <PeriodPicker
              label="Period"
              value={form.logPeriod}
              onChange={(logPeriod) => setForm({ ...form, logPeriod })}
            />
            <div className="grid grid-cols-2 gap-1.5">
              <MetricInput
                compact
                label="Target"
                type="number"
                min={1}
                max={form.focusUnit === 'hours' ? 12 : 480}
                step={1}
                value={form.targetValue}
                onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                placeholder={form.focusUnit === 'hours' ? '2' : '90'}
              />
              <div>
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Unit
                </span>
                <SlidingSegmentedControl
                  className="w-full"
                  value={form.focusUnit}
                  options={[
                    { value: 'hours', label: 'Hours' },
                    { value: 'minutes', label: 'Minutes' },
                  ]}
                  onChange={handleFocusUnitChange}
                />
              </div>
            </div>
            <p className="text-[10px] leading-snug text-zinc-500">
              Tracked automatically from your focus timer sessions.
            </p>
          </>
        )}

        {form.kind === 'sleep' && (
          <>
            <PeriodPicker
              label="Log"
              value={form.logPeriod}
              onChange={(logPeriod) =>
                setForm({
                  ...form,
                  logPeriod,
                  goalLogWhen: logPeriod === 'weekly' ? 'home' : form.goalLogWhen,
                })
              }
            />
            <ToggleRow
              label="Set target"
              description="Compare nightly sleep against a goal"
              checked={form.setTarget}
              compact
              onChange={(setTarget) => setForm({ ...form, setTarget })}
            />
            {form.setTarget && (
              <MetricInput
                compact
                label="Target"
                unit="hrs"
                step="0.5"
                value={form.targetValue}
                onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                placeholder="8"
              />
            )}
            {form.logPeriod === 'daily' && (
              <>
                <SegmentPicker
                  label="Ask in"
                  value={form.goalLogWhen}
                  onChange={(goalLogWhen) => setForm({ ...form, goalLogWhen })}
                  options={[
                    { value: 'home', label: 'Home' },
                    { value: 'morning', label: 'Morning' },
                    { value: 'shutdown', label: 'Shutdown' },
                  ]}
                />
                {form.goalLogWhen === 'morning' && (
                  <SegmentPicker
                    label="For"
                    value={form.goalMorningDay}
                    onChange={(goalMorningDay) => setForm({ ...form, goalMorningDay })}
                    options={[
                      { value: 'today', label: 'Today' },
                      { value: 'yesterday', label: 'Yesterday' },
                    ]}
                  />
                )}
                <p className="text-[10px] leading-snug text-zinc-500">
                  {form.goalLogWhen === 'home' &&
                    'Sleep hours can also be logged on Home when configured.'}
                  {form.goalLogWhen === 'morning' &&
                    (form.goalMorningDay === 'yesterday'
                      ? 'Asked in the morning log for yesterday’s sleep.'
                      : 'Asked in the morning log for last night’s sleep.')}
                  {form.goalLogWhen === 'shutdown' &&
                    'Asked during evening shutdown.'}
                </p>
              </>
            )}
            {form.logPeriod === 'weekly' && (
              <p className="text-[10px] leading-snug text-zinc-500">
                Weekly sleep is reviewed at weekly shutdown.
              </p>
            )}
          </>
        )}

        {form.kind === 'weight' && (
          <>
            <WeightModePicker
              value={form.weightMode}
              onChange={(weightMode) => {
                if (weightMode === 'maintain' && form.weightStart) {
                  setForm({ ...form, weightMode, weightTarget: form.weightStart })
                  return
                }
                setForm({ ...form, weightMode })
              }}
            />
            {form.weightMode === 'maintain' ? (
              <MetricInput
                compact
                label="Maintain at"
                unit={settings.weightUnit}
                value={form.weightTarget}
                onChange={(e) =>
                  setForm({ ...form, weightTarget: e.target.value, weightStart: e.target.value })
                }
                placeholder="e.g. 80"
              />
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                <MetricInput
                  compact
                  label="Starting weight"
                  unit={settings.weightUnit}
                  value={form.weightStart}
                  onChange={(e) => setForm({ ...form, weightStart: e.target.value })}
                  placeholder="e.g. 80"
                />
                <MetricInput
                  compact
                  label={form.weightMode === 'bulk' ? 'Goal (gain to)' : 'Goal (cut to)'}
                  unit={settings.weightUnit}
                  value={form.weightTarget}
                  onChange={(e) => setForm({ ...form, weightTarget: e.target.value })}
                  placeholder={form.weightMode === 'bulk' ? 'e.g. 85' : 'e.g. 75'}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <DatePickerField
                allowPast
                placeholder="Start date"
                value={form.weightStartDate}
                onChange={(weightStartDate) => setForm({ ...form, weightStartDate })}
              />
              <DatePickerField
                placeholder="Target date"
                value={form.weightTargetDate}
                minDate={form.weightStartDate}
                onChange={(weightTargetDate) => setForm({ ...form, weightTargetDate })}
              />
            </div>
            <PeriodPicker
              label="Log"
              value={form.logPeriod}
              onChange={(logPeriod) =>
                setForm({
                  ...form,
                  logPeriod,
                  goalLogWhen: logPeriod === 'weekly' ? 'home' : form.goalLogWhen,
                })
              }
            />
            {form.logPeriod === 'daily' ? (
              <>
                <SegmentPicker
                  label="Ask in"
                  value={form.goalLogWhen}
                  onChange={(goalLogWhen) => setForm({ ...form, goalLogWhen })}
                  options={[
                    { value: 'home', label: 'Home' },
                    { value: 'morning', label: 'Morning' },
                    { value: 'shutdown', label: 'Shutdown' },
                  ]}
                />
                {form.goalLogWhen === 'morning' && (
                  <SegmentPicker
                    label="For"
                    value={form.goalMorningDay}
                    onChange={(goalMorningDay) => setForm({ ...form, goalMorningDay })}
                    options={[
                      { value: 'today', label: 'Today' },
                      { value: 'yesterday', label: 'Yesterday' },
                    ]}
                  />
                )}
                <p className="text-[10px] leading-snug text-zinc-500">
                  Daily weigh-ins. Weekly shutdown won&apos;t ask for weight.
                </p>
              </>
            ) : (
              <p className="text-[10px] leading-snug text-zinc-500">
                Log once at weekly shutdown. Can&apos;t also be on the morning log — each week
                compares last week&apos;s weight to this week&apos;s against your bulk, cut, or
                maintain goal.
              </p>
            )}
          </>
        )}

        {form.kind === 'habit' && (
          <>
            <PeriodPicker
              label="Log"
              value={form.logPeriod}
              onChange={(logPeriod) =>
                setForm({
                  ...form,
                  logPeriod,
                  habitLogWhen: logPeriod === 'weekly' ? 'home' : form.habitLogWhen,
                })
              }
            />
            {form.logPeriod === 'daily' && (
              <>
                <SegmentPicker
                  label="Ask in"
                  value={form.habitLogWhen}
                  onChange={(habitLogWhen) => setForm({ ...form, habitLogWhen })}
                  options={[
                    { value: 'home', label: 'Home' },
                    { value: 'morning', label: 'Morning' },
                    { value: 'shutdown', label: 'Shutdown' },
                  ]}
                />
                {form.habitLogWhen === 'morning' && (
                  <SegmentPicker
                    label="For"
                    value={form.habitMorningDay}
                    onChange={(habitMorningDay) => setForm({ ...form, habitMorningDay })}
                    options={[
                      { value: 'today', label: 'Today' },
                      { value: 'yesterday', label: 'Yesterday' },
                    ]}
                  />
                )}
                <p className="text-[10px] leading-snug text-zinc-500">
                  {form.habitLogWhen === 'home' &&
                    'Shows in Habits on the homepage throughout the day.'}
                  {form.habitLogWhen === 'morning' &&
                    (form.habitMorningDay === 'yesterday'
                      ? 'Asked in the morning log for yesterday’s value.'
                      : 'Asked in the morning log for today’s value.')}
                  {form.habitLogWhen === 'shutdown' &&
                    'Asked during evening shutdown.'}
                </p>
              </>
            )}
            <ToggleRow
              label="Target units"
              description="Optional target amount for this habit"
              checked={form.habitDurationEnabled}
              compact
              onChange={(habitDurationEnabled) => setForm({ ...form, habitDurationEnabled })}
            />
            {form.habitDurationEnabled && (
              <div className="grid grid-cols-2 gap-1.5">
                <MetricInput
                  compact
                  label="Target"
                  unit={form.habitDurationUnit || 'min'}
                  value={form.habitDurationValue}
                  onChange={(e) => setForm({ ...form, habitDurationValue: e.target.value })}
                  placeholder="10"
                />
                <MetricInput
                  compact
                  label="Unit"
                  type="text"
                  value={form.habitDurationUnit}
                  onChange={(e) => setForm({ ...form, habitDurationUnit: e.target.value })}
                  placeholder="min"
                />
              </div>
            )}
            <ToggleRow
              label="Ramping goal"
              description="Level up after a streak of days, capped at Build to"
              checked={form.rampEnabled}
              compact
              onChange={(rampEnabled) => setForm({ ...form, rampEnabled })}
            />
            {form.rampEnabled && (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  <MetricInput
                    compact
                    label="Start at"
                    unit={form.rampUnit || 'min'}
                    value={form.rampStartValue}
                    onChange={(e) => setForm({ ...form, rampStartValue: e.target.value })}
                    placeholder="5"
                  />
                  <MetricInput
                    compact
                    label="Build to"
                    unit={form.rampUnit || 'min'}
                    value={form.rampTargetValue}
                    onChange={(e) => setForm({ ...form, rampTargetValue: e.target.value })}
                    placeholder="30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <MetricInput
                    compact
                    label="Increase by"
                    unit={form.rampUnit || 'min'}
                    value={form.rampStepValue}
                    onChange={(e) => setForm({ ...form, rampStepValue: e.target.value })}
                    placeholder="5"
                  />
                  <MetricInput
                    compact
                    label="Every"
                    unit="streak days"
                    value={form.rampIntervalStreakDays}
                    onChange={(e) =>
                      setForm({ ...form, rampIntervalStreakDays: e.target.value })
                    }
                    placeholder="7"
                  />
                </div>
                <MetricInput
                  compact
                  label="Unit"
                  type="text"
                  value={form.rampUnit}
                  onChange={(e) => setForm({ ...form, rampUnit: e.target.value })}
                  placeholder="min"
                />
                {isValidHabitRampForm(form) && (
                  <p className="text-[10px] leading-snug text-zinc-500">
                    Current target:{' '}
                    <span className="text-[var(--accent-300)]">
                      {formatHabitRampTarget({
                        id: 'preview',
                        label: form.name.trim() || 'Habit',
                        ramp: habitRampFromForm(form),
                      }) ?? '—'}
                    </span>
                    {' · '}
                    level {form.rampLevel}. Increases every {form.rampIntervalStreakDays || '—'}{' '}
                    day streak. Never goes above Build to. Still check off when done.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {form.kind === 'goal' && (
          <>
            <ToggleRow
              label="Set a target"
              checked={form.setTarget}
              compact
              onChange={(setTarget) =>
                setForm({
                  ...form,
                  setTarget,
                  targetPeriod: setTarget ? form.targetPeriod : 'daily',
                  logPeriod: setTarget ? form.logPeriod : 'daily',
                })
              }
            />
            {form.setTarget && (
              <div className="space-y-1.5">
                <TargetPeriodPicker
                  value={form.targetPeriod}
                  onChange={(targetPeriod) => setForm(applyTargetPeriod(form, targetPeriod))}
                  customMode={form.customPeriodMode}
                  onCustomModeChange={(customPeriodMode) =>
                    setForm(applyCustomPeriodMode(form, customPeriodMode))
                  }
                  periodAmount={form.periodAmount}
                  onPeriodAmountChange={(periodAmount) => setForm({ ...form, periodAmount })}
                  periodUnit={form.periodUnit}
                  onPeriodUnitChange={(periodUnit) => setForm({ ...form, periodUnit })}
                  periodEndDate={form.periodEndDate}
                  onPeriodEndDateChange={(periodEndDate) =>
                    setForm({ ...form, periodEndDate })
                  }
                />
                <PeriodPicker
                  label="Log"
                  value={form.logPeriod}
                  onChange={(logPeriod) =>
                    setForm({
                      ...form,
                      logPeriod,
                      goalLogWhen: logPeriod === 'weekly' ? 'home' : form.goalLogWhen,
                    })
                  }
                />
                {(form.targetPeriod === 'custom_duration' ||
                  form.targetPeriod === 'custom_date') && (
                  <ToggleRow
                    label="Recurring"
                    description="Start a new period when this one ends"
                    checked={form.periodRecurring}
                    compact
                    onChange={(periodRecurring) => setForm({ ...form, periodRecurring })}
                  />
                )}
              </div>
            )}
            {(!form.setTarget || form.logPeriod === 'daily') && (
              <>
                <SegmentPicker
                  label="Ask in"
                  value={form.goalLogWhen}
                  onChange={(goalLogWhen) => setForm({ ...form, goalLogWhen })}
                  options={[
                    { value: 'home', label: 'Home' },
                    { value: 'morning', label: 'Morning' },
                    { value: 'shutdown', label: 'Shutdown' },
                  ]}
                />
                {form.goalLogWhen === 'morning' && (
                  <SegmentPicker
                    label="For"
                    value={form.goalMorningDay}
                    onChange={(goalMorningDay) => setForm({ ...form, goalMorningDay })}
                    options={[
                      { value: 'today', label: 'Today' },
                      { value: 'yesterday', label: 'Yesterday' },
                    ]}
                  />
                )}
                <p className="text-[10px] leading-snug text-zinc-500">
                  {form.goalLogWhen === 'home' &&
                    'Shows with daily metrics on the homepage.'}
                  {form.goalLogWhen === 'morning' &&
                    (form.goalMorningDay === 'yesterday'
                      ? 'Asked in the morning log for yesterday’s value.'
                      : 'Asked in the morning log for today’s value.')}
                  {form.goalLogWhen === 'shutdown' &&
                    'Asked during evening shutdown.'}
                </p>
              </>
            )}
            {form.setTarget && form.logPeriod === 'weekly' && (
              <p className="text-[10px] leading-snug text-zinc-500">
                Weekly log entries are entered at weekly shutdown.
              </p>
            )}
            {form.setTarget && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  {usesTimedMetricInput(form.unit) ? (
                    <DurationMetricInput
                      compact
                      label={`Target (${targetLabelForForm(form)})`}
                      value={form.targetValue ? parseFloat(form.targetValue) : null}
                      onChange={(minutes) =>
                        setForm({
                          ...form,
                          targetValue: minutes != null ? String(minutes) : '',
                        })
                      }
                    />
                  ) : (
                    <MetricInput
                      compact
                      label={`Target (${targetLabelForForm(form)})`}
                      value={form.targetValue}
                      onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                    />
                  )}
                  <div>
                    <MetricInput
                      compact
                      label="Unit"
                      type="text"
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      placeholder="hrs, min, hrs:min, kg"
                    />
                    <div className="mt-1 flex flex-wrap gap-1">
                      {METRIC_UNIT_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setForm({ ...form, unit: option })}
                          className={cn(
                            'rounded-md border px-1.5 py-0.5 text-[9px] transition-colors',
                            form.unit === option
                              ? 'border-[var(--accent-500)]/50 bg-[var(--accent-500)]/10 text-[var(--accent-300)]'
                              : 'border-zinc-700/60 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
                          )}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!form.setTarget && (
              <div className="grid grid-cols-2 gap-1.5">
                <MetricInput
                  compact
                  label="Unit"
                  type="text"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="hrs, min, hrs:min, kg"
                />
                <div className="flex flex-wrap content-end gap-1 pb-0.5">
                  {METRIC_UNIT_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setForm({ ...form, unit: option })}
                      className={cn(
                        'rounded-md border px-1.5 py-0.5 text-[9px] transition-colors',
                        form.unit === option
                          ? 'border-[var(--accent-500)]/50 bg-[var(--accent-500)]/10 text-[var(--accent-300)]'
                          : 'border-zinc-700/60 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {form.kind === 'workout' && (
          <>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Tracking unit
              </p>
              <div className="mb-1.5">
                <MetricInput
                  compact
                  label="Unit"
                  type="text"
                  value={form.unit || DEFAULT_WORKOUT_UNIT}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="min, km, cal…"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {WORKOUT_UNIT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setForm({ ...form, unit: option })}
                    className={cn(
                      'rounded-md border px-1.5 py-0.5 text-[9px] transition-colors',
                      normalizeWorkoutUnit(form.unit) === option
                        ? 'border-[var(--accent-500)]/50 bg-[var(--accent-500)]/10 text-[var(--accent-300)]'
                        : 'border-zinc-700/60 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <MetricInput
              compact
              label="Subcategories"
              type="text"
              value={form.workoutSubtypes}
              onChange={(e) => setForm({ ...form, workoutSubtypes: e.target.value })}
              placeholder="e.g. Push, Pull, Legs"
            />
            <p className="-mt-1 text-[10px] leading-snug text-zinc-500">
              Optional. Comma-separated. Home planner and the weekly exercise template ask you to pick
              one after choosing this workout.
            </p>
            <ToggleRow
              label="Set a target"
              checked={form.setTarget}
              compact
              onChange={(setTarget) =>
                setForm({
                  ...form,
                  setTarget,
                  targetPeriod: setTarget ? form.targetPeriod : 'daily',
                })
              }
            />
            {form.setTarget && (
              <div className="space-y-1.5">
                <TargetPeriodPicker
                  value={form.targetPeriod}
                  onChange={(targetPeriod) => setForm(applyTargetPeriod(form, targetPeriod))}
                  customMode={form.customPeriodMode}
                  onCustomModeChange={(customPeriodMode) =>
                    setForm(applyCustomPeriodMode(form, customPeriodMode))
                  }
                  periodAmount={form.periodAmount}
                  onPeriodAmountChange={(periodAmount) => setForm({ ...form, periodAmount })}
                  periodUnit={form.periodUnit}
                  onPeriodUnitChange={(periodUnit) => setForm({ ...form, periodUnit })}
                  periodEndDate={form.periodEndDate}
                  onPeriodEndDateChange={(periodEndDate) =>
                    setForm({ ...form, periodEndDate })
                  }
                />
                <PeriodPicker
                  label="Log"
                  value={form.logPeriod}
                  onChange={(logPeriod) =>
                    setForm({
                      ...form,
                      logPeriod,
                      workoutLogWhen: logPeriod === 'weekly' ? 'home' : form.workoutLogWhen,
                    })
                  }
                />
                {(form.targetPeriod === 'custom_duration' ||
                  form.targetPeriod === 'custom_date') && (
                  <ToggleRow
                    label="Recurring"
                    description="Start a new period when this one ends"
                    checked={form.periodRecurring}
                    compact
                    onChange={(periodRecurring) => setForm({ ...form, periodRecurring })}
                  />
                )}
                <MetricInput
                  compact
                  label={`Target (${targetLabelForForm(form)})`}
                  unit={normalizeWorkoutUnit(form.unit || DEFAULT_WORKOUT_UNIT)}
                  value={form.targetValue}
                  onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                />
                <p className="text-[10px] leading-snug text-zinc-500">
                  {form.logPeriod === 'weekly'
                    ? 'Weekly totals are entered at weekly shutdown.'
                    : 'Sessions are logged in this unit.'}
                </p>
              </div>
            )}
            {(!form.setTarget || form.logPeriod === 'daily') && (
              <>
                <SegmentPicker
                  label="Ask in"
                  value={form.workoutLogWhen}
                  onChange={(workoutLogWhen) => setForm({ ...form, workoutLogWhen })}
                  options={[
                    { value: 'home', label: 'Home' },
                    { value: 'morning', label: 'Morning' },
                    { value: 'shutdown', label: 'Shutdown' },
                  ]}
                />
                {form.workoutLogWhen === 'morning' && (
                  <SegmentPicker
                    label="For"
                    value={form.workoutMorningDay}
                    onChange={(workoutMorningDay) => setForm({ ...form, workoutMorningDay })}
                    options={[
                      { value: 'today', label: 'Today' },
                      { value: 'yesterday', label: 'Yesterday' },
                    ]}
                  />
                )}
                <p className="text-[10px] leading-snug text-zinc-500">
                  {form.workoutLogWhen === 'home' &&
                    'Shows on the Workouts card on the homepage.'}
                  {form.workoutLogWhen === 'morning' &&
                    (form.workoutMorningDay === 'yesterday'
                      ? 'Asked in the morning log for yesterday’s sessions.'
                      : 'Asked in the morning log for today’s sessions.')}
                  {form.workoutLogWhen === 'shutdown' &&
                    'Asked during evening shutdown.'}
                </p>
              </>
            )}
            {form.setTarget && form.logPeriod === 'weekly' && (
              <p className="text-[10px] leading-snug text-zinc-500">
                Ask in is weekly shutdown — enter the week’s total when you close out the week.
              </p>
            )}
          </>
        )}

        <div className="flex gap-1.5 border-t border-zinc-800/80 pt-2">
          <Button variant="secondary" size="sm" className="h-8 flex-1 text-xs" onClick={closeForm}>
            <X size={13} /> Cancel
          </Button>
          <Button size="sm" className="h-8 flex-1 text-xs" onClick={handleSave} disabled={!canSaveForm}>
            <Check size={13} /> {form.mode === 'edit' ? 'Update' : 'Save'}
          </Button>
        </div>
      </div>
    )
  }

  const renderInlineFormCard = (key?: string) => (
    <Card key={key} className="p-3 ring-1 ring-[var(--accent-500)]/25">
      {renderInlineForm()}
    </Card>
  )

  const renderHabitsPanel = () => (
    <>
      {habits.length > 0 && (
        <p className="mb-3 text-[10px] text-zinc-600">Drag to set order on Home</p>
      )}
      <HabitMetricsReorderList
        habits={habits}
        onReorder={persistHabit}
        onView={(habit) => openMetricHistory({ kind: 'habit', habitId: habit.id })}
        onEdit={openEditHabit}
        onDelete={(habit) => {
          if (habits.length <= 1) return
          requestDelete({ kind: 'habit', id: habit.id })
        }}
        onConfirmDelete={deleteHabit}
        onCancelDelete={() => setPendingDelete(null)}
        deleteConfirmId={pendingDelete?.kind === 'habit' ? pendingDelete.id : null}
        onAdd={!isAddingInSection ? openAddHabit : undefined}
        addForm={isAddingInSection ? renderInlineFormCard('add-habit') : undefined}
        editingHabitId={
          form?.kind === 'habit' && form.mode === 'edit' ? form.habitId ?? null : null
        }
        renderInlineEditor={renderInlineForm}
      />
    </>
  )

  const renderWeightPanel = () => (
    <div className="grid items-start gap-3 sm:grid-cols-2">
      {activeWeightGoal && renderWeightCard(activeWeightGoal)}
      {isAddingInSection && !activeWeightGoal && renderInlineFormCard('add-weight')}
      {!activeWeightGoal && !isAddingInSection && (
        <AddGhostCard onClick={openAddWeight} label="Add weight goal" />
      )}
    </div>
  )

  const syncSleepDurationGoal = (targetMinutes: number | null) => {
    const hours =
      targetMinutes != null && targetMinutes > 0
        ? Math.round((targetMinutes / 60) * 100) / 100
        : null
    const existing = activeSleepGoal

    if (hours == null) {
      if (existing && hasTarget(existing)) {
        onSaveGoal(normalizeGoal({ ...existing, target_value: null }))
      }
      return
    }

    const nextSleep: Goal = {
      id: existing?.id ?? generateId(),
      user_id: userId,
      metric_key: 'sleep',
      name: existing?.name ?? 'Sleep',
      target_value: hours,
      log_period: existing?.log_period ?? 'daily',
      target_period: existing?.target_period ?? 'daily',
      goal_weight_start: null,
      goal_weight_target: null,
      unit: 'hrs',
      is_active: true,
      created_at: existing?.created_at ?? new Date().toISOString(),
      log_when: existing?.log_when ?? 'morning',
      morning_day: existing?.morning_day ?? 'today',
    }
    if (existing?.period_start_date) nextSleep.period_start_date = existing.period_start_date
    if (existing?.period_end_date) nextSleep.period_end_date = existing.period_end_date
    if (existing?.period_days) nextSleep.period_days = existing.period_days
    if (existing?.period_recurring != null) nextSleep.period_recurring = existing.period_recurring
    onSaveGoal(normalizeGoal(nextSleep))
  }

  const renderSleepMetricCard = (metric: SleepMetricDefinition) => {
    const unitLabel = sleepMetricDisplayUnit(metric)
    const supportsTarget = sleepMetricSupportsTarget(metric)
    const target = getSleepMetricTarget(sleepMetricsConfig, metric.id)
    const targetInput = sleepMetricTargetToInputValue(metric, target)
    const targetUnit = sleepMetricTargetInputUnit(metric)
    const isEditingSettings = editingSleepMetricId === metric.id

    if (isEditingSettings) {
      return (
        <Card key={metric.id} className="ring-1 ring-[var(--accent-500)]/25">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-zinc-200">{metric.label}</h3>
              <p className="text-[10px] text-zinc-500">{unitLabel} · settings</p>
            </div>
            <button
              type="button"
              onClick={() => setEditingSleepMetricId(null)}
              className="shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              aria-label="Close settings"
            >
              <X size={14} />
            </button>
          </div>
          {supportsTarget && (
            <div className="mt-3">
              {isClockSleepMetric(metric) ? (
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-medium text-zinc-400">Target</span>
                  <input
                    type="time"
                    value={targetInput}
                    onChange={(e) => {
                      const nextTarget = sleepMetricTargetFromInputValue(metric, e.target.value)
                      saveSleepMetricsConfig(
                        setSleepMetricTarget(sleepMetricsConfig, metric.id, nextTarget),
                      )
                    }}
                    className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                  />
                  <p className="mt-1.5 text-[10px] leading-snug text-zinc-600">
                    Optional target time for this metric.
                  </p>
                </label>
              ) : (
                <>
                  <MetricInput
                    compact
                    label="Target"
                    unit={targetUnit}
                    step={
                      metric.unit === 'score10' ||
                      metric.id === 'sleep_duration' ||
                      metric.id === 'in_bed'
                        ? '0.5'
                        : '1'
                    }
                    value={targetInput}
                    onChange={(e) => {
                      const nextTarget = sleepMetricTargetFromInputValue(metric, e.target.value)
                      saveSleepMetricsConfig(
                        setSleepMetricTarget(sleepMetricsConfig, metric.id, nextTarget),
                      )
                      if (metric.id === 'sleep_duration') syncSleepDurationGoal(nextTarget)
                    }}
                    placeholder={
                      metric.id === 'sleep_duration' || metric.id === 'in_bed'
                        ? '8'
                        : metric.unit === 'percent'
                          ? '85'
                          : metric.unit === 'score10'
                            ? '7'
                            : ''
                    }
                  />
                  <p className="mt-1.5 text-[10px] leading-snug text-zinc-600">
                    Optional — used for Pulse when this metric is weighted.
                  </p>
                </>
              )}
            </div>
          )}
          <div className="mt-3 flex gap-2 border-t border-zinc-800/80 pt-3">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => setEditingSleepMetricId(null)}
            >
              Done
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="flex-1"
              onClick={() => {
                if (metric.source === 'custom') {
                  saveSleepMetricsConfig(removeCustomSleepMetric(sleepMetricsConfig, metric.id))
                } else {
                  saveSleepMetricsConfig(toggleSleepMetric(sleepMetricsConfig, metric.id, false))
                }
                removeSleepFieldFromMorningLog(metric.id)
                removeSleepFieldFromShutdownLog(metric.id)
                if (metric.id === 'sleep_duration') syncSleepDurationGoal(null)
                setEditingSleepMetricId(null)
              }}
            >
              Remove
            </Button>
          </div>
        </Card>
      )
    }

    const targetSummary =
      supportsTarget && target != null
        ? isClockSleepMetric(metric)
          ? `Target ${formatSleepMetricDisplay(metric, target)}`
          : `Target ${sleepMetricTargetToInputValue(metric, target)}${targetUnit ? ` ${targetUnit}` : ''}`
        : 'Tap to view history'

    return (
      <Card
        key={metric.id}
        onClick={() => openMetricHistory({ kind: 'sleep_metric', metricId: metric.id })}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-zinc-200">{metric.label}</h3>
            <p className="text-[10px] text-zinc-500">{targetSummary}</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setEditingSleepMetricId(metric.id)
              }}
              className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
              aria-label={`Edit ${metric.label} settings`}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (metric.source === 'custom') {
                  saveSleepMetricsConfig(removeCustomSleepMetric(sleepMetricsConfig, metric.id))
                } else {
                  saveSleepMetricsConfig(toggleSleepMetric(sleepMetricsConfig, metric.id, false))
                }
                removeSleepFieldFromMorningLog(metric.id)
                removeSleepFieldFromShutdownLog(metric.id)
                if (metric.id === 'sleep_duration') syncSleepDurationGoal(null)
              }}
              className="rounded-lg p-1.5 text-zinc-600 hover:text-red-400"
              aria-label={`Remove ${metric.label}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </Card>
    )
  }

  const renderSleepPanel = () => {
    const enabledSleepMetrics = getEnabledSleepMetrics(sleepMetricsConfig)

    return (
      <div className="grid items-start gap-3 sm:grid-cols-2">
        {enabledSleepMetrics.map(renderSleepMetricCard)}

        {addingSleepMetric && (
          <Card key="add-sleep-metric" className="p-3 ring-1 ring-[var(--accent-500)]/25 sm:col-span-2">
            <SleepMetricTemplatePicker
              config={sleepMetricsConfig}
              onChange={saveSleepMetricsConfig}
              onDone={() => setAddingSleepMetric(false)}
            />
          </Card>
        )}

        {!addingSleepMetric && (
          <AddGhostCard onClick={() => setAddingSleepMetric(true)} label="Add" />
        )}
      </div>
    )
  }

  const renderFocusPanel = () => (
    <div className="grid items-start gap-3 sm:grid-cols-2">
      {activeFocusGoal && renderGoalCard(activeFocusGoal)}
      {isAddingInSection && !activeFocusGoal && renderInlineFormCard('add-focus')}
      {!activeFocusGoal && !isAddingInSection && (
        <AddGhostCard onClick={openAddFocus} label="Add focus goal" />
      )}
    </div>
  )

  const renderWorkoutsPanel = () => (
    <div className="grid items-start gap-3 sm:grid-cols-2">
      {workoutTypes.map(renderWorkoutCard)}
      {isAddingInSection && renderInlineFormCard('add-workout')}
      {!isAddingInSection && <AddGhostCard onClick={openAddWorkout} label="Add workout" />}
    </div>
  )

  const renderActivePanel = () => {
    if (activeSection === 'habits') return renderHabitsPanel()
    if (activeSection === 'sleep') return renderSleepPanel()
    if (activeSection === 'focus') return renderFocusPanel()
    if (activeSection === 'weight') return renderWeightPanel()
    if (activeSection === 'workouts') return renderWorkoutsPanel()

    const category = goalCategories.find((c) => c.id === activeSection)
    if (category) return renderCategorySection(category)
    return null
  }

  const isCustomCategorySection =
    activeSection !== 'habits' &&
    activeSection !== 'sleep' &&
    activeSection !== 'focus' &&
    activeSection !== 'weight' &&
    activeSection !== 'workouts' &&
    !isDefaultGoalCategory(activeSection)

  const renderCategorySection = (category: GoalCategoryDefinition) => {
    const categoryGoals = goalsForCategory(category.id)

    return (
      <section key={category.id}>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          {categoryGoals.map(renderGoalCard)}
          {isAddingInSection && form?.categoryId === category.id && renderInlineFormCard('add-goal')}
          {!isAddingInSection && (
            <AddGhostCard onClick={() => openAdd(category.id)} label="Add" />
          )}
        </div>
      </section>
    )
  }

  const activateBuiltinSection = (sectionId: (typeof BUILTIN_METRICS_SECTIONS)[number]) => {
    enableMetricsSection(sectionId)
    if (sectionId === 'workouts') {
      updateSettings({ showWorkoutMetrics: true })
    }
    refreshEnabledSections()
    refreshCategories()
    setActiveSection(sectionId)
    setTemplatePickerOpen(false)
  }

  const templateOptions = getAvailableMetricTemplates({
    showWorkoutMetrics: showWorkouts,
  })
  const metricsEmpty = navItems.length === 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-100">Metrics</h2>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => setEditLogsOpen(true)}
        >
          <History size={14} />
          Edit logs
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
        {!metricsEmpty && (
          <SlidingNavList
            activeId={activeSection}
            items={navItems}
            getKey={(item) => item.id}
            onSelect={(item) => setActiveSection(item.id)}
            ariaLabel="Metrics sections"
            className="flex gap-1 overflow-x-auto pb-1 sm:w-44 sm:shrink-0 sm:flex-col sm:gap-0.5 sm:overflow-visible sm:pb-0"
            itemClassName="shrink-0 px-3 py-2 sm:w-full"
            renderItem={(item) => item.label}
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="relative mb-4">
            <button
              type="button"
              onClick={() => setTemplatePickerOpen((open) => !open)}
              className={cn(
                'rounded-lg px-3 py-2 text-sm transition-colors',
                metricsEmpty
                  ? 'border border-dashed border-zinc-700 text-zinc-300 hover:border-[var(--accent-500)]/50 hover:text-[var(--accent-300)]'
                  : 'text-zinc-600 hover:bg-zinc-900/80 hover:text-zinc-300',
              )}
            >
              + Category
            </button>
            {templatePickerOpen && (
              <div className="absolute left-0 top-full z-20 mt-2 w-full max-w-sm overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl">
                {templateOptions.map((option) => {
                  const Icon = METRIC_TEMPLATE_ICONS[option.id]
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => activateBuiltinSection(option.id)}
                      className="flex w-full items-start gap-3 border-b border-zinc-800/80 px-4 py-3 text-left last:border-b-0 hover:bg-zinc-900/80"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-zinc-300 ring-1 ring-zinc-800">
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0 flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-zinc-100">{option.label}</span>
                        <span className="text-[11px] leading-snug text-zinc-500">
                          {option.description}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {metricsEmpty ? (
            <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
              <p className="text-sm text-zinc-400">No metrics yet</p>
              <p className="mt-1 text-xs text-zinc-600">
                Add habits, goals, a weight target, or workouts to get started.
              </p>
            </div>
          ) : (
            <>
          <div className="mb-4 flex items-center gap-1.5">
            {isCustomCategorySection && editingCategoryId === activeSection ? (
              <>
                <input
                  type="text"
                  value={editingCategoryName}
                  onChange={(e) => setEditingCategoryName(e.target.value)}
                  className="w-48 max-w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-base font-semibold text-zinc-100 focus:border-[var(--accent-500)] focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      renameCategory(activeSection, editingCategoryName)
                      setEditingCategoryId(null)
                    }
                    if (e.key === 'Escape') setEditingCategoryId(null)
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    renameCategory(activeSection, editingCategoryName)
                    setEditingCategoryId(null)
                  }}
                  className="rounded p-1 text-zinc-500 hover:text-emerald-400"
                  aria-label="Save category name"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCategoryId(null)}
                  className="rounded p-1 text-zinc-500 hover:text-zinc-300"
                  aria-label="Cancel rename"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-zinc-100">{activeNavLabel}</h3>
                {isCustomCategorySection && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategoryId(activeSection)
                      setEditingCategoryName(activeNavLabel)
                    }}
                    className="rounded p-1 text-zinc-600 hover:text-indigo-400"
                    aria-label={`Rename ${activeNavLabel}`}
                  >
                    <Pencil size={12} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSectionDeleteConfirm(activeSection)}
                  className="rounded p-1 text-zinc-600 hover:text-red-400"
                  aria-label={`Delete ${activeNavLabel}`}
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
          {sectionDeleteConfirm === activeSection && (
            <div className="mb-4 rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3">
              <p className="text-sm text-zinc-300">
                {sectionItemCount(activeSection) > 0 ? (
                  <>
                    Delete <span className="font-medium text-zinc-100">{activeNavLabel}</span>? This
                    will permanently remove all{' '}
                    {activeSection === 'habits'
                      ? 'habits'
                      : activeSection === 'sleep'
                        ? 'sleep goal and sleep metrics'
                        : activeSection === 'focus'
                          ? 'focus goals'
                          : activeSection === 'workouts'
                            ? 'workouts'
                            : 'goals'}{' '}
                    in this category ({sectionItemCount(activeSection)}).
                  </>
                ) : (
                  <>
                    Remove <span className="font-medium text-zinc-100">{activeNavLabel}</span>? You
                    can add it back later with + Category.
                  </>
                )}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSectionDeleteConfirm(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => executeDeleteSection(activeSection)}
                >
                  Delete category
                </Button>
              </div>
            </div>
          )}
          {renderActivePanel()}
            </>
          )}
        </div>
      </div>

      {editLogsOpen && (
        <EditLogsModal
          goals={goals}
          userId={userId}
          onClose={() => setEditLogsOpen(false)}
        />
      )}

      {historyTarget && (
        <MetricHistoryModal
          target={historyTarget}
          goals={goals}
          userId={userId}
          habits={habits}
          workoutTypes={workoutTypes}
          sleepMetricsConfig={sleepMetricsConfig}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  )
}
