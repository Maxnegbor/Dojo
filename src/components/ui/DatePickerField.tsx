import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
} from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSettings } from '@/context/SettingsContext'
import { cn, formatDate, getMonthStartPad, getWeekdayLabels } from '@/lib/utils'

interface DatePickerFieldProps {
  value: string
  onChange: (value: string) => void
  minDate?: string
  /** When true, dates before today are selectable (default: today is the minimum). */
  allowPast?: boolean
  placeholder?: string
  className?: string
}

function parseValue(value: string): Date | null {
  if (!value) return null
  const d = parseISO(value + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

export function DatePickerField({
  value,
  onChange,
  minDate,
  allowPast = false,
  placeholder = 'Pick a date',
  className,
}: DatePickerFieldProps) {
  const { settings } = useSettings()
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = parseValue(value)
  const min =
    minDate !== undefined
      ? parseValue(minDate)
      : allowPast
        ? null
        : parseValue(formatDate(new Date()))
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => selected ?? min ?? new Date())

  const dropdownRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  })

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (
        rootRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      )
        return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return
    const rect = rootRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + 6,
      left: rect.left,
      width: Math.max(rect.width, 260),
    })
  }, [open])

  useEffect(() => {
    if (selected) setMonth(selected)
  }, [value])

  const days = eachDayOfInterval({
    start: startOfMonth(month),
    end: endOfMonth(month),
  })
  const startPad = getMonthStartPad(month, settings.weekStartsOn)
  const weekdayLabels = getWeekdayLabels(settings.weekStartsOn)

  const isDisabled = (day: Date) => {
    if (!min) return false
    const dayStr = formatDate(day)
    const minStr = formatDate(min)
    return dayStr < minStr
  }

  const selectDay = (day: Date) => {
    if (isDisabled(day)) return
    onChange(formatDate(day))
    setOpen(false)
  }

  const label = selected ? format(selected, 'MMM d, yyyy') : placeholder

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-sm transition-colors',
          'hover:border-zinc-600 focus:border-[var(--accent-500)] focus:outline-none',
          selected ? 'text-zinc-100' : 'text-zinc-500',
          open && 'border-[var(--accent-500)]',
        )}
      >
        <span>{label}</span>
        <Calendar size={16} className="shrink-0 text-zinc-500" />
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-xl shadow-black/40"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-semibold text-zinc-100">
                {format(month, 'MMMM yyyy')}
              </span>
              <button
                type="button"
                onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 text-center text-[10px] text-zinc-500">
              {weekdayLabels.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: startPad }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {days.map((day) => {
                const disabled = isDisabled(day)
                const isSelected = selected ? isSameDay(day, selected) : false
                const inMonth = isSameMonth(day, month)

                return (
                  <button
                    key={formatDate(day)}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectDay(day)}
                    className={cn(
                      'flex h-8 items-center justify-center rounded-md text-xs tabular-nums transition-colors',
                      !inMonth && 'opacity-40',
                      disabled && 'cursor-not-allowed opacity-25',
                      isSelected
                        ? 'bg-[var(--accent-600)] font-medium text-white'
                        : !disabled && 'text-zinc-300 hover:bg-zinc-800',
                    )}
                  >
                    {format(day, 'd')}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
