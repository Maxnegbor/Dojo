import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { StickyNote } from 'lucide-react'
import { DAY_NOTES_CHANGED, getDayNoteItems, saveDayNoteItems } from '@/lib/dayNotes'
import { cn, parseLocalDate } from '@/lib/utils'

export function useDayNoteItems(date: string) {
  const [items, setItems] = useState(() => getDayNoteItems(date))

  useEffect(() => {
    const refresh = () => setItems(getDayNoteItems(date))
    refresh()
    window.addEventListener(DAY_NOTES_CHANGED, refresh)
    window.addEventListener('user-storage-ready', refresh)
    return () => {
      window.removeEventListener(DAY_NOTES_CHANGED, refresh)
      window.removeEventListener('user-storage-ready', refresh)
    }
  }, [date])

  return items
}

function dayLabel(date: string) {
  return parseLocalDate(date).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function DayNoteButton({ date, onEdit }: { date: string; onEdit: () => void }) {
  const items = useDayNoteItems(date)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null)
  if (items.length === 0) return null

  const showPreview = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setPreview({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Read day notes"
        title="Day notes"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 transition-colors duration-200 ease-out hover:bg-zinc-800 hover:text-[var(--accent-300)]"
        onMouseEnter={showPreview}
        onMouseLeave={() => setPreview(null)}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setPreview(null)
          onEdit()
        }}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <StickyNote size={12} />
      </button>
      {preview &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[360] w-56 -translate-x-1/2 rounded-xl border border-zinc-700/80 bg-zinc-950 px-3 py-2 text-left shadow-xl"
            style={{ left: preview.x, top: preview.y }}
          >
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {items.map((item, index) => (
                <li key={index} className="flex gap-2 text-xs leading-snug text-zinc-200">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
                  <span className="min-w-0 break-words">{item}</span>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  )
}

export function DayNotesMarker({
  date,
  onEdit,
  className,
}: {
  date: string
  onEdit: () => void
  className?: string
}) {
  const items = useDayNoteItems(date)
  if (items.length === 0) return null
  return (
    <div className={cn('flex justify-center', className)}>
      <DayNoteButton date={date} onEdit={onEdit} />
    </div>
  )
}

export function DayNotesEditor({ date, onClose }: { date: string; onClose: () => void }) {
  const [items, setItems] = useState(() => {
    const saved = getDayNoteItems(date)
    return saved.length > 0 ? saved : ['']
  })
  const [focusIndex, setFocusIndex] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useLayoutEffect(() => {
    const input = inputRefs.current[focusIndex]
    if (!input || document.activeElement === input) return
    input.focus()
  }, [focusIndex, items.length])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const update = (next: string[], nextFocus = focusIndex) => {
    setItems(next.length > 0 ? next : [''])
    setFocusIndex(nextFocus)
    saveDayNoteItems(date, next)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[420] flex items-center justify-center bg-black/45 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Notes for ${dayLabel(date)}`}
        className="w-full max-w-sm rounded-2xl border border-zinc-700/80 bg-zinc-950 p-4 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Notes</p>
        <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">{dayLabel(date)}</h2>
        <ul className="mt-3 space-y-1">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />
              <input
                ref={(node) => {
                  inputRefs.current[index] = node
                }}
                value={item}
                aria-label={`Note ${index + 1}`}
                placeholder="Add a note"
                className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                onChange={(event) => {
                  const next = [...items]
                  next[index] = event.target.value
                  update(next, index)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    const next = [...items]
                    next.splice(index + 1, 0, '')
                    update(next, index + 1)
                    return
                  }
                  if (event.key === 'Backspace' && item === '' && items.length > 1) {
                    event.preventDefault()
                    const next = items.filter((_, itemIndex) => itemIndex !== index)
                    update(next, Math.max(0, index - 1))
                  }
                }}
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-2 rounded-full px-2 py-1 text-xs text-zinc-500 transition-colors duration-200 ease-out hover:bg-zinc-800 hover:text-zinc-300"
          onClick={() => update([...items, ''], items.length)}
        >
          Add bullet
        </button>
      </div>
    </div>,
    document.body,
  )
}
