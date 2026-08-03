import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Check, X } from 'lucide-react'
import { GoalMetricInput } from '@/components/ui/GoalMetricInput'
import type { DailyLog, Goal, Workout } from '@/types'
import { normalizeHabits } from '@/types'
import { formatEditLogWeekLabel } from '@/lib/editLogsRange'
import { habitWeeklyLogKey } from '@/lib/habitTypes'
import {
  getDailyHistoryValue,
  getMetricHistoryDateRange,
  getMetricHistoryWeekKeys,
  getWeeklyHistoryValue,
  historyValueToChartNumber,
  persistMetricHistoryEntry,
  resolveMetricHistoryContext,
  type MetricHistoryTarget,
} from '@/lib/metricHistory'
import { setWeeklyLogValue } from '@/lib/weeklyLogStore'
import { formatMetricAmount, formatMetricAmountWithUnit } from '@/lib/timedMetrics'
import { isSupabaseConfigured } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import { kgToDisplay } from '@/lib/settingsStore'
import { useSettings } from '@/context/SettingsContext'
import type { SleepMetricsConfig } from '@/lib/sleepMetrics'
import type { HabitTypeDefinition } from '@/lib/habitTypes'
import type { WorkoutTypeDefinition } from '@/lib/workoutTypes'
import { cn, formatDate } from '@/lib/utils'

interface MetricHistoryModalProps {
  target: MetricHistoryTarget
  goals: Goal[]
  userId: string
  habits: HabitTypeDefinition[]
  workoutTypes: WorkoutTypeDefinition[]
  sleepMetricsConfig: SleepMetricsConfig
  onClose: () => void
}

function chunkRows<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/** Newest-first list → rows with most recent on the right. */
function chunkRowsRecentRight<T>(items: T[], size: number): T[][] {
  return chunkRows(items, size).map((chunk) => [...chunk].reverse())
}

type HistoryRow =
  | { kind: 'daily'; date: string; label: string }
  | { kind: 'weekly'; weekKey: string; label: string }

function shortDayParts(date: string): { dow: string; day: number } {
  const d = new Date(`${date}T12:00:00`)
  return {
    dow: d.toLocaleDateString(undefined, { weekday: 'short' }),
    day: d.getDate(),
  }
}

function formatHistoryDisplayValue(
  value: number | boolean | null,
  context: NonNullable<ReturnType<typeof resolveMetricHistoryContext>>,
  weightUnit: 'kg' | 'lb',
): string {
  if (value == null) return '—'
  if (typeof value === 'boolean') return value ? 'Done' : 'Not done'

  if (context.metricKey === 'weight') {
    const display = kgToDisplay(value, weightUnit)
    return display != null ? `${display} ${weightUnit}` : '—'
  }

  if (context.sleepMetric) {
    return formatMetricAmountWithUnit(value, context.unit, context.sleepMetric.id)
  }

  return formatMetricAmountWithUnit(value, context.unit, context.metricKey)
}

function shortChartLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
}

function shortWeekChartLabel(label: string): string {
  return label.replace('Week of ', '').split(' – ')[0] ?? label
}

function compactCellValue(
  value: number | boolean | null,
  context: NonNullable<ReturnType<typeof resolveMetricHistoryContext>>,
  weightUnit: 'kg' | 'lb',
): string {
  if (value == null) return '—'
  if (typeof value === 'boolean') return value ? '✓' : '·'

  if (context.metricKey === 'weight') {
    const display = kgToDisplay(value, weightUnit)
    return display != null ? String(display) : '—'
  }

  if (context.sleepMetric?.id === 'sleep_duration' || context.sleepMetric?.id === 'in_bed') {
    return formatMetricAmount(value, context.unit, context.sleepMetric.id)
  }

  if (context.unit === 'min' || context.unit === 'min/wk') {
    return value >= 60 ? `${Math.round(value / 60)}h` : `${value}`
  }

  if (context.unit === 'hrs' || context.unit === 'hrs/night') {
    return value > 0 ? value.toFixed(1) : '0'
  }

  if (context.unit === '%' || context.sleepMetric?.unit === 'percent') {
    return `${Math.round(value)}%`
  }

  if (context.unit === '/10' || context.sleepMetric?.unit === 'score10') {
    return `${value}`
  }

  return formatMetricAmount(value, context.unit, context.metricKey ?? context.sleepMetric?.id)
}

export function MetricHistoryModal({
  target,
  goals,
  userId,
  habits,
  workoutTypes,
  sleepMetricsConfig,
  onClose,
}: MetricHistoryModalProps) {
  const { settings } = useSettings()
  const today = formatDate(new Date())
  const context = useMemo(
    () => resolveMetricHistoryContext(target, goals, habits, workoutTypes, sleepMetricsConfig),
    [target, goals, habits, workoutTypes, sleepMetricsConfig],
  )

  const [logs, setLogs] = useState<DailyLog[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [, setWeekLogRevision] = useState(0)
  const [editingRow, setEditingRow] = useState<HistoryRow | null>(null)
  const [editValue, setEditValue] = useState<number | boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [gridCols, setGridCols] = useState(7)
  const editCellRef = useRef<HTMLDivElement>(null)
  const editValueRef = useRef<number | boolean | null>(null)
  const gridScrollRef = useRef<HTMLDivElement>(null)

  const setEditValueSynced = (value: number | boolean | null) => {
    editValueRef.current = value
    setEditValue(value)
  }

  const { start, end, dates } = useMemo(() => getMetricHistoryDateRange(), [])
  const weekKeys = useMemo(
    () => getMetricHistoryWeekKeys(dates, settings.weekStartsOn),
    [dates, settings.weekStartsOn],
  )

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true)
    try {
      if (isSupabaseConfigured) {
        const { fetchDailyLogs, fetchWorkouts } = await import('@/lib/supabase')
        const [nextLogs, nextWorkouts] = await Promise.all([
          fetchDailyLogs(userId, start, end),
          fetchWorkouts(userId, start, end),
        ])
        setLogs(nextLogs)
        setWorkouts(nextWorkouts)
      } else {
        localStore.setUserId(userId)
        setLogs(localStore.getDailyLogs(start, end))
        setWorkouts(localStore.getWorkouts(start, end))
      }
    } finally {
      if (!options?.silent) setLoading(false)
    }
  }, [userId, start, end])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const isWeekly = context?.period === 'weekly'

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const update = () => {
      if (isWeekly) {
        setGridCols(mq.matches ? 3 : 2)
      } else {
        setGridCols(mq.matches ? 7 : 4)
      }
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [isWeekly])

  const applyOptimisticDailyHabit = useCallback(
    (date: string, habitId: string, done: boolean) => {
      setLogs((prev) => {
        const existing = prev.find((l) => l.date === date)
        if (existing) {
          return prev.map((l) =>
            l.date === date
              ? { ...l, habits: normalizeHabits({ ...l.habits, [habitId]: done }) }
              : l,
          )
        }
        return [
          ...prev,
          {
            id: `temp-${date}`,
            user_id: userId,
            date,
            sleep_hours: null,
            weight: null,
            steps: null,
            screen_time_minutes: null,
            focus_minutes: 0,
            notes: '',
            habits: normalizeHabits({ [habitId]: done }),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]
      })
    },
    [userId],
  )

  const rows: HistoryRow[] = useMemo(() => {
    if (!context) return []
    if (context.period === 'weekly') {
      // weekKeys are oldest→newest; reverse so most recent weeks come first
      return [...weekKeys].reverse().map((weekKey) => ({
        kind: 'weekly' as const,
        weekKey,
        label: formatEditLogWeekLabel(weekKey),
      }))
    }
    // dates are already newest→oldest from getMetricHistoryDateRange
    return dates.map((date) => ({
      kind: 'daily' as const,
      date,
      label: date,
    }))
  }, [context, dates, weekKeys])

  const getRowValue = useCallback(
    (row: HistoryRow): number | boolean | null => {
      if (!context) return null
      if (row.kind === 'weekly') {
        return getWeeklyHistoryValue(context, row.weekKey)
      }
      const log = logs.find((l) => l.date === row.date)
      return getDailyHistoryValue(context, log, workouts, row.date)
    },
    [context, logs, workouts],
  )

  const stats = useMemo(() => {
    if (!context) return null
    const values = rows.map((row) => getRowValue(row))
    if (context.valueKind === 'boolean') {
      const done = values.filter((v) => v === true).length
      return { primary: `${done}/${values.length}`, detail: 'completed' }
    }
    const numeric = values.filter((v): v is number => typeof v === 'number' && v > 0)
    if (numeric.length === 0) return { primary: '—', detail: 'no entries yet' }
    const total = numeric.reduce((sum, v) => sum + v, 0)
    const avg = total / numeric.length
    return {
      primary: formatHistoryDisplayValue(avg, context, settings.weightUnit),
      detail: `${numeric.length} logged · ${formatHistoryDisplayValue(total, context, settings.weightUnit)} total`,
    }
  }, [rows, context, getRowValue, settings.weightUnit])

  const showChart = target.kind === 'workout' && context?.valueKind === 'number'

  const chartData = useMemo(() => {
    if (!context || !showChart) return []
    return rows.map((row) => {
        const value = getRowValue(row)
        const chartValue = historyValueToChartNumber(value, context)
        const key = row.kind === 'daily' ? row.date : row.weekKey
        const fullLabel =
          row.kind === 'daily'
            ? new Date(`${row.date}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })
            : row.label
        return {
          key,
          label:
            row.kind === 'daily' ? shortChartLabel(row.date) : shortWeekChartLabel(row.label),
          fullLabel,
          value: chartValue,
          hasValue: typeof value === 'number' && value > 0,
        }
      })
  }, [rows, context, getRowValue, showChart])

  const chartUnit = context?.unit === 'min' || context?.unit === 'min/wk' ? 'min' : context?.unit ?? ''

  const startEditing = (row: HistoryRow) => {
    const value = getRowValue(row)
    setSaveError(null)
    setEditingRow(row)
    if (context?.metricKey === 'weight' && typeof value === 'number') {
      setEditValueSynced(kgToDisplay(value, settings.weightUnit))
    } else {
      setEditValueSynced(value)
    }
  }

  const cancelEditing = () => {
    setEditingRow(null)
    setEditValueSynced(null)
    setSaveError(null)
  }

  const readEditingNumberFromInput = (): number | null | undefined => {
    const input = editCellRef.current?.querySelector('input')
    if (!(input instanceof HTMLInputElement)) return undefined
    const raw = input.value.trim()
    if (!raw) return null
    if (context?.unit === 'hrs:min' || context?.sleepMetric?.id === 'sleep_duration' || context?.sleepMetric?.id === 'in_bed') {
      // Duration inputs commit via their own onChange; prefer ref.
      return undefined
    }
    const parsed = context?.unit === 'steps' || context?.metricKey === 'steps'
      ? parseInt(raw, 10)
      : parseFloat(raw)
    return Number.isNaN(parsed) ? null : parsed
  }

  const saveEditing = async () => {
    if (!context || !editingRow) return
    setSaving(true)
    setSaveError(null)
    try {
      let valueToSave = editValueRef.current
      if (context.valueKind === 'number') {
        const fromInput = readEditingNumberFromInput()
        if (fromInput !== undefined) {
          valueToSave = fromInput
          setEditValueSynced(fromInput)
        }
      }

      const log =
        editingRow.kind === 'daily'
          ? logs.find((l) => l.date === editingRow.date) ?? null
          : null
      await persistMetricHistoryEntry({
        userId,
        target,
        context,
        date: editingRow.kind === 'daily' ? editingRow.date : editingRow.weekKey,
        weekKey: editingRow.kind === 'weekly' ? editingRow.weekKey : undefined,
        value: valueToSave,
        log,
        workouts,
        sleepConfig: sleepMetricsConfig,
        weightUnit: settings.weightUnit,
      })

      // Optimistic local update so the cell reflects the save immediately.
      if (editingRow.kind === 'daily' && context.sleepMetric && typeof valueToSave === 'number') {
        const metricId = context.sleepMetric.id
        const date = editingRow.date
        setLogs((prev) => {
          const existing = prev.find((entry) => entry.date === date)
          if (existing) {
            return prev.map((entry) =>
              entry.date === date
                ? {
                    ...entry,
                    sleep_metrics: {
                      ...(entry.sleep_metrics ?? {}),
                      [metricId]: valueToSave,
                    },
                  }
                : entry,
            )
          }
          return [
            ...prev,
            {
              id: `temp-${date}`,
              user_id: userId,
              date,
              sleep_hours: null,
              weight: null,
              steps: null,
              screen_time_minutes: null,
              focus_minutes: 0,
              notes: '',
              habits: {},
              custom_metrics: {},
              sleep_metrics: { [metricId]: valueToSave },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]
        })
      }

      cancelEditing()
      await loadData({ silent: true })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not save. Try again.'
      setSaveError(message)
    } finally {
      setSaving(false)
    }
  }

  useLayoutEffect(() => {
    if (!editingRow || context?.valueKind !== 'number') return
    const cell = editCellRef.current
    if (!cell) return
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    const scroller = gridScrollRef.current
    if (scroller) {
      const cellLeft = cell.offsetLeft
      const cellRight = cellLeft + cell.offsetWidth
      const viewLeft = scroller.scrollLeft
      const viewRight = viewLeft + scroller.clientWidth
      if (cellLeft < viewLeft + 12) {
        scroller.scrollTo({ left: Math.max(0, cellLeft - 12), behavior: 'smooth' })
      } else if (cellRight > viewRight - 12) {
        scroller.scrollTo({
          left: cellRight - scroller.clientWidth + 12,
          behavior: 'smooth',
        })
      }
    }
    const input = cell.querySelector('input')
    if (input instanceof HTMLInputElement) {
      input.focus()
      input.select()
    }
  }, [editingRow, context?.valueKind])

  useEffect(() => {
    if (!editingRow || context?.valueKind !== 'number') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelEditing()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editingRow, context?.valueKind])

  const toggleHabit = async (row: HistoryRow) => {
    if (!context || context.valueKind !== 'boolean' || !context.habit) return
    const current = getRowValue(row)
    const next = current !== true

    if (row.kind === 'daily') {
      applyOptimisticDailyHabit(row.date, context.habit.id, next)
    } else {
      setWeeklyLogValue(row.weekKey, habitWeeklyLogKey(context.habit.id), next ? 1 : 0)
      setWeekLogRevision((n) => n + 1)
    }

    try {
      const log = row.kind === 'daily' ? logs.find((l) => l.date === row.date) ?? null : null
      await persistMetricHistoryEntry({
        userId,
        target,
        context,
        date: row.kind === 'daily' ? row.date : row.weekKey,
        weekKey: row.kind === 'weekly' ? row.weekKey : undefined,
        value: next,
        log,
        workouts,
        sleepConfig: sleepMetricsConfig,
        weightUnit: settings.weightUnit,
      })
      if (row.kind === 'daily') {
        await loadData({ silent: true })
      }
    } catch {
      if (row.kind === 'daily') {
        applyOptimisticDailyHabit(row.date, context.habit.id, current === true)
        await loadData({ silent: true })
      } else {
        setWeeklyLogValue(
          row.weekKey,
          habitWeeklyLogKey(context.habit.id),
          current === true ? 1 : 0,
        )
        setWeekLogRevision((n) => n + 1)
      }
    }
  }

  const handleCellClick = (row: HistoryRow) => {
    if (context?.valueKind === 'boolean') {
      void toggleHabit(row)
      return
    }
    startEditing(row)
  }

  if (!context) return null

  const editingKey = editingRow
    ? editingRow.kind === 'daily'
      ? editingRow.date
      : editingRow.weekKey
    : null
  const isNumberEditing = editingKey != null && context.valueKind === 'number'
  const rowChunks = chunkRowsRecentRight(rows, gridCols)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="metric-history-title"
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {isWeekly ? 'Weekly history' : 'Last 30 days'}
            </p>
            <h2 id="metric-history-title" className="truncate text-lg font-semibold text-zinc-100">
              {context.label}
            </h2>
            {stats && (
              <p className="mt-1 text-sm text-zinc-400">
                <span className="font-medium text-zinc-200">{stats.primary}</span>
                <span className="text-zinc-600"> · </span>
                {stats.detail}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-zinc-500">
              Loading…
            </div>
          ) : (
            <>
              {showChart && (
                <div className="mb-5 h-40 rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#71717a', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: '#71717a', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                        allowDecimals
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                        contentStyle={{
                          background: '#18181b',
                          border: '1px solid #3f3f46',
                          borderRadius: 10,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: '#a1a1aa' }}
                        formatter={(value: number) => [
                          `${value}${chartUnit ? ` ${chartUnit}` : ''}`,
                          context.label,
                        ]}
                        labelFormatter={(_, payload) =>
                          payload?.[0]?.payload?.fullLabel ?? ''
                        }
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
                        {chartData.map((entry) => (
                          <Cell
                            key={entry.key}
                            fill={entry.hasValue ? 'var(--accent-500)' : '#3f3f46'}
                            fillOpacity={entry.hasValue ? 0.9 : 0.45}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {saveError && (
                <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
                  {saveError}
                </p>
              )}

              <div
                ref={gridScrollRef}
                className={cn(
                  '-mx-1 overflow-x-auto px-1 pb-1',
                  isNumberEditing && 'scroll-smooth',
                )}
              >
                <div className="flex min-w-full flex-col gap-2">
                  {rowChunks.map((chunk, chunkIndex) => {
                    const editingIndex =
                      context.valueKind === 'number' && editingKey
                        ? chunk.findIndex((entry) =>
                            entry.kind === 'daily'
                              ? entry.date === editingKey
                              : entry.weekKey === editingKey,
                          )
                        : -1
                    return (
                    <div
                      key={`row-${chunkIndex}`}
                      className="metric-history-grid-row"
                      style={
                        {
                          '--metric-history-cols': gridCols,
                        } as CSSProperties
                      }
                    >
                      {chunk.map((row, cellIndex) => {
                        const key = row.kind === 'daily' ? row.date : row.weekKey
                        const value = getRowValue(row)
                        const isSelected = editingKey === key
                        const sideClass =
                          editingIndex >= 0 && !isSelected
                            ? cellIndex < editingIndex
                              ? 'metric-history-cell-before'
                              : 'metric-history-cell-after'
                            : null
                        const isDone = value === true
                        const hasValue =
                          value != null && (typeof value !== 'boolean' || value === true)
                        const isToday = row.kind === 'daily' && row.date === today
                        const parts = row.kind === 'daily' ? shortDayParts(row.date) : null
                        const fullDateLabel =
                          row.kind === 'daily'
                            ? new Date(`${row.date}T12:00:00`).toLocaleDateString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })
                            : row.label.replace('Week of ', '')

                        if (isSelected && context.valueKind === 'number') {
                          return (
                            <div
                              key={key}
                              ref={editCellRef}
                              onKeyDown={(event) => {
                                if (event.key !== 'Enter' || event.shiftKey) return
                                event.preventDefault()
                                const input = editCellRef.current?.querySelector('input')
                                input?.blur()
                                void saveEditing()
                              }}
                              className={cn(
                                'metric-history-cell metric-history-cell-expand relative z-20 flex flex-col rounded-xl border border-[var(--accent-500)]/70 bg-zinc-950 p-2.5 shadow-lg shadow-black/40 ring-2 ring-[var(--accent-500)]/25',
                                isToday && 'ring-zinc-400/40',
                              )}
                            >
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  {row.kind === 'daily' && parts ? (
                                    <p className="truncate text-[11px] font-semibold text-zinc-200">
                                      <span className="uppercase tracking-wide text-zinc-500">
                                        {parts.dow}
                                      </span>{' '}
                                      <span className="tabular-nums">{parts.day}</span>
                                    </p>
                                  ) : (
                                    <p className="truncate text-[11px] font-semibold text-zinc-200">
                                      {fullDateLabel}
                                    </p>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-center gap-0.5">
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={cancelEditing}
                                    className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                                    aria-label="Cancel"
                                  >
                                    <X size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => void saveEditing()}
                                    className="rounded-lg bg-[var(--accent-500)] p-1.5 text-black transition-colors hover:bg-[var(--accent-400)] disabled:opacity-50"
                                    aria-label={saving ? 'Saving' : 'Save'}
                                  >
                                    <Check size={14} strokeWidth={2.5} />
                                  </button>
                                </div>
                              </div>
                              <GoalMetricInput
                                label=""
                                compact
                                unit={
                                  context.metricKey === 'weight'
                                    ? settings.weightUnit
                                    : context.unit
                                }
                                metricKey={context.sleepMetric?.id ?? context.metricKey}
                                value={
                                  typeof editValue === 'number'
                                    ? editValue
                                    : editValue === null
                                      ? null
                                      : 0
                                }
                                onChange={setEditValueSynced}
                                disabled={saving}
                              />
                            </div>
                          )
                        }

                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={saving && context.valueKind !== 'boolean'}
                            onClick={() => handleCellClick(row)}
                            className={cn(
                              'metric-history-cell flex min-h-[4.5rem] flex-col items-center justify-center rounded-xl border px-1 py-2 text-center',
                              sideClass,
                              context.valueKind === 'boolean' && isDone
                                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                                : hasValue
                                  ? 'border-[var(--accent-500)]/30 bg-[var(--accent-500)]/10 text-zinc-100'
                                  : 'border-zinc-800/80 bg-zinc-950/50 text-zinc-500',
                              isToday && 'ring-1 ring-zinc-500/50',
                            )}
                            aria-label={
                              row.kind === 'daily'
                                ? `${parts?.dow} ${parts?.day}: ${formatHistoryDisplayValue(value, context, settings.weightUnit)}`
                                : `${row.label}: ${formatHistoryDisplayValue(value, context, settings.weightUnit)}`
                            }
                          >
                            {row.kind === 'daily' && parts ? (
                              <>
                                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                                  {parts.dow}
                                </span>
                                <span className="text-sm font-semibold tabular-nums text-zinc-200">
                                  {parts.day}
                                </span>
                              </>
                            ) : (
                              <span className="line-clamp-2 px-1 text-[10px] font-medium leading-tight text-zinc-400">
                                {row.label.replace('Week of ', '')}
                              </span>
                            )}

                            <span
                              className={cn(
                                'mt-1 text-xs font-medium tabular-nums',
                                context.valueKind === 'boolean' && isDone
                                  ? 'text-emerald-400'
                                  : hasValue
                                    ? 'text-[var(--accent-300)]'
                                    : 'text-zinc-600',
                              )}
                            >
                              {context.valueKind === 'boolean' ? (
                                isDone ? (
                                  <Check size={14} strokeWidth={2.5} className="mx-auto" />
                                ) : (
                                  <span className="text-zinc-600">·</span>
                                )
                              ) : (
                                compactCellValue(value, context, settings.weightUnit)
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
