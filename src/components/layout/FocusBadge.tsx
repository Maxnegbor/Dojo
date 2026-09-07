import { useMemo } from 'react'
import { useFocus } from '@/context/FocusContext'
import { focusGoalTargetMinutes } from '@/lib/focusGoalSync'
import { getFocusSettings } from '@/lib/focusStore'
import { formatDuration } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface FocusBadgeProps {
  className?: string
}

export function FocusBadge({ className }: FocusBadgeProps) {
  const { focusToday, focusWeekExceptToday, liveFocusSeconds } = useFocus()
  const focusSettings = getFocusSettings()

  const liveMinutes = liveFocusSeconds / 60
  const dailyMinutes = focusToday + liveMinutes

  const progressMinutes = useMemo(() => {
    if (focusSettings.focusGoalEnabled && focusSettings.focusGoalPeriod === 'weekly') {
      return focusWeekExceptToday + focusToday + liveMinutes
    }
    return dailyMinutes
  }, [
    dailyMinutes,
    focusToday,
    focusWeekExceptToday,
    liveMinutes,
    focusSettings.focusGoalEnabled,
    focusSettings.focusGoalPeriod,
  ])

  const targetMinutes =
    focusSettings.focusGoalEnabled ? focusGoalTargetMinutes(focusSettings) : null
  const percent =
    targetMinutes && targetMinutes > 0
      ? Math.min(100, (progressMinutes / targetMinutes) * 100)
      : null
  const isLive = liveFocusSeconds > 0
  const durationLabel = formatDuration(dailyMinutes)

  return (
    <div
      className={cn(
        'relative w-full min-w-0 overflow-hidden rounded-full border border-[var(--accent-600)]',
        className,
      )}
      style={{
        background:
          percent != null
            ? `linear-gradient(to right, color-mix(in srgb, var(--accent-500) 20%, var(--accent-950)) 0%, color-mix(in srgb, var(--accent-500) 20%, var(--accent-950)) max(0%, calc(${percent}% - 8px)), var(--accent-950) ${percent}%)`
            : 'var(--accent-950)',
        transition: isLive ? 'none' : 'background 0.4s ease-out',
      }}
    >
      <div className="relative flex min-h-[2rem] items-center justify-center px-2 py-1.5 text-center text-[var(--accent-200)]">
        <span className="text-xs font-medium tabular-nums whitespace-nowrap">
          {durationLabel} focused
        </span>
      </div>
    </div>
  )
}
