import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { TimeFormat } from '@/types'

const TRACK_MAX = 24

function formatHourLabel(
  hour: number,
  timeFormat: TimeFormat,
  kind: 'start' | 'end',
): string {
  if (kind === 'end' && hour === 24) {
    return timeFormat === '24h' ? '24:00' : '12:00 AM'
  }
  if (timeFormat === '24h') {
    return `${String(hour).padStart(2, '0')}:00`
  }
  const h12 = hour % 12 || 12
  const meridiem = hour < 12 ? 'AM' : 'PM'
  return `${h12}:00 ${meridiem}`
}

interface TimelineRangeSliderProps {
  label?: string
  startHour: number
  endHour: number
  timeFormat: TimeFormat
  onChange: (startHour: number, endHour: number) => void
}

export function TimelineRangeSlider({
  label = 'Schedule hours',
  startHour,
  endHour,
  timeFormat,
  onChange,
}: TimelineRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)

  const startPct = (startHour / TRACK_MAX) * 100
  const endPct = (endHour / TRACK_MAX) * 100

  const hourFromPointer = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return null
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(ratio * TRACK_MAX)
  }, [])

  const pickNearestThumb = useCallback(
    (hour: number) => {
      const distToStart = Math.abs(hour - startHour)
      const distToEnd = Math.abs(hour - endHour)
      return distToStart <= distToEnd ? 'start' : 'end'
    },
    [startHour, endHour],
  )

  const applyHour = useCallback(
    (thumb: 'start' | 'end', hour: number) => {
      if (thumb === 'start') {
        const nextStart = Math.max(0, Math.min(endHour - 1, hour))
        onChange(nextStart, endHour)
        return
      }
      const nextEnd = Math.min(24, Math.max(startHour + 1, hour))
      onChange(startHour, nextEnd)
    },
    [startHour, endHour, onChange],
  )

  useEffect(() => {
    if (!dragging) return
    const activeThumb = dragging

    function onPointerMove(e: PointerEvent) {
      const hour = hourFromPointer(e.clientX)
      if (hour == null) return
      applyHour(activeThumb, hour)
    }

    function onPointerUp() {
      setDragging(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [dragging, hourFromPointer, applyHour])

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).dataset.thumb) return
    const hour = hourFromPointer(e.clientX)
    if (hour == null) return
    const thumb = pickNearestThumb(hour)
    setDragging(thumb)
    applyHour(thumb, hour)
  }

  const rangeLabel = `${formatHourLabel(startHour, timeFormat, 'start')} – ${formatHourLabel(endHour, timeFormat, 'end')}`

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-zinc-100">{rangeLabel}</span>
      </div>

      <div
        ref={trackRef}
        className="relative mx-1 mt-6 mb-2 h-1.5 cursor-pointer rounded-full bg-zinc-700/80 touch-none select-none"
        onPointerDown={handleTrackPointerDown}
      >
        <div
          className="absolute inset-y-0 rounded-full bg-[var(--accent-500)] shadow-[0_0_10px_var(--accent-glow)]"
          style={{ left: `${startPct}%`, width: `${Math.max(endPct - startPct, 0)}%` }}
        />

        <button
          type="button"
          data-thumb="start"
          aria-label="Schedule start time"
          aria-valuemin={0}
          aria-valuemax={endHour - 1}
          aria-valuenow={startHour}
          onPointerDown={(e) => {
            e.stopPropagation()
            e.currentTarget.setPointerCapture(e.pointerId)
            setDragging('start')
          }}
          className={cn(
            'absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full',
            'bg-[var(--accent-500)] shadow-[0_0_8px_var(--accent-glow)]',
            'transition-transform hover:scale-110',
            dragging === 'start' && 'scale-110 ring-2 ring-[var(--accent-300)] ring-offset-2 ring-offset-[#06060b]',
          )}
          style={{ left: `${startPct}%` }}
        />

        <button
          type="button"
          data-thumb="end"
          aria-label="Schedule end time"
          aria-valuemin={startHour + 1}
          aria-valuemax={24}
          aria-valuenow={endHour}
          onPointerDown={(e) => {
            e.stopPropagation()
            e.currentTarget.setPointerCapture(e.pointerId)
            setDragging('end')
          }}
          className={cn(
            'absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full',
            'bg-[var(--accent-500)] shadow-[0_0_8px_var(--accent-glow)]',
            'transition-transform hover:scale-110',
            dragging === 'end' && 'scale-110 ring-2 ring-[var(--accent-300)] ring-offset-2 ring-offset-[#06060b]',
          )}
          style={{ left: `${endPct}%` }}
        />
      </div>

      <div className="flex justify-between text-[10px] text-zinc-600">
        <span>{formatHourLabel(0, timeFormat, 'start')}</span>
        <span>{formatHourLabel(24, timeFormat, 'end')}</span>
      </div>
    </div>
  )
}

export { formatHourLabel }
