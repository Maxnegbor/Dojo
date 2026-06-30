import { useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { activeDailyChecklist, allDailyCheckItemIds } from '@/lib/dailyChecklist'
import type { DailyCheckGroup } from '@/types'
import { cn } from '@/lib/utils'

interface DailyChecklistModalProps {
  title: string
  subtitle: string
  checklist: DailyCheckGroup[]
  buttonLabel?: string
  onClose: () => void
  onComplete: (checkedIds: string[]) => void | Promise<void>
}

export function DailyChecklistModal({
  title,
  subtitle,
  checklist,
  buttonLabel = 'Done',
  onClose,
  onComplete,
}: DailyChecklistModalProps) {
  const groups = useMemo(() => activeDailyChecklist(checklist), [checklist])
  const itemIds = useMemo(() => allDailyCheckItemIds(groups), [groups])
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const [finishing, setFinishing] = useState(false)

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDone = async () => {
    setFinishing(true)
    try {
      await onComplete([...checked])
    } finally {
      setFinishing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X size={18} />
        </button>

        <div className="border-b border-zinc-800/80 px-6 py-5 pr-12">
          <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
          <p className="text-xs text-zinc-400">{subtitle}</p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {groups.map((group) => (
            <div key={group.id}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                {group.label}
              </p>
              <ul className="space-y-2">
                {group.items.map((item) => {
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
            </div>
          ))}
        </div>

        <div className="border-t border-zinc-800/80 px-6 py-4">
          <Button onClick={handleDone} className="w-full" disabled={finishing}>
            {finishing ? 'Saving…' : buttonLabel}
            {itemIds.length > 0 && (
              <span className="ml-1 text-black/70">
                ({checked.size}/{itemIds.length})
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
