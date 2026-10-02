import { addDays, addMonths, addWeeks, addYears, format, startOfDay, startOfMonth, startOfWeek, startOfYear } from 'date-fns'

export const ONE_THING_HORIZONS = [
  { id: 'someday', label: 'Someday', prompt: 'What’s the ONE Thing I want to accomplish someday?', cadence: 'Review each year' },
  { id: 'year', label: 'Yearly', prompt: 'Based on my someday goal, what’s the ONE Thing I can accomplish this year to be on track?', cadence: 'Choose each year' },
  { id: 'month', label: 'Monthly', prompt: 'Based on my yearly goal, what’s the ONE Thing I can accomplish this month to be on track?', cadence: 'Choose each month' },
  { id: 'week', label: 'Weekly', prompt: 'Based on my monthly goal, what’s the ONE Thing I can accomplish this week to be on track?', cadence: 'Choose each week' },
  { id: 'today', label: 'Daily', prompt: 'Based on my weekly goal, what’s the ONE Thing I can accomplish today to be on track?', cadence: 'Choose each day' },
  { id: 'rightNow', label: 'Right now', prompt: 'Based on my daily goal, what’s the ONE Thing I can do right now to be on track?', cadence: 'Choose each day' },
] as const
// Retain previously saved five-year goals without displaying that retired horizon.
export type OneThingHorizon = typeof ONE_THING_HORIZONS[number]['id'] | 'fiveYear'
export interface OneThingGoal {
  horizon: OneThingHorizon
  period: string
  text: string
  nextAction: string
  updatedAt: string
  completedAt?: string
}

/** Local calendar periods, respecting the user's chosen first day of the week. */
export function oneThingPeriod(horizon: OneThingHorizon, now: Date, weekStartsOn: 0 | 1) {
  let start: Date
  let next: Date
  if (horizon === 'today' || horizon === 'rightNow') {
    start = startOfDay(now); next = addDays(start, 1)
  } else if (horizon === 'week') {
    start = startOfWeek(now, { weekStartsOn }); next = addWeeks(start, 1)
  } else if (horizon === 'month') {
    start = startOfMonth(now); next = addMonths(start, 1)
  } else {
    start = startOfYear(now); next = addYears(start, 1)
  }
  return { key: format(start, 'yyyy-MM-dd'), start, next }
}

export function currentOneThing(goals: OneThingGoal[], horizon: OneThingHorizon, now: Date, weekStartsOn: 0 | 1) {
  const key = oneThingPeriod(horizon, now, weekStartsOn).key
  const goal = goals.find(goal => goal.horizon === horizon && goal.period === key && !goal.completedAt)
  if (goal || horizon !== 'rightNow') return goal
  if (goals.some(goal => goal.horizon === 'rightNow' && goal.period === key && goal.completedAt)) return undefined
  // Existing daily next actions become the Right now goal until explicitly edited.
  const daily = goals.find(goal => goal.horizon === 'today' && goal.period === key)
  return daily?.nextAction.trim() ? { ...daily, horizon: 'rightNow' as const, text: daily.nextAction, nextAction: '' } : undefined
}

export function previousOneThing(goals: OneThingGoal[], horizon: OneThingHorizon, now: Date, weekStartsOn: 0 | 1) {
  const key = oneThingPeriod(horizon, now, weekStartsOn).key
  return goals.filter(goal => goal.horizon === horizon && goal.period < key)
    .sort((a, b) => b.period.localeCompare(a.period))[0]
}

/** The first horizon that still needs a goal, from someday down to right now. */
export function nextOneThingToSet(goals: OneThingGoal[], now: Date, weekStartsOn: 0 | 1) {
  const index = ONE_THING_HORIZONS.findIndex(horizon => !currentOneThing(goals, horizon.id, now, weekStartsOn))
  if (index < 0) return undefined
  const horizon = ONE_THING_HORIZONS[index]
  const parent = index > 0 ? ONE_THING_HORIZONS[index - 1] : undefined
  const parentGoal = parent ? currentOneThing(goals, parent.id, now, weekStartsOn) : undefined
  return { horizon, parent, parentGoal }
}

/** Archive the current focus; a completed legacy next action must not reappear. */
export function completeRightNow(goals: OneThingGoal[], now: Date, weekStartsOn: 0 | 1): OneThingGoal[] {
  const current = currentOneThing(goals, 'rightNow', now, weekStartsOn)
  if (!current) return goals
  return [
    ...goals.filter(goal => goal.horizon !== 'rightNow' || goal.period !== current.period || goal.completedAt),
    { ...current, completedAt: now.toISOString() },
  ]
}
