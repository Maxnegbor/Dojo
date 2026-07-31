import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface ColorDotPickerProps {
  value: string
  swatches: readonly string[]
  onChange: (hex: string) => void
  /** Accessible name for the color button. */
  label?: string
  className?: string
  size?: 'sm' | 'md'
}

export function ColorDotPicker({
  value,
  swatches,
  onChange,
  label = 'Choose color',
  className,
  size = 'md',
}: ColorDotPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const normalized = value.toLowerCase()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (target && rootRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cn('relative shrink-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'rounded-full ring-2 ring-zinc-700 transition-[box-shadow,transform] hover:scale-105 hover:ring-zinc-500',
          open && 'ring-[var(--accent-500)]/70',
          size === 'md' ? 'h-7 w-7' : 'h-6 w-6',
        )}
        style={{ backgroundColor: value }}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        title={value}
      />

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-full z-50 mt-2 grid w-max grid-cols-5 gap-2 rounded-xl border border-zinc-700/80 bg-zinc-950 p-2 shadow-xl shadow-black/40"
        >
          {swatches.map((hex) => {
            const selected = normalized === hex.toLowerCase()
            return (
              <button
                key={hex}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(hex)
                  setOpen(false)
                }}
                className={cn(
                  'h-6 w-6 rounded-full transition-transform hover:scale-110',
                  selected
                    ? 'ring-2 ring-white/80 ring-offset-1 ring-offset-zinc-950'
                    : 'ring-1 ring-white/10',
                )}
                style={{ backgroundColor: hex }}
                aria-label={`Color ${hex}`}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
