import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { Card } from '@/components/ui/Card'
import { useSettings } from '@/context/SettingsContext'
import { hasTarget } from '@/lib/goals'
import { resolveGoalForWeek, getWeekStartsBefore } from '@/lib/goalTargetSnapshots'
import { calculateProgress } from '@/lib/metrics'
import { cn, getWeekDates } from '@/lib/utils'
import {
  getWorkoutTypes,
  workoutMetricKey,
  type WorkoutTypeDefinition,
} from '@/lib/workoutTypes'
import type { DailyLog, Goal, Workout } from '@/types'

const DEFAULT_WEEKS = 12

interface WorkoutGoalsWeeklyProgressGridProps {
  goals: Goal[]
  logs: DailyLog[]
  workouts: Workout[]
  asOf: Date
  weekStartsOn: 0 | 1
  weekCount?: number
}

function workoutGoalIntensity(percent: number): number {
  return Math.min(1, Math.max(0, percent / 100))
}

function workoutGoalFillBackground(color: string, intensity: number): string {
  if (intensity <= 0) return 'rgb(39 39 42)'
  const mix = Math.round(22 + intensity * 78)
  return `color-mix(in srgb, ${color} ${mix}%, rgb(39 39 42))`
}

function WeekCell({
  percent,
  color,
  title,
  isCurrentWeek,
}: {
  percent: number
  color: string
  title: string
  isCurrentWeek: boolean
}) {
  const intensity = workoutGoalIntensity(percent)
  const fill = Math.min(100, Math.max(0, percent))

  return (
    <div
      title={title}
      className={cn(
        'relative flex aspect-square w-full items-end overflow-hidden rounded-md border border-zinc-800/80',
        isCurrentWeek && 'ring-1 ring-[var(--accent-500)] ring-offset-1 ring-offset-zinc-900',
      )}
      style={{ backgroundColor: workoutGoalFillBackground(color, intensity * 0.35) }}
    >
      <div
        className="w-full rounded-sm transition-all"
        style={{
          height: `${fill}%`,
          backgroundColor: workoutGoalFillBackground(color, Math.max(intensity, 0.2)),
        }}
      />
    </div>
  )
}

export function WorkoutGoalsWeeklyProgressGrid({
  goals,
  logs,
  workouts,
  asOf,
  weekStartsOn,
  weekCount = DEFAULT_WEEKS,
}: WorkoutGoalsWeeklyProgressGridProps) {
  const { settings } = useSettings()

  const workoutGoals = useMemo(() => {
    if (!settings.showWorkoutMetrics) return []
    return getWorkoutTypes()
      .map((type) => ({
        type,
        goal: goals.find((g) => g.is_active && g.metric_key === workoutMetricKey(type.id)),
      }))
      .filter(({ goal }) => goal && hasTarget(goal)) as Array<{
      type: WorkoutTypeDefinition
      goal: Goal
    }>
  }, [goals, settings.showWorkoutMetrics])

  const weekStarts = useMemo(
    () => getWeekStartsBefore(asOf, weekStartsOn, weekCount),
    [asOf, weekStartsOn, weekCount],
  )

  const currentWeekStart = getWeekDates(new Date(), weekStartsOn)[0]

  const grid = useMemo(() => {
    return workoutGoals.map(({ type, goal }) => {
      const cells = weekStarts.map((weekStart) => {
        const weekDates = getWeekDates(parseISO(`${weekStart}T12:00:00`), weekStartsOn)
        const effectiveGoal = resolveGoalForWeek(goal, weekStart, weekStartsOn)
        const weekWorkouts = workouts.filter((w) => weekDates.includes(w.date))
        const weekLogs = logs.filter((l) => weekDates.includes(l.date))
        const lastDate = weekDates[weekDates.length - 1]
        const progress = calculateProgress(
          effectiveGoal,
          weekLogs.find((l) => l.date === lastDate),
          weekWorkouts,
          lastDate,
          weekDates,
          weekLogs,
          weekStart,
          weekStartsOn,
        )
        const target = effectiveGoal.target_value ?? 0
        const weekLabel = format(parseISO(`${weekStart}T12:00:00`), 'MMM d')
        const title =
          target > 0
            ? `${type.label} · w/o ${weekLabel}: ${Math.round(progress.current)}/${target} min (${Math.round(progress.percent)}%)`
            : `${type.label} · w/o ${weekLabel}: ${Math.round(progress.current)} min`

        return {
          weekStart,
          percent: progress.percent,
          title,
          isCurrentWeek: weekStart === currentWeekStart,
        }
      })
      return { type, goal, cells }
    })
  }, [workoutGoals, weekStarts, workouts, logs, weekStartsOn, currentWeekStart])

  if (workoutGoals.length === 0) return null

  const gridTemplateColumns = `4.5rem repeat(${weekStarts.length}, minmax(0, 1fr))`

  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Weekly goal progress
      </h3>
      <Card className="w-full max-w-lg p-3 sm:max-w-xl">
        <div
          className="mb-1 grid gap-1 text-[9px] text-zinc-500"
          style={{ gridTemplateColumns }}
        >
          <span />
          {weekStarts.map((weekStart) => (
            <span key={weekStart} className="truncate text-center">
              {format(parseISO(`${weekStart}T12:00:00`), 'MMM d')}
            </span>
          ))}
        </div>

        <div className="space-y-1.5">
          {grid.map(({ type, cells }) => (
            <div
              key={type.id}
              className="grid items-center gap-1"
              style={{ gridTemplateColumns }}
            >
              <div className="flex min-w-0 items-center gap-1 pr-1">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: type.color }}
                />
                <span className="truncate text-[10px] text-zinc-300">{type.label}</span>
              </div>
              {cells.map((cell) => (
                <WeekCell
                  key={cell.weekStart}
                  percent={cell.percent}
                  color={type.color}
                  title={cell.title}
                  isCurrentWeek={cell.isCurrentWeek}
                />
              ))}
            </div>
          ))}
        </div>
      </Card>
    </section>
  )
}
