import { cn } from '@/lib/utils'
import type { InputHTMLAttributes } from 'react'

interface MetricInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  unit?: string
}

export function MetricInput({ label, unit, className, ...props }: MetricInputProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <div className="relative">
        <input
          type="number"
          className={cn(
            'w-full rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100',
            'placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]',
            'disabled:cursor-not-allowed disabled:opacity-60',
            unit && 'pr-10',
            className,
          )}
          {...props}
        />
        {unit && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
            {unit}
          </span>
        )}
      </div>
    </label>
  )
}
