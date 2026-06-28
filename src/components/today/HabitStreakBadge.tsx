import { Flame } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Fixed slot width — flame + two-digit streak, no layout shift. */
export const HABIT_STREAK_SLOT_WIDTH = 'w-11' // 2.75rem / 44px

interface HabitStreakBadgeProps {
  streak: number
  variant?: 'inline' | 'circle'
  className?: string
}

function formatStreak(streak: number): string {
  if (streak > 99) return '99+'
  return String(streak)
}

export function HabitStreakBadge({
  streak,
  variant = 'inline',
  className,
}: HabitStreakBadgeProps) {
  if (variant === 'circle') {
    const active = streak > 0
    const colorClass = active ? 'text-orange-400' : 'text-zinc-500'

    return (
      <span
        className={cn(
          'inline-flex h-7 shrink-0 items-center justify-center gap-0.5 rounded-full bg-black/40',
          HABIT_STREAK_SLOT_WIDTH,
          className,
        )}
        aria-label={`${streak} day streak`}
        title={streak > 99 ? `${streak} day streak` : undefined}
      >
        <Flame size={11} className={cn('shrink-0', colorClass)} />
        <span
          className={cn(
            'min-w-[0.875rem] text-center text-[10px] font-semibold tabular-nums leading-none',
            colorClass,
          )}
        >
          {formatStreak(streak)}
        </span>
      </span>
    )
  }

  if (streak <= 0) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums text-orange-400',
        className,
      )}
      title={streak > 99 ? `${streak} day streak` : undefined}
    >
      <Flame size={12} className="shrink-0" />
      {formatStreak(streak)}
    </span>
  )
}
