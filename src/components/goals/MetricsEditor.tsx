import { useCallback, useState, type ReactNode } from 'react'
import { Dumbbell, Flame, Pencil, Plus, Scale, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MetricInput } from '@/components/ui/MetricInput'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { WorkoutColorPicker } from '@/components/goals/WorkoutColorPicker'
import { ToggleRow } from '@/components/settings/SettingsControls'
import type { DailyLog, Goal, GoalPeriod, MetricKey, Workout } from '@/types'
import {
  defaultUnitForMetric,
  effectiveLogPeriod,
  goalLogPeriod,
  hasTarget,
  normalizeGoal,
} from '@/lib/goals'
import {
  getHabitTypes,
  habitLogPeriod,
  saveHabitTypes,
  slugifyHabitId,
  type HabitTypeDefinition,
} from '@/lib/habitTypes'
import { calculateProgress } from '@/lib/metrics'
import {
  WORKOUT_COLOR_PRESETS,
  getWorkoutTypes,
  saveWorkoutTypes,
  slugifyWorkoutId,
  workoutMetricKey,
  type WorkoutTypeDefinition,
} from '@/lib/workoutTypes'
import { generateId, getWeekDates } from '@/lib/utils'
import { displayToKg, kgToDisplay } from '@/lib/settingsStore'
import { formatWeightGoalRange, getWeightGoalProgress, isWeightGoal, weightGoalMode, type WeightGoalMode } from '@/lib/weightGoal'
import { useSettings } from '@/context/SettingsContext'
import { cn } from '@/lib/utils'

type MetricKind = 'habit' | 'goal' | 'workout' | 'weight'

interface MetricsEditorProps {
  goals: Goal[]
  log: DailyLog | undefined
  weekLogs: DailyLog[]
  weekWorkouts: Workout[]
  date: string
  weekStartsOn: 0 | 1
  userId: string
  onSaveGoal: (goal: Goal) => void
  onDeleteGoal: (goal: Goal) => void
}

interface MetricFormState {
  mode: 'add' | 'edit'
  kind: MetricKind
  habitId?: string
  goalId?: string
  workoutId?: string
  name: string
  logPeriod: GoalPeriod
  setTarget: boolean
  targetValue: string
  unit: string
  color: string
  weightMode: WeightGoalMode
  weightStart: string
  weightTarget: string
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
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      <div className="flex flex-1 gap-2">
        <button
          type="button"
          onClick={() => onChange('daily')}
          className={cn(
            'flex-1 rounded-md py-1.5 text-xs',
            value === 'daily'
              ? 'bg-[var(--accent-600)] text-white'
              : 'bg-zinc-800 text-zinc-400',
          )}
        >
          daily
        </button>
        <button
          type="button"
          onClick={() => onChange('weekly')}
          className={cn(
            'flex-1 rounded-md py-1.5 text-xs',
            value === 'weekly'
              ? 'bg-[var(--accent-600)] text-white'
              : 'bg-zinc-800 text-zinc-400',
          )}
        >
          weekly
        </button>
      </div>
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
      <span className="text-xs font-medium text-zinc-400">Goal:</span>
      <div className="flex flex-1 gap-2">
        <button
          type="button"
          onClick={() => onChange('bulk')}
          className={cn(
            'flex-1 rounded-md py-1.5 text-xs',
            value === 'bulk'
              ? 'bg-[var(--accent-600)] text-white'
              : 'bg-zinc-800 text-zinc-400',
          )}
        >
          Bulk
        </button>
        <button
          type="button"
          onClick={() => onChange('cut')}
          className={cn(
            'flex-1 rounded-md py-1.5 text-xs',
            value === 'cut'
              ? 'bg-[var(--accent-600)] text-white'
              : 'bg-zinc-800 text-zinc-400',
          )}
        >
          Cut
        </button>
      </div>
    </div>
  )
}

function KindPicker({
  value,
  onChange,
  weightDisabled,
}: {
  value: MetricKind
  onChange: (kind: MetricKind) => void
  weightDisabled?: boolean
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <button
        type="button"
        onClick={() => onChange('habit')}
        className={cn(
          'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-colors',
          value === 'habit'
            ? 'border-[var(--accent-500)] bg-[var(--accent-950)] text-[var(--accent-300)]'
            : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
        )}
      >
        <Flame size={16} />
        Habit
      </button>
      <button
        type="button"
        onClick={() => onChange('goal')}
        className={cn(
          'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-colors',
          value === 'goal'
            ? 'border-[var(--accent-500)] bg-[var(--accent-950)] text-[var(--accent-300)]'
            : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
        )}
      >
        <TargetIcon size={16} />
        Goal
      </button>
      <button
        type="button"
        onClick={() => onChange('workout')}
        className={cn(
          'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-colors',
          value === 'workout'
            ? 'border-[var(--accent-500)] bg-[var(--accent-950)] text-[var(--accent-300)]'
            : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
        )}
      >
        <Dumbbell size={16} />
        Workout
      </button>
      <button
        type="button"
        onClick={() => onChange('weight')}
        disabled={weightDisabled}
        className={cn(
          'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-colors',
          value === 'weight'
            ? 'border-[var(--accent-500)] bg-[var(--accent-950)] text-[var(--accent-300)]'
            : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
          weightDisabled && 'cursor-not-allowed opacity-40 hover:border-zinc-800 hover:text-zinc-400',
        )}
      >
        <Scale size={16} />
        Weight
      </button>
    </div>
  )
}

function TargetIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

function emptyForm(kind: MetricKind = 'goal', mode: 'add' | 'edit' = 'add'): MetricFormState {
  return {
    mode,
    kind,
    name: kind === 'weight' ? 'Weight' : '',
    logPeriod: 'daily',
    setTarget: kind !== 'habit',
    targetValue: '',
    unit: kind === 'workout' ? 'min' : kind === 'weight' ? 'kg' : '',
    color: WORKOUT_COLOR_PRESETS[0],
    weightMode: 'bulk',
    weightStart: '',
    weightTarget: '',
  }
}

export function MetricsEditor({
  goals,
  log,
  weekLogs,
  weekWorkouts,
  date,
  weekStartsOn,
  userId,
  onSaveGoal,
  onDeleteGoal,
}: MetricsEditorProps) {
  const { settings } = useSettings()
  const [habits, setHabits] = useState<HabitTypeDefinition[]>(() => getHabitTypes())
  const [workoutTypes, setWorkoutTypes] = useState<WorkoutTypeDefinition[]>(() => getWorkoutTypes())
  const [form, setForm] = useState<MetricFormState | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)

  const weekDates = getWeekDates(new Date(date), settings.weekStartsOn)
  const customGoals = goals.filter(
    (g) => !g.metric_key.startsWith('workout_') && !isWeightGoal(g),
  )
  const activeWeightGoal = goals.find(isWeightGoal)

  const refreshHabits = useCallback(() => setHabits(getHabitTypes()), [])
  const refreshWorkouts = useCallback(() => setWorkoutTypes(getWorkoutTypes()), [])

  const workoutGoal = (typeId: string) =>
    goals.find((g) => g.metric_key === workoutMetricKey(typeId))

  const closeForm = () => {
    setForm(null)
    setColorPickerOpen(false)
  }

  const openAdd = () => {
    setForm(emptyForm('goal', 'add'))
    setColorPickerOpen(false)
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
    })
  }

  const openEditGoal = (goal: Goal) => {
    setForm({
      ...emptyForm('goal', 'edit'),
      goalId: goal.id,
      name: goal.name,
      logPeriod: goalLogPeriod(goal),
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
      logPeriod: goal ? goalLogPeriod(goal) : 'weekly',
      setTarget: goal ? hasTarget(goal) : false,
      targetValue: goal?.target_value != null ? String(goal.target_value) : '',
      color: type.color,
    })
  }

  const persistHabit = (next: HabitTypeDefinition[]) => {
    saveHabitTypes(next)
    refreshHabits()
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
    logPeriod: GoalPeriod,
  ) => {
    const existing = workoutGoal(typeId)
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
        log_period: logPeriod,
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
      if (form.mode === 'edit' && form.habitId) {
        persistHabit(
          habits.map((h) =>
            h.id === form.habitId
              ? { ...h, label: name, log_period: form.logPeriod }
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
        persistHabit([...habits, { id, label: name, log_period: form.logPeriod }])
      }
      closeForm()
      return
    }

    if (form.kind === 'goal') {
      const value = form.setTarget ? parseFloat(form.targetValue) : null
      if (form.setTarget && (value == null || Number.isNaN(value))) return
      const log_period = form.setTarget ? form.logPeriod : 'daily'

      if (form.mode === 'edit' && form.goalId) {
        const existing = goals.find((g) => g.id === form.goalId)
        if (!existing) return
        onSaveGoal(
          normalizeGoal({
            ...existing,
            name,
            log_period,
            target_value: form.setTarget ? value : null,
            unit: form.unit.trim() || existing.unit,
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
            log_period,
            goal_weight_start: null,
            goal_weight_target: null,
            unit: form.unit.trim() || defaultUnitForMetric(resolvedKey),
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
          log_period: 'daily',
          goal_weight_start: startKg,
          goal_weight_target: targetKg,
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
        saveWorkoutGoal(form.workoutId, name, form.setTarget, form.targetValue, form.logPeriod)
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
        saveWorkoutGoal(id, name, form.setTarget, form.targetValue, form.logPeriod)
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

  const renderGoalCard = (goal: Goal) => {
    const progress = calculateProgress(goal, log, weekWorkouts, date, weekDates, weekLogs, undefined, weekStartsOn)

    return (
      <Card key={goal.id}>
        <div className="mb-2 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-medium text-zinc-200">{goal.name}</h3>
            <p className="text-[10px] text-zinc-500">
              {effectiveLogPeriod(goal)}
              {hasTarget(goal) && goal.target_value != null
                ? ` · ${goal.target_value} ${goal.unit}`
                : ' · track only'}
            </p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => openEditGoal(goal)}
              className="text-zinc-600 hover:text-indigo-400"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onDeleteGoal(goal)}
              className="text-zinc-600 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {hasTarget(goal) ? (
          <ProgressBar
            percent={Math.min(100, progress.percent)}
            onTrack={progress.onTrack}
            label={progress.label}
          />
        ) : (
          <p className="text-xs text-zinc-500">{progress.label}</p>
        )}
      </Card>
    )
  }

  const renderHabitCard = (habit: HabitTypeDefinition) => (
    <Card key={habit.id}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <Flame size={14} className="mt-0.5 shrink-0 text-emerald-400" />
          <div>
            <h3 className="text-sm font-medium text-zinc-200">{habit.label}</h3>
            <p className="text-[10px] text-zinc-500">
              {habitLogPeriod(habit)} · check off
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => openEditHabit(habit)}
            className="text-zinc-600 hover:text-indigo-400"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => deleteHabit(habit)}
            disabled={habits.length <= 1}
            className="text-zinc-600 hover:text-red-400 disabled:opacity-30"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </Card>
  )

  const renderWorkoutCard = (type: WorkoutTypeDefinition) => {
    const goal = workoutGoal(type.id)
    const progress = goal
      ? calculateProgress(goal, log, weekWorkouts, date, weekDates, weekLogs, undefined, weekStartsOn)
      : null

    return (
      <Card key={type.id}>
        <div className="mb-2 flex items-start justify-between">
          <div className="flex items-start gap-2">
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: type.color }}
            />
            <div>
              <h3 className="text-sm font-medium text-zinc-200">{type.label}</h3>
              <p className="text-[10px] text-zinc-500">
                {goal && hasTarget(goal)
                  ? `${goalLogPeriod(goal)} target · ${goal.target_value} min`
                  : 'min · track only'}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => openEditWorkout(type)}
              className="text-zinc-600 hover:text-indigo-400"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => deleteWorkout(type)}
              className="text-zinc-600 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {goal && hasTarget(goal) && progress ? (
          <ProgressBar
            percent={Math.min(100, progress.percent)}
            onTrack={progress.onTrack}
            label={progress.label}
          />
        ) : null}
      </Card>
    )
  }

  const renderWeightCard = (goal: Goal) => {
    const progress = getWeightGoalProgress(goal, weekLogs, weekDates, weekStartsOn)
    const unit = settings.weightUnit

    return (
      <Card key={goal.id}>
        <div className="mb-2 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-medium text-zinc-200">Weight</h3>
            <p className="text-[10px] text-zinc-500">
              {weightGoalMode(goal) === 'bulk' ? 'Bulk' : 'Cut'}
              {goal.goal_weight_start != null && goal.goal_weight_target != null
                ? ` · ${formatWeightGoalRange(goal.goal_weight_start, goal.goal_weight_target, unit)}`
                : ''}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-500">{progress.detail}</p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => openEditWeight(goal)}
              className="text-zinc-600 hover:text-indigo-400"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onDeleteGoal(goal)}
              className="text-zinc-600 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <ProgressBar
          percent={Math.min(100, progress.percentAfter)}
          onTrack={progress.hit}
          label={progress.label}
        />
      </Card>
    )
  }

  const renderSection = (title: string, children: ReactNode, empty: boolean) => {
    if (empty) return null
    return (
      <section>
        <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {title}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">{children}</div>
      </section>
    )
  }

  const formTitle =
    form?.mode === 'edit'
      ? `Edit ${form.kind === 'habit' ? 'Habit' : form.kind === 'workout' ? 'Workout' : form.kind === 'weight' ? 'Weight' : 'Goal'}`
      : 'Add Metric'

  const canSaveForm = (() => {
    if (!form) return false
    if (form.kind === 'weight') {
      const start = parseFloat(form.weightStart)
      const target = parseFloat(form.weightTarget)
      if (Number.isNaN(start) || start <= 0 || Number.isNaN(target) || target <= 0) return false
      if (form.weightMode === 'bulk') return target > start
      return target < start
    }
    if (!form.name.trim()) return false
    if (form.kind === 'habit') return true
    if (form.kind === 'goal') {
      if (!form.setTarget) return true
      const v = parseFloat(form.targetValue)
      return !Number.isNaN(v) && v > 0
    }
    if (form.kind === 'workout') {
      if (!form.setTarget) return true
      const v = parseFloat(form.targetValue)
      return !Number.isNaN(v) && v > 0
    }
    return false
  })()

  const hasAnyMetrics =
    habits.length > 0 || customGoals.length > 0 || workoutTypes.length > 0 || !!activeWeightGoal

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-100">Metrics</h2>
        <Button variant="secondary" size="sm" onClick={openAdd}>
          <Plus size={14} /> Add Metric
        </Button>
      </div>

      {form && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={closeForm}
        >
          <div
            role="dialog"
            aria-labelledby="metric-form-title"
            className="w-full max-w-sm rounded-2xl border border-zinc-700/80 bg-zinc-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 id="metric-form-title" className="text-base font-semibold text-zinc-100">
                {formTitle}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {form.mode === 'add' && (
                <KindPicker
                  value={form.kind}
                  weightDisabled={!!activeWeightGoal}
                  onChange={(kind) =>
                    setForm({
                      ...emptyForm(kind, 'add'),
                      name: form.name,
                      logPeriod: form.logPeriod,
                      color: form.color,
                      weightMode: form.weightMode,
                      weightStart: form.weightStart,
                      weightTarget: form.weightTarget,
                    })
                  }
                />
              )}

              {form.kind === 'workout' && (
                <div className="flex items-end gap-3">
                  <WorkoutColorPicker
                    color={form.color}
                    open={colorPickerOpen}
                    onToggle={() => setColorPickerOpen((v) => !v)}
                    onSelect={(color) => setForm({ ...form, color })}
                  />
                  <div className="min-w-0 flex-1">
                    <MetricInput
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

              {form.kind === 'weight' && (
                <>
                  <WeightModePicker
                    value={form.weightMode}
                    onChange={(weightMode) => setForm({ ...form, weightMode })}
                  />
                  <MetricInput
                    label="Starting weight"
                    unit={settings.weightUnit}
                    value={form.weightStart}
                    onChange={(e) => setForm({ ...form, weightStart: e.target.value })}
                    placeholder="e.g. 80"
                  />
                  <MetricInput
                    label={form.weightMode === 'bulk' ? 'Goal weight (gain to)' : 'Goal weight (cut to)'}
                    unit={settings.weightUnit}
                    value={form.weightTarget}
                    onChange={(e) => setForm({ ...form, weightTarget: e.target.value })}
                    placeholder={form.weightMode === 'bulk' ? 'e.g. 85' : 'e.g. 75'}
                  />
                  <p className="text-[11px] leading-snug text-zinc-500">
                    Log weight in your daily log. Each week compares start-of-week to end-of-week
                    weight against this range.
                  </p>
                </>
              )}

              {form.kind === 'habit' && (
                <PeriodPicker
                  label="Log:"
                  value={form.logPeriod}
                  onChange={(logPeriod) => setForm({ ...form, logPeriod })}
                />
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
                        logPeriod: setTarget ? form.logPeriod : 'daily',
                      })
                    }
                  />
                  {form.setTarget && (
                    <>
                      <PeriodPicker
                        label="Target is:"
                        value={form.logPeriod}
                        onChange={(logPeriod) => setForm({ ...form, logPeriod })}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <MetricInput
                          label={`Target (${form.logPeriod})`}
                          value={form.targetValue}
                          onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                        />
                        <MetricInput
                          label="Unit"
                          type="text"
                          value={form.unit}
                          onChange={(e) => setForm({ ...form, unit: e.target.value })}
                          placeholder="hrs, min, kg"
                        />
                      </div>
                    </>
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
                        logPeriod: setTarget ? form.logPeriod : 'daily',
                      })
                    }
                  />
                  {form.setTarget && (
                    <>
                      <PeriodPicker
                        label="Target is:"
                        value={form.logPeriod}
                        onChange={(logPeriod) => setForm({ ...form, logPeriod })}
                      />
                      <MetricInput
                        label={`Target (${form.logPeriod})`}
                        unit="min"
                        value={form.targetValue}
                        onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                      />
                    </>
                  )}
                </>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="secondary" className="flex-1" onClick={closeForm}>
                  <X size={14} /> Cancel
                </Button>
                <Button className="flex-1" onClick={handleSave} disabled={!canSaveForm}>
                  <Check size={14} /> {form.mode === 'edit' ? 'Update' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {renderSection('Habits', habits.map(renderHabitCard), habits.length === 0)}
        {renderSection('Goals', customGoals.map(renderGoalCard), customGoals.length === 0)}
        {activeWeightGoal ? (
          <section>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Weight
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">{renderWeightCard(activeWeightGoal)}</div>
          </section>
        ) : null}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Workouts
            </h3>
            <Button variant="secondary" size="sm" onClick={openAddWorkout}>
              <Plus size={14} /> Add Workout
            </Button>
          </div>
          {workoutTypes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
              No workouts yet. Add any workout type you track — HIIT, running, yoga, etc.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {workoutTypes.map(renderWorkoutCard)}
            </div>
          )}
        </section>
      </div>

      {!hasAnyMetrics && !form && (
        <p className="py-8 text-center text-sm text-zinc-500">
          No metrics yet. Add a habit, goal, or workout to start tracking.
        </p>
      )}
    </div>
  )
}
