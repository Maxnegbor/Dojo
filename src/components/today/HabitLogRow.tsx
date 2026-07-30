import { Check } from 'lucide-react'
import { HabitStreakBadge } from '@/components/today/HabitStreakBadge'
import { CompletionWaveFill } from '@/components/ui/CompletionWaveFill'
import type { HabitCompletePhase } from '@/hooks/useHabitCompleteAnimation'
import type { HabitTypeDefinition } from '@/lib/habitTypes'
import { cn } from '@/lib/utils'

interface HabitLogRowProps {
  habit: HabitTypeDefinition
  done: boolean
  phase?: HabitCompletePhase
  targetLabel: string | null
  streak: number
  disabled: boolean
  onToggle: () => void
}

export function HabitLogRow({
  habit,
  done,
  phase,
  targetLabel,
  streak,
  disabled,
  onToggle,
}: HabitLogRowProps) {
  const filling = phase === 'filling'
  const exiting = phase === 'exiting'
  const showDoneChrome = done && !filling && (exiting || !phase)
  const checkVisible = filling || showDoneChrome
  const labelDone = exiting || showDoneChrome
  const chromeTransition = filling || exiting ? 'duration-300' : 'duration-0'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (phase) return
        onToggle()
      }}
      className={cn(
        'relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg border px-3 py-2 text-left',
        `transition-[border-color,box-shadow] ${chromeTransition}`,
        showDoneChrome
          ? 'border-[var(--accent-500)]/40 bg-[var(--accent-950)]/35 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-500)_18%,transparent)]'
          : 'border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900/70',
        phase && 'pointer-events-none',
        disabled && 'cursor-not-allowed opacity-60',
        filling && 'border-zinc-800/80 bg-zinc-900/50',
      )}
    >
      <CompletionWaveFill phase={filling ? 'animating' : showDoneChrome && !filling ? 'done' : undefined} />

      <span
        className={cn(
          'relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          `transition-all ${chromeTransition}`,
          checkVisible
            ? 'border-[var(--accent-500)] bg-[var(--accent-500)] text-black'
            : 'border-zinc-600 bg-transparent',
          filling && 'scale-110',
        )}
        aria-hidden
      >
        {checkVisible && (
          <Check
            size={10}
            strokeWidth={3}
            className={cn('transition-transform duration-200', filling && 'scale-100')}
          />
        )}
      </span>

      <span
        className={cn(
          'relative z-10 min-w-0 flex-1 truncate text-xs font-medium',
          `transition-colors ${chromeTransition}`,
          labelDone ? 'text-[var(--accent-200)]' : 'text-zinc-200',
        )}
      >
        {habit.label}
      </span>

      {targetLabel && (
        <span
          className={cn(
            'relative z-10 shrink-0 text-[10px] tabular-nums',
            `transition-colors ${chromeTransition}`,
            labelDone ? 'text-[var(--accent-400)]/80' : 'text-[var(--accent-400)]',
          )}
        >
          {targetLabel}
        </span>
      )}

      <span className="relative z-10">
        <HabitStreakBadge streak={streak} variant="circle" />
      </span>
    </button>
  )
}
