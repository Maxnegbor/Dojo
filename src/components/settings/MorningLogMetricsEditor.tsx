import {
  getAddableMorningLogItems,
  getConfiguredMorningLogItems,
} from '@/lib/morningLogConfig'
import {
  getShutdownLogGoalKeys,
  getShutdownLogSleepFieldIds,
  saveShutdownLogGoalKeys,
  saveShutdownLogSleepFieldIds,
} from '@/lib/shutdownLogConfig'
import { getShutdownClaimedItemIds } from '@/lib/trackedLogsNet'
import { moveMorningLogItemToShutdown } from '@/lib/moveMorningLogToShutdown'
import { LogMetricsEditor } from '@/components/settings/LogMetricsEditor'
import type { Goal, MetricKey } from '@/types'

interface MorningLogMetricsEditorProps {
  goals: Goal[]
  sleepConfig: import('@/lib/sleepMetrics').SleepMetricsConfig
  morningLogGoalKeys: MetricKey[]
  morningLogYesterdayKeys: MetricKey[]
  morningLogSleepFieldIds: string[]
  showWorkouts?: boolean
  onMorningLogGoalKeysChange: (keys: MetricKey[]) => void
  onMorningLogYesterdayKeysChange: (keys: MetricKey[]) => void
  onMorningLogSleepFieldIdsChange: (ids: string[]) => void
  onSaveGoal?: (goal: Goal) => void | Promise<void>
  onMovedToShutdown?: () => void
  onPickerOpenChange?: (open: boolean) => void
}

function claimKeysForMorning(keys: MetricKey[]) {
  const shutdownKeys = getShutdownLogGoalKeys()
  const nextShutdown = shutdownKeys.filter((key) => !keys.includes(key))
  if (nextShutdown.length !== shutdownKeys.length) {
    saveShutdownLogGoalKeys(nextShutdown)
  }
}

function claimSleepForMorning(ids: string[]) {
  const shutdownSleep = getShutdownLogSleepFieldIds()
  const nextShutdown = shutdownSleep.filter((id) => !ids.includes(id))
  if (nextShutdown.length !== shutdownSleep.length) {
    saveShutdownLogSleepFieldIds(nextShutdown)
  }
}

export function MorningLogMetricsEditor(props: MorningLogMetricsEditorProps) {
  return (
    <LogMetricsEditor
      goals={props.goals}
      sleepConfig={props.sleepConfig}
      goalKeys={props.morningLogGoalKeys}
      sleepFieldIds={props.morningLogSleepFieldIds}
      yesterdayKeys={props.morningLogYesterdayKeys}
      showWorkouts={props.showWorkouts}
      onGoalKeysChange={(keys) => {
        claimKeysForMorning(keys)
        props.onMorningLogGoalKeysChange(keys)
      }}
      onSleepFieldIdsChange={(ids) => {
        claimSleepForMorning(ids)
        props.onMorningLogSleepFieldIdsChange(ids)
      }}
      onYesterdayKeysChange={props.onMorningLogYesterdayKeysChange}
      onPickerOpenChange={props.onPickerOpenChange}
      onRemoveItem={(item) => {
        const { updatedGoal } = moveMorningLogItemToShutdown(item)
        if (updatedGoal) void props.onSaveGoal?.(updatedGoal)
        props.onMovedToShutdown?.()
      }}
      getConfiguredItems={getConfiguredMorningLogItems}
      getAddableItems={(goals, sleepConfig, options) =>
        getAddableMorningLogItems(goals, sleepConfig, options).filter(
          (item) => !getShutdownClaimedItemIds(goals, sleepConfig).has(item.id),
        )
      }
      description="Add metrics from your Metrics page to include in the morning log. New metrics you track appear in the add menu automatically. Removing a metric moves it to Daily shutdown (weekly weight returns to weekly shutdown)."
      emptyConfiguredHint="No morning log fields yet. Add metrics on the Metrics page first, then add them here."
      emptyAddableHint="All tracked metrics are already assigned to morning or shutdown. Add more on the Metrics page."
      removeAriaLabel={(label) => `Move ${label} to daily shutdown`}
    />
  )
}
