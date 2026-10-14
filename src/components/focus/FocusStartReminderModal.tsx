import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import type { FocusAlarmCheckItem } from '@/types'

interface FocusStartReminderModalProps {
  items: FocusAlarmCheckItem[]
  onStart: () => void
  onCancel: () => void
}

export function FocusStartReminderModal({
  items,
  onStart,
  onCancel,
}: FocusStartReminderModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center bg-black/92 p-6 backdrop-blur-md"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-labelledby="focus-start-reminder-title"
        aria-modal="true"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl outline-none"
      >
        <div className="border-b border-zinc-800/80 px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--accent-400)]">
            Before you start
          </p>
          <h2 id="focus-start-reminder-title" className="mt-1 text-lg font-bold text-zinc-100">
            Reminder
          </h2>
        </div>

        <ul className="flex-1 space-y-2 overflow-y-auto px-6 py-5">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2.5 text-sm text-zinc-200"
            >
              {item.label}
            </li>
          ))}
        </ul>

        <div className="flex gap-2 border-t border-zinc-800/80 px-6 py-4">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Not now
          </Button>
          <Button className="flex-1" onClick={onStart}>
            Start
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
