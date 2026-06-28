import { useEffect, useRef } from 'react'
import { WORKOUT_COLOR_PRESETS } from '@/lib/workoutTypes'
import { cn } from '@/lib/utils'

interface WorkoutColorPickerProps {
  color: string
  open: boolean
  onToggle: () => void
  onSelect: (color: string) => void
}

export function WorkoutColorPicker({
  color,
  open,
  onToggle,
  onSelect,
}: WorkoutColorPickerProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return
      onToggle()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onToggle])

  return (
    <div ref={popoverRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className="h-10 w-10 rounded-full border-2 border-zinc-700/80 shadow-inner transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
        style={{ backgroundColor: color }}
        aria-label="Choose color"
        aria-expanded={open}
      />
      {open && (
        <div
          className="absolute left-0 top-full z-20 mt-2 w-[10.5rem] rounded-xl border border-zinc-700/80 bg-zinc-900 p-3 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-4 gap-3">
            {WORKOUT_COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                title="Set color"
                onClick={() => {
                  onSelect(preset)
                  onToggle()
                }}
                className={cn(
                  'mx-auto h-6 w-6 shrink-0 rounded-full border-2 transition-transform hover:scale-110',
                  color === preset ? 'border-white' : 'border-transparent',
                )}
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
