import { addDays, parseISO } from 'date-fns'
import type { Goal, MetricKey } from '@/types'
import { hasTarget } from '@/lib/goals'
import { getWeekDates } from '@/lib/utils'

import { storageGetItem, storageSetItem } from '@/lib/userStorage'

const STORAGE_KEY = 'personal-os-goal-target-snapshots'

export interface GoalTargetSnapshot {
  week_start: string
  goal_id: string
  metric_key: MetricKey
  target_value: number | null
  log_period: Goal['log_period']
  target_period?: Goal['target_period']
  period_days?: number
  period_start_date?: string
  period_end_date?: string
  period_recurring?: boolean
}

function snapshotKey(weekStart: string, goalId: string): string {
  return `${weekStart}:${goalId}`
}

function readSnapshots(): Record<string, GoalTargetSnapshot> {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Record<string, GoalTargetSnapshot>
  } catch {
    /* ignore */
  }
  return {}
}

function writeSnapshots(snapshots: Record<string, GoalTargetSnapshot>) {
  storageSetItem(STORAGE_KEY, JSON.stringify(snapshots))
}

function snapshotFromGoal(weekStart: string, goal: Goal): GoalTargetSnapshot {
  return {
    week_start: weekStart,
    goal_id: goal.id,
    metric_key: goal.metric_key,
    target_value: goal.target_value,
    log_period: goal.log_period,
    target_period: goal.target_period,
    period_days: goal.period_days,
    period_start_date: goal.period_start_date,
    period_end_date: goal.period_end_date,
    period_recurring: goal.period_recurring,
  }
}

export function getGoalTargetSnapshot(
  weekStart: string,
  goalId: string,
): GoalTargetSnapshot | null {
  return readSnapshots()[snapshotKey(weekStart, goalId)] ?? null
}

export function upsertGoalTargetSnapshotIfAbsent(weekStart: string, goal: Goal) {
  if (!hasTarget(goal)) return
  const key = snapshotKey(weekStart, goal.id)
  const snapshots = readSnapshots()
  if (snapshots[key]) return
  snapshots[key] = snapshotFromGoal(weekStart, goal)
  writeSnapshots(snapshots)
}

export function captureWorkoutGoalSnapshotsForWeek(goals: Goal[], weekStart: string) {
  for (const goal of goals) {
    if (!goal.is_active || !goal.metric_key.startsWith('workout_') || !hasTarget(goal)) continue
    upsertGoalTargetSnapshotIfAbsent(weekStart, goal)
  }
}

function goalTargetFieldsEqual(a: Goal, b: Goal): boolean {
  return (
    a.target_value === b.target_value &&
    a.log_period === b.log_period &&
    a.target_period === b.target_period &&
    a.period_days === b.period_days &&
    a.period_start_date === b.period_start_date &&
    a.period_end_date === b.period_end_date &&
    a.period_recurring === b.period_recurring
  )
}

export function goalTargetFieldsChanged(a: Goal, b: Goal): boolean {
  return !goalTargetFieldsEqual(a, b)
}

/** Preserve historical targets for completed weeks when a workout goal is edited. */
export function backfillPastWeekSnapshotsOnGoalEdit(oldGoal: Goal, weekStartsOn: 0 | 1) {
  if (!oldGoal.metric_key.startsWith('workout_') || !hasTarget(oldGoal)) return

  const currentWeekStart = getWeekDates(new Date(), weekStartsOn)[0]
  let cursor = addDays(parseISO(currentWeekStart), -7)
  const oldest = addDays(parseISO(currentWeekStart), -364)

  while (cursor >= oldest) {
    const weekStart = getWeekDates(cursor, weekStartsOn)[0]
    if (weekStart >= currentWeekStart) break
    upsertGoalTargetSnapshotIfAbsent(weekStart, oldGoal)
    cursor = addDays(cursor, -7)
  }
}

export function isPastWeek(weekStart: string, weekStartsOn: 0 | 1): boolean {
  const currentWeekStart = getWeekDates(new Date(), weekStartsOn)[0]
  return weekStart < currentWeekStart
}

export function applyGoalTargetSnapshot(goal: Goal, snapshot: GoalTargetSnapshot): Goal {
  return {
    ...goal,
    target_value: snapshot.target_value,
    log_period: snapshot.log_period,
    target_period: snapshot.target_period,
    period_days: snapshot.period_days,
    period_start_date: snapshot.period_start_date,
    period_end_date: snapshot.period_end_date,
    period_recurring: snapshot.period_recurring,
  }
}

/** Use frozen target for past weeks; live goal for the current week. */
export function resolveGoalForWeek(
  goal: Goal,
  weekStart: string,
  weekStartsOn: 0 | 1,
): Goal {
  if (!isPastWeek(weekStart, weekStartsOn)) return goal
  const snapshot = getGoalTargetSnapshot(weekStart, goal.id)
  return snapshot ? applyGoalTargetSnapshot(goal, snapshot) : goal
}

export function getWeekStartsBefore(
  asOf: Date,
  weekStartsOn: 0 | 1,
  count: number,
): string[] {
  const starts: string[] = []
  let cursor = asOf
  for (let i = 0; i < count; i++) {
    const weekStart = getWeekDates(cursor, weekStartsOn)[0]
    starts.unshift(weekStart)
    cursor = addDays(parseISO(weekStart), -1)
  }
  return starts
}
