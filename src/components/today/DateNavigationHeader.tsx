import { format, isFuture, isToday, parseISO } from 'date-fns'
import { ALLOW_FUTURE_DATES } from '@/lib/devFlags'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LogStreak } from '@/components/today/LogStreak'

interface DateNavigationHeaderProps {
  date: string
  streak: number
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

export function DateNavigationHeader({
  date,
  streak,
  onPrev,
  onNext,
  onToday,
}: DateNavigationHeaderProps) {
  const parsed = parseISO(date)
  const viewingToday = isToday(parsed)
  const viewingFuture = ALLOW_FUTURE_DATES && isFuture(parsed) && !viewingToday

  return (
    <header className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onPrev}
          aria-label="Previous day"
          className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex w-[4.5rem] justify-center">
          {viewingToday ? (
            <span className="text-sm font-medium text-zinc-200">Today</span>
          ) : (
            <Button variant="secondary" size="sm" onClick={onToday}>
              Today
            </Button>
          )}
        </div>

        <button
          onClick={onNext}
          aria-label="Next day"
          className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        {!viewingToday && (
          <h1 className="truncate text-2xl font-bold tracking-tight text-zinc-100">
            {format(parsed, 'EEEE, MMM d')}
          </h1>
        )}
        {viewingFuture && (
          <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-300">
            Future
          </span>
        )}
        <LogStreak streak={streak} />
      </div>
    </header>
  )
}
