import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  formatScheduleBlockAlarmLead,
  setScheduleBlockAlarmLead,
  type ScheduleBlockAlarmLead,
} from '@/lib/scheduleBlockAlarms'
import { cn } from '@/lib/utils'

const LEAD_OPTIONS: ScheduleBlockAlarmLead[] = [15, 30, 60]

interface ScheduleBlockAlarmMenuProps {
  blockId: string
  x: number
  y: number
  currentLead: ScheduleBlockAlarmLead
  onClose: () => void
}

export function ScheduleBlockAlarmMenu({
  blockId,
  x,
  y,
  currentLead,
  onClose,
}: ScheduleBlockAlarmMenuProps) {
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Node && document.getElementById('schedule-block-alarm-menu')?.contains(target)) {
        return
      }
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return createPortal(
    <div
      id="schedule-block-alarm-menu"
      className="fixed z-[300] min-w-[10rem] overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 py-1 shadow-xl"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        Alarm timing
      </p>
      {LEAD_OPTIONS.map((lead) => (
        <button
          key={lead}
          type="button"
          className={cn(
            'flex w-full items-center justify-between px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800/80',
            currentLead === lead && 'bg-zinc-800/60 text-red-300',
          )}
          onClick={() => {
            setScheduleBlockAlarmLead(blockId, lead)
            onClose()
          }}
        >
          {formatScheduleBlockAlarmLead(lead)}
        </button>
      ))}
    </div>,
    document.body,
  )
}
