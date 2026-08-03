import { OverviewCategoryPanel } from '@/components/overview/OverviewCategoryPanel'
import type { OverviewCategory } from '@/lib/overviewCategories'
import type { PeriodRange } from '@/lib/overviewPeriods'
import type { DailyLog, Goal, Workout } from '@/types'

interface WeeklyOverviewPanelProps {
  category: OverviewCategory
  logs: DailyLog[]
  allLogs: DailyLog[]
  workouts: Workout[]
  goals: Goal[]
  log: DailyLog | undefined
  weekLogs: DailyLog[]
  weekWorkouts: Workout[]
  date: string
  weekStartsOn: 0 | 1
  asOf: Date
  range: PeriodRange
  isCurrentPeriod: boolean
}

/** @deprecated Prefer OverviewCategoryPanel — kept for compatibility. */
export function WeeklyOverviewPanel(props: WeeklyOverviewPanelProps) {
  return <OverviewCategoryPanel period="week" {...props} />
}
