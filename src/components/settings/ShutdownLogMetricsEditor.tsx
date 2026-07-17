import {
  getAddableShutdownLogItems,
  getConfiguredShutdownLogItems,
} from '@/lib/shutdownLogConfig'
import { LogMetricsEditor } from '@/components/settings/LogMetricsEditor'
import type { Goal, MetricKey } from '@/types'

interface ShutdownLogMetricsEditorProps {
  goals: Goal[]
  sleepConfig: import('@/lib/sleepMetrics').SleepMetricsConfig
  shutdownLogGoalKeys: MetricKey[]
  shutdownLogSleepFieldIds: string[]
  showWorkouts?: boolean
  onShutdownLogGoalKeysChange: (keys: MetricKey[]) => void
  onShutdownLogSleepFieldIdsChange: (ids: string[]) => void
  onPickerOpenChange?: (open: boolean) => void
}

export function ShutdownLogMetricsEditor(props: ShutdownLogMetricsEditorProps) {
  return (
    <LogMetricsEditor
      goals={props.goals}
      sleepConfig={props.sleepConfig}
      goalKeys={props.shutdownLogGoalKeys}
      sleepFieldIds={props.shutdownLogSleepFieldIds}
      showWorkouts={props.showWorkouts}
      onGoalKeysChange={props.onShutdownLogGoalKeysChange}
      onSleepFieldIdsChange={props.onShutdownLogSleepFieldIdsChange}
      onPickerOpenChange={props.onPickerOpenChange}
      getConfiguredItems={getConfiguredShutdownLogItems}
      getAddableItems={getAddableShutdownLogItems}
      description="Add metrics from your Metrics page to include in your evening shutdown log. New metrics you track appear in the add menu automatically."
      emptyConfiguredHint="No shutdown log fields yet. Add metrics on the Metrics page first, then add them here."
      emptyAddableHint="All tracked metrics are already in your shutdown log. Add more on the Metrics page."
      removeAriaLabel={(label) => `Remove ${label} from shutdown log`}
    />
  )
}
