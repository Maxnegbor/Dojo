import { useMemo } from 'react'
import { Brain } from 'lucide-react'
import { useFocus } from '@/context/FocusContext'
import { focusGoalTargetMinutes } from '@/lib/focusGoalSync'
import { getFocusSettings } from '@/lib/focusStore'
import { formatDuration } from '@/lib/utils'

export function FocusBadge() {
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

  return (
    <div className="relative overflow-hidden rounded-full border border-[var(--accent-600)] bg-[var(--accent-950)]">
      {percent != null && (
        <div
          className="absolute inset-y-0 left-0 bg-[var(--accent-500)]/30"
          style={{
            width: `${percent}%`,
            transition: isLive ? 'none' : 'width 0.4s ease-out',
          }}
        />
      )}
      <div className="relative flex items-center gap-2 px-3 py-1.5">
        <Brain size={14} className="shrink-0 text-[var(--accent-400)]" />
        <span className="text-xs font-medium tabular-nums text-[var(--accent-200)]">
          {formatDuration(dailyMinutes)}
        </span>
      </div>
    </div>
  )
}
