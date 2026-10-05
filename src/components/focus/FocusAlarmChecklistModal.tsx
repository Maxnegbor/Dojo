import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { FocusAlarmCheckItem } from '@/types'
import { cn } from '@/lib/utils'

interface FocusAlarmChecklistModalProps {
  items: FocusAlarmCheckItem[]
  subtitle: string
  onComplete: () => void
}

export function FocusAlarmChecklistModal({ items, subtitle, onComplete }: FocusAlarmChecklistModalProps) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const ready = items.length > 0 && items.every((item) => checked.has(item.id))

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/92 p-6 backdrop-blur-md">
      <div
        role="dialog"
        aria-labelledby="focus-alarm-checklist-title"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl"
      >
        <div className="border-b border-zinc-800/80 px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">After the alarm</p>
          <h2 id="focus-alarm-checklist-title" className="mt-1 text-lg font-bold text-zinc-100">
            Checklist
          </h2>
          <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>
        </div>

        <ul className="flex-1 space-y-2 overflow-y-auto px-6 py-5">
          {items.map((item) => {
            const done = checked.has(item.id)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                    done
                      ? 'border-[var(--accent-500)]/40 bg-[var(--accent-950)]/60'
                      : 'border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-700',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      done
                        ? 'border-[var(--accent-500)] bg-[var(--accent-500)] text-black'
                        : 'border-zinc-600',
                    )}
                  >
                    {done && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="text-sm text-zinc-200">{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="border-t border-zinc-800/80 px-6 py-4">
          <Button onClick={onComplete} className="w-full" disabled={!ready}>
            Continue
            <span className="text-white/70">
              ({checked.size}/{items.length})
            </span>
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
