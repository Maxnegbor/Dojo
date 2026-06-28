import { ArrowDown, ArrowUp } from 'lucide-react'
import type { ReactNode } from 'react'
import type { OverviewMetric } from '@/lib/overviewStats'
import { cn } from '@/lib/utils'

interface OverviewMetricCardProps {
  metric: OverviewMetric
}

export function OverviewMetricCard({ metric }: OverviewMetricCardProps) {
  const { label, value, displayValue, unit, pctVsBaseline, isPositive } = metric

  let comparison: ReactNode
  if (pctVsBaseline == null && value > 0) {
    comparison = (
      <span className="flex items-center gap-1 text-sm text-emerald-400">
        <ArrowUp size={16} strokeWidth={2.5} />
        Above 30-day average
      </span>
    )
  } else if (pctVsBaseline === 0) {
    comparison = <span className="text-sm text-zinc-500">In line with 30-day average</span>
  } else {
    const pct = Math.abs(Math.round(pctVsBaseline ?? 0))
    comparison = (
      <span
        className={cn(
          'flex items-center gap-1 text-sm font-medium',
          isPositive ? 'text-emerald-400' : 'text-red-400',
        )}
      >
        {isPositive ? (
          <ArrowUp size={16} strokeWidth={2.5} />
        ) : (
          <ArrowDown size={16} strokeWidth={2.5} />
        )}
        {pct}% {isPositive ? 'above' : 'below'} 30-day average
      </span>
    )
  }

  const shown = displayValue ?? String(value)

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 px-6 py-5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-4xl font-light tabular-nums tracking-tight text-zinc-50">
        {shown}
        {shown !== '—' && unit && (
          <span className="ml-1.5 text-lg text-zinc-500">{unit}</span>
        )}
      </p>
      <div className="mt-3">{comparison}</div>
    </div>
  )
}
