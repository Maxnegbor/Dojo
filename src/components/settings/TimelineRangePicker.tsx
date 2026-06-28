import { formatHourLabel, TimelineRangeSlider } from '@/components/settings/TimelineRangeSlider'
import { useSettings } from '@/context/SettingsContext'
import { normalizeTimelineRange } from '@/lib/settingsStore'

interface TimelineRangePickerProps {
  startHour: number
  endHour: number
  onChange: (range: { timelineStartHour: number; timelineEndHour: number }) => void
}

export function TimelineRangePicker({ startHour, endHour, onChange }: TimelineRangePickerProps) {
  const { settings } = useSettings()
  const { timeFormat } = settings

  return (
    <div className="space-y-2">
      <TimelineRangeSlider
        startHour={startHour}
        endHour={endHour}
        timeFormat={timeFormat}
        onChange={(nextStart, nextEnd) => onChange(normalizeTimelineRange(nextStart, nextEnd))}
      />
      <p className="text-[11px] text-zinc-500">
        {endHour - startHour} hour{endHour - startHour === 1 ? '' : 's'} on your Today schedule
        {' · '}
        <span className="text-zinc-400">
          {formatHourLabel(startHour, timeFormat, 'start')} – {formatHourLabel(endHour, timeFormat, 'end')}
        </span>
      </p>
    </div>
  )
}
