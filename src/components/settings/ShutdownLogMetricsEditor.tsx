import {
  getAddableShutdownLogItems,
  getConfiguredShutdownLogItems,
} from '@/lib/shutdownLogConfig'
import {
  getMorningLogGoalKeys,
  getMorningLogSleepFieldIds,
  saveMorningLogGoalKeys,
  saveMorningLogSleepFieldIds,
  saveMorningLogYesterdayKeys,
  getMorningLogYesterdayKeys,
} from '@/lib/morningLogConfig'
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

function claimKeysForShutdown(keys: MetricKey[]) {
  const morningKeys = getMorningLogGoalKeys()
  const nextMorning = morningKeys.filter((key) => !keys.includes(key))
  if (nextMorning.length !== morningKeys.length) {
    saveMorningLogGoalKeys(nextMorning)
    saveMorningLogYesterdayKeys(
      getMorningLogYesterdayKeys().filter((key) => nextMorning.includes(key)),
    )
  }
}

function claimSleepForShutdown(ids: string[]) {
  const morningSleep = getMorningLogSleepFieldIds()
  const nextMorning = morningSleep.filter((id) => !ids.includes(id))
  if (nextMorning.length !== morningSleep.length) {
    saveMorningLogSleepFieldIds(nextMorning)
  }
}

export function ShutdownLogMetricsEditor(props: ShutdownLogMetricsEditorProps) {
  return (
    <LogMetricsEditor
      goals={props.goals}
      sleepConfig={props.sleepConfig}
      goalKeys={props.shutdownLogGoalKeys}
      sleepFieldIds={props.shutdownLogSleepFieldIds}
      showWorkouts={props.showWorkouts}
      onGoalKeysChange={(keys) => {
        claimKeysForShutdown(keys)
        props.onShutdownLogGoalKeysChange(keys)
      }}
      onSleepFieldIdsChange={(ids) => {
        claimSleepForShutdown(ids)
        props.onShutdownLogSleepFieldIdsChange(ids)
      }}
      onPickerOpenChange={props.onPickerOpenChange}
      getConfiguredItems={getConfiguredShutdownLogItems}
      getAddableItems={getAddableShutdownLogItems}
      description="Add metrics from your Metrics page to include in your evening shutdown log. Metrics already in your morning log are not listed here."
      emptyConfiguredHint="No shutdown log fields yet. Add metrics on the Metrics page first, then add them here."
      emptyAddableHint="All tracked metrics are already assigned to morning or shutdown. Add more on the Metrics page."
      removeAriaLabel={(label) => `Remove ${label} from shutdown log`}
    />
  )
}
