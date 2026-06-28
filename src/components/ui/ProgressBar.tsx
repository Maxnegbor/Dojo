import { cn } from '@/lib/utils'

interface ProgressBarProps {
  percent: number
  onTrack?: boolean
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

export function ProgressBar({
  percent,
  onTrack = true,
  label,
  size = 'md',
  className,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent))

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
          <span>{label}</span>
          <span className={onTrack ? 'text-emerald-400' : 'text-amber-400'}>
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
          className={cn(
            'h-full rounded-full transition-all duration-500',
            onTrack
              ? 'bg-gradient-to-r from-indigo-500 to-emerald-500'
              : 'bg-gradient-to-r from-amber-500 to-orange-500',
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
