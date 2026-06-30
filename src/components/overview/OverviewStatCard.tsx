import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

interface OverviewStatCardProps {
  label: string
  value: ReactNode
  detail?: ReactNode
  accent?: boolean
  className?: string
}

export function OverviewStatCard({
  label,
  value,
  detail,
  accent,
  className,
}: OverviewStatCardProps) {
  return (
    <Card className={cn('text-center', className)}>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums',
          accent ? 'text-[var(--accent-400)]' : 'text-zinc-100',
        )}
      >
        {value}
      </p>
      {detail ? <div className="mt-2 text-xs text-zinc-500">{detail}</div> : null}
    </Card>
  )
}

interface OverviewComparisonProps {
  text: string
  positive: boolean | null
}

export function OverviewComparison({ text, positive }: OverviewComparisonProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-1 text-xs font-medium',
        positive === true && 'text-emerald-400',
        positive === false && 'text-red-400',
        positive === null && 'text-zinc-500',
      )}
    >
      {positive === true && <ArrowUp size={14} strokeWidth={2.5} />}
      {positive === false && <ArrowDown size={14} strokeWidth={2.5} />}
      {text}
    </span>
  )
}

interface OverviewSectionProps {
  title: string
  children: React.ReactNode
}

export function OverviewSection({ title, children }: OverviewSectionProps) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </h3>
      {children}
    </section>
  )
}
