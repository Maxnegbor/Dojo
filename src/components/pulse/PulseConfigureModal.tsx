import { useEffect, useMemo, useState } from 'react'
import { Activity, Equal, GitMerge, Minus, Plus, Unlink, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  PULSE_POINTS_TOTAL,
  assignPointsPulseFormula,
  copyPulseFormula,
  createDefaultPulseFormula,
  createPulseOrGroup,
  defaultPulseDailyTarget,
  dissolvePulseOrGroup,
  ensureDailyTargets,
  equalizePulseFormula,
  formatPulseOrGroupLabel,
  formulaIncludedCount,
  formulaWeightsSum,
  getIncludedMetricsNeedingDailyTarget,
  isValidPulseFormula,
  listPulseMetricOptions,
  metricsInOrGroups,
  prunePulseFormulaMetrics,
  resolveWeeklyQuantityTarget,
  setPulseOrGroupWeight,
  type PulseFormula,
  type PulseMetricOption,
} from '@/lib/pulseConfig'
import { formatDuration } from '@/lib/utils'
import type { Goal, MetricKey } from '@/types'
import { cn } from '@/lib/utils'

interface PulseConfigureModalProps {
  goals: Goal[]
  initialFormula: PulseFormula | null
  isReconfigure: boolean
  onClose: () => void
  onSave: (formula: PulseFormula) => void
}

type ConfigureStep = 'weights' | 'daily-targets'

function createDraft(initialFormula: PulseFormula | null, goals: Goal[]): PulseFormula {
  if (initialFormula) return prunePulseFormulaMetrics(copyPulseFormula(initialFormula), goals)
  return createDefaultPulseFormula(goals)
}

function formatTargetHint(value: number | null, unit: string, metricKey: string): string {
  if (value == null || value <= 0) return 'No weekly target found'
  if (metricKey === 'focus' || unit === 'min' || unit === 'minutes') {
    return `Weekly ${formatDuration(value)} → default ${formatDuration(Math.round(value / 7))}/day`
  }
  const daily = Math.round((value / 7) * 100) / 100
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
  return `Weekly ${fmt(value)}${unit ? ` ${unit}` : ''} → default ${fmt(daily)}${unit ? ` ${unit}` : ''}/day`
}

function WeightStepper({
  value,
  disableMinus,
  disablePlus,
  onChange,
}: {
  value: number
  disableMinus?: boolean
  disablePlus?: boolean
  onChange: (next: number) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={disableMinus || value <= 0}
        onClick={() => onChange(value - 1)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/80 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-40"
        aria-label="Decrease points"
      >
        <Minus size={14} />
      </button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums text-zinc-100">{value}</span>
      <button
        type="button"
        disabled={disablePlus}
        onClick={() => onChange(value + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/80 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-40"
        aria-label="Increase points"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

function IncludeToggle({
  included,
  onChange,
}: {
  included: boolean
  onChange: (included: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!included)}
      className={cn(
        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
        included
          ? 'border-[var(--accent-500)]/50 bg-[var(--accent-500)]/15 text-[var(--accent-300)]'
          : 'border-zinc-700 bg-zinc-800/60 text-zinc-500 hover:text-zinc-300',
      )}
    >
      {included ? 'Included' : 'Excluded'}
    </button>
  )
}

function groupOptions(options: PulseMetricOption[]) {
  const groups: { label: string; options: PulseMetricOption[] }[] = []
  const index = new Map<string, number>()
  for (const option of options) {
    const label = option.categoryLabel || 'Ungrouped'
    let i = index.get(label)
    if (i == null) {
      i = groups.length
      index.set(label, i)
      groups.push({ label, options: [] })
    }
    groups[i].options.push(option)
  }
  return groups
}

export function PulseConfigureModal({
  goals,
  initialFormula,
  isReconfigure,
  onClose,
  onSave,
}: PulseConfigureModalProps) {
  const [draft, setDraft] = useState(() => createDraft(initialFormula, goals))
  const [step, setStep] = useState<ConfigureStep>('weights')
  const [selectedForGroup, setSelectedForGroup] = useState<MetricKey[]>([])
  const metricOptions = useMemo(() => listPulseMetricOptions(goals), [goals])
  const groupedKeys = useMemo(() => metricsInOrGroups(draft), [draft])
  const visibleOptions = useMemo(
    () => metricOptions.filter((option) => !groupedKeys.has(option.key)),
    [metricOptions, groupedKeys],
  )
  const groups = useMemo(() => groupOptions(visibleOptions), [visibleOptions])
  const equalMode = draft.equalWeights === true
  const assigned = formulaWeightsSum(draft)
  const remaining = PULSE_POINTS_TOTAL - assigned
  const includedCount = formulaIncludedCount(draft)
  const needingDailyTargets = useMemo(
    () => getIncludedMetricsNeedingDailyTarget(draft, goals),
    [draft, goals],
  )
  const weightsValid =
    equalMode
      ? includedCount > 0
      : formulaWeightsSum(draft) === PULSE_POINTS_TOTAL && includedCount > 0
  const validation = isValidPulseFormula(draft, goals)
  const canSave = validation.valid
  const canCreateGroup = selectedForGroup.length >= 2

  useEffect(() => {
    setDraft((prev) => prunePulseFormulaMetrics(prev, goals))
  }, [goals])

  const setMetricWeight = (key: MetricKey, nextValue: number) => {
    setDraft((prev) => {
      if (nextValue < 0) return prev
      if (nextValue > (prev.metricWeights[key] ?? 0) && formulaWeightsSum(prev) >= PULSE_POINTS_TOTAL) {
        return prev
      }
      const metricWeights = { ...prev.metricWeights }
      if (nextValue <= 0) delete metricWeights[key]
      else metricWeights[key] = nextValue
      return { ...prev, equalWeights: false, metricWeights }
    })
  }

  const setMetricIncluded = (key: MetricKey, included: boolean) => {
    setDraft((prev) => {
      const metricWeights = { ...prev.metricWeights }
      if (included) metricWeights[key] = 1
      else delete metricWeights[key]
      return { ...prev, equalWeights: true, metricWeights }
    })
  }

  const setDailyTarget = (key: MetricKey, raw: string) => {
    const parsed = Number(raw)
    setDraft((prev) => {
      const dailyTargets = { ...prev.dailyTargets }
      if (Number.isFinite(parsed) && parsed > 0) dailyTargets[key] = parsed
      else delete dailyTargets[key]
      return { ...prev, dailyTargets }
    })
  }

  const toggleSelectForGroup = (key: MetricKey) => {
    setSelectedForGroup((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  const handleCreateGroup = () => {
    if (selectedForGroup.length < 2) return
    setDraft((prev) => createPulseOrGroup(prev, selectedForGroup, goals))
    setSelectedForGroup([])
  }

  const goToDailyTargetsStep = () => {
    setDraft((prev) => ensureDailyTargets(prev, goals))
    setStep('daily-targets')
  }

  const handlePrimaryAction = () => {
    if (step === 'weights') {
      if (!weightsValid) return
      if (needingDailyTargets.length > 0) {
        goToDailyTargetsStep()
        return
      }
      onSave(prunePulseFormulaMetrics(draft, goals))
      return
    }
    if (!canSave) return
    onSave(prunePulseFormulaMetrics(draft, goals))
  }

  const equalShareLabel =
    includedCount > 0 ? `1/${includedCount} each` : 'No metrics included'

  const title =
    step === 'daily-targets'
      ? 'Daily Pulse targets'
      : isReconfigure
        ? 'Reconfigure Pulse'
        : 'Configure Pulse'

  const subtitle =
    step === 'daily-targets'
      ? 'These metrics have weekly targets. Set how much counts as a full day for Pulse (default = weekly ÷ 7).'
      : equalMode
        ? 'Included metrics each make up an equal share of your daily score.'
        : `Distribute ${PULSE_POINTS_TOTAL} points across individual metrics. Each point is 10% of your daily score.`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="pulse-configure-title"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700">
              <Activity size={20} />
            </div>
            <div>
              <h2 id="pulse-configure-title" className="text-lg font-semibold text-zinc-100">
                {title}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
              {needingDailyTargets.length > 0 && (
                <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                  Step {step === 'weights' ? '1' : '2'} of 2
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {step === 'weights' ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <div
                  className={cn(
                    'flex-1 rounded-xl border px-4 py-3 text-center text-sm font-medium',
                    equalMode || remaining === 0
                      ? 'border-[var(--accent-500)]/40 bg-[var(--accent-950)]/40 text-[var(--accent-300)]'
                      : 'border-zinc-800 bg-zinc-950/50 text-zinc-400',
                  )}
                >
                  {equalMode ? (
                    <>
                      Equal weights
                      <span className="block text-xs font-normal text-zinc-500">
                        {equalShareLabel}
                      </span>
                    </>
                  ) : (
                    <>
                      {assigned} / {PULSE_POINTS_TOTAL} points assigned
                      {remaining > 0 && (
                        <span className="block text-xs font-normal text-zinc-500">
                          {remaining} remaining
                        </span>
                      )}
                    </>
                  )}
                </div>
                {equalMode ? (
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => assignPointsPulseFormula(prev, goals))}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
                  >
                    Assign points
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => equalizePulseFormula(prev, goals))}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
                  >
                    <Equal size={16} className="text-zinc-400" />
                    Split equally
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5">
                <p className="text-[11px] text-zinc-500">
                  Select 2+ metrics, then group them so hitting either one counts as full success.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canCreateGroup}
                  onClick={handleCreateGroup}
                >
                  <GitMerge size={13} />
                  Either/or group
                  {selectedForGroup.length > 0 ? ` (${selectedForGroup.length})` : ''}
                </Button>
              </div>

              {(draft.orGroups ?? []).length > 0 && (
                <section className="space-y-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Either / or groups
                  </p>
                  {draft.orGroups.map((group) => {
                    const included = group.weight > 0
                    return (
                      <div
                        key={group.id}
                        className={cn(
                          'rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3',
                          equalMode && !included && 'opacity-60',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-200">
                              {formatPulseOrGroupLabel(group, metricOptions, goals)}
                            </p>
                            <p className="mt-0.5 text-[11px] text-zinc-500">
                              Hit any one metric for full points
                            </p>
                            <ul className="mt-1.5 space-y-0.5">
                              {group.metricKeys.map((key) => {
                                const option = metricOptions.find((entry) => entry.key === key)
                                return (
                                  <li key={key} className="text-[11px] text-zinc-400">
                                    · {option?.label ?? key}
                                    {option?.needsDailyTarget ? ' · daily target next' : ''}
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {equalMode ? (
                              <IncludeToggle
                                included={included}
                                onChange={(next) =>
                                  setDraft((prev) =>
                                    setPulseOrGroupWeight(prev, group.id, next ? 1 : 0, {
                                      keepEqualMode: true,
                                    }),
                                  )
                                }
                              />
                            ) : (
                              <WeightStepper
                                value={group.weight}
                                disablePlus={remaining <= 0 && group.weight === 0}
                                onChange={(next) =>
                                  setDraft((prev) => {
                                    if (
                                      next > group.weight &&
                                      formulaWeightsSum(prev) >= PULSE_POINTS_TOTAL
                                    ) {
                                      return prev
                                    }
                                    return setPulseOrGroupWeight(prev, group.id, next)
                                  })
                                }
                              />
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setDraft((prev) => dissolvePulseOrGroup(prev, group.id, goals))
                              }
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                            >
                              <Unlink size={11} />
                              Ungroup
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </section>
              )}

              {metricOptions.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
                  Add metrics on the Metrics page first, then choose which ones count toward Pulse.
                </p>
              ) : (
                <div className="space-y-5">
                  {groups.map((group) => (
                    <section key={group.label}>
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                        {group.label}
                      </p>
                      <div className="space-y-2">
                        {group.options.map((option) => {
                          const value = draft.metricWeights[option.key] ?? 0
                          const included = value > 0
                          const selected = selectedForGroup.includes(option.key)

                          return (
                            <div
                              key={option.key}
                              className={cn(
                                'rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3',
                                equalMode && !included && 'opacity-60',
                                !equalMode && value === 0 && 'opacity-70',
                                selected && 'ring-1 ring-[var(--accent-500)]/40',
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-2.5">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => toggleSelectForGroup(option.key)}
                                    className="mt-1 h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-[var(--accent-500)]"
                                    aria-label={`Select ${option.label} for either/or group`}
                                  />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-zinc-200">
                                      {option.label}
                                    </p>
                                    <p className="text-[11px] text-zinc-500">{option.description}</p>
                                  </div>
                                </div>
                                {equalMode ? (
                                  <IncludeToggle
                                    included={included}
                                    onChange={(next) => setMetricIncluded(option.key, next)}
                                  />
                                ) : (
                                  <WeightStepper
                                    value={value}
                                    disablePlus={remaining <= 0}
                                    onChange={(next) => setMetricWeight(option.key, next)}
                                  />
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              {needingDailyTargets.map((option) => {
                const weekly = resolveWeeklyQuantityTarget(option.key, goals)
                const dailyTarget =
                  draft.dailyTargets[option.key] ?? defaultPulseDailyTarget(option.key, goals)
                return (
                  <div
                    key={option.key}
                    className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200">{option.label}</p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          {formatTargetHint(weekly, option.unit, option.key)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={dailyTarget ?? ''}
                          onChange={(e) => setDailyTarget(option.key, e.target.value)}
                          className="w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-right text-sm tabular-nums text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                        />
                        <span className="text-xs text-zinc-500">{option.unit || ''}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800/80 px-6 py-4">
          {step === 'weights' && !weightsValid && assigned > 0 && (
            <p className="mb-3 text-center text-xs text-amber-400/90">
              {equalMode
                ? 'Include at least one metric.'
                : `Assign all ${PULSE_POINTS_TOTAL} points before continuing.`}
            </p>
          )}
          {step === 'daily-targets' && !validation.valid && validation.reason && (
            <p className="mb-3 text-center text-xs text-amber-400/90">{validation.reason}</p>
          )}
          <div className="flex justify-between gap-2">
            {step === 'daily-targets' ? (
              <Button variant="ghost" onClick={() => setStep('weights')}>
                Back
              </Button>
            ) : (
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button
              disabled={step === 'weights' ? !weightsValid : !canSave}
              onClick={handlePrimaryAction}
            >
              {step === 'weights' && needingDailyTargets.length > 0
                ? 'Continue'
                : 'Save formula'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
