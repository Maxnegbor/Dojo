import type { Goal, GoalPeriod, GoalTargetPeriod } from '@/types'
import { goalLogPeriod } from '@/lib/goals'
import { getWeekDates } from '@/lib/utils'

export function goalTargetPeriod(goal: Goal): GoalTargetPeriod {
  return goal.target_period ?? goalLogPeriod(goal)
}

export function isCustomTargetPeriod(goal: Goal): boolean {
  const period = goalTargetPeriod(goal)
  return period === 'custom_duration' || period === 'custom_date'
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function daysBetween(start: string, end: string): number {
  const a = new Date(start + 'T12:00:00').getTime()
  const b = new Date(end + 'T12:00:00').getTime()
  return Math.max(0, Math.round((b - a) / 86400000))
}

function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getRecurringCustomPeriodRange(
  goal: Goal,
  asOfDate: string,
): { start: string; end: string; totalDays: number; elapsedDays: number } | null {
  const period = goalTargetPeriod(goal)
  const anchorStart = goal.period_start_date ?? goal.created_at.split('T')[0]

  if (period === 'custom_duration' && goal.period_days && goal.period_days > 0) {
    let start = anchorStart
    const len = goal.period_days
    while (addDays(start, len - 1) < asOfDate) {
      start = addDays(start, len)
    }
    const end = addDays(start, len - 1)
    const effectiveEnd = asOfDate < end ? asOfDate : end
    const elapsedDays = daysBetween(start, effectiveEnd) + 1
    return {
      start,
      end,
      totalDays: len,
      elapsedDays: Math.min(len, elapsedDays),
    }
  }

  if (period === 'custom_date' && goal.period_end_date) {
    const span = daysBetween(anchorStart, goal.period_end_date)
    let start = anchorStart
    let end = goal.period_end_date
    while (end < asOfDate) {
      start = addDays(end, 1)
      end = addDays(start, span)
    }
    if (asOfDate < start) {
      return { start, end, totalDays: span + 1, elapsedDays: 0 }
    }
    const effectiveEnd = asOfDate < end ? asOfDate : end
    const totalDays = span + 1
    const elapsedDays = daysBetween(start, effectiveEnd) + 1
    return {
      start,
      end,
      totalDays,
      elapsedDays: Math.min(totalDays, elapsedDays),
    }
  }

  return null
}

export function formatGoalPeriodLabel(goal: Goal, asOfDate?: string): string {
  const period = goalTargetPeriod(goal)
  const today = asOfDate ?? new Date().toISOString().split('T')[0]

  if (goal.period_recurring && isCustomTargetPeriod(goal)) {
    const range = getCustomPeriodRange(goal, today)
    if (range) {
      if (period === 'custom_duration' && goal.period_days) {
        if (goal.period_days % 7 === 0 && goal.period_days >= 7) {
          const weeks = goal.period_days / 7
          return weeks === 1 ? '1 week' : `${weeks} weeks`
        }
        return goal.period_days === 1 ? '1 day' : `${goal.period_days} days`
      }
      if (period === 'custom_date') {
        return `by ${formatShortDate(range.end)}`
      }
    }
  }

  if (period === 'daily') return 'daily'
  if (period === 'weekly') return 'weekly'
  if (period === 'custom_duration' && goal.period_days) {
    if (goal.period_days % 7 === 0 && goal.period_days >= 7) {
      const weeks = goal.period_days / 7
      return weeks === 1 ? '1 week' : `${weeks} weeks`
    }
    return goal.period_days === 1 ? '1 day' : `${goal.period_days} days`
  }
  if (period === 'custom_date' && goal.period_end_date) {
    return `by ${formatShortDate(goal.period_end_date)}`
  }
  return 'custom'
}

export function targetPeriodLabel(period: GoalTargetPeriod, opts?: {
  periodDays?: number
  periodEndDate?: string
}): string {
  if (period === 'daily') return 'daily'
  if (period === 'weekly') return 'weekly'
  if (period === 'custom_duration' && opts?.periodDays) {
    if (opts.periodDays % 7 === 0 && opts.periodDays >= 7) {
      const weeks = opts.periodDays / 7
      return weeks === 1 ? '1 week' : `${weeks} weeks`
    }
    return opts.periodDays === 1 ? '1 day' : `${opts.periodDays} days`
  }
  if (period === 'custom_date' && opts?.periodEndDate) {
    return `by ${formatShortDate(opts.periodEndDate)}`
  }
  return 'custom'
}

/** Goal target window spans more than one calendar week (e.g. 2-week Zone 2 block). */
export function isGoalLongerThanWeek(goal: Goal, asOfDate: string): boolean {
  const range = getCustomPeriodRange(goal, asOfDate)
  if (range) return range.totalDays > 7

  if (
    goal.metric_key === 'weight' &&
    goal.period_start_date &&
    goal.period_end_date
  ) {
    return daysBetween(goal.period_start_date, goal.period_end_date) + 1 > 7
  }

  return false
}

export function getCustomPeriodRange(
  goal: Goal,
  asOfDate: string,
): { start: string; end: string; totalDays: number; elapsedDays: number } | null {
  if (goal.period_recurring && isCustomTargetPeriod(goal)) {
    return getRecurringCustomPeriodRange(goal, asOfDate)
  }

  const period = goalTargetPeriod(goal)
  const start = goal.period_start_date ?? goal.created_at.split('T')[0]

  if (period === 'custom_duration' && goal.period_days && goal.period_days > 0) {
    const end = addDays(start, goal.period_days - 1)
    const effectiveEnd = asOfDate < end ? asOfDate : end
    const elapsedDays = daysBetween(start, effectiveEnd) + 1
    return {
      start,
      end,
      totalDays: goal.period_days,
      elapsedDays: Math.min(goal.period_days, elapsedDays),
    }
  }

  if (period === 'custom_date' && goal.period_end_date) {
    const end = goal.period_end_date
    if (asOfDate < start) {
      return { start, end, totalDays: daysBetween(start, end) + 1, elapsedDays: 0 }
    }
    const effectiveEnd = asOfDate < end ? asOfDate : end
    const totalDays = daysBetween(start, end) + 1
    const elapsedDays = daysBetween(start, effectiveEnd) + 1
    return { start, end, totalDays, elapsedDays: Math.min(totalDays, elapsedDays) }
  }

  return null
}

export function periodDaysFromForm(amount: number, unit: 'days' | 'weeks'): number {
  const n = Math.max(1, Math.round(amount))
  return unit === 'weeks' ? n * 7 : n
}

export function formValuesFromPeriodDays(days: number): { amount: string; unit: 'days' | 'weeks' } {
  if (days >= 7 && days % 7 === 0) {
    return { amount: String(days / 7), unit: 'weeks' }
  }
  return { amount: String(days), unit: 'days' }
}

export function buildGoalPeriodFields(form: {
  targetPeriod: GoalTargetPeriod
  logPeriod: GoalPeriod
  periodDays?: number
  periodStartDate?: string
  periodEndDate?: string
  periodRecurring?: boolean
  createdAt?: string
}): Pick<Goal, 'log_period' | 'target_period' | 'period_days' | 'period_start_date' | 'period_end_date' | 'period_recurring'> {
  const today = new Date().toISOString().split('T')[0]
  const log_period = form.logPeriod
  const period_recurring = form.periodRecurring ?? false
  const cleared = {
    period_days: undefined as number | undefined,
    period_start_date: undefined as string | undefined,
    period_end_date: undefined as string | undefined,
    period_recurring: false,
  }

  if (form.targetPeriod === 'daily') {
    return { log_period, target_period: 'daily', ...cleared }
  }

  if (form.targetPeriod === 'weekly') {
    return { log_period, target_period: 'weekly', ...cleared }
  }

  if (form.targetPeriod === 'custom_duration') {
    return {
      log_period,
      target_period: 'custom_duration',
      period_days: form.periodDays,
      period_start_date: form.periodStartDate ?? today,
      period_end_date: undefined,
      period_recurring,
    }
  }

  return {
    log_period,
    target_period: 'custom_date',
    period_days: undefined,
    period_start_date: form.periodStartDate ?? today,
    period_end_date: form.periodEndDate,
    period_recurring,
  }
}

export function formatGoalScheduleLabel(goal: Goal, asOfDate?: string): string {
  const target = formatGoalPeriodLabel(goal, asOfDate)
  const log = goalLogPeriod(goal)
  const recurring =
    goal.period_recurring && isCustomTargetPeriod(goal) ? ' · recurring' : ''
  if (isCustomTargetPeriod(goal)) {
    return `${target}${recurring} · log ${log}`
  }
  if (target === log) return target
  return `${target} target · log ${log}`
}

export interface GoalTimeHorizon {
  start: string
  end: string
  /** Share of the goal period elapsed (0–100), by calendar days. */
  elapsedPercent: number
}

export function formatGoalEndDate(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00')
  const now = new Date()
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (d.getFullYear() !== now.getFullYear()) {
    opts.year = 'numeric'
  }
  return d.toLocaleDateString(undefined, opts)
}

/** Calendar window for goals with a start/end time horizon (weekly, custom, etc.). */
export function getGoalTimeHorizon(
  goal: Goal,
  asOfDate: string,
  weekStartsOn: 0 | 1 = 1,
): GoalTimeHorizon | null {
  if (
    goal.metric_key === 'weight' &&
    goal.goal_weight_start != null &&
    goal.goal_weight_target != null &&
    goal.period_start_date &&
    goal.period_end_date
  ) {
    const start = goal.period_start_date
    const end = goal.period_end_date
    const totalDays = daysBetween(start, end) + 1
    if (totalDays <= 0) return null
    if (asOfDate < start) {
      return { start, end, elapsedPercent: 0 }
    }
    const effectiveEnd = asOfDate < end ? asOfDate : end
    const elapsedDays = daysBetween(start, effectiveEnd) + 1
    return {
      start,
      end,
      elapsedPercent: Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100)),
    }
  }

  const period = goalTargetPeriod(goal)

  if (isCustomTargetPeriod(goal)) {
    const range = getCustomPeriodRange(goal, asOfDate)
    if (!range || range.totalDays <= 0) return null
    const elapsedPercent = (range.elapsedDays / range.totalDays) * 100
    return {
      start: range.start,
      end: range.end,
      elapsedPercent: Math.min(100, Math.max(0, elapsedPercent)),
    }
  }

  if (period === 'weekly') {
    const weekDates = getWeekDates(new Date(asOfDate + 'T12:00:00'), weekStartsOn)
    const start = weekDates[0]
    const end = weekDates[weekDates.length - 1]
    const dayIndex = weekDates.indexOf(asOfDate)
    const elapsedDays = dayIndex >= 0 ? dayIndex + 1 : asOfDate > end ? 7 : 1
    return {
      start,
      end,
      elapsedPercent: Math.min(100, (elapsedDays / 7) * 100),
    }
  }

  return null
}

export function goalTimeHorizonEndLabel(
  goal: Goal,
  asOfDate: string,
  weekStartsOn: 0 | 1 = 1,
): string | null {
  if (goal.metric_key === 'weight' && goal.period_start_date && goal.period_end_date) {
    return `${formatGoalEndDate(goal.period_start_date)} → ${formatGoalEndDate(goal.period_end_date)}`
  }
  const horizon = getGoalTimeHorizon(goal, asOfDate, weekStartsOn)
  if (!horizon) return null
  return `Ends ${formatGoalEndDate(horizon.end)}`
}
