import type { OverviewPeriod } from '@/lib/overviewPeriods'
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl'

const PERIODS = [
  { value: 'week' as const, label: 'Weekly' },
  { value: 'month' as const, label: 'Monthly' },
  { value: 'year' as const, label: 'Yearly' },
]

interface OverviewPeriodTabsProps {
  value: OverviewPeriod
  onChange: (period: OverviewPeriod) => void
}

export function OverviewPeriodTabs({ value, onChange }: OverviewPeriodTabsProps) {
  return (
    <SlidingSegmentedControl
      value={value}
      options={PERIODS}
      onChange={onChange}
      size="md"
      bordered
      aria-label="Overview period"
    />
  )
}
