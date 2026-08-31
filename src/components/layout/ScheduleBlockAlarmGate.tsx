import { useSettings } from '@/context/SettingsContext'
import { useAuth } from '@/hooks/useData'
import { useScheduleBlockAlarms } from '@/hooks/useScheduleBlockAlarms'
import { ScheduleBlockAlarmModal } from '@/components/schedule/ScheduleBlockAlarmModal'

export function ScheduleBlockAlarmGate() {
  const { userId } = useAuth()
  const { formatTime } = useSettings()
  const { activeAlarm, dismissAlarm } = useScheduleBlockAlarms(userId)

  if (!activeAlarm) return null

  return (
    <ScheduleBlockAlarmModal
      block={activeAlarm}
      formatTime={formatTime}
      onDismiss={dismissAlarm}
    />
  )
}
