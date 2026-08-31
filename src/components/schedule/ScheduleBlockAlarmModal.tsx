import { createPortal } from 'react-dom'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ScheduleBlockAlarmLead } from '@/lib/scheduleBlockAlarms'
import type { ScheduleBlock } from '@/types'

interface ScheduleBlockAlarmModalProps {
  block: ScheduleBlock
  leadMinutes: ScheduleBlockAlarmLead
  formatTime: (date: Date) => string
  onDismiss: () => void
}

function formatBlockTime(hhmm: string, formatTime: (date: Date) => string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  const date = new Date()
  date.setHours(h, m, 0, 0)
  return formatTime(date)
}

function alarmLeadMessage(leadMinutes: ScheduleBlockAlarmLead): string {
  if (leadMinutes === 0) return 'This block is starting now.'
  if (leadMinutes === 60) return 'This block starts in 1 hour.'
  return `This block starts in ${leadMinutes} minutes.`
}

export function ScheduleBlockAlarmModal({
  block,
  leadMinutes,
  formatTime,
  onDismiss,
}: ScheduleBlockAlarmModalProps) {
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/92 p-6 backdrop-blur-md">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-950/80 ring-2 ring-red-500/60">
          <Bell size={40} className="text-red-400" aria-hidden />
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-red-400">Schedule alarm</p>
        <h2 className="mt-2 text-3xl font-bold text-zinc-50">{block.title}</h2>
        <p className="mt-2 text-lg text-zinc-400">
          {formatBlockTime(block.start_time, formatTime)}
          <span className="mx-2 text-zinc-600">–</span>
          {formatBlockTime(block.end_time, formatTime)}
        </p>
        <p className="mt-4 text-sm text-zinc-500">{alarmLeadMessage(leadMinutes)}</p>
        <Button size="lg" className="mt-8 min-w-[10rem]" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>,
    document.body,
  )
}
