import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchScheduleBlocksForDate } from '@/lib/scheduleBlock'
import {
  getScheduleBlockAlarm,
  scheduleBlockAlarmAtMinutes,
  type ScheduleBlockAlarmLead,
} from '@/lib/scheduleBlockAlarms'
import { playScheduleBlockAlarmSound } from '@/lib/timerSound'
import { formatDate } from '@/lib/utils'
import type { ScheduleBlock } from '@/types'

export interface ActiveScheduleBlockAlarm {
  block: ScheduleBlock
  leadMinutes: ScheduleBlockAlarmLead
}

function alarmKey(block: ScheduleBlock, alarmAtMinutes: number): string {
  return `${block.date}:${block.id}:${alarmAtMinutes}`
}

/** Fire block alarms only while the tab is visible — never catch up on past alarms. */
export function useScheduleBlockAlarms(userId: string | null) {
  const [activeAlarm, setActiveAlarm] = useState<ActiveScheduleBlockAlarm | null>(null)
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
        const config = getScheduleBlockAlarm(block.id)
        if (!config) continue

        const alarmAt = scheduleBlockAlarmAtMinutes(block.start_time, config.leadMinutes)
        if (nowMinutes !== alarmAt) continue

        const key = alarmKey(block, alarmAt)
        if (firedRef.current.has(key)) continue

        firedRef.current.add(key)
        playScheduleBlockAlarmSound()
        activeAlarmShowingRef.current = true
        setActiveAlarm({ block, leadMinutes: config.leadMinutes })
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
