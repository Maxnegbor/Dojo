import { cn } from '@/lib/utils'
import type { OverviewPeriod } from '@/lib/overviewPeriods'

const PERIODS: { id: OverviewPeriod; label: string }[] = [
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'year', label: 'Yearly' },
]

interface OverviewPeriodTabsProps {
  value: OverviewPeriod
  onChange: (period: OverviewPeriod) => void
}

export function OverviewPeriodTabs({ value, onChange }: OverviewPeriodTabsProps) {
  return (
    <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
      {PERIODS.map((period) => (
        <button
          key={period.id}
          type="button"
          onClick={() => onChange(period.id)}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            value === period.id
              ? 'bg-[var(--accent-600)] text-white'
              : 'text-zinc-400 hover:text-zinc-200',
          )}
        >
          {period.label}
        </button>
      ))}
    </div>
  )
}
