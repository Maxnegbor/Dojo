import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2, Check, X, ChevronDown, History, Brain, Moon, Repeat, Scale, Dumbbell, Shapes, Plus, Flame } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl'
import { Card } from '@/components/ui/Card'
import { MetricInput } from '@/components/ui/MetricInput'
import { EditLogsModal } from '@/components/goals/EditLogsModal'
import { MetricHistoryModal } from '@/components/goals/MetricHistoryModal'
import type { MetricHistoryTarget } from '@/lib/metricHistory'
import { SleepMetricTemplatePicker } from '@/components/goals/SleepMetricTemplatePicker'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import type { Goal, GoalPeriod, MetricKey } from '@/types'
import {
  defaultUnitForMetric,
  getActiveGoalByMetricKey,
  goalLogPeriod,
  goalLogWhen,
  goalMorningDay,
  normalizeGoal,
  type GoalLogWhen,
  type GoalMorningDay,
} from '@/lib/goals'
import { formatGoalScheduleLabel } from '@/lib/goalPeriod'
import {
  habitLogPeriod,
  habitLogWhen,
  habitMorningDay,
  saveHabitTypes,
  slugifyHabitId,
  useHabitTypes,
  type HabitTypeDefinition,
  type HabitLogWhen,
  type HabitMorningDay,
} from '@/lib/habitTypes'
import { formatHabitCardSubtitle } from '@/lib/habitRamp'
import { HABITIFY_CHANGED, isHabitifyConnected } from '@/lib/habitifyStore'
import { clearFocusGoalInSettings } from '@/lib/focusGoalSync'
import {
  METRIC_UNIT_OPTIONS,
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
  workoutLogWhen,
  workoutLogPeriod,
  workoutMetricKey,
  workoutMorningDay,
  type WorkoutTypeDefinition,
  type WorkoutLogWhen,
  type WorkoutMorningDay,
} from '@/lib/workoutTypes'
import { cn, generateId, formatDate } from '@/lib/utils'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { getActiveWeightGoal, getDuplicateActiveWeightGoals, isWeightGoal } from '@/lib/weightGoal'
import {
  autoEnrollInMorningLog,
  getMorningLogGoalKeys,
  getMorningLogYesterdayKeys,
  pruneMorningLogAssignments,
  removeSleepFieldFromMorningLog,
  saveMorningLogGoalKeys,
  saveMorningLogYesterdayKeys,
} from '@/lib/morningLogConfig'
import {
  pruneShutdownLogAssignments,
  removeSleepFieldFromShutdownLog,
  getShutdownLogGoalKeys,
  saveShutdownLogGoalKeys,
} from '@/lib/shutdownLogConfig'
import { useSettings } from '@/context/SettingsContext'
import {
  DEFAULT_GOAL_CATEGORY_ID,
  getCustomGoalCategories,
  resolveGoalCategoryId,
  saveCustomGoalCategories,
  type GoalCategoryDefinition,
} from '@/lib/goalCategories'
import { enableMetricsSection } from '@/lib/metricsSections'
import {
  createMetricCategory,
  getMetricLibraryCategories,
  KIND_CATEGORY_FALLBACK,
  migrateMetricLibraryCategories,
  storedLibraryCategoryId,
  UNGROUPED_CATEGORY_ID,
  UNGROUPED_CATEGORY_LABEL,
  ungroupMetricsInCategory,
} from '@/lib/metricLibrary'
import {
  sleepMetricDisplayUnit,
  getEnabledSleepMetrics,
  removeCustomSleepMetric,
  setSleepMetricCategory,
  toggleSleepMetric,
  type SleepMetricDefinition,
} from '@/lib/sleepMetrics'

type MetricKind = 'habit' | 'goal' | 'workout' | 'weight' | 'focus' | 'sleep'

const COLLAPSED_CATS_KEY = 'personal-os-metrics-collapsed-cats'

function readCollapsedCategoryIds(): string[] {
  try {
    const raw = storageGetItem(COLLAPSED_CATS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []
  } catch {
    return []
  }
}

function saveCollapsedCategoryIds(ids: string[]) {
  storageSetItem(COLLAPSED_CATS_KEY, JSON.stringify(ids))
}

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
  unit: string
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
        <span>{selected?.label ?? UNGROUPED_CATEGORY_LABEL}</span>
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

function emptyForm(
  kind: MetricKind = 'goal',
  mode: 'add' | 'edit' = 'add',
  categoryId: string = DEFAULT_GOAL_CATEGORY_ID,
): MetricFormState {
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
    unit: kind === 'workout' ? 'min' : kind === 'weight' ? 'kg' : kind === 'sleep' ? 'hrs' : '',
  }
}

function buildHabitFields(form: MetricFormState): HabitTypeDefinition {
  const habit: HabitTypeDefinition = {
    id: form.habitId ?? '',
    label: form.name.trim(),
    log_period: form.logPeriod,
  }
  const categoryId = storedLibraryCategoryId(form.categoryId)
  if (categoryId) habit.category_id = categoryId
  if (form.logPeriod !== 'daily') {
    delete habit.log_when
    delete habit.morning_day
  }
  return habit
}

function applyHabitFormFields(
  existing: HabitTypeDefinition,
  form: MetricFormState,
): HabitTypeDefinition {
  const next: HabitTypeDefinition = {
    ...existing,
    label: form.name.trim(),
    log_period: form.logPeriod,
    category_id: storedLibraryCategoryId(form.categoryId),
  }
  delete next.log_when
  delete next.morning_day
  return next
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
    migrateMetricLibraryCategories()
    setGoalCategories(getMetricLibraryCategories())
    setWorkoutTypes(getWorkoutTypes())
    pruneMorningLogAssignments(goals, sleepMetricsConfig)
    pruneShutdownLogAssignments(goals, sleepMetricsConfig)
  }, [goals, sleepMetricsConfig])

  const today = formatDate(new Date())
  const habits = useHabitTypes()
  const [habitifyConnected, setHabitifyConnected] = useState(() => isHabitifyConnected())
  const [workoutTypes, setWorkoutTypes] = useState<WorkoutTypeDefinition[]>(() => getWorkoutTypes())
  const [goalCategories, setGoalCategories] = useState<GoalCategoryDefinition[]>(() =>
    getMetricLibraryCategories(),
  )

  useEffect(() => {
    const sync = () => setHabitifyConnected(isHabitifyConnected())
    window.addEventListener(HABITIFY_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(HABITIFY_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [])
  const [form, setForm] = useState<MetricFormState | null>(null)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [kindPickerOpen, setKindPickerOpen] = useState(false)
  const [kindPickerCategoryId, setKindPickerCategoryId] = useState(UNGROUPED_CATEGORY_ID)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [sectionDeleteConfirm, setSectionDeleteConfirm] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingMetricDelete | null>(null)
  const [editLogsOpen, setEditLogsOpen] = useState(false)
  const [historyTarget, setHistoryTarget] = useState<MetricHistoryTarget | null>(null)
  const [editingSleepMetricId, setEditingSleepMetricId] = useState<string | null>(null)
  const [addingSleepMetric, setAddingSleepMetric] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState<string | null>(null)
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<string[]>(() =>
    readCollapsedCategoryIds(),
  )

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
  const refreshCategories = useCallback(() => setGoalCategories(getMetricLibraryCategories()), [])

  const toggleCategoryCollapsed = (categoryId: string) => {
    setCollapsedCategoryIds((current) => {
      const next = current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
      saveCollapsedCategoryIds(next)
      return next
    })
  }

  const persistCategories = (custom: GoalCategoryDefinition[]) => {
    saveCustomGoalCategories(custom)
    refreshCategories()
  }

  const renameCategory = (categoryId: string, label: string) => {
    const trimmed = label.trim()
    if (!trimmed || categoryId === UNGROUPED_CATEGORY_ID) return
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
    setKindPickerOpen(false)
    setAddingSleepMetric(false)
  }

  const isPendingDelete = (kind: PendingMetricDelete['kind'], id: string) =>
    pendingDelete?.kind === kind && pendingDelete.id === id

  const requestDelete = (entry: PendingMetricDelete) => {
    closeForm()
    setPendingDelete(entry)
  }

  const openKindPicker = (categoryId: string = UNGROUPED_CATEGORY_ID) => {
    closeForm()
    setKindPickerCategoryId(categoryId)
    setKindPickerOpen(true)
  }

  const openAddHabit = (categoryId: string = kindPickerCategoryId) => {
    if (isHabitifyConnected()) {
      setKindPickerOpen(false)
      return
    }
    setKindPickerOpen(false)
    setForm(emptyForm('habit', 'add', categoryId))
  }

  const openAddWeight = (categoryId: string = kindPickerCategoryId) => {
    setKindPickerOpen(false)
    setForm(emptyForm('weight', 'add', categoryId))
  }

  const openAddFocus = (categoryId: string = kindPickerCategoryId) => {
    setKindPickerOpen(false)
    setForm(emptyForm('focus', 'add', categoryId))
  }

  const openAdd = (categoryId: string = kindPickerCategoryId) => {
    setKindPickerOpen(false)
    setForm(emptyForm('goal', 'add', categoryId))
    setCategoryPickerOpen(false)
  }

  const openAddWorkout = (categoryId: string = kindPickerCategoryId) => {
    setKindPickerOpen(false)
    setForm(emptyForm('workout', 'add', categoryId))
  }

  const openAddSleep = (categoryId: string = kindPickerCategoryId) => {
    setKindPickerOpen(false)
    setKindPickerCategoryId(categoryId)
    setAddingSleepMetric(true)
  }

  const openMetricHistory = (target: MetricHistoryTarget) => {
    setHistoryTarget(target)
    setEditingSleepMetricId(null)
  }

  const openEditHabit = (habit: HabitTypeDefinition) => {
    setForm({
      ...emptyForm('habit', 'edit', resolveGoalCategoryId(habit.category_id)),
      habitId: habit.id,
      name: habit.label,
      logPeriod: habitLogPeriod(habit),
      habitLogWhen: habitLogWhen(habit),
      habitMorningDay: habitMorningDay(habit),
    })
  }

  const openEditWeight = (goal: Goal) => {
    setForm({
      ...emptyForm('weight', 'edit', resolveGoalCategoryId(goal.category_id)),
      goalId: goal.id,
      unit: settings.weightUnit,
      logPeriod: goalLogPeriod(goal),
      goalLogWhen: goalLogWhen(goal),
      goalMorningDay: goalMorningDay(goal),
    })
  }

  const openEditGoal = (goal: Goal) => {
    if (goal.metric_key === 'focus') {
      setCategoryPickerOpen(false)
      setForm({
        ...emptyForm('focus', 'edit', resolveGoalCategoryId(goal.category_id)),
        goalId: goal.id,
        name: 'Focus',
        logPeriod: goalLogPeriod(goal),
      })
      return
    }

    if (goal.metric_key === 'sleep') {
      setCategoryPickerOpen(false)
      setForm({
        ...emptyForm('sleep', 'edit', resolveGoalCategoryId(goal.category_id)),
        goalId: goal.id,
        name: 'Sleep',
        logPeriod: goalLogPeriod(goal),
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
      unit: goal.unit,
    })
  }

  const openEditWorkout = (type: WorkoutTypeDefinition) => {
    const logPeriod = workoutLogPeriod(type)
    setForm({
      ...emptyForm('workout', 'edit', resolveGoalCategoryId(type.category_id)),
      workoutId: type.id,
      name: type.label,
      logPeriod,
      unit: normalizeWorkoutUnit(type.unit),
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
    formState: MetricFormState,
    existingGoal?: Goal,
  ) => {
    const existing = existingGoal ?? workoutGoal(typeId)
    const unit = normalizeWorkoutUnit(formState.unit || DEFAULT_WORKOUT_UNIT)
    onSaveGoal(
      normalizeGoal({
        id: existing?.id ?? generateId(),
        user_id: userId,
        metric_key: workoutMetricKey(typeId),
        name: label,
        target_value: existing?.target_value ?? null,
        log_period: formState.logPeriod,
        goal_weight_start: existing?.goal_weight_start ?? null,
        goal_weight_target: existing?.goal_weight_target ?? null,
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
      const existing = goals.find((g) => g.metric_key === 'focus' && g.is_active)
      const nextFocus: Goal = {
        id: existing?.id ?? generateId(),
        user_id: userId,
        metric_key: 'focus',
        name: 'Focus',
        target_value: existing?.target_value ?? null,
        log_period: form.logPeriod,
        goal_weight_start: existing?.goal_weight_start ?? null,
        goal_weight_target: existing?.goal_weight_target ?? null,
        unit: existing?.unit ?? 'min',
        is_active: true,
        created_at: existing?.created_at ?? new Date().toISOString(),
        category_id: storedLibraryCategoryId(form.categoryId),
      }
      onSaveGoal(normalizeGoal(nextFocus))
      enableMetricsSection('focus')
      saveFocusSettings({
        ...getFocusSettings(),
        focusGoalPeriod: form.logPeriod,
      })
      closeForm()
      return
    }

    if (form.kind === 'habit') {
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
        autoEnrollInMorningLog({ kind: 'habit', logPeriod: form.logPeriod, habitId: id })
        enableMetricsSection('habits')
      }
      closeForm()
      return
    }

    if (form.kind === 'sleep') {
      const existing =
        form.mode === 'edit' && form.goalId
          ? goals.find((g) => g.id === form.goalId)
          : activeSleepGoal

      const nextSleep: Goal = {
        id: existing?.id ?? generateId(),
        user_id: userId,
        metric_key: 'sleep',
        name: 'Sleep',
        target_value: existing?.target_value ?? null,
        log_period: form.logPeriod,
        target_period: existing?.target_period,
        period_days: existing?.period_days,
        period_start_date: existing?.period_start_date,
        period_end_date: existing?.period_end_date,
        period_recurring: existing?.period_recurring,
        goal_weight_start: null,
        goal_weight_target: null,
        unit: 'hrs',
        is_active: true,
        created_at: existing?.created_at ?? new Date().toISOString(),
        category_id: storedLibraryCategoryId(form.categoryId),
      }
      delete nextSleep.log_when
      delete nextSleep.morning_day

      onSaveGoal(normalizeGoal(nextSleep))
      closeForm()
      return
    }

    if (form.kind === 'goal') {
      if (form.mode === 'edit' && form.goalId) {
        const existing = goals.find((g) => g.id === form.goalId)
        if (!existing) return
        const nextGoal: Goal = {
          ...existing,
          name,
          log_period: form.logPeriod,
          unit: form.unit.trim() || existing.unit,
          category_id: storedLibraryCategoryId(form.categoryId),
        }
        delete nextGoal.log_when
        delete nextGoal.morning_day
        onSaveGoal(normalizeGoal(nextGoal))
      } else {
        const resolvedKey = goalKeyFromName(name)
        const nextGoal: Goal = {
          id: generateId(),
          user_id: userId,
          metric_key: resolvedKey,
          name,
          target_value: null,
          log_period: form.logPeriod,
          goal_weight_start: null,
          goal_weight_target: null,
          unit: form.unit.trim() || defaultUnitForMetric(resolvedKey),
          category_id: storedLibraryCategoryId(form.categoryId),
          is_active: true,
          created_at: new Date().toISOString(),
        }
        onSaveGoal(normalizeGoal(nextGoal))
        autoEnrollInMorningLog({
          kind: 'goal',
          logPeriod: form.logPeriod,
          metricKey: resolvedKey,
        })
      }
      enableMetricsSection(
        form.categoryId && form.categoryId !== UNGROUPED_CATEGORY_ID
          ? form.categoryId
          : 'default',
      )
      closeForm()
      return
    }

    if (form.kind === 'weight') {
      const unit = settings.weightUnit
      const existing = form.mode === 'edit' && form.goalId
        ? goals.find((g) => g.id === form.goalId)
        : activeWeightGoal

      const savedWeightGoal = normalizeGoal({
        id: existing?.id ?? generateId(),
        user_id: userId,
        metric_key: 'weight',
        name: 'Weight',
        target_value: existing?.target_value ?? null,
        log_period: form.logPeriod,
        goal_weight_start: existing?.goal_weight_start ?? null,
        goal_weight_target: existing?.goal_weight_target ?? null,
        period_start_date: existing?.period_start_date,
        period_end_date: existing?.period_end_date,
        unit,
        is_active: true,
        created_at: existing?.created_at ?? new Date().toISOString(),
        category_id: storedLibraryCategoryId(form.categoryId),
      })
      onSaveGoal(savedWeightGoal)
      enableMetricsSection('weight')
      if (form.logPeriod === 'daily') {
        autoEnrollInMorningLog({ kind: 'weight', logPeriod: form.logPeriod })
      }
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
      const logPeriod = form.logPeriod
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
                log_period: logPeriod,
                subtypes: subtypes.length > 0 ? subtypes : undefined,
                category_id: storedLibraryCategoryId(form.categoryId),
                log_when: undefined,
                morning_day: undefined,
              }
            : t,
        )
        persistWorkoutTypes(updated)
        saveWorkoutGoal(form.workoutId, name, form, workoutGoal(form.workoutId))
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
            log_period: logPeriod,
            ...(subtypes.length > 0 ? { subtypes } : {}),
            category_id: storedLibraryCategoryId(form.categoryId) ?? undefined,
          },
        ])
        saveWorkoutGoal(id, name, form)
        autoEnrollInMorningLog({ kind: 'workout', logPeriod, workoutId: id })
        enableMetricsSection('workouts')
        updateSettings({ showWorkoutMetrics: true })
      }
      closeForm()
    }
  }

  const deleteHabit = (habit: HabitTypeDefinition) => {
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

  const libraryItems = useMemo(() => {
    const items: Array<{
      key: string
      categoryId: string
      node: 'habit' | 'sleep' | 'goal' | 'workout'
      habit?: HabitTypeDefinition
      sleepMetric?: SleepMetricDefinition
      goal?: Goal
      workout?: WorkoutTypeDefinition
    }> = []

    for (const habit of habits) {
      items.push({
        key: `habit:${habit.id}`,
        categoryId: resolveGoalCategoryId(habit.category_id),
        node: 'habit',
        habit,
      })
    }
    for (const metric of getEnabledSleepMetrics(sleepMetricsConfig)) {
      items.push({
        key: `sleep:${metric.id}`,
        categoryId: resolveGoalCategoryId(sleepMetricsConfig.categories?.[metric.id]),
        node: 'sleep',
        sleepMetric: metric,
      })
    }
    if (activeWeightGoal) {
      items.push({
        key: `goal:${activeWeightGoal.id}`,
        categoryId: resolveGoalCategoryId(activeWeightGoal.category_id),
        node: 'goal',
        goal: activeWeightGoal,
      })
    }
    if (activeFocusGoal) {
      items.push({
        key: `goal:${activeFocusGoal.id}`,
        categoryId: resolveGoalCategoryId(activeFocusGoal.category_id),
        node: 'goal',
        goal: activeFocusGoal,
      })
    }
    for (const goal of customGoals) {
      items.push({
        key: `goal:${goal.id}`,
        categoryId: resolveGoalCategoryId(goal.category_id),
        node: 'goal',
        goal,
      })
    }
    for (const workout of workoutTypes) {
      items.push({
        key: `workout:${workout.id}`,
        categoryId: resolveGoalCategoryId(workout.category_id),
        node: 'workout',
        workout,
      })
    }
    return items
  }, [
    habits,
    sleepMetricsConfig,
    activeWeightGoal,
    activeFocusGoal,
    customGoals,
    workoutTypes,
  ])

  const categoryItemCount = (categoryId: string): number =>
    libraryItems.filter((item) => item.categoryId === categoryId).length

  const executeDeleteCategory = (categoryId: string) => {
    closeForm()
    setSectionDeleteConfirm(null)
    setEditingCategoryId(null)
    ungroupMetricsInCategory(categoryId)
    for (const goal of goals) {
      if (goal.category_id === categoryId) {
        onSaveGoal(normalizeGoal({ ...goal, category_id: null }))
      }
    }
    refreshCategories()
    refreshWorkouts()
  }

  const renderHabitCard = (habit: HabitTypeDefinition) => {
    const isEditing = form?.kind === 'habit' && form.habitId === habit.id

    if (isEditing) {
      return renderInlineFormCard(habit.id)
    }

    if (isPendingDelete('habit', habit.id)) {
      return (
        <Card key={habit.id} className="border-red-900/40 bg-red-950/20">
          <MetricDeleteConfirmInline
            name={habit.label}
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => deleteHabit(habit)}
          />
        </Card>
      )
    }

    return (
      <Card key={habit.id} onClick={() => openMetricHistory({ kind: 'habit', habitId: habit.id })}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <Flame size={14} className="mt-0.5 shrink-0 text-[var(--accent-400)]" />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-zinc-200">{habit.label}</h3>
              <p className="text-[10px] text-zinc-500">{formatHabitCardSubtitle(habit)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openEditHabit(habit)
              }}
              className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
              aria-label={`Edit ${habit.label} settings`}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                requestDelete({ kind: 'habit', id: habit.id })
              }}
              className="rounded-lg p-1.5 text-zinc-600 hover:text-red-400"
              aria-label={`Delete ${habit.label}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </Card>
    )
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
              {goal.unit ? ` · ${goal.unit}` : ''}
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
                {`${type.unit || DEFAULT_WORKOUT_UNIT} · ${workoutLogPeriod(type)}`}
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
              Weight · {goalLogPeriod(goal) === 'daily' ? 'daily' : 'weekly'}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums leading-tight text-zinc-100">
              {settings.weightUnit}
            </p>
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
    if (form.kind === 'weight' || form.kind === 'focus' || form.kind === 'sleep') return true
    if (
      (form.kind === 'habit' || form.kind === 'goal' || form.kind === 'workout') &&
      !form.name.trim()
    ) {
      return false
    }
    return true
  })()

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

        <GoalCategoryPicker
          value={form.categoryId}
          categories={goalCategories}
          open={categoryPickerOpen}
          onOpenChange={setCategoryPickerOpen}
          onChange={(categoryId) => setForm({ ...form, categoryId })}
        />

        {form.kind === 'focus' && (
          <>
            <PeriodPicker
              label="Period"
              value={form.logPeriod}
              onChange={(logPeriod) => setForm({ ...form, logPeriod })}
            />
            <p className="text-[10px] leading-snug text-zinc-500">
              Tracked automatically from your focus timer sessions. Set a focus target on the Goals
              page.
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
            {form.logPeriod === 'daily' && (
              <p className="text-[10px] leading-snug text-zinc-500">
                Logged from Home, and at shutdown if it’s still missing. Add it to Morning log in
                Settings if you want it there.
              </p>
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
              <p className="text-[10px] leading-snug text-zinc-500">
                Daily weigh-ins from Home, and at shutdown if still missing. Set a bulk, cut, or
                maintain target on the Goals page. Add it to Morning log in Settings if you want it
                there.
              </p>
            ) : (
              <p className="text-[10px] leading-snug text-zinc-500">
                Log once at weekly shutdown. Set the weight outcome on the Goals page.
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
              <p className="text-[10px] leading-snug text-zinc-500">
                Logged from Home, and at shutdown if it’s still missing. Add it to Morning log in
                Settings if you want it there.
              </p>
            )}
          </>
        )}

        {form.kind === 'goal' && (
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
            {form.logPeriod === 'daily' && (
              <p className="text-[10px] leading-snug text-zinc-500">
                Logged from Home, and at shutdown if it’s still missing. Add it to Morning log in
                Settings if you want it there.
              </p>
            )}
            {form.logPeriod === 'weekly' && (
              <p className="text-[10px] leading-snug text-zinc-500">
                Weekly log entries are entered at weekly shutdown. Set the target on the Goals page.
              </p>
            )}
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
            {form.logPeriod === 'daily' && (
              <p className="text-[10px] leading-snug text-zinc-500">
                Logged from Home, and at shutdown if it’s still missing. Add it to Morning log in
                Settings if you want it there.
              </p>
            )}
            {form.logPeriod === 'weekly' && (
              <p className="text-[10px] leading-snug text-zinc-500">
                Weekly totals are entered at weekly shutdown. Set a training target on the Goals page.
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

  const renderSleepMetricCard = (metric: SleepMetricDefinition) => {
    const unitLabel = sleepMetricDisplayUnit(metric)
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
          <p className="mt-3 text-[10px] leading-snug text-zinc-500">
            Sleep targets live on the Goals page. This field is only for measurement.
          </p>
          <label className="mt-3 block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Category
            </span>
            <select
              value={resolveGoalCategoryId(sleepMetricsConfig.categories?.[metric.id])}
              onChange={(e) =>
                saveSleepMetricsConfig(
                  setSleepMetricCategory(
                    sleepMetricsConfig,
                    metric.id,
                    storedLibraryCategoryId(e.target.value),
                  ),
                )
              }
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
            >
              {goalCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
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
                setEditingSleepMetricId(null)
              }}
            >
              Remove
            </Button>
          </div>
        </Card>
      )
    }

    return (
      <Card
        key={metric.id}
        onClick={() => openMetricHistory({ kind: 'sleep_metric', metricId: metric.id })}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-zinc-200">{metric.label}</h3>
            <p className="text-[10px] text-zinc-500">{unitLabel}</p>
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

  const renderLibraryItem = (item: (typeof libraryItems)[number]) => {
    if (item.node === 'habit' && item.habit) return renderHabitCard(item.habit)
    if (item.node === 'sleep' && item.sleepMetric) return renderSleepMetricCard(item.sleepMetric)
    if (item.node === 'goal' && item.goal) {
      return item.goal.metric_key === 'weight'
        ? renderWeightCard(item.goal)
        : renderGoalCard(item.goal)
    }
    if (item.node === 'workout' && item.workout) return renderWorkoutCard(item.workout)
    return null
  }

  const kindOptions = [
    {
      id: 'habit' as const,
      label: 'Habit',
      description: habitifyConnected ? 'Synced with Habitify' : 'Done or not done',
      icon: Repeat,
      hidden: habitifyConnected,
    },
    { id: 'goal' as const, label: 'Number', description: 'Pages, hours, kg…', icon: Shapes },
    { id: 'workout' as const, label: 'Workout', description: 'Training sessions', icon: Dumbbell },
    { id: 'sleep' as const, label: 'Sleep field', description: 'Duration, bedtime, scores', icon: Moon },
    { id: 'weight' as const, label: 'Weight', description: 'Weigh-ins', icon: Scale, hidden: !!activeWeightGoal },
    { id: 'focus' as const, label: 'Focus', description: 'From the focus timer', icon: Brain, hidden: !!activeFocusGoal },
  ].filter((option) => !option.hidden)

  const handleKindPick = (id: (typeof kindOptions)[number]['id']) => {
    if (id === 'habit') openAddHabit(kindPickerCategoryId)
    else if (id === 'goal') openAdd(kindPickerCategoryId)
    else if (id === 'workout') openAddWorkout(kindPickerCategoryId)
    else if (id === 'sleep') openAddSleep(kindPickerCategoryId)
    else if (id === 'weight') openAddWeight(kindPickerCategoryId)
    else openAddFocus(kindPickerCategoryId)
  }

  const renderKindPickerCard = () => (
    <Card className="p-3 ring-1 ring-[var(--accent-500)]/25 sm:col-span-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          What do you measure?
        </p>
        <button
          type="button"
          onClick={() => setKindPickerOpen(false)}
          className="rounded p-1 text-zinc-500 hover:text-zinc-300"
          aria-label="Cancel"
        >
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {kindOptions.map((option) => {
          const Icon = option.icon
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleKindPick(option.id)}
              className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 text-left hover:border-[var(--accent-500)]/40"
            >
              <Icon size={14} className="mt-0.5 shrink-0 text-zinc-400" />
              <span>
                <span className="block text-sm font-medium text-zinc-100">{option.label}</span>
                <span className="block text-[10px] text-zinc-500">{option.description}</span>
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )

  const groupedCategories = useMemo(() => {
    const base = goalCategories.filter((category) => {
      if (category.id !== UNGROUPED_CATEGORY_ID) return true
      return (
        libraryItems.some((item) => item.categoryId === UNGROUPED_CATEGORY_ID) ||
        goalCategories.length === 1
      )
    })
    if (
      habitifyConnected &&
      !base.some((category) => category.id === KIND_CATEGORY_FALLBACK.habit)
    ) {
      return [
        { id: KIND_CATEGORY_FALLBACK.habit, label: 'Habits' },
        ...base,
      ]
    }
    return base
  }, [goalCategories, libraryItems, habitifyConnected])

  const metricsEmpty = libraryItems.length === 0 && !habitifyConnected

  const renderCategoryGrid = (categoryId: string) => {
    const items = libraryItems.filter((item) => item.categoryId === categoryId)
    const isHabitsCategory = categoryId === KIND_CATEGORY_FALLBACK.habit
    const showHabitifyNotice = habitifyConnected && isHabitsCategory

    return (
      <div className="space-y-3">
        {showHabitifyNotice ? (
          <p className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2.5 text-xs leading-relaxed text-zinc-400">
            You can’t add habit metrics in Dojo while Habitify is connected — habits are synced and
            linked with Habitify. Manage them there; they’ll show on Home.
          </p>
        ) : null}
        {items.length > 0 ? (
          <div className="grid items-start gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <div key={item.key}>{renderLibraryItem(item)}</div>
            ))}
          </div>
        ) : showHabitifyNotice ? null : (
          <p className="text-xs text-zinc-600">No metrics in this category yet.</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Metrics</h2>
          <p className="mt-0.5 max-w-xl text-xs text-zinc-500">
            A library of what you measure — name, unit, and when you log. Group them into categories
            only to keep order. Outcomes live on{' '}
            <Link to="/goals" className="text-[var(--accent-300)] hover:underline">
              Goals
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openKindPicker()}
          >
            <Plus size={14} />
            Metric
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setNewCategoryName('')}
          >
            + Category
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditLogsOpen(true)}
          >
            <History size={14} />
            Edit logs
          </Button>
        </div>
      </div>

      {newCategoryName != null && (
        <Card className="p-3 ring-1 ring-[var(--accent-500)]/25">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            New category
          </p>
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Health, Training"
              className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-[var(--accent-500)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newCategoryName.trim()) {
                  createMetricCategory(newCategoryName)
                  refreshCategories()
                  setNewCategoryName(null)
                }
                if (e.key === 'Escape') setNewCategoryName(null)
              }}
            />
            <Button
              size="sm"
              disabled={!newCategoryName.trim()}
              onClick={() => {
                createMetricCategory(newCategoryName)
                refreshCategories()
                setNewCategoryName(null)
              }}
            >
              <Check size={13} /> Add
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setNewCategoryName(null)}>
              <X size={13} />
            </Button>
          </div>
        </Card>
      )}

      {metricsEmpty && !kindPickerOpen && !form && !addingSleepMetric ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">No metrics yet</p>
          <p className="mt-1 text-xs text-zinc-600">
            Add anything you want to measure. A metric can exist with no goal attached.
          </p>
          <Button size="sm" className="mt-4" onClick={() => openKindPicker()}>
            <Plus size={14} />
            Add metric
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {kindPickerOpen && renderKindPickerCard()}
          {addingSleepMetric && (
            <Card className="p-3 ring-1 ring-[var(--accent-500)]/25">
              <SleepMetricTemplatePicker
                config={sleepMetricsConfig}
                onChange={(config) => {
                  enableMetricsSection('sleep')
                  const added = config.enabledIds.filter(
                    (id) => !sleepMetricsConfig.enabledIds.includes(id),
                  )
                  let next = config
                  for (const id of added) {
                    next = setSleepMetricCategory(
                      next,
                      id,
                      storedLibraryCategoryId(kindPickerCategoryId),
                    )
                  }
                  saveSleepMetricsConfig(next)
                  for (const id of added) {
                    autoEnrollInMorningLog({ kind: 'sleep', logPeriod: 'daily', sleepFieldId: id })
                  }
                }}
                onDone={() => setAddingSleepMetric(false)}
              />
            </Card>
          )}
          {form?.mode === 'add' && renderInlineFormCard(`add-${form.kind}`)}
          {groupedCategories.map((category) => {
            const collapsed = collapsedCategoryIds.includes(category.id)
            return (
            <section key={category.id}>
              <div className="mb-3 flex items-center gap-1.5">
                {editingCategoryId === category.id ? (
                  <>
                    <input
                      type="text"
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      className="w-48 max-w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-base font-semibold text-zinc-100 focus:border-[var(--accent-500)] focus:outline-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          renameCategory(category.id, editingCategoryName)
                          setEditingCategoryId(null)
                        }
                        if (e.key === 'Escape') setEditingCategoryId(null)
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        renameCategory(category.id, editingCategoryName)
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
                    <button
                      type="button"
                      onClick={() => toggleCategoryCollapsed(category.id)}
                      className="flex min-w-0 items-center gap-1.5 text-left"
                      aria-expanded={!collapsed}
                    >
                      <ChevronDown
                        size={14}
                        className={cn(
                          'shrink-0 text-zinc-500 transition-transform',
                          collapsed && '-rotate-90',
                        )}
                      />
                      <h3 className="text-sm font-semibold text-zinc-200">{category.label}</h3>
                    </button>
                    {category.id !== UNGROUPED_CATEGORY_ID && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategoryId(category.id)
                            setEditingCategoryName(category.label)
                          }}
                          className="rounded p-1 text-zinc-600 hover:text-indigo-400"
                          aria-label={`Rename ${category.label}`}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSectionDeleteConfirm(category.id)}
                          className="rounded p-1 text-zinc-600 hover:text-red-400"
                          aria-label={`Delete ${category.label}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
              {sectionDeleteConfirm === category.id && (
                <div className="mb-3 rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3">
                  <p className="text-sm text-zinc-300">
                    Remove <span className="font-medium text-zinc-100">{category.label}</span>? Metrics
                    stay — they move to {UNGROUPED_CATEGORY_LABEL}
                    {categoryItemCount(category.id) > 0
                      ? ` (${categoryItemCount(category.id)})`
                      : ''}
                    .
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
                      onClick={() => executeDeleteCategory(category.id)}
                    >
                      Remove category
                    </Button>
                  </div>
                </div>
              )}
              {!collapsed && renderCategoryGrid(category.id)}
            </section>
            )
          })}
        </div>
      )}

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
