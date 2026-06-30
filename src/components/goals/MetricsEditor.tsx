import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2, Check, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MetricInput } from '@/components/ui/MetricInput'
import { DurationMetricInput } from '@/components/ui/DurationMetricInput'
import { WorkoutColorPicker } from '@/components/goals/WorkoutColorPicker'
import { HabitMetricsReorderList } from '@/components/goals/HabitMetricsReorderList'
import { AddGhostCard } from '@/components/goals/AddGhostCard'
import { ToggleRow } from '@/components/settings/SettingsControls'
import { DatePickerField } from '@/components/ui/DatePickerField'
import type { Goal, GoalPeriod, GoalTargetPeriod, MetricKey } from '@/types'
import {
  defaultUnitForMetric,
  goalLogPeriod,
  hasTarget,
  normalizeGoal,
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
  saveHabitTypes,
  slugifyHabitId,
  useHabitTypes,
  type HabitTypeDefinition,
  type HabitRampConfig,
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
import { FocusGoalModal } from '@/components/focus/FocusGoalModal'
import { getFocusSettings, saveFocusSettings } from '@/lib/focusStore'
import {
  WORKOUT_COLOR_PRESETS,
  getWorkoutTypes,
  saveWorkoutTypes,
  slugifyWorkoutId,
  workoutMetricKey,
  type WorkoutTypeDefinition,
} from '@/lib/workoutTypes'
import { cn, generateId, formatDate } from '@/lib/utils'
import { displayToKg, kgToDisplay } from '@/lib/settingsStore'
import { formatWeightGoalRange, formatWeightGoalDateRange, isWeightGoal, weightGoalMode, type WeightGoalMode } from '@/lib/weightGoal'
import { useSettings } from '@/context/SettingsContext'
import {
  DEFAULT_GOAL_CATEGORY_ID,
  getAllGoalCategories,
  getCustomGoalCategories,
  isDefaultGoalCategory,
  resolveGoalCategoryId,
  saveCustomGoalCategories,
  slugifyGoalCategoryId,
  type GoalCategoryDefinition,
} from '@/lib/goalCategories'

type MetricKind = 'habit' | 'goal' | 'workout' | 'weight'
type MetricsSection = 'habits' | 'weight' | 'workouts' | string
type CustomPeriodMode = 'duration' | 'date'

interface MetricsEditorProps {
  goals: Goal[]
  userId: string
  onSaveGoal: (goal: Goal) => void
  onDeleteGoal: (goal: Goal) => void
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
}

function goalKeyFromName(name: string): MetricKey {
  return `custom:${slugifyWorkoutId(name)}` as MetricKey
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
  const presetClass = (active: boolean) =>
    cn(
      'flex-1 rounded-md py-1 text-[11px] transition-colors',
      active ? 'bg-[var(--accent-600)] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
    )

  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 gap-1">
        <button type="button" onClick={() => onChange('daily')} className={presetClass(value === 'daily')}>
          daily
        </button>
        <button type="button" onClick={() => onChange('weekly')} className={presetClass(value === 'weekly')}>
          weekly
        </button>
      </div>
    </div>
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
  const presetClass = (active: boolean) =>
    cn(
      'flex-1 rounded-md py-1 text-[11px] transition-colors',
      active ? 'bg-[var(--accent-600)] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
    )

  const selectCustomMode = (mode: CustomPeriodMode) => {
    onCustomModeChange(mode)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Target
        </span>
        <div className="flex min-w-0 flex-1 gap-1">
          <button type="button" onClick={() => onChange('daily')} className={presetClass(value === 'daily')}>
            daily
          </button>
          <button type="button" onClick={() => onChange('weekly')} className={presetClass(value === 'weekly')}>
            weekly
          </button>
          <button
            type="button"
            onClick={() => onChange(customMode === 'date' ? 'custom_date' : 'custom_duration')}
            className={presetClass(isCustom)}
          >
            custom
          </button>
        </div>
      </div>

      {isCustom && (
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => selectCustomMode('duration')}
              className={presetClass(!showDatePicker)}
            >
              Duration
            </button>
            <button
              type="button"
              onClick={() => selectCustomMode('date')}
              className={presetClass(showDatePicker)}
            >
              By date
            </button>
          </div>

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
              <div className="flex overflow-hidden rounded-md border border-zinc-700">
                <button
                  type="button"
                  onClick={() => onPeriodUnitChange('days')}
                  className={cn(
                    'px-2 py-1.5 text-[10px]',
                    periodUnit === 'days'
                      ? 'bg-[var(--accent-600)] text-white'
                      : 'bg-zinc-900 text-zinc-400',
                  )}
                >
                  days
                </button>
                <button
                  type="button"
                  onClick={() => onPeriodUnitChange('weeks')}
                  className={cn(
                    'px-2 py-1.5 text-[10px]',
                    periodUnit === 'weeks'
                      ? 'bg-[var(--accent-600)] text-white'
                      : 'bg-zinc-900 text-zinc-400',
                  )}
                >
                  weeks
                </button>
              </div>
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
        <span>{selected?.label ?? 'Goals'}</span>
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
  const presetClass = (active: boolean) =>
    cn(
      'flex-1 rounded-md py-1 text-[11px] transition-colors',
      active ? 'bg-[var(--accent-600)] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
    )

  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        Goal
      </span>
      <div className="flex min-w-0 flex-1 gap-1">
        <button type="button" onClick={() => onChange('bulk')} className={presetClass(value === 'bulk')}>
          Bulk
        </button>
        <button type="button" onClick={() => onChange('cut')} className={presetClass(value === 'cut')}>
          Cut
        </button>
      </div>
    </div>
  )
}

function MetricsNavButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors sm:w-full',
        active
          ? 'bg-[var(--accent-950)] text-[var(--accent-300)] ring-1 ring-[var(--accent-ring)]'
          : 'text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200',
      )}
    >
      {label}
    </button>
  )
}

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
    name: kind === 'weight' ? 'Weight' : '',
    logPeriod: 'daily',
    targetPeriod: kind === 'workout' ? 'weekly' : 'daily',
    customPeriodMode: 'duration',
    periodAmount: '2',
    periodUnit: 'weeks',
    periodEndDate: '',
    periodRecurring: false,
    setTarget: kind !== 'habit',
    targetValue: '',
    unit: kind === 'workout' ? 'min' : kind === 'weight' ? 'kg' : '',
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

function buildHabitFields(form: MetricFormState): HabitTypeDefinition {
  const ramp = habitRampFromForm(form)
  const habit: HabitTypeDefinition = {
    id: form.habitId ?? '',
    label: form.name.trim(),
    log_period: form.logPeriod,
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
  const { settings } = useSettings()
  const showWorkouts = settings.showWorkoutMetrics
  const today = formatDate(new Date())
  const habits = useHabitTypes()
  const [workoutTypes, setWorkoutTypes] = useState<WorkoutTypeDefinition[]>(() => getWorkoutTypes())
  const [goalCategories, setGoalCategories] = useState<GoalCategoryDefinition[]>(() => getAllGoalCategories())
  const [form, setForm] = useState<MetricFormState | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [focusGoalModal, setFocusGoalModal] = useState<Goal | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [activeSection, setActiveSection] = useState<MetricsSection>('habits')

  const customGoals = goals.filter(
    (g) => !g.metric_key.startsWith('workout_') && !isWeightGoal(g),
  )
  const activeWeightGoal = goals.find(isWeightGoal)

  const refreshWorkouts = useCallback(() => setWorkoutTypes(getWorkoutTypes()), [])
  const refreshCategories = useCallback(() => setGoalCategories(getAllGoalCategories()), [])

  const goalsForCategory = (categoryId: string) =>
    customGoals.filter((g) => resolveGoalCategoryId(g.category_id) === categoryId)

  const persistCategories = (custom: GoalCategoryDefinition[]) => {
    saveCustomGoalCategories(custom)
    refreshCategories()
  }

  const createCategory = (label: string): string | null => {
    const trimmed = label.trim()
    if (!trimmed) return null

    let id = slugifyGoalCategoryId(trimmed)
    const existing = getCustomGoalCategories()
    let n = 2
    while (existing.some((c) => c.id === id)) {
      id = `${slugifyGoalCategoryId(trimmed)}_${n}`
      n++
    }

    persistCategories([...existing, { id, label: trimmed }])
    return id
  }

  const deleteCategory = (categoryId: string) => {
    if (isDefaultGoalCategory(categoryId)) return
    persistCategories(getCustomGoalCategories().filter((c) => c.id !== categoryId))
    goalsForCategory(categoryId).forEach((goal) => {
      onSaveGoal(normalizeGoal({ ...goal, category_id: null }))
    })
    if (activeSection === categoryId) setActiveSection('habits')
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
    goals.find((g) => g.metric_key === workoutMetricKey(typeId))

  const closeForm = () => {
    setForm(null)
    setColorPickerOpen(false)
    setCategoryPickerOpen(false)
  }

  const openAddHabit = () => {
    setForm(emptyForm('habit', 'add'))
    setColorPickerOpen(false)
  }

  const openAddWeight = () => {
    setForm(emptyForm('weight', 'add'))
    setColorPickerOpen(false)
  }

  const openAdd = (categoryId: string = DEFAULT_GOAL_CATEGORY_ID) => {
    setForm(emptyForm('goal', 'add', categoryId))
    setColorPickerOpen(false)
    setCategoryPickerOpen(false)
  }

  const openAddWorkout = () => {
    setForm(emptyForm('workout', 'add'))
    setColorPickerOpen(false)
  }

  const openEditHabit = (habit: HabitTypeDefinition) => {
    setForm({
      ...emptyForm('habit', 'edit'),
      habitId: habit.id,
      name: habit.label,
      logPeriod: habitLogPeriod(habit),
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
    setCategoryPickerOpen(false)
    setForm({
      ...emptyForm('goal', 'edit', resolveGoalCategoryId(goal.category_id)),
      goalId: goal.id,
      name: goal.name,
      logPeriod: goalLogPeriod(goal),
      ...goalToFormPeriod(goal),
      setTarget: hasTarget(goal),
      targetValue: goal.target_value != null ? String(goal.target_value) : '',
      unit: goal.unit,
    })
  }

  const openEditWorkout = (type: WorkoutTypeDefinition) => {
    const goal = workoutGoal(type.id)
    setForm({
      ...emptyForm('workout', 'edit'),
      workoutId: type.id,
      name: type.label,
      logPeriod: goal ? goalLogPeriod(goal) : 'daily',
      ...(goal ? goalToFormPeriod(goal) : { targetPeriod: 'weekly' as GoalTargetPeriod }),
      setTarget: goal ? hasTarget(goal) : false,
      targetValue: goal?.target_value != null ? String(goal.target_value) : '',
      color: type.color,
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
        unit: 'min',
        is_active: true,
        created_at: existing?.created_at ?? new Date().toISOString(),
      }),
    )
  }

  const handleSave = () => {
    if (!form) return
    const name = form.name.trim()
    if (!name && form.kind !== 'weight') return

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

    if (form.kind === 'goal') {
      const value = form.setTarget ? parseFloat(form.targetValue) : null
      if (form.setTarget && (value == null || Number.isNaN(value))) return

      if (form.mode === 'edit' && form.goalId) {
        const existing = goals.find((g) => g.id === form.goalId)
        if (!existing) return
        onSaveGoal(
          normalizeGoal({
            ...existing,
            name,
            ...periodFieldsFromForm(form, existing),
            target_value: form.setTarget ? value : null,
            unit: form.unit.trim() || existing.unit,
            category_id:
              form.categoryId === DEFAULT_GOAL_CATEGORY_ID ? null : form.categoryId,
          }),
        )
      } else {
        const resolvedKey = goalKeyFromName(name)
        onSaveGoal(
          normalizeGoal({
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
          }),
        )
      }
      closeForm()
      return
    }

    if (form.kind === 'weight') {
      const unit = settings.weightUnit
      const startDisplay = parseFloat(form.weightStart)
      const targetDisplay = parseFloat(form.weightTarget)
      if (Number.isNaN(startDisplay) || startDisplay <= 0 || Number.isNaN(targetDisplay) || targetDisplay <= 0) {
        return
      }
      if (form.weightMode === 'bulk' && targetDisplay <= startDisplay) return
      if (form.weightMode === 'cut' && targetDisplay >= startDisplay) return

      const startKg = displayToKg(startDisplay, unit)
      const targetKg = displayToKg(targetDisplay, unit)
      const existing = form.mode === 'edit' && form.goalId
        ? goals.find((g) => g.id === form.goalId)
        : activeWeightGoal

      onSaveGoal(
        normalizeGoal({
          id: existing?.id ?? generateId(),
          user_id: userId,
          metric_key: 'weight',
          name: 'Weight',
          target_value: null,
          log_period: 'weekly',
          goal_weight_start: startKg,
          goal_weight_target: targetKg,
          period_start_date: form.weightStartDate,
          period_end_date: form.weightTargetDate,
          unit,
          is_active: true,
          created_at: existing?.created_at ?? new Date().toISOString(),
        }),
      )
      closeForm()
      return
    }

    if (form.kind === 'workout') {
      if (form.setTarget) {
        const value = parseFloat(form.targetValue)
        if (Number.isNaN(value) || value <= 0) return
      }

      if (form.mode === 'edit' && form.workoutId) {
        const updated = workoutTypes.map((t) =>
          t.id === form.workoutId ? { ...t, label: name, color: form.color } : t,
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
        const usedColors = new Set(workoutTypes.map((t) => t.color))
        const color =
          form.color ||
          WORKOUT_COLOR_PRESETS.find((c) => !usedColors.has(c)) ||
          WORKOUT_COLOR_PRESETS[workoutTypes.length % WORKOUT_COLOR_PRESETS.length]

        persistWorkoutTypes([...workoutTypes, { id, label: name, color }])
        saveWorkoutGoal(id, name, form.setTarget, form.targetValue, form)
      }
      closeForm()
    }
  }

  const deleteHabit = (habit: HabitTypeDefinition) => {
    if (habits.length <= 1) return
    persistHabit(habits.filter((h) => h.id !== habit.id))
  }

  const deleteWorkout = (type: WorkoutTypeDefinition) => {
    const goal = workoutGoal(type.id)
    if (goal) onDeleteGoal(goal)
    persistWorkoutTypes(workoutTypes.filter((t) => t.id !== type.id))
  }

  const deleteFocusGoal = (goal: Goal) => {
    onDeleteGoal(goal)
    clearFocusGoalInSettings()
  }

  const handleSaveFocusGoal = async (values: Parameters<typeof saveFocusGoal>[2]) => {
    const { settings: next, goal } = await saveFocusGoal(userId, getFocusSettings(), values)
    saveFocusSettings(next)
    onSaveGoal(goal)
  }

  const renderGoalCard = (goal: Goal) => {
    const isTimerFocusGoal = goal.metric_key === 'focus'
    const isEditing = form?.kind === 'goal' && form.goalId === goal.id

    if (isEditing) {
      return renderInlineFormCard(goal.id)
    }

    return (
      <Card
        key={goal.id}
        onClick={() =>
          isTimerFocusGoal ? setFocusGoalModal(goal) : openEditGoal(goal)
        }
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-medium text-zinc-200">{goal.name}</h3>
            <p className="text-[10px] text-zinc-500">
              {formatGoalScheduleLabel(goal, today)}
              {hasTarget(goal) && goal.target_value != null
                ? ` · ${isTimerFocusGoal ? formatFocusGoalTarget(goal.target_value) : formatGoalTargetLabel(goal.target_value, goal.unit, goal.metric_key)}`
                : ' · track only'}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              isTimerFocusGoal ? deleteFocusGoal(goal) : onDeleteGoal(goal)
            }}
            className="shrink-0 text-zinc-600 hover:text-red-400"
            aria-label={`Delete ${goal.name}`}
          >
            <Trash2 size={14} />
          </button>
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

    return (
      <Card key={type.id} onClick={() => openEditWorkout(type)}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: type.color }}
            />
            <div>
              <h3 className="text-sm font-medium text-zinc-200">{type.label}</h3>
              <p className="text-[10px] text-zinc-500">
                {goal && hasTarget(goal)
                  ? `${formatGoalScheduleLabel(goal, today)} · ${goal.target_value} min`
                  : 'min · track only'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              deleteWorkout(type)
            }}
            className="shrink-0 text-zinc-600 hover:text-red-400"
            aria-label={`Delete ${type.label}`}
          >
            <Trash2 size={14} />
          </button>
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

    return (
      <Card key={goal.id} onClick={() => openEditWeight(goal)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {mode === 'bulk' ? 'Bulk goal' : 'Cut goal'}
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDeleteGoal(goal)
            }}
            className="shrink-0 text-zinc-600 hover:text-red-400"
            aria-label="Delete weight goal"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </Card>
    )
  }

  const canSaveForm = (() => {
    if (!form) return false
    if (form.kind === 'weight') {
      const start = parseFloat(form.weightStart)
      const target = parseFloat(form.weightTarget)
      if (Number.isNaN(start) || start <= 0 || Number.isNaN(target) || target <= 0) return false
      if (!form.weightStartDate.trim() || !form.weightTargetDate.trim()) return false
      if (form.weightStartDate >= form.weightTargetDate) return false
      if (form.weightMode === 'bulk') return target > start
      return target < start
    }
    if (!form.name.trim()) return false
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

  const navItems = useMemo(
    (): { id: MetricsSection; label: string }[] => [
      { id: 'habits', label: 'Habits' },
      ...goalCategories.map((category) => ({
        id: category.id,
        label: category.label,
      })),
      { id: 'weight', label: 'Weight Goal' },
      ...(showWorkouts ? [{ id: 'workouts' as MetricsSection, label: 'Workouts' }] : []),
    ],
    [goalCategories, showWorkouts],
  )

  const activeNavLabel =
    navItems.find((item) => item.id === activeSection)?.label ?? 'Metrics'

  useEffect(() => {
    if (
      activeSection !== 'habits' &&
      activeSection !== 'weight' &&
      activeSection !== 'workouts'
    ) {
      if (!goalCategories.some((category) => category.id === activeSection)) {
        setActiveSection('habits')
      }
    }
  }, [goalCategories, activeSection])

  useEffect(() => {
    setForm(null)
    setColorPickerOpen(false)
    setCategoryPickerOpen(false)
  }, [activeSection])

  const isAddingInSection =
    !!form &&
    form.mode === 'add' &&
    ((activeSection === 'habits' && form.kind === 'habit') ||
      (activeSection === 'weight' && form.kind === 'weight') ||
      (activeSection === 'workouts' && form.kind === 'workout') ||
      (form.kind === 'goal' && form.categoryId === activeSection))

  const renderInlineForm = () => {
    if (!form) return null

    return (
      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
        {form.kind === 'workout' && (
          <div className="flex items-end gap-2">
            <WorkoutColorPicker
              color={form.color}
              open={colorPickerOpen}
              onToggle={() => setColorPickerOpen((v) => !v)}
              onSelect={(color) => setForm({ ...form, color })}
            />
            <div className="min-w-0 flex-1">
              <MetricInput
                compact
                label="Name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. HIIT, Zone 2"
              />
            </div>
          </div>
        )}

        {form.kind !== 'workout' && form.kind !== 'weight' && (
          <MetricInput
            compact
            label="Name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={
              form.kind === 'habit'
                ? 'e.g. Meditation, Skincare'
                : 'e.g. Sleep, Reading, Protein'
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

        {form.kind === 'weight' && (
          <>
            <WeightModePicker
              value={form.weightMode}
              onChange={(weightMode) => setForm({ ...form, weightMode })}
            />
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
            <p className="text-[10px] leading-snug text-zinc-500">
              Log weight during weekly shutdown. Each week compares last week&apos;s weight to
              this week&apos;s against your bulk or cut range.
            </p>
          </>
        )}

        {form.kind === 'habit' && (
          <>
            <PeriodPicker
              label="Log"
              value={form.logPeriod}
              onChange={(logPeriod) => setForm({ ...form, logPeriod })}
            />
            <ToggleRow
              label="Duration"
              description="Optional target time or amount for this habit"
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
                  onChange={(logPeriod) => setForm({ ...form, logPeriod })}
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
                <p className="text-[10px] leading-snug text-zinc-500">
                  Daily log entries appear in Today. Weekly log entries are entered at weekly
                  shutdown.
                </p>
              </div>
            )}
          </>
        )}

        {form.kind === 'workout' && (
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
                  onChange={(logPeriod) => setForm({ ...form, logPeriod })}
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
                  unit="min"
                  value={form.targetValue}
                  onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                />
                <p className="text-[10px] leading-snug text-zinc-500">
                  Workout minutes are tracked per session. Weekly log totals them at shutdown.
                </p>
              </div>
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
        <p className="mb-3 text-[10px] text-zinc-600">Drag to set order on Today</p>
      )}
      <HabitMetricsReorderList
        habits={habits}
        onReorder={persistHabit}
        onEdit={openEditHabit}
        onDelete={deleteHabit}
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

  const renderWorkoutsPanel = () => (
    <div className="grid items-start gap-3 sm:grid-cols-2">
      {workoutTypes.map(renderWorkoutCard)}
      {isAddingInSection && renderInlineFormCard('add-workout')}
      {!isAddingInSection && <AddGhostCard onClick={openAddWorkout} label="Add workout" />}
    </div>
  )

  const renderActivePanel = () => {
    if (activeSection === 'habits') return renderHabitsPanel()
    if (activeSection === 'weight') return renderWeightPanel()
    if (activeSection === 'workouts') return renderWorkoutsPanel()

    const category = goalCategories.find((c) => c.id === activeSection)
    if (category) return renderCategorySection(category)
    return null
  }

  const isCustomCategorySection =
    activeSection !== 'habits' &&
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
            <AddGhostCard onClick={() => openAdd(category.id)} label="Add goal" />
          )}
        </div>
      </section>
    )
  }

  const startAddCategory = () => {
    const id = createCategory('New category')
    if (!id) return
    setActiveSection(id)
    setEditingCategoryId(id)
    setEditingCategoryName('New category')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-100">Metrics</h2>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
        <nav className="flex gap-1 overflow-x-auto pb-1 sm:block sm:w-44 sm:shrink-0 sm:space-y-0.5 sm:overflow-visible sm:pb-0">
          {navItems.map((item) => (
            <MetricsNavButton
              key={item.id}
              label={item.label}
              active={activeSection === item.id}
              onClick={() => setActiveSection(item.id)}
            />
          ))}
          <button
            type="button"
            onClick={startAddCategory}
            className="mt-1 hidden shrink-0 rounded-lg px-3 py-2 text-left text-sm text-zinc-600 transition-colors hover:bg-zinc-900/80 hover:text-zinc-300 sm:block"
          >
            + Category
          </button>
        </nav>

        <div className="min-w-0 flex-1">
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
                  <>
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
                    <button
                      type="button"
                      onClick={() => deleteCategory(activeSection)}
                      className="rounded p-1 text-zinc-600 hover:text-red-400"
                      aria-label={`Delete ${activeNavLabel}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
          {renderActivePanel()}
        </div>
      </div>


      {focusGoalModal && (
        <FocusGoalModal
          mode="edit"
          initial={goalToFocusGoalFormValues(focusGoalModal)}
          onSave={handleSaveFocusGoal}
          onClose={() => setFocusGoalModal(null)}
        />
      )}
    </div>
  )
}
