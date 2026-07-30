import { cn } from '@/lib/utils'
import type { InputHTMLAttributes } from 'react'

interface MetricInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  unit?: string
  compact?: boolean
}

export function MetricInput({ label, unit, compact, className, type = 'number', ...props }: MetricInputProps) {
  return (
    <label className="block">
      {label ? (
        <span
          className={cn(
            'block font-medium text-zinc-400',
            compact ? 'mb-0.5 text-[10px] uppercase tracking-wide' : 'mb-1 text-xs',
          )}
        >
          {label}
        </span>
      ) : null}
      <div className="relative">
        <input
          type={type}
          className={cn(
            'w-full rounded-lg border border-zinc-700/60 bg-zinc-900/80 text-zinc-100',
            'placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]',
            'disabled:cursor-not-allowed disabled:opacity-60',
            compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
            unit && type === 'number' && (compact ? 'pr-8' : 'pr-10'),
            className,
          )}
          {...props}
        />
        {unit && (
          <span
            className={cn(
              'pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500',
              compact ? 'text-[10px]' : 'text-xs',
            )}
          >
            {unit}
          </span>
        )}
      </div>
    </label>
  )
}
