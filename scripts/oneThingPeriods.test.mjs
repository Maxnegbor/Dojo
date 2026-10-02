import test from 'node:test'
import assert from 'node:assert/strict'
import { oneThingPeriod, currentOneThing, previousOneThing, completeRightNow, nextOneThingToSet } from '../src/lib/oneThingPeriods.ts'
const local = value => new Date(value)

test('a new local day requires a new daily choice', () => {
  assert.equal(oneThingPeriod('today', local('2026-10-01T23:59:59'), 1).key, '2026-10-01')
  assert.equal(oneThingPeriod('today', local('2026-10-02T00:00:00'), 1).key, '2026-10-02')
})
test('weekly renewal respects Monday and Sunday preferences across year boundaries', () => {
  assert.equal(oneThingPeriod('week', local('2027-01-03T12:00:00'), 1).key, '2026-12-28')
  assert.equal(oneThingPeriod('week', local('2027-01-04T00:00:00'), 1).key, '2027-01-04')
  assert.equal(oneThingPeriod('week', local('2027-01-03T00:00:00'), 0).key, '2027-01-03')
})
test('months and annual reviews renew at calendar boundaries', () => {
  const feb = oneThingPeriod('month', local('2028-02-29T12:00:00'), 1)
  assert.equal(feb.key, '2028-02-01')
  assert.equal(feb.next.getMonth(), 2)
  assert.equal(feb.next.getDate(), 1)
  for (const horizon of ['year', 'fiveYear', 'someday']) {
    assert.equal(oneThingPeriod(horizon, local('2027-01-01T00:00:00'), 1).key, '2027-01-01')
  }
})
test('an old goal remains available for review but cannot satisfy the new period', () => {
  const old = {horizon:'month',period:'2026-09-01',text:'Finish draft',nextAction:'',updatedAt:''}
  const now = local('2026-10-01T00:00:00')
  assert.equal(currentOneThing([old], 'month', now, 1), undefined)
  assert.equal(previousOneThing([old], 'month', now, 1), old)
  const renewed = {...old, period:'2026-10-01'}
  assert.equal(currentOneThing([old, renewed], 'month', now, 1), renewed)
  assert.equal(previousOneThing([old, renewed], 'month', now, 1), old)
})
test('daily renewal uses calendar midnight over daylight saving changes', () => {
  const { next } = oneThingPeriod('today', local('2026-10-25T00:30:00'), 1)
  assert.equal(next.getDate(), 26)
  assert.equal(next.getHours(), 0)
})

test('completing a focus archives it and permits a new focus in the same day', () => {
  const now = local('2026-10-01T12:00:00')
  const focus = {horizon:'rightNow',period:'2026-10-01',text:'Write outline',nextAction:'',updatedAt:''}
  const completed = completeRightNow([focus], now, 1)
  assert.equal(completed[0].text, 'Write outline')
  assert.ok(completed[0].completedAt)
  assert.equal(currentOneThing(JSON.parse(JSON.stringify(completed)), 'rightNow', now, 1), undefined)
  const next = {...focus, text:'Draft introduction'}
  assert.equal(currentOneThing([...completed, next], 'rightNow', now, 1), next)
})
test('the header asks for the earliest unset horizon and shows the goal above it', () => {
  const now = local('2026-10-05T09:00:00')
  const goal = (horizon, period, text) => ({ horizon, period, text, nextAction: '', updatedAt: '' })
  const base = [
    goal('someday', '2026-01-01', 'Write the book'),
    goal('year', '2026-01-01', 'Finish part one'),
    goal('month', '2026-10-01', 'Outline October'),
  ]
  const week = nextOneThingToSet(base, now, 1)
  assert.equal(week.horizon.id, 'week')
  assert.equal(week.parent.label, 'Monthly')
  assert.equal(week.parentGoal.text, 'Outline October')
  const withWeek = [...base, goal('week', '2026-10-05', 'Draft the chapter')]
  const today = nextOneThingToSet(withWeek, now, 1)
  assert.equal(today.horizon.id, 'today')
  assert.equal(today.horizon.prompt, 'Based on my weekly goal, what’s the ONE Thing I can accomplish today to be on track?')
  assert.equal(today.parent.label, 'Weekly')
  assert.equal(today.parentGoal.text, 'Draft the chapter')
  const withToday = [...withWeek, goal('today', '2026-10-05', 'Get in bed on time')]
  const rightNow = nextOneThingToSet(withToday, now, 1)
  assert.equal(rightNow.horizon.id, 'rightNow')
  assert.equal(rightNow.parent.label, 'Daily')
  assert.equal(rightNow.parentGoal.text, 'Get in bed on time')
  assert.equal(nextOneThingToSet([...withToday, goal('rightNow', '2026-10-05', 'Set an alarm')], now, 1), undefined)
  const first = nextOneThingToSet([], now, 1)
  assert.equal(first.horizon.id, 'someday')
  assert.equal(first.parent, undefined)
})
test('completing a legacy daily next action prevents it from returning', () => {
  const now = local('2026-10-01T12:00:00')
  const daily = {horizon:'today',period:'2026-10-01',text:'Finish draft',nextAction:'Write outline',updatedAt:''}
  const completed = completeRightNow([daily], now, 1)
  assert.equal(currentOneThing(completed, 'rightNow', now, 1), undefined)
  assert.equal(currentOneThing(completed, 'today', now, 1), daily)
  assert.equal(completeRightNow(completed, now, 1), completed)
})
