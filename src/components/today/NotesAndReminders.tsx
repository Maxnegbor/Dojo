import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CompletionWaveFill } from '@/components/ui/CompletionWaveFill'
import { useReminderDismissAnimation } from '@/hooks/useReminderDismissAnimation'
import type { Reminder } from '@/types'
import { cn, generateId } from '@/lib/utils'

interface NotesAndRemindersProps {
  items: Reminder[]
  viewDate: string
  userId: string
  onAdd: (item: Reminder) => void
  onRemove: (id: string) => void
}

export function NotesAndReminders({
  items,
  viewDate,
  userId,
  onAdd,
  onRemove,
}: NotesAndRemindersProps) {
  const [composing, setComposing] = useState(false)
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const visible = items.filter(
    (r) => !r.completed && r.due_date <= viewDate && r.kind !== 'note',
  )

  const handleDismiss = useCallback((id: string) => onRemove(id), [onRemove])
  const { dismiss, getPhase } = useReminderDismissAnimation({ onDismiss: handleDismiss })

  useEffect(() => {
    if (composing) inputRef.current?.focus()
  }, [composing])

  const cancelCompose = () => {
    setComposing(false)
    setTitle('')
  }

  const commitCompose = () => {
    const trimmed = title.trim()
    if (!trimmed) {
      cancelCompose()
      return
    }
    onAdd({
      id: generateId(),
      user_id: userId,
      title: trimmed,
      due_date: viewDate,
      due_time: null,
      completed: false,
      rescheduled_from: null,
      kind: 'task',
      created_at: new Date().toISOString(),
    })
    cancelCompose()
  }

  return (
    <Card
      title="Reminders"
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setComposing(true)
            setTitle('')
          }}
        >
          <Plus size={14} />
        </Button>
      }
    >
      <ul className="space-y-1">
        {visible.map((item) => {
          const phase = getPhase(item.id)
          const completing = phase === 'completing'
          const exiting = phase === 'exiting'
          const checkActive = completing || exiting

          return (
            <li
              key={item.id}
              className={cn('reminder-row', exiting && 'reminder-row-exiting')}
            >
              <div className="reminder-row-inner">
                <div
                  className={cn(
                    'group relative flex items-center gap-2.5 overflow-hidden rounded-lg px-2 py-2 transition-colors',
                    !completing && !exiting && 'hover:bg-zinc-800/50',
                  )}
                >
                  <CompletionWaveFill
                    plain
                    phase={completing ? 'animating' : exiting ? 'done' : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => dismiss(item.id)}
                    disabled={!!phase}
                    aria-label={`Complete ${item.title}`}
                    className={cn(
                      'relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200',
                      checkActive
                        ? 'border-emerald-500 bg-emerald-500 text-zinc-950'
                        : 'border-zinc-600 text-transparent group-hover:border-emerald-500/70 group-hover:bg-emerald-500/10 hover:!border-emerald-500 hover:!bg-emerald-500/20 hover:!text-emerald-400',
                    )}
                  >
                    {checkActive ? (
                      <Check size={11} strokeWidth={3} />
                    ) : (
                      <Check size={11} className="scale-0 transition-transform group-hover:scale-100" />
                    )}
                  </button>
                  <p
                    className={cn(
                      'relative z-10 min-w-0 flex-1 truncate text-sm transition-colors duration-300',
                      exiting ? 'text-emerald-300/90' : 'text-zinc-200',
                    )}
                  >
                    {item.title}
                  </p>
                </div>
              </div>
            </li>
          )
        })}

        {composing && (
          <li className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div
              aria-hidden
              className="h-5 w-5 shrink-0 rounded-full border-2 border-zinc-600"
            />
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Reminder…"
              className="min-w-0 flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitCompose()
                }
                if (e.key === 'Escape') cancelCompose()
              }}
              onBlur={commitCompose}
            />
          </li>
        )}
      </ul>
    </Card>
  )
}
