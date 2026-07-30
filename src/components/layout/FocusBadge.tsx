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
        'relative w-full min-w-0 overflow-hidden rounded-full border border-[var(--accent-600)] bg-[var(--accent-950)]',
        className,
      )}
    >
      {percent != null && (
        <div
          className="absolute inset-y-0 left-0 bg-[var(--accent-500)]/30"
          style={{
            width: `${percent}%`,
            transition: isLive ? 'none' : 'width 0.4s ease-out',
          }}
        />
      )}
      <div className="relative flex min-h-[2rem] items-center justify-center px-2 py-1.5 text-center text-[var(--accent-200)]">
        <span className="text-xs font-medium tabular-nums whitespace-nowrap">
          {durationLabel} focused
        </span>
      </div>
    </div>
  )
}
