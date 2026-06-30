import type { ReactNode } from 'react'
import type { Goal } from '@/types'
import { GoalPaceBar } from '@/components/ui/GoalPaceBar'
import { getGoalTimeHorizon } from '@/lib/goalPeriod'

interface GoalProgressWithPaceProps {
  goal: Goal
  asOfDate: string
  weekStartsOn: 0 | 1
  size?: 'sm' | 'md'
  children: ReactNode
}

export function GoalProgressWithPace({
  goal,
  asOfDate,
  weekStartsOn,
  size = 'md',
  children,
}: GoalProgressWithPaceProps) {
  const horizon = getGoalTimeHorizon(goal, asOfDate, weekStartsOn)

  return (
    <>
      {children}
      {horizon != null && <GoalPaceBar percent={horizon.elapsedPercent} size={size} />}
    </>
  )
}
