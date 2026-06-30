import { cn } from '@/lib/utils'

interface ProgressBarProps {
  percent: number
  onTrack?: boolean
  label?: string
  size?: 'sm' | 'md'
  tone?: 'default' | 'focus'
  className?: string
}

export function ProgressBar({
  percent,
  onTrack: _onTrack = true,
  label,
  size = 'md',
  tone = 'default',
  className,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent))
  const isFocus = tone === 'focus'

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
          <span>{label}</span>
          <span
            className={
              isFocus ? 'text-indigo-300' : 'text-[var(--accent-300)] tabular-nums'
            }
          >
            {Math.round(clamped)}%
          </span>
        </div>
      )}
      <div
        className={cn(
          'overflow-hidden rounded-full bg-zinc-800',
          size === 'sm' ? 'h-1.5' : 'h-2.5',
        )}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
