import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchScheduleBlocksForDate } from '@/lib/scheduleBlock'
import { isScheduleBlockAlarmEnabled } from '@/lib/scheduleBlockAlarms'
import { playScheduleBlockAlarmSound } from '@/lib/timerSound'
import { formatDate, parseTimeToMinutes } from '@/lib/utils'
import type { ScheduleBlock } from '@/types'

function alarmKey(block: ScheduleBlock): string {
  return `${block.date}:${block.id}:${block.start_time}`
}

/** Fire block-start alarms only while the tab is visible — never catch up on past alarms. */
export function useScheduleBlockAlarms(userId: string | null) {
  const [activeAlarm, setActiveAlarm] = useState<ScheduleBlock | null>(null)
  const firedRef = useRef(new Set<string>())

  const activeAlarmShowingRef = useRef(false)

  const dismissAlarm = useCallback(() => {
    activeAlarmShowingRef.current = false
    setActiveAlarm(null)
  }, [])

  useEffect(() => {
    if (!userId) return

    let intervalId: number | undefined

    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      if (activeAlarmShowingRef.current) return

      const now = new Date()
      const today = formatDate(now)
      const nowMinutes = now.getHours() * 60 + now.getMinutes()

      const blocks = await fetchScheduleBlocksForDate(userId, today)
      for (const block of blocks) {
        if (!isScheduleBlockAlarmEnabled(block.id)) continue

        const startMinutes = parseTimeToMinutes(block.start_time)
        if (nowMinutes !== startMinutes) continue

        const key = alarmKey(block)
        if (firedRef.current.has(key)) continue

        firedRef.current.add(key)
        playScheduleBlockAlarmSound()
        activeAlarmShowingRef.current = true
        setActiveAlarm(block)
        break
      }
    }

    const syncPolling = () => {
      if (document.visibilityState === 'visible') {
        void tick()
        if (intervalId == null) {
          intervalId = window.setInterval(() => void tick(), 1000)
        }
      } else if (intervalId != null) {
        window.clearInterval(intervalId)
        intervalId = undefined
      }
    }

    syncPolling()
    document.addEventListener('visibilitychange', syncPolling)

    return () => {
      if (intervalId != null) window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', syncPolling)
    }
  }, [userId])

  return { activeAlarm, dismissAlarm }
}
