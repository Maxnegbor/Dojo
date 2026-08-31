import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface ScheduleHourLabelProps {
  hour: number
  use24h: boolean
  className?: string
  position?: 'first' | 'default'
}

function hourDate(hour: number): Date {
  if (hour === 24) return new Date(2000, 0, 1, 0, 0)
  return new Date(2000, 0, 1, hour, 0)
}

/** Hour gutter label with AM/PM stacked under the time in 12h mode. */
export function ScheduleHourLabel({
  hour,
  use24h,
  className,
  position = 'default',
}: ScheduleHourLabelProps) {
  const date = hourDate(hour)
  const positionClass = position === 'first' ? 'relative top-0.5' : 'relative -top-2'

  if (use24h) {
    return (
      <span className={cn('block', positionClass, className)}>
        {format(date, 'HH:mm')}
      </span>
    )
  }

  return (
    <span className={cn('flex flex-col items-end leading-none', positionClass, className)}>
      <span>{format(date, 'h:mm')}</span>
      <span>{format(date, 'a')}</span>
    </span>
  )
}
