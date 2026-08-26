import { format, isFuture, isToday, parseISO } from 'date-fns'
import { ALLOW_FUTURE_DATES } from '@/lib/devFlags'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface DateNavigationHeaderProps {
  date: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

export function DateNavigationHeader({
  date,
  onPrev,
  onNext,
  onToday,
}: DateNavigationHeaderProps) {
  const parsed = parseISO(date)
  const viewingToday = isToday(parsed)
  const viewingFuture = ALLOW_FUTURE_DATES && isFuture(parsed) && !viewingToday

  return (
    <header className="home-date-nav flex min-w-0 flex-1 flex-wrap items-center gap-3">
      <div className="home-date-nav__controls flex shrink-0 items-center gap-0.5 rounded-full border border-zinc-800/70 bg-zinc-950/60 p-0.5 backdrop-blur-sm">
        <button
          onClick={onPrev}
          aria-label="Previous day"
          className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800/80 hover:text-zinc-200"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="flex min-w-[3.75rem] justify-center px-1">
          {viewingToday ? (
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
              Today
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="!h-auto !px-2 !py-1 !text-[11px] !font-semibold uppercase !tracking-[0.12em] text-zinc-400 hover:text-zinc-100"
              onClick={onToday}
            >
              Today
            </Button>
          )}
        </div>

        <button
          onClick={onNext}
          aria-label="Next day"
          className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800/80 hover:text-zinc-200"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        {!viewingToday && (
          <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">
            {format(parsed, 'EEEE, MMM d')}
          </h1>
        )}
        {viewingFuture && (
          <span className="shrink-0 rounded-full border border-amber-500/25 bg-amber-950/30 px-2 py-0.5 text-[10px] font-medium tracking-wide text-amber-300/90">
            Future
          </span>
        )}
      </div>
    </header>
  )
}
