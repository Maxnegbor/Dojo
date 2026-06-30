import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OverviewPeriodNavProps {
  label: string
  canGoPrev: boolean
  canGoNext: boolean
  onPrev: () => void
  onNext: () => void
}

export function OverviewPeriodNav({
  label,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}: OverviewPeriodNavProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-2 py-1.5">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canGoPrev}
        aria-label="Previous period"
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
          canGoPrev
            ? 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
            : 'cursor-not-allowed text-zinc-700',
        )}
      >
        <ChevronLeft size={18} />
      </button>
      <p className="min-w-0 flex-1 truncate text-center text-xs font-medium text-zinc-200">
        {label}
      </p>
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        aria-label="Next period"
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
          canGoNext
            ? 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
            : 'cursor-not-allowed text-zinc-700',
        )}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
