import { useMemo, useState, useEffect, useRef } from 'react'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ToggleRow } from '@/components/settings/SettingsControls'
import { groupMorningLogItemsByCategory, type MorningLogItem } from '@/lib/morningLogConfig'
import { SLEEP_METRIC_UNIT_LABELS, SLEEP_METRICS_CHANGED } from '@/lib/sleepMetrics'
import { HABIT_TYPES_CHANGED } from '@/lib/habitTypes'
import { METRICS_SECTIONS_CHANGED } from '@/lib/metricsSections'
import { WORKOUT_TYPES_CHANGED } from '@/lib/workoutTypes'
import type { Goal, MetricKey } from '@/types'
import { cn } from '@/lib/utils'

interface LogMetricsEditorProps {
  goals: Goal[]
  sleepConfig: import('@/lib/sleepMetrics').SleepMetricsConfig
  goalKeys: MetricKey[]
  sleepFieldIds: string[]
  yesterdayKeys?: MetricKey[]
  showWorkouts?: boolean
  onGoalKeysChange: (keys: MetricKey[]) => void
  onSleepFieldIdsChange: (ids: string[]) => void
  onYesterdayKeysChange?: (keys: MetricKey[]) => void
  onPickerOpenChange?: (open: boolean) => void
  /** Override default remove (e.g. morning → move to shutdown). */
  onRemoveItem?: (item: MorningLogItem) => void
  getConfiguredItems: (goals: Goal[], sleepConfig: import('@/lib/sleepMetrics').SleepMetricsConfig) => MorningLogItem[]
  getAddableItems: (
    goals: Goal[],
    sleepConfig: import('@/lib/sleepMetrics').SleepMetricsConfig,
    options?: { showWorkouts?: boolean },
  ) => MorningLogItem[]
  description: string
  emptyConfiguredHint: string
  emptyAddableHint: string
  removeAriaLabel: (label: string) => string
}

function unitLabel(item: MorningLogItem): string | null {
  if (item.kind === 'sleep') {
    if (item.sleepFieldId === 'bedtime' || item.sleepFieldId === 'wake_time') return 'Time of day'
    if (item.sleepFieldId === 'sleep_duration' || item.sleepFieldId === 'in_bed') return 'hrs:min'
    const unit = item.unit as keyof typeof SLEEP_METRIC_UNIT_LABELS
    return SLEEP_METRIC_UNIT_LABELS[unit] ?? item.unit
  }
  if (item.kind === 'habit') return 'Check-off'
  return item.unit || null
}

export function LogMetricsEditor({
  goals,
  sleepConfig,
  goalKeys,
  sleepFieldIds,
  yesterdayKeys = [],
  showWorkouts = true,
  onGoalKeysChange,
  onSleepFieldIdsChange,
  onYesterdayKeysChange,
  onPickerOpenChange,
  onRemoveItem,
  getConfiguredItems,
  getAddableItems,
  description,
  emptyConfiguredHint,
  emptyAddableHint,
  removeAriaLabel,
}: LogMetricsEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null)
  const [metricsRevision, setMetricsRevision] = useState(0)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const refresh = () => setMetricsRevision((value) => value + 1)
    window.addEventListener(METRICS_SECTIONS_CHANGED, refresh)
    window.addEventListener(HABIT_TYPES_CHANGED, refresh)
    window.addEventListener(WORKOUT_TYPES_CHANGED, refresh)
    window.addEventListener(SLEEP_METRICS_CHANGED, refresh)
    return () => {
      window.removeEventListener(METRICS_SECTIONS_CHANGED, refresh)
      window.removeEventListener(HABIT_TYPES_CHANGED, refresh)
      window.removeEventListener(WORKOUT_TYPES_CHANGED, refresh)
      window.removeEventListener(SLEEP_METRICS_CHANGED, refresh)
    }
  }, [])

  const setPickerOpenState = (open: boolean | ((value: boolean) => boolean)) => {
    setPickerOpen((current) => {
      const next = typeof open === 'function' ? open(current) : open
      onPickerOpenChange?.(next)
      return next
    })
  }

  const configuredItems = useMemo(
    () => getConfiguredItems(goals, sleepConfig),
    [goals, sleepConfig, goalKeys, sleepFieldIds, metricsRevision, getConfiguredItems],
  )
  const addableItems = useMemo(
    () => getAddableItems(goals, sleepConfig, { showWorkouts }),
    [goals, sleepConfig, showWorkouts, goalKeys, sleepFieldIds, metricsRevision, getAddableItems],
  )
  const addableCategories = useMemo(
    () => groupMorningLogItemsByCategory(addableItems),
    [addableItems],
  )
  const hoveredCategory = useMemo(
    () => addableCategories.find((category) => category.id === hoveredCategoryId) ?? null,
    [addableCategories, hoveredCategoryId],
  )

  useEffect(() => {
    if (!pickerOpen) {
      setHoveredCategoryId(null)
      return
    }
    if (addableCategories.length === 0) return
    setHoveredCategoryId((current) =>
      current && addableCategories.some((category) => category.id === current)
        ? current
        : addableCategories[0].id,
    )
  }, [pickerOpen, addableCategories])

  useEffect(() => {
    if (!pickerOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (pickerRef.current?.contains(event.target as Node)) return
      setPickerOpenState(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [pickerOpen])

  const yesterdayKeySet = useMemo(() => new Set(yesterdayKeys), [yesterdayKeys])

  const removeItem = (item: MorningLogItem) => {
    if (onRemoveItem) {
      onRemoveItem(item)
      return
    }
    if (item.kind === 'sleep' && item.sleepFieldId) {
      onSleepFieldIdsChange(sleepFieldIds.filter((id) => id !== item.sleepFieldId))
      return
    }
    if (!item.metricKey) return
    onGoalKeysChange(goalKeys.filter((key) => key !== item.metricKey))
    if (onYesterdayKeysChange && yesterdayKeySet.has(item.metricKey)) {
      onYesterdayKeysChange(yesterdayKeys.filter((key) => key !== item.metricKey))
    }
  }

  const addItem = (item: MorningLogItem) => {
    if (item.kind === 'sleep' && item.sleepFieldId) {
      if (!sleepFieldIds.includes(item.sleepFieldId)) {
        onSleepFieldIdsChange([...sleepFieldIds, item.sleepFieldId])
      }
    } else if (item.metricKey && !goalKeys.includes(item.metricKey)) {
      onGoalKeysChange([...goalKeys, item.metricKey])
    }
    setPickerOpenState(false)
  }

  const handleYesterdayToggle = (item: MorningLogItem, enabled: boolean) => {
    if (!item.metricKey || !onYesterdayKeysChange) return
    const next = new Set(yesterdayKeys)
    if (enabled) next.add(item.metricKey)
    else next.delete(item.metricKey)
    onYesterdayKeysChange([...next])
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-zinc-500">{description}</p>

      {configuredItems.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-2 text-xs text-zinc-500">
          {emptyConfiguredHint}
        </p>
      )}

      <div className="space-y-2">
        {configuredItems.map((item) => {
          const logYesterday = item.metricKey ? yesterdayKeySet.has(item.metricKey) : false
          const unit = unitLabel(item)

          return (
            <div
              key={item.id}
              className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-zinc-200">{item.label}</p>
                    <span className="rounded-md bg-zinc-800/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                      {item.badge}
                    </span>
                    {unit && <span className="text-[10px] text-zinc-600">{unit}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item)}
                  className="shrink-0 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                  aria-label={removeAriaLabel(item.label)}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {onYesterdayKeysChange && item.supportsYesterday && item.metricKey && (
                <div className="mt-2.5 border-t border-zinc-800/60 pt-2.5">
                  <ToggleRow
                    compact
                    label="Log as yesterday's value"
                    checked={logYesterday}
                    onChange={(enabled) => handleYesterdayToggle(item, enabled)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="relative" ref={pickerRef}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPickerOpenState((open) => !open)}
          disabled={addableItems.length === 0}
        >
          <Plus size={14} />
          Add
        </Button>

        {pickerOpen && addableCategories.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-2 flex overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl">
            <div className="w-40 shrink-0 py-1">
              {addableCategories.map((category) => {
                const active = hoveredCategoryId === category.id
                return (
                  <button
                    key={category.id}
                    type="button"
                    onMouseEnter={() => setHoveredCategoryId(category.id)}
                    onFocus={() => setHoveredCategoryId(category.id)}
                    onClick={() => setHoveredCategoryId(category.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors',
                      active ? 'bg-zinc-900 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-200',
                    )}
                  >
                    <span className="min-w-0 truncate text-sm font-medium">{category.label}</span>
                    <ChevronRight
                      size={14}
                      className={cn('shrink-0', active ? 'text-zinc-400' : 'text-zinc-600')}
                    />
                  </button>
                )
              })}
            </div>

            {hoveredCategory && (
              <div className="max-h-64 w-52 shrink-0 overflow-y-auto border-l border-zinc-800 py-1">
                {hoveredCategory.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addItem(item)}
                    className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-900/80"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-zinc-100">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                        {item.badge}
                        {unitLabel(item) ? ` · ${unitLabel(item)}` : ''}
                      </span>
                    </span>
                    <Plus size={14} className="mt-0.5 shrink-0 text-zinc-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {addableItems.length === 0 && (
          <p className="mt-2 text-[11px] text-zinc-600">{emptyAddableHint}</p>
        )}
      </div>
    </div>
  )
}
