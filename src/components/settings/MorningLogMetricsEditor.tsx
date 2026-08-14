import {
  getAddableMorningLogItems,
  getConfiguredMorningLogItems,
} from '@/lib/morningLogConfig'
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
  onPickerOpenChange?: (open: boolean) => void
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
      onGoalKeysChange={props.onMorningLogGoalKeysChange}
      onSleepFieldIdsChange={props.onMorningLogSleepFieldIdsChange}
      onYesterdayKeysChange={props.onMorningLogYesterdayKeysChange}
      onPickerOpenChange={props.onPickerOpenChange}
      getConfiguredItems={getConfiguredMorningLogItems}
      getAddableItems={getAddableMorningLogItems}
      description="Add metrics from your Metrics page to include in the morning log. Everything else is logged from Home, and asked again at shutdown if it’s still missing."
      emptyConfiguredHint="No morning log fields yet. Add metrics on the Metrics page first, then add them here."
      emptyAddableHint="All tracked metrics are already in the morning log. Add more on the Metrics page."
      removeAriaLabel={(label) => `Remove ${label} from morning log`}
    />
  )
}
