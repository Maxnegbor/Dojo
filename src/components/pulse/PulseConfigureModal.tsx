import { useEffect, useMemo, useState } from 'react'
import { Activity, ChevronDown, GitMerge, RotateCcw, Unlink, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl'
import {
  PULSE_POINTS_TOTAL,
  copyPulseFormula,
  createDefaultPulseFormula,
  createPulseOrGroup,
  defaultPulseDailyTarget,
  dissolvePulseOrGroup,
  effectivePulseWeights,
  ensureDailyTargets,
  equalizeCategoryPoints,
  formatPulseOrGroupLabel,
  formulaIncludedCount,
  formulaWeightsSum,
  getIncludedMetricsNeedingDailyTarget,
  getPulseWeightMode,
  isPulseMetricIncluded,
  isValidPulseFormula,
  listIncludedPulseSlots,
  listPulseMetricOptions,
  prunePulseFormulaMetrics,
  resetPulsePoints,
  resolvePulseMetricTarget,
  resolveWeeklyQuantityTarget,
  setPulseCategoryIncluded,
  setPulseMetricIncluded,
  setPulseOrGroupWeight,
  setPulseWeightMode,
  type PulseFormula,
  type PulseMetricOption,
  type PulseWeightMode,
  type PulseWeightSlot,
} from '@/lib/pulseConfig'
import { formatDuration } from '@/lib/utils'
import type { Goal, MetricKey } from '@/types'
import { cn } from '@/lib/utils'
import { fetchHabitifyHabits } from '@/lib/habitifyApi'
import {
  HABITIFY_CHANGED,
  HABITIFY_JOURNAL_CHANGED,
  isHabitifyConnected,
} from '@/lib/habitifyStore'
import {
  WHOOP_CHANGED,
  getWhoopMetric,
  isWhoopClockMetric,
  whoopClockMinutesToTimeValue,
  whoopClockTimeValueToMinutes,
} from '@/lib/whoopStore'

interface PulseConfigureModalProps {
  goals: Goal[]
  initialFormula: PulseFormula | null
  isReconfigure: boolean
  onClose: () => void
  onSave: (formula: PulseFormula) => void
}

type ConfigureStep = 'select' | 'daily-targets' | 'weights'

const WEIGHT_MODE_OPTIONS: { value: PulseWeightMode; label: string }[] = [
  { value: 'equal', label: 'Equal' },
  { value: 'category', label: 'By category' },
  { value: 'points', label: 'Custom' },
]

function createDraft(initialFormula: PulseFormula | null, goals: Goal[]): PulseFormula {
  if (initialFormula) return prunePulseFormulaMetrics(copyPulseFormula(initialFormula), goals)
  return createDefaultPulseFormula(goals)
}

function formatTargetHint(
  option: PulseMetricOption,
  weekly: number | null,
  suggested: number | null,
): string {
  const unit = option.unit
  const metricKey = option.key
  const isCheckOff =
    metricKey.startsWith('habit_') ||
    metricKey.startsWith('habitify_') ||
    unit === 'check'

  if (isWhoopClockMetric(metricKey)) {
    return getWhoopMetric(metricKey)?.description ?? 'Closest to this time scores highest'
  }

  if (weekly != null && weekly > 0) {
    if (metricKey === 'focus' || unit === 'min' || unit === 'minutes') {
      return `Weekly ${formatDuration(weekly)} → default ${formatDuration(Math.round(weekly / 7))}/day`
    }
    const daily = Math.round((weekly / 7) * 100) / 100
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
    return `Weekly ${fmt(weekly)}${unit ? ` ${unit}` : ''} → default ${fmt(daily)}${unit ? ` ${unit}` : ''}/day`
  }

  if (isCheckOff) {
    return '1 = done for the day'
  }

  if (metricKey === 'whoop_recovery') {
    return 'WHOOP green starts at 67'
  }
  const whoop = getWhoopMetric(metricKey)
  if (whoop) return whoop.description

  if (suggested != null && suggested > 0) {
    if (metricKey === 'focus' || unit === 'min' || unit === 'minutes') {
      return `Default ${formatDuration(suggested)}/day`
    }
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
    return `Default ${fmt(suggested)}${unit ? ` ${unit}` : ''}/day`
  }

  return 'Set how much counts as a full day'
}

function pulseShareLabel(weight: number, total: number): string {
  if (total <= 0 || weight <= 0) return '0%'
  const pct = (weight / total) * 100
  const rounded = Math.round(pct * 10) / 10
  if (rounded < 1) return '<1%'
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`
}

function slotEffectiveWeight(
  slot: PulseWeightSlot,
  metricWeights: Record<string, number>,
  orGroupWeights: Record<string, number>,
): number {
  return slot.kind === 'metric' ? metricWeights[slot.key] ?? 0 : orGroupWeights[slot.id] ?? 0
}

function clampPoolWeight(current: number, next: number, assigned: number): number {
  const remaining = PULSE_POINTS_TOTAL - assigned
  const max = current + Math.max(0, remaining)
  return Math.max(0, Math.min(PULSE_POINTS_TOTAL, Math.round(next), max))
}

function WeightSlider({
  value,
  remaining,
  onChange,
  label,
}: {
  value: number
  remaining: number
  onChange: (next: number) => void
  label: string
}) {
  const fill = (value / PULSE_POINTS_TOTAL) * 100
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <input
        type="range"
        min={0}
        max={PULSE_POINTS_TOTAL}
        step={1}
        value={value}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={PULSE_POINTS_TOTAL}
        aria-valuenow={value}
        onChange={(e) => onChange(Math.max(0, Math.min(value + remaining, Math.round(Number(e.target.value)))))}
        className={cn(
          'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-700/80',
          '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
          '[&::-webkit-slider-thumb]:bg-[var(--accent-500)] [&::-webkit-slider-thumb]:shadow-[0_0_8px_var(--accent-glow)]',
          '[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110',
          '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--accent-500)]',
        )}
        style={{
          background: `linear-gradient(to right, var(--accent-500) ${fill}%, rgb(63 63 70 / 0.85) ${fill}%)`,
        }}
      />
      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-zinc-100">
        {value}
      </span>
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
  const groups: {
    label: string
    options: PulseMetricOption[]
    subgroups: { id: string; label: string; options: PulseMetricOption[] }[]
  }[] = []
  const index = new Map<string, number>()
  for (const option of options) {
    const label = option.categoryLabel || 'Ungrouped'
    let i = index.get(label)
    if (i == null) {
      i = groups.length
      index.set(label, i)
      groups.push({ label, options: [], subgroups: [] })
    }
    const group = groups[i]
    if (option.groupId && option.groupLabel) {
      let subgroup = group.subgroups.find((entry) => entry.id === option.groupId)
      if (!subgroup) {
        subgroup = { id: option.groupId, label: option.groupLabel, options: [] }
        group.subgroups.push(subgroup)
      }
      subgroup.options.push(option)
    } else {
      group.options.push(option)
    }
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
  const [step, setStep] = useState<ConfigureStep>('select')
  const [selectedForGroup, setSelectedForGroup] = useState<MetricKey[]>([])
  const [isGrouping, setIsGrouping] = useState(false)
  const [habitifyTick, setHabitifyTick] = useState(0)
  const [habitifyLoading, setHabitifyLoading] = useState(() => isHabitifyConnected())
  const [openSubgroups, setOpenSubgroups] = useState<string[] | null>(null)
  const metricOptions = useMemo(
    () => listPulseMetricOptions(goals),
    [goals, habitifyTick],
  )
  const selectGroups = useMemo(() => groupOptions(metricOptions), [metricOptions])
  const weightMode = getPulseWeightMode(draft)
  const assigned = formulaWeightsSum(draft)
  const remaining = PULSE_POINTS_TOTAL - assigned
  const includedCount = formulaIncludedCount(draft)
  const needingDailyTargets = useMemo(
    () => getIncludedMetricsNeedingDailyTarget(draft, goals),
    [draft, goals],
  )
  const includedSlots = useMemo(
    () => listIncludedPulseSlots(draft, goals),
    [draft, goals, habitifyTick],
  )
  const effective = useMemo(
    () => effectivePulseWeights(draft, goals),
    [draft, goals, habitifyTick],
  )
  const effectiveTotal =
    Object.values(effective.metricWeights).reduce((sum, n) => sum + n, 0) +
    Object.values(effective.orGroupWeights).reduce((sum, n) => sum + n, 0)

  const selectValid = includedCount > 0
  const targetsValid = needingDailyTargets.every((option) => {
    const target = resolvePulseMetricTarget(option.key, goals, draft)
    return target != null && target > 0
  })
  const weightsValid =
    weightMode === 'points'
      ? formulaWeightsSum(draft) === PULSE_POINTS_TOTAL && includedCount > 0
      : includedCount > 0
  const validation = isValidPulseFormula(draft, goals)
  const canSave = validation.valid
  const canCreateGroup = selectedForGroup.length >= 2

  useEffect(() => {
    setDraft((prev) => prunePulseFormulaMetrics(prev, goals))
  }, [goals, habitifyTick])

  useEffect(() => {
    if (openSubgroups != null) return
    const open: string[] = []
    for (const group of selectGroups) {
      for (const subgroup of group.subgroups) {
        if (subgroup.options.some((option) => isPulseMetricIncluded(draft, option.key))) {
          open.push(`${group.label}:${subgroup.id}`)
        }
      }
    }
    setOpenSubgroups(open)
  }, [selectGroups, draft, openSubgroups])

  useEffect(() => {
    const bump = () => setHabitifyTick((n) => n + 1)
    window.addEventListener(HABITIFY_CHANGED, bump)
    window.addEventListener(HABITIFY_JOURNAL_CHANGED, bump)
    window.addEventListener(WHOOP_CHANGED, bump)
    return () => {
      window.removeEventListener(HABITIFY_CHANGED, bump)
      window.removeEventListener(HABITIFY_JOURNAL_CHANGED, bump)
      window.removeEventListener(WHOOP_CHANGED, bump)
    }
  }, [])

  useEffect(() => {
    if (!isHabitifyConnected()) {
      setHabitifyLoading(false)
      return
    }
    let cancelled = false
    setHabitifyLoading(true)
    void fetchHabitifyHabits()
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return
        setHabitifyLoading(false)
        setHabitifyTick((n) => n + 1)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setMetricWeight = (key: MetricKey, nextValue: number) => {
    setDraft((prev) => {
      const current = prev.metricWeights[key] ?? 0
      const next = clampPoolWeight(current, nextValue, formulaWeightsSum(prev))
      const metricWeights = { ...prev.metricWeights, [key]: next }
      return { ...prev, equalWeights: false, weightMode: 'points', metricWeights }
    })
  }

  const setGroupWeight = (groupId: string, nextValue: number) => {
    setDraft((prev) => {
      const current = prev.orGroups.find((group) => group.id === groupId)?.weight ?? 0
      return setPulseOrGroupWeight(
        prev,
        groupId,
        clampPoolWeight(current, nextValue, formulaWeightsSum(prev)),
      )
    })
  }

  const handleResetPoints = () => {
    setDraft((prev) => resetPulsePoints(prev, goals))
  }

  const setDailyTarget = (key: MetricKey, raw: string) => {
    if (isWhoopClockMetric(key)) {
      const minutes = whoopClockTimeValueToMinutes(raw)
      setDraft((prev) => {
        const dailyTargets = { ...prev.dailyTargets }
        if (minutes == null) delete dailyTargets[key]
        else dailyTargets[key] = minutes
        return { ...prev, dailyTargets }
      })
      return
    }
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

  const cancelGrouping = () => {
    setIsGrouping(false)
    setSelectedForGroup([])
  }

  const handleCreateGroup = () => {
    if (selectedForGroup.length < 2) return
    setDraft((prev) => createPulseOrGroup(prev, selectedForGroup, goals))
    setSelectedForGroup([])
    setIsGrouping(false)
  }

  const handlePrimaryAction = () => {
    if (step === 'select') {
      if (!selectValid) return
      cancelGrouping()
      setDraft((prev) => ensureDailyTargets(prev, goals))
      setStep('daily-targets')
      return
    }
    if (step === 'daily-targets') {
      if (!targetsValid) return
      setDraft((prev) => setPulseWeightMode(prev, getPulseWeightMode(prev), goals))
      setStep('weights')
      return
    }
    if (!canSave) return
    onSave(prunePulseFormulaMetrics(draft, goals))
  }

  const isSubgroupOpen = (id: string) => (openSubgroups ?? []).includes(id)
  const toggleSubgroup = (id: string) => {
    setOpenSubgroups((prev) => {
      const current = prev ?? []
      return current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    })
  }

  const categoryKeys = (group: ReturnType<typeof groupOptions>[number]) => [
    ...group.options.map((option) => option.key),
    ...group.subgroups.flatMap((subgroup) => subgroup.options.map((option) => option.key)),
  ]

  const renderSelectCard = (option: PulseMetricOption) => {
    const included = isPulseMetricIncluded(draft, option.key)
    return (
      <div
        key={option.key}
        className={cn(
          'rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3',
          !included && 'opacity-60',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200">{option.label}</p>
            <p className="text-[11px] text-zinc-500">{option.description}</p>
          </div>
          <IncludeToggle
            included={included}
            onChange={(next) => setDraft((prev) => setPulseMetricIncluded(prev, option.key, next))}
          />
        </div>
      </div>
    )
  }

  const weighSlotsByCategory = (() => {
    const groups: { id: string; label: string; slots: PulseWeightSlot[] }[] = []
    const index = new Map<string, number>()
    for (const slot of includedSlots) {
      let i = index.get(slot.categoryId)
      if (i == null) {
        i = groups.length
        index.set(slot.categoryId, i)
        groups.push({ id: slot.categoryId, label: slot.categoryLabel, slots: [] })
      }
      groups[i]!.slots.push(slot)
    }
    return groups
  })()

  const title =
    step === 'select'
      ? isReconfigure
        ? 'Reconfigure Pulse'
        : 'Configure Pulse'
      : step === 'daily-targets'
        ? 'Daily Pulse targets'
        : 'Weigh Pulse metrics'

  const subtitle =
    step === 'select'
      ? 'Pick the metrics that should count toward your daily Pulse.'
      : step === 'daily-targets'
        ? 'Set a daily target for each included metric. This is how much counts as a full day for Pulse.'
        : weightMode === 'equal'
          ? 'Every included metric gets the same share of Pulse.'
          : weightMode === 'category'
            ? 'Each category gets the same share of Pulse, split equally inside it.'
            : `Distribute ${PULSE_POINTS_TOTAL} points. Each point is 1% of your daily score.`

  const stepIndex = step === 'select' ? 1 : step === 'daily-targets' ? 2 : 3
  const optionByKey = useMemo(
    () => new Map(metricOptions.map((option) => [option.key as string, option])),
    [metricOptions],
  )

  return (
    <ModalOverlay align="center" onBackdropClick={onClose}>
      <div
        role="dialog"
        aria-labelledby="pulse-configure-title"
        className="flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-bottom)-1.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl"
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
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                Step {stepIndex} of 3
              </p>
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
          {step === 'select' ? (
            <>
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3 text-center text-sm font-medium text-zinc-300">
                {includedCount} included
                <span className="block text-xs font-normal text-zinc-500">
                  Only these metrics get daily targets and a Pulse weight.
                </span>
              </div>
              {metricOptions.length === 0 && !habitifyLoading ? (
                <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
                  Add metrics on the Metrics page first, then choose which ones count toward Pulse.
                </p>
              ) : (
                <div className="space-y-5">
                  {habitifyLoading && (
                    <p className="text-[11px] text-zinc-500">Loading Habitify habits…</p>
                  )}
                  {selectGroups.map((group) => {
                    const keys = categoryKeys(group)
                    const includedInCategory = keys.filter((key) =>
                      isPulseMetricIncluded(draft, key),
                    ).length
                    const allIncluded = includedInCategory === keys.length && keys.length > 0
                    return (
                      <section key={group.label}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                            {group.label}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((prev) => setPulseCategoryIncluded(prev, keys, !allIncluded))
                            }
                            className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200"
                          >
                            {allIncluded ? 'Exclude all' : 'Include all'}
                          </button>
                        </div>
                        <div className="space-y-2">
                          {group.options.map((option) => renderSelectCard(option))}
                          {group.subgroups.map((subgroup) => {
                            const subgroupId = `${group.label}:${subgroup.id}`
                            const open = isSubgroupOpen(subgroupId)
                            const includedCountInGroup = subgroup.options.filter((option) =>
                              isPulseMetricIncluded(draft, option.key),
                            ).length
                            return (
                              <div
                                key={subgroupId}
                                className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/30"
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleSubgroup(subgroupId)}
                                  aria-expanded={open}
                                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <ChevronDown
                                      size={14}
                                      className={cn(
                                        'shrink-0 text-zinc-500 transition-transform',
                                        !open && '-rotate-90',
                                      )}
                                    />
                                    <span className="text-sm font-medium text-zinc-200">
                                      {subgroup.label}
                                    </span>
                                  </span>
                                  <span className="text-[11px] text-zinc-500">
                                    {includedCountInGroup > 0
                                      ? `${includedCountInGroup} included`
                                      : `${subgroup.options.length} metrics`}
                                  </span>
                                </button>
                                {open ? (
                                  <div className="space-y-2 border-t border-zinc-800/70 px-2 pb-2 pt-2">
                                    {subgroup.options.map((option) => renderSelectCard(option))}
                                  </div>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      </section>
                    )
                  })}
                </div>
              )}
            </>
          ) : step === 'daily-targets' ? (
            <div className="space-y-3">
              {needingDailyTargets.map((option) => {
                const weekly = resolveWeeklyQuantityTarget(option.key, goals)
                const suggested = resolvePulseMetricTarget(option.key, goals, {
                  ...draft,
                  dailyTargets: {},
                })
                const dailyTarget =
                  draft.dailyTargets[option.key] ??
                  defaultPulseDailyTarget(option.key, goals) ??
                  suggested
                return (
                  <div
                    key={option.key}
                    className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200">
                          {option.groupLabel
                            ? `${option.groupLabel} · ${option.label}`
                            : option.label}
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          {formatTargetHint(option, weekly, suggested)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isWhoopClockMetric(option.key) ? (
                          <input
                            type="time"
                            value={whoopClockMinutesToTimeValue(dailyTarget)}
                            onChange={(e) => setDailyTarget(option.key, e.target.value)}
                            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm tabular-nums text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                          />
                        ) : (
                          <>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={dailyTarget ?? ''}
                              onChange={(e) => setDailyTarget(option.key, e.target.value)}
                              className="w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-right text-sm tabular-nums text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                            />
                            <span className="text-xs text-zinc-500">{option.unit || ''}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <>
              <SlidingSegmentedControl
                value={weightMode}
                options={WEIGHT_MODE_OPTIONS}
                onChange={(mode) => setDraft((prev) => setPulseWeightMode(prev, mode, goals))}
                aria-label="Pulse weighing mode"
              />

              {weightMode === 'points' ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3">
                  <div className="text-sm font-medium text-zinc-300">
                    {assigned} / {PULSE_POINTS_TOTAL} points assigned
                    <span className="block text-xs font-normal text-zinc-500">
                      {remaining > 0 ? `${remaining} remaining` : 'All points assigned'}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={assigned <= 0}
                    onClick={handleResetPoints}
                  >
                    <RotateCcw size={13} />
                    Reset points
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--accent-500)]/40 bg-[var(--accent-950)]/40 px-4 py-3 text-center text-sm font-medium text-[var(--accent-300)]">
                  {weightMode === 'equal'
                    ? includedCount > 0
                      ? `${pulseShareLabel(1, includedCount)} each`
                      : 'No metrics included'
                    : `${weighSlotsByCategory.length} ${
                        weighSlotsByCategory.length === 1 ? 'category' : 'categories'
                      } share Pulse equally`}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5">
                <p className="text-[11px] text-zinc-500">
                  {isGrouping
                    ? 'Select 2 or more metrics, then confirm.'
                    : 'Group metrics so hitting either one counts as full success.'}
                </p>
                {isGrouping ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={cancelGrouping}>
                      Cancel
                    </Button>
                    <Button size="sm" disabled={!canCreateGroup} onClick={handleCreateGroup}>
                      Confirm
                      {selectedForGroup.length > 0 ? ` (${selectedForGroup.length})` : ''}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setIsGrouping(true)}>
                    <GitMerge size={13} />
                    Either / or
                  </Button>
                )}
              </div>

              <div className="space-y-5">
                {weighSlotsByCategory.map((category) => {
                  const categoryWeight = category.slots.reduce(
                    (sum, slot) =>
                      sum +
                      slotEffectiveWeight(slot, effective.metricWeights, effective.orGroupWeights),
                    0,
                  )
                  return (
                    <section key={category.id}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                          {category.label}
                          <span className="ml-2 font-normal normal-case tracking-normal text-zinc-600">
                            {pulseShareLabel(categoryWeight, effectiveTotal)} of Pulse
                          </span>
                        </p>
                        {weightMode === 'points' && category.slots.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((prev) => equalizeCategoryPoints(prev, category.id, goals))
                            }
                            className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200"
                          >
                            Weigh equally
                          </button>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        {category.slots.map((slot) => {
                          const share = pulseShareLabel(
                            slotEffectiveWeight(slot, effective.metricWeights, effective.orGroupWeights),
                            effectiveTotal,
                          )
                          if (slot.kind === 'group') {
                            const group = draft.orGroups.find((entry) => entry.id === slot.id)
                            if (!group) return null
                            return (
                              <div
                                key={slot.id}
                                className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-zinc-200">
                                      {formatPulseOrGroupLabel(group, metricOptions, goals)}
                                      <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-zinc-500">
                                        either/or
                                      </span>
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-zinc-500">
                                      Hit any one metric for full points
                                    </p>
                                    <ul className="mt-1.5 space-y-0.5">
                                      {group.metricKeys.map((key) => {
                                        const option = optionByKey.get(key)
                                        return (
                                          <li key={key} className="text-[11px] text-zinc-400">
                                            · {option?.groupLabel
                                              ? `${option.groupLabel} · ${option.label}`
                                              : option?.label ?? key}
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  </div>
                                  {weightMode !== 'points' ? (
                                    <span className="text-sm font-semibold tabular-nums text-zinc-100">
                                      {share}
                                    </span>
                                  ) : null}
                                </div>
                                {weightMode === 'points' ? (
                                  <div className="mt-3">
                                    <WeightSlider
                                      value={group.weight}
                                      remaining={remaining}
                                      label={`Points for ${formatPulseOrGroupLabel(group, metricOptions, goals)}`}
                                      onChange={(next) => setGroupWeight(group.id, next)}
                                    />
                                  </div>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraft((prev) => dissolvePulseOrGroup(prev, group.id, goals))
                                  }
                                  className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                                >
                                  <Unlink size={11} />
                                  Ungroup
                                </button>
                              </div>
                            )
                          }

                          const option = optionByKey.get(slot.key)
                          const value = draft.metricWeights[slot.key] ?? 0
                          const selected = isGrouping && selectedForGroup.includes(slot.key)
                          const metricLabel = option?.groupLabel
                            ? `${option.groupLabel} · ${option.label}`
                            : option?.label ?? slot.key
                          return (
                            <div
                              key={slot.key}
                              className={cn(
                                'rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3',
                                selected && 'ring-1 ring-[var(--accent-500)]/40',
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                {isGrouping ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleSelectForGroup(slot.key)}
                                    aria-pressed={selected}
                                    aria-label={`Select ${metricLabel} for either/or group`}
                                    className="flex min-w-0 items-start gap-2.5 text-left"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      readOnly
                                      tabIndex={-1}
                                      className="pointer-events-none mt-1 h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-[var(--accent-500)]"
                                      aria-hidden
                                    />
                                    <p className="text-sm font-medium text-zinc-200">{metricLabel}</p>
                                  </button>
                                ) : (
                                  <p className="min-w-0 text-sm font-medium text-zinc-200">
                                    {metricLabel}
                                  </p>
                                )}
                                {weightMode !== 'points' ? (
                                  <span className="text-sm font-semibold tabular-nums text-zinc-100">
                                    {share}
                                  </span>
                                ) : null}
                              </div>
                              {weightMode === 'points' ? (
                                <div className="mt-3">
                                  <WeightSlider
                                    value={value}
                                    remaining={remaining}
                                    label={`Points for ${metricLabel}`}
                                    onChange={(next) => setMetricWeight(slot.key, next)}
                                  />
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-zinc-800/80 px-6 py-4">
          {step === 'select' && !selectValid && (
            <p className="mb-3 text-center text-xs text-amber-400/90">
              Include at least one metric.
            </p>
          )}
          {step === 'daily-targets' && !targetsValid && (
            <p className="mb-3 text-center text-xs text-amber-400/90">
              Set a daily target for each included metric.
            </p>
          )}
          {step === 'weights' && !weightsValid && (
            <p className="mb-3 text-center text-xs text-amber-400/90">
              {weightMode === 'points'
                ? `Assign all ${PULSE_POINTS_TOTAL} points before saving.`
                : 'Include at least one metric.'}
            </p>
          )}
          {step === 'weights' && weightsValid && !canSave && validation.reason && (
            <p className="mb-3 text-center text-xs text-amber-400/90">{validation.reason}</p>
          )}
          <div className="flex justify-between gap-2">
            {step === 'select' ? (
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={() => {
                  cancelGrouping()
                  setStep(step === 'weights' ? 'daily-targets' : 'select')
                }}
              >
                Back
              </Button>
            )}
            <Button
              disabled={
                step === 'select' ? !selectValid : step === 'daily-targets' ? !targetsValid : !canSave
              }
              onClick={handlePrimaryAction}
            >
              {step === 'weights' ? 'Save formula' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
