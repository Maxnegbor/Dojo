import { useEffect, useRef, useState } from 'react'
import { Plus, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
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
        {visible.map((item) => (
          <li
            key={item.id}
            className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-zinc-800/50"
          >
            <button
              onClick={() => onRemove(item.id)}
              aria-label={`Complete ${item.title}`}
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200',
                'border-zinc-600 text-transparent',
                'group-hover:border-emerald-500/70 group-hover:bg-emerald-500/10',
                'hover:!border-emerald-500 hover:!bg-emerald-500/20 hover:!text-emerald-400',
              )}
            >
              <Check size={11} className="scale-0 transition-transform group-hover:scale-100" />
            </button>
            <p className="min-w-0 flex-1 truncate text-sm text-zinc-200">{item.title}</p>
          </li>
        ))}

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

      {visible.length === 0 && !composing && (
        <p className="py-3 text-center text-xs text-zinc-500">No reminders yet</p>
      )}
    </Card>
  )
}
