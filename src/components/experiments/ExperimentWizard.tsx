import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DatePickerField } from '@/components/ui/DatePickerField'
import {
  EXPERIMENT_PROTOCOLS,
  createConfounder,
  createEmptyExperiment,
  experimentQuestionLabel,
  generateExperimentSchedule,
  protocolLabel,
} from '@/lib/experiments'
import {
  listMetricOptionsForGoals,
  type GoalMetricOption,
} from '@/lib/outcomeGoals'
import { METRIC_UNIT_OPTIONS } from '@/lib/timedMetrics'
import { slugifyWorkoutId } from '@/lib/workoutTypes'
import { cn, formatDate } from '@/lib/utils'
import type {
  Experiment,
  ExperimentConfounder,
  ExperimentConfounderLogSurface,
  ExperimentProtocol,
  Goal,
  MetricKey,
} from '@/types'

const STEPS = [
  'question',
  'intervention',
  'primary',
  'secondary',
  'confounders',
  'protocol',
  'duration',
  'review',
] as const

type StepId = (typeof STEPS)[number]

const STEP_META: Record<StepId, { title: string; subtitle: string }> = {
  question: {
    title: 'Question',
    subtitle: 'Frame the hypothesis like a scientist.',
  },
  intervention: {
    title: 'Intervention & control',
    subtitle: 'What are you changing — and what happens normally?',
  },
  primary: {
    title: 'Primary outcome',
    subtitle: 'Which metric determines success?',
  },
  secondary: {
    title: 'Secondary outcomes',
    subtitle: 'Optional metrics that might also move.',
  },
  confounders: {
    title: 'Confounders',
    subtitle: 'What else could influence the result?',
  },
  protocol: {
    title: 'Protocol',
    subtitle: 'How will you assign intervention vs control?',
  },
  duration: {
    title: 'Duration',
    subtitle: 'How long should the experiment run?',
  },
  review: {
    title: 'Review & schedule',
    subtitle: 'Dojo generates your day-by-day plan.',
  },
}

export interface NewExperimentMetricDraft {
  metric_key: MetricKey
  name: string
  unit: string
}

interface ExperimentWizardProps {
  hybridGoals: Goal[]
  onSave: (experiment: Experiment, newMetrics?: NewExperimentMetricDraft[]) => void
  onCancel: () => void
}

export function ExperimentWizard({ hybridGoals, onSave, onCancel }: ExperimentWizardProps) {
  const metricOptions = useMemo(() => listMetricOptionsForGoals(hybridGoals), [hybridGoals])

  const [stepIndex, setStepIndex] = useState(0)
  const step = STEPS[stepIndex]!

  const [cause, setCause] = useState('')
  const [effect, setEffect] = useState('')
  const [intervention, setIntervention] = useState('')
  const [control, setControl] = useState('')
  const [primaryMode, setPrimaryMode] = useState<'existing' | 'new'>('existing')
  const [primaryKey, setPrimaryKey] = useState<MetricKey | ''>(
    () => metricOptions[0]?.key ?? '',
  )
  const [newMetricName, setNewMetricName] = useState('')
  const [newMetricUnit, setNewMetricUnit] = useState<string>('score')
  const [secondaryKeys, setSecondaryKeys] = useState<MetricKey[]>([])
  const [secondaryDrafts, setSecondaryDrafts] = useState<NewExperimentMetricDraft[]>([])
  const [secondaryCreateName, setSecondaryCreateName] = useState('')
  const [secondaryCreateUnit, setSecondaryCreateUnit] = useState('score')
  const [showSecondaryCreate, setShowSecondaryCreate] = useState(false)
  const [confounders, setConfounders] = useState<ExperimentConfounder[]>([])
  const [confounderDraft, setConfounderDraft] = useState('')
  const [confounderSurfaces, setConfounderSurfaces] = useState<
    ExperimentConfounderLogSurface[]
  >(['home_log', 'shutdown'])
  const [protocol, setProtocol] = useState<ExperimentProtocol>('randomized_crossover')
  const [durationMode, setDurationMode] = useState<'observations' | 'end_date'>('observations')
  const [observations, setObservations] = useState('14')
  const [endDate, setEndDate] = useState(() => formatDate(new Date(Date.now() + 13 * 86400000)))
  const [startDate, setStartDate] = useState(() => formatDate(new Date()))
  const [scheduleNonce, setScheduleNonce] = useState(0)

  const resolvedPrimaryKey = useMemo((): MetricKey | null => {
    if (primaryMode === 'new') {
      const name = newMetricName.trim()
      if (!name) return null
      return `custom:${slugifyWorkoutId(name)}` as MetricKey
    }
    return primaryKey || null
  }, [primaryMode, newMetricName, primaryKey])

  const duration = useMemo(
    () =>
      durationMode === 'end_date'
        ? ({ mode: 'end_date' as const, end_date: endDate })
        : ({
            mode: 'observations' as const,
            observations: Math.max(2, Math.round(Number(observations) || 14)),
          }),
    [durationMode, endDate, observations],
  )

  const previewSchedule = useMemo(() => {
    if (step !== 'review') return []
    void scheduleNonce
    return generateExperimentSchedule({ protocol, duration, startDate })
  }, [step, protocol, duration, startDate, scheduleNonce])

  const canContinue = (() => {
    switch (step) {
      case 'question':
        return cause.trim().length > 0 && effect.trim().length > 0
      case 'intervention':
        return intervention.trim().length > 0 && control.trim().length > 0
      case 'primary':
        if (primaryMode === 'new') return newMetricName.trim().length > 0
        return Boolean(primaryKey)
      case 'secondary':
      case 'confounders':
      case 'protocol':
        return true
      case 'duration':
        if (durationMode === 'end_date') return Boolean(endDate) && endDate >= startDate
        return Math.round(Number(observations) || 0) >= 2
      case 'review':
        return resolvedPrimaryKey != null && previewSchedule.length >= 2
      default:
        return false
    }
  })()

  const toggleSecondary = (key: MetricKey) => {
    setSecondaryKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  const addSecondaryDraft = () => {
    const name = secondaryCreateName.trim()
    if (!name) return
    const metric_key = `custom:${slugifyWorkoutId(name)}` as MetricKey
    if (metric_key === resolvedPrimaryKey) return
    if (secondaryDrafts.some((d) => d.metric_key === metric_key)) return
    if (secondaryKeys.includes(metric_key)) return
    const draft: NewExperimentMetricDraft = {
      metric_key,
      name,
      unit: secondaryCreateUnit,
    }
    setSecondaryDrafts((prev) => [...prev, draft])
    setSecondaryKeys((prev) => [...prev, metric_key])
    setSecondaryCreateName('')
    setSecondaryCreateUnit('score')
    setShowSecondaryCreate(false)
  }

  const removeSecondaryDraft = (key: MetricKey) => {
    setSecondaryDrafts((prev) => prev.filter((d) => d.metric_key !== key))
    setSecondaryKeys((prev) => prev.filter((k) => k !== key))
  }

  const handleSave = () => {
    if (!resolvedPrimaryKey) return
    const schedule =
      previewSchedule.length > 0
        ? previewSchedule
        : generateExperimentSchedule({ protocol, duration, startDate })
    const experiment = createEmptyExperiment({
      title: experimentQuestionLabel({ cause, effect }),
      cause: cause.trim(),
      effect: effect.trim(),
      intervention: intervention.trim(),
      control: control.trim(),
      primary_metric_key: resolvedPrimaryKey,
      secondary_metric_keys: secondaryKeys.filter((k) => k !== resolvedPrimaryKey),
      confounders,
      confounder_log_surfaces:
        confounders.length > 0
          ? confounderSurfaces.length > 0
            ? confounderSurfaces
            : ['home_log', 'shutdown']
          : [],
      protocol,
      duration,
      start_date: startDate,
      status: 'running',
      schedule,
    })

    const newMetrics: NewExperimentMetricDraft[] = [...secondaryDrafts]
    if (primaryMode === 'new' && newMetricName.trim()) {
      newMetrics.unshift({
        metric_key: resolvedPrimaryKey,
        name: newMetricName.trim(),
        unit: newMetricUnit,
      })
    }

    onSave(experiment, newMetrics.length > 0 ? newMetrics : undefined)
  }

  const meta = STEP_META[step]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-labelledby="experiment-wizard-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800/80 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Step {stepIndex + 1} of {STEPS.length}
            </p>
            <h2
              id="experiment-wizard-title"
              className="mt-0.5 text-base font-semibold text-zinc-100"
            >
              {meta.title}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">{meta.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="h-1 w-full bg-zinc-900">
          <div
            className="h-full bg-[var(--accent-500)] transition-[width] duration-300"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="scrollbar-hidden min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {step === 'question' && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-400">
                Does <span className="text-zinc-200">___</span> cause{' '}
                <span className="text-zinc-200">___</span>?
              </p>
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Cause (what you change)
                </span>
                <input
                  value={cause}
                  onChange={(e) => setCause(e.target.value)}
                  placeholder="e.g. morning sunlight"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Effect (what you measure)
                </span>
                <input
                  value={effect}
                  onChange={(e) => setEffect(e.target.value)}
                  placeholder="e.g. better sleep"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </label>
            </div>
          )}

          {step === 'intervention' && (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Intervention — what are you changing?
                </span>
                <textarea
                  value={intervention}
                  onChange={(e) => setIntervention(e.target.value)}
                  rows={3}
                  placeholder="e.g. 10 min outdoor light within 30 min of waking"
                  className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Control — what happens normally?
                </span>
                <textarea
                  value={control}
                  onChange={(e) => setControl(e.target.value)}
                  rows={3}
                  placeholder="e.g. usual indoor morning routine"
                  className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </label>
            </div>
          )}

          {step === 'primary' && (
            <div className="space-y-3">
              <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 p-1">
                <button
                  type="button"
                  onClick={() => setPrimaryMode('existing')}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    primaryMode === 'existing'
                      ? 'bg-[var(--accent-500)] text-black'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
                  )}
                >
                  Existing metric
                </button>
                <button
                  type="button"
                  onClick={() => setPrimaryMode('new')}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    primaryMode === 'new'
                      ? 'bg-[var(--accent-500)] text-black'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
                  )}
                >
                  Create new
                </button>
              </div>

              {primaryMode === 'existing' ? (
                <MetricSelect
                  options={metricOptions}
                  value={primaryKey}
                  onChange={setPrimaryKey}
                  emptyLabel="No metrics yet — create one"
                />
              ) : (
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                      Metric name
                    </span>
                    <input
                      value={newMetricName}
                      onChange={(e) => setNewMetricName(e.target.value)}
                      placeholder="e.g. Subjective energy"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                      autoFocus
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                      Unit
                    </span>
                    <select
                      value={newMetricUnit}
                      onChange={(e) => setNewMetricUnit(e.target.value)}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                    >
                      <option value="score">score (1–10)</option>
                      {METRIC_UNIT_OPTIONS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}

          {step === 'secondary' && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">Optional. Tap to include, or create a new one.</p>

              {secondaryDrafts.length > 0 && (
                <ul className="space-y-1">
                  {secondaryDrafts.map((draft) => (
                    <li key={draft.metric_key}>
                      <div className="flex w-full items-center justify-between rounded-lg border border-[var(--accent-500)]/50 bg-[var(--accent-950)]/50 px-3 py-2 text-sm text-zinc-100">
                        <span className="truncate">
                          {draft.name}
                          <span className="ml-1.5 text-[10px] text-zinc-500">{draft.unit}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSecondaryDraft(draft.metric_key)}
                          className="shrink-0 text-[11px] text-zinc-500 hover:text-red-400"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {showSecondaryCreate ? (
                <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                      Metric name
                    </span>
                    <input
                      value={secondaryCreateName}
                      onChange={(e) => setSecondaryCreateName(e.target.value)}
                      placeholder="e.g. Mood"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                      autoFocus
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                      Unit
                    </span>
                    <select
                      value={secondaryCreateUnit}
                      onChange={(e) => setSecondaryCreateUnit(e.target.value)}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                    >
                      <option value="score">score (1–10)</option>
                      {METRIC_UNIT_OPTIONS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowSecondaryCreate(false)
                        setSecondaryCreateName('')
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!secondaryCreateName.trim()}
                      onClick={addSecondaryDraft}
                    >
                      Add metric
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSecondaryCreate(true)}
                  className="w-full rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-left text-sm text-[var(--accent-300)] transition-colors hover:border-zinc-600 hover:bg-zinc-900/50"
                >
                  + Create new metric
                </button>
              )}

              {metricOptions.length === 0 && secondaryDrafts.length === 0 ? (
                <p className="text-sm text-zinc-500">No other metrics available yet.</p>
              ) : (
                <ul className="max-h-52 space-y-1 overflow-y-auto">
                  {metricOptions
                    .filter((opt) => opt.key !== resolvedPrimaryKey)
                    .filter((opt) => !secondaryDrafts.some((d) => d.metric_key === opt.key))
                    .map((opt) => {
                      const selected = secondaryKeys.includes(opt.key)
                      return (
                        <li key={opt.key}>
                          <button
                            type="button"
                            onClick={() => toggleSecondary(opt.key)}
                            className={cn(
                              'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                              selected
                                ? 'border-[var(--accent-500)]/50 bg-[var(--accent-950)]/50 text-zinc-100'
                                : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700',
                            )}
                          >
                            <span className="truncate">{opt.label}</span>
                            <span className="shrink-0 text-[10px] text-zinc-600">
                              {opt.categoryLabel}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                </ul>
              )}
            </div>
          )}

          {step === 'confounders' && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">
                Add things that could muddy the result. You’ll tick them on days they happen,
                then exclude those days from results.
              </p>
              {confounders.length > 0 && (
                <ul className="space-y-1">
                  {confounders.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200"
                    >
                      <span className="truncate">{item.label}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setConfounders((prev) => prev.filter((c) => c.id !== item.id))
                        }
                        className="shrink-0 text-[11px] text-zinc-500 hover:text-red-400"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <input
                  value={confounderDraft}
                  onChange={(e) => setConfounderDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const label = confounderDraft.trim()
                      if (!label) return
                      setConfounders((prev) => [...prev, createConfounder(label)])
                      setConfounderDraft('')
                    }
                  }}
                  placeholder="e.g. Travel, Illness, Late night"
                  className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                  autoFocus
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!confounderDraft.trim()}
                  onClick={() => {
                    const label = confounderDraft.trim()
                    if (!label) return
                    setConfounders((prev) => [...prev, createConfounder(label)])
                    setConfounderDraft('')
                  }}
                >
                  Add
                </Button>
              </div>
              {confounders.length > 0 && (
                <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Ask me to tick these in
                  </p>
                  {(
                    [
                      { id: 'home_log' as const, label: 'Home Log' },
                      { id: 'shutdown' as const, label: 'Daily shutdown' },
                      { id: 'morning' as const, label: 'Morning log' },
                    ] as const
                  ).map((surface) => {
                    const on = confounderSurfaces.includes(surface.id)
                    return (
                      <button
                        key={surface.id}
                        type="button"
                        onClick={() =>
                          setConfounderSurfaces((prev) =>
                            on
                              ? prev.filter((s) => s !== surface.id)
                              : [...prev, surface.id],
                          )
                        }
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                          on
                            ? 'border-[var(--accent-500)]/50 bg-[var(--accent-950)]/40 text-zinc-100'
                            : 'border-zinc-800 bg-zinc-950/40 text-zinc-500',
                        )}
                      >
                        {surface.label}
                        <span className="text-[10px] uppercase tracking-wide">
                          {on ? 'On' : 'Off'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {step === 'protocol' && (
            <ul className="space-y-2">
              {EXPERIMENT_PROTOCOLS.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setProtocol(p.id)}
                    className={cn(
                      'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                      protocol === p.id
                        ? 'border-[var(--accent-500)]/50 bg-[var(--accent-950)]/40'
                        : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
                    )}
                  >
                    <p className="text-sm font-medium text-zinc-100">{p.label}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{p.description}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {step === 'duration' && (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Start date
                </span>
                <DatePickerField value={startDate} onChange={setStartDate} allowPast />
              </label>
              <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 p-1">
                <button
                  type="button"
                  onClick={() => setDurationMode('observations')}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    durationMode === 'observations'
                      ? 'bg-[var(--accent-500)] text-black'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
                  )}
                >
                  Observations
                </button>
                <button
                  type="button"
                  onClick={() => setDurationMode('end_date')}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    durationMode === 'end_date'
                      ? 'bg-[var(--accent-500)] text-black'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
                  )}
                >
                  End date
                </button>
              </div>
              {durationMode === 'observations' ? (
                <label className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">Days</span>
                  <input
                    type="number"
                    min={2}
                    step={1}
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    className="w-24 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm tabular-nums text-zinc-100"
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    End date
                  </span>
                  <DatePickerField value={endDate} onChange={setEndDate} allowPast />
                </label>
              )}
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm">
                <p className="font-medium text-zinc-100">
                  {experimentQuestionLabel({ cause, effect })}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {protocolLabel(protocol)} · {previewSchedule.length} days · from {startDate}
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  <span className="text-[var(--accent-300)]">A</span>{' '}
                  {intervention.trim() || 'Intervention'}
                  {' · '}
                  <span className="text-zinc-300">B</span> {control.trim() || 'Control'}
                </p>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Generated schedule
                  </p>
                  {(protocol === 'randomized_crossover' || protocol === 'randomized_ab') && (
                    <button
                      type="button"
                      onClick={() => setScheduleNonce((n) => n + 1)}
                      className="text-[11px] text-[var(--accent-300)] hover:underline"
                    >
                      Shuffle again
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {previewSchedule.map((day) => (
                    <span
                      key={day.date}
                      title={day.date}
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                        day.arm === 'A'
                          ? 'bg-[var(--accent-950)] text-[var(--accent-300)] ring-1 ring-[var(--accent-ring)]'
                          : 'bg-zinc-800 text-zinc-400',
                      )}
                    >
                      {day.date.slice(5)} {day.arm}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-800/80 px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft size={14} />
            Back
          </Button>
          {step === 'review' ? (
            <Button type="button" size="sm" disabled={!canContinue} onClick={handleSave}>
              Start experiment
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={!canContinue}
              onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
            >
              Continue
              <ChevronRight size={14} />
            </Button>
          )}
        </footer>
      </div>
    </div>
  )
}

function MetricSelect({
  options,
  value,
  onChange,
  emptyLabel,
}: {
  options: GoalMetricOption[]
  value: MetricKey | ''
  onChange: (key: MetricKey) => void
  emptyLabel: string
}) {
  if (options.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyLabel}</p>
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as MetricKey)}
      className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
    >
      {options.map((opt) => (
        <option key={opt.key} value={opt.key}>
          {opt.label} ({opt.categoryLabel})
        </option>
      ))}
    </select>
  )
}
