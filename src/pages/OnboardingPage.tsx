import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import {
  OnboardingField,
  OnboardingLayout,
  OnboardingNavButtons,
  OnboardingOption,
  onboardingInputClass,
} from '@/components/onboarding/OnboardingLayout'
import { OnboardingSleepMetricsStep } from '@/components/onboarding/OnboardingSleepMetricsStep'
import { AccentPicker } from '@/components/settings/AccentPicker'
import { SegmentedControl, ToggleRow } from '@/components/settings/SettingsControls'
import { Button } from '@/components/ui/Button'
import { useSettings } from '@/context/SettingsContext'
import { useAuth } from '@/hooks/useData'
import {
  applyOnboardingConfig,
  createBlankWorkoutDraft,
  defaultOnboardingData,
  isOnboardingPreview,
  ONBOARDING_TRACK_OPTIONS,
  stopOnboardingPreview,
  type OnboardingData,
  type OnboardingMeasurementDraft,
  type OnboardingTrack,
  type OnboardingWorkoutDraft,
} from '@/lib/onboarding'
import {
  buildOnboardingSteps,
  canContinueOnboardingStep,
  getMainProgressStep,
  getOnboardingStepMeta,
  isGoalSubstep,
  MAIN_ONBOARDING_STEP_COUNT,
  skipGoalCategory,
} from '@/lib/onboardingSteps'
import { cn, formatDate } from '@/lib/utils'
import type { GoalTargetPeriod } from '@/types'
import { addDays } from 'date-fns'

export function OnboardingPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  const { updateSettings } = useSettings()
  const preview = isOnboardingPreview()
  const [stepIndex, setStepIndex] = useState(0)
  const [data, setData] = useState<OnboardingData>(() => defaultOnboardingData())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const steps = useMemo(() => buildOnboardingSteps(data), [data])
  const step = steps[Math.min(stepIndex, steps.length - 1)] ?? 'tracks'
  const stepMeta = getOnboardingStepMeta(step, data)
  const canContinue = canContinueOnboardingStep(step, data)
  const isLastStep = stepIndex >= steps.length - 1

  useEffect(() => {
    if (stepIndex >= steps.length) {
      setStepIndex(Math.max(0, steps.length - 1))
    }
  }, [stepIndex, steps.length])

  useEffect(() => {
    updateSettings({ accentColor: data.preferences.accentColor })
  }, [data.preferences.accentColor, updateSettings])

  const toggleTrack = (track: OnboardingTrack) => {
    setData((prev) => ({
      ...prev,
      tracks: prev.tracks.includes(track)
        ? prev.tracks.filter((t) => t !== track)
        : [...prev.tracks, track],
    }))
  }

  const finish = async () => {
    if (!userId) return
    setSaving(true)
    setError(null)
    try {
      if (preview) {
        stopOnboardingPreview()
        navigate('/settings')
        return
      }
      const settingsPatch = await applyOnboardingConfig(userId, data)
      updateSettings(settingsPatch)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your setup.')
    } finally {
      setSaving(false)
    }
  }

  const exitPreview = () => {
    stopOnboardingPreview()
    navigate('/settings')
  }

  const updateHabit = (index: number, value: string) => {
    setData((prev) => {
      const habits = [...prev.habits]
      habits[index] = value
      return { ...prev, habits }
    })
  }

  const addHabit = () => setData((prev) => ({ ...prev, habits: [...prev.habits, ''] }))
  const removeHabit = (index: number) =>
    setData((prev) => ({ ...prev, habits: prev.habits.filter((_, i) => i !== index) }))

  const updateWorkout = (index: number, patch: Partial<OnboardingWorkoutDraft>) => {
    setData((prev) => {
      const workoutTypes = [...prev.workoutTypes]
      workoutTypes[index] = { ...workoutTypes[index], ...patch }
      return { ...prev, workoutTypes }
    })
  }

  const addWorkoutType = () => {
    setData((prev) => ({
      ...prev,
      workoutTypes: [...prev.workoutTypes, createBlankWorkoutDraft(prev.workoutTypes.length)],
    }))
  }

  const removeWorkout = (index: number) => {
    setData((prev) => {
      const next = prev.workoutTypes.filter((_, i) => i !== index)
      return {
        ...prev,
        workoutTypes: next.length > 0 ? next : [createBlankWorkoutDraft(0)],
      }
    })
  }

  const updateMeasurement = (index: number, patch: Partial<OnboardingMeasurementDraft>) => {
    setData((prev) => {
      const measurements = [...prev.measurements]
      measurements[index] = { ...measurements[index], ...patch }
      return { ...prev, measurements }
    })
  }

  const addMeasurement = () =>
    setData((prev) => ({
      ...prev,
      measurements: [...prev.measurements, { name: '', unit: '' }],
    }))

  const removeMeasurement = (index: number) =>
    setData((prev) => ({
      ...prev,
      measurements: prev.measurements.filter((_, i) => i !== index),
    }))

  const handleNext = () => {
    if (!canContinue) return
    if (isLastStep) {
      void finish()
      return
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1))
  }

  const handleBack = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1)
  }

  const handleSkipGoal = () => {
    if (!isGoalSubstep(step)) return
    setData((prev) => skipGoalCategory(prev, step))
  }

  const renderTracksStep = () => (
    <div className="space-y-2">
      {ONBOARDING_TRACK_OPTIONS.map((option) => (
        <OnboardingOption
          key={option.id}
          selected={data.tracks.includes(option.id)}
          onClick={() => toggleTrack(option.id)}
          title={option.label}
          description={option.description}
        />
      ))}
    </div>
  )

  const renderPreferencesStep = () => (
    <div className="space-y-5">
      <OnboardingField label="Week starts on">
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 1 as const, label: 'Monday' },
            { value: 0 as const, label: 'Sunday' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                setData((prev) => ({
                  ...prev,
                  preferences: { ...prev.preferences, weekStartsOn: opt.value },
                }))
              }
              className={cn(
                'rounded-lg border px-3 py-2 text-sm transition-colors',
                data.preferences.weekStartsOn === opt.value
                  ? 'border-[var(--accent-500)]/60 bg-[var(--accent-950)]/40 text-zinc-100'
                  : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </OnboardingField>

      <AccentPicker
        value={data.preferences.accentColor}
        onChange={(accentColor) =>
          setData((prev) => ({
            ...prev,
            preferences: { ...prev.preferences, accentColor },
          }))
        }
      />
    </div>
  )

  const renderSleepStep = () => (
    <OnboardingSleepMetricsStep
      config={data.sleepMetrics}
      onChange={(sleepMetrics) => setData((prev) => ({ ...prev, sleepMetrics }))}
    />
  )

  const renderFocusStep = () => (
    <div className="space-y-4">
      <OnboardingField label="Target amount">
        <input
          type="number"
          min={1}
          value={data.focusTargetAmount}
          onChange={(e) =>
            setData((prev) => ({
              ...prev,
              focusTargetAmount: Number(e.target.value) || 1,
            }))
          }
          className={onboardingInputClass}
        />
      </OnboardingField>
      <SegmentedControl
        label="Unit"
        value={data.focusTargetUnit}
        options={[
          { value: 'hours', label: 'Hours' },
          { value: 'minutes', label: 'Minutes' },
        ]}
        onChange={(focusTargetUnit) => setData((prev) => ({ ...prev, focusTargetUnit }))}
      />
      <SegmentedControl
        label="Period"
        value={data.focusTargetPeriod}
        options={[
          { value: 'daily', label: 'Per day' },
          { value: 'weekly', label: 'Per week' },
        ]}
        onChange={(focusTargetPeriod) => setData((prev) => ({ ...prev, focusTargetPeriod }))}
      />
    </div>
  )

  const renderHabitsStep = () => (
    <div className="space-y-3">
      <div className="space-y-2">
        {data.habits.map((habit, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={habit}
              onChange={(e) => updateHabit(index, e.target.value)}
              placeholder="e.g. Meditation"
              className={onboardingInputClass}
            />
            {data.habits.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeHabit(index)}>
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={addHabit}>
        <Plus size={14} />
        Add habit
      </Button>
    </div>
  )

  const renderWorkoutsStep = () => (
    <div className="space-y-3">
      {data.workoutTypes.map((workout, index) => {
        const setTargetPeriod = (targetPeriod: GoalTargetPeriod) => {
          const patch: Partial<OnboardingWorkoutDraft> = { targetPeriod }
          if (targetPeriod === 'custom_date' && !workout.periodStartDate) {
            patch.periodStartDate = formatDate(new Date())
            patch.periodEndDate = formatDate(addDays(new Date(), 28))
          }
          if (targetPeriod === 'custom_duration' && workout.periodDays == null) {
            patch.periodDays = 30
          }
          updateWorkout(index, patch)
        }

        return (
          <div
            key={index}
            className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3"
          >
            <div className="flex gap-2">
              <input
                value={workout.label}
                onChange={(e) => updateWorkout(index, { label: e.target.value })}
                placeholder="Workout name"
                className={onboardingInputClass}
              />
              {data.workoutTypes.length > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeWorkout(index)}>
                  <Trash2 size={14} />
                </Button>
              )}
            </div>

            <SegmentedControl
              label="Target timeframe"
              value={workout.targetPeriod}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'custom_duration', label: 'Days' },
                { value: 'custom_date', label: 'Dates' },
              ]}
              onChange={setTargetPeriod}
            />

            {workout.targetPeriod === 'custom_duration' && (
              <OnboardingField label="Period length (days)">
                <input
                  type="number"
                  min={1}
                  value={workout.periodDays ?? ''}
                  onChange={(e) =>
                    updateWorkout(index, {
                      periodDays: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  placeholder="e.g. 30"
                  className={onboardingInputClass}
                />
              </OnboardingField>
            )}

            {workout.targetPeriod === 'custom_date' && (
              <div className="grid grid-cols-2 gap-2">
                <OnboardingField label="Start">
                  <input
                    type="date"
                    value={workout.periodStartDate ?? ''}
                    onChange={(e) =>
                      updateWorkout(index, { periodStartDate: e.target.value || null })
                    }
                    className={onboardingInputClass}
                  />
                </OnboardingField>
                <OnboardingField label="End">
                  <input
                    type="date"
                    value={workout.periodEndDate ?? ''}
                    onChange={(e) =>
                      updateWorkout(index, { periodEndDate: e.target.value || null })
                    }
                    className={onboardingInputClass}
                  />
                </OnboardingField>
              </div>
            )}

            <OnboardingField label="Target minutes (optional)">
              <input
                type="number"
                min={0}
                value={workout.targetMinutes ?? ''}
                onChange={(e) =>
                  updateWorkout(index, {
                    targetMinutes: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="Optional"
                className={onboardingInputClass}
              />
            </OnboardingField>
          </div>
        )
      })}
      <Button type="button" variant="ghost" size="sm" onClick={addWorkoutType}>
        <Plus size={14} />
        Add workout type
      </Button>
    </div>
  )

  const renderMeasurementsStep = () => (
    <div className="space-y-3">
      <div className="space-y-2">
        {data.measurements.map((measurement, index) => (
          <div key={index} className="grid grid-cols-[1fr_100px_auto] gap-2">
            <input
              value={measurement.name}
              onChange={(e) => updateMeasurement(index, { name: e.target.value })}
              placeholder="e.g. Weight, Mood"
              className={onboardingInputClass}
            />
            <input
              value={measurement.unit}
              onChange={(e) => updateMeasurement(index, { unit: e.target.value })}
              placeholder="unit"
              className={onboardingInputClass}
              aria-label="Unit"
            />
            {data.measurements.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeMeasurement(index)}>
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={addMeasurement}>
        <Plus size={14} />
        Add measurement
      </Button>
    </div>
  )

  const renderWeightStep = () => (
    <div className="space-y-4">
      <SegmentedControl
        label="Goal type"
        value={data.weightMode}
        options={[
          { value: 'bulk', label: 'Bulk' },
          { value: 'cut', label: 'Cut' },
          { value: 'maintain', label: 'Maintain' },
        ]}
        onChange={(weightMode) =>
          setData((prev) => ({
            ...prev,
            weightMode,
            weightTargetKg:
              weightMode === 'maintain' && prev.weightStartKg != null
                ? prev.weightStartKg
                : prev.weightTargetKg,
          }))
        }
      />

      <div className={cn('grid gap-2', data.weightMode === 'maintain' ? 'grid-cols-1' : 'grid-cols-2')}>
        {data.weightMode !== 'maintain' && (
          <OnboardingField label="Starting weight (kg)">
            <input
              type="number"
              min={1}
              step={0.1}
              value={data.weightStartKg ?? ''}
              onChange={(e) =>
                setData((prev) => ({
                  ...prev,
                  weightStartKg: e.target.value ? Number(e.target.value) : null,
                }))
              }
              className={onboardingInputClass}
            />
          </OnboardingField>
        )}
        <OnboardingField
          label={
            data.weightMode === 'maintain'
              ? 'Target weight (kg)'
              : data.weightMode === 'bulk'
                ? 'Goal weight (kg)'
                : 'Goal weight (kg)'
          }
        >
          <input
            type="number"
            min={1}
            step={0.1}
            value={data.weightTargetKg ?? ''}
            onChange={(e) => {
              const value = e.target.value ? Number(e.target.value) : null
              setData((prev) => ({
                ...prev,
                weightTargetKg: value,
                ...(prev.weightMode === 'maintain' ? { weightStartKg: value } : {}),
              }))
            }}
            className={onboardingInputClass}
          />
        </OnboardingField>
      </div>

      <ToggleRow
        label="Set a date range"
        description="Optional start and end dates for this goal"
        checked={data.weightUseDates}
        onChange={(weightUseDates) => setData((prev) => ({ ...prev, weightUseDates }))}
      />

      {data.weightUseDates && (
        <div className="grid grid-cols-2 gap-2">
          <OnboardingField label="Start date">
            <input
              type="date"
              value={data.weightStartDate}
              onChange={(e) => setData((prev) => ({ ...prev, weightStartDate: e.target.value }))}
              className={onboardingInputClass}
            />
          </OnboardingField>
          <OnboardingField label="End date">
            <input
              type="date"
              value={data.weightEndDate}
              min={data.weightStartDate}
              onChange={(e) => setData((prev) => ({ ...prev, weightEndDate: e.target.value }))}
              className={onboardingInputClass}
            />
          </OnboardingField>
        </div>
      )}
    </div>
  )

  const renderStepContent = () => {
    switch (step) {
      case 'tracks':
        return renderTracksStep()
      case 'preferences':
        return renderPreferencesStep()
      case 'sleep':
        return renderSleepStep()
      case 'focus':
        return renderFocusStep()
      case 'habits':
        return renderHabitsStep()
      case 'workouts':
        return renderWorkoutsStep()
      case 'measurements':
        return renderMeasurementsStep()
      case 'weight':
        return renderWeightStep()
    }
  }

  return (
    <OnboardingLayout
      step={getMainProgressStep(step)}
      totalSteps={MAIN_ONBOARDING_STEP_COUNT}
      title={stepMeta.title}
      subtitle={stepMeta.subtitle}
      preview={preview}
      footer={
        <>
          {preview && (
            <Button variant="ghost" onClick={exitPreview} className="order-3 sm:mr-auto">
              Exit preview
            </Button>
          )}
          <OnboardingNavButtons
            onBack={stepIndex > 0 ? handleBack : undefined}
            onSkip={isGoalSubstep(step) ? handleSkipGoal : undefined}
            onNext={() => void handleNext()}
            nextLabel={isLastStep ? 'Open Dojo' : 'Continue'}
            nextDisabled={!canContinue}
            loading={saving}
          />
        </>
      }
    >
      {error && (
        <p className="mb-4 rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-400">{error}</p>
      )}
      {preview && stepIndex === 0 && (
        <p className="mb-4 rounded-xl border border-violet-500/25 bg-violet-950/20 px-3 py-2 text-xs text-violet-200">
          This is the exact flow new users see. Nothing is saved until you finish without preview mode.
        </p>
      )}
      {renderStepContent()}
    </OnboardingLayout>
  )
}
