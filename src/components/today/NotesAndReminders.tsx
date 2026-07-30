import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
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
  onUpdate: (item: Reminder) => void
  onRemove: (id: string) => void
  /** Only show reminders due on viewDate (default: due on or before). */
  exactDueDate?: boolean
  className?: string
}

export function NotesAndReminders({
  items,
  viewDate,
  userId,
  onAdd,
  onUpdate,
  onRemove,
  exactDueDate = false,
  className,
}: NotesAndRemindersProps) {
  const [composing, setComposing] = useState(false)
  const [title, setTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const editInputRef = useRef<HTMLTextAreaElement>(null)

  const visible = items.filter(
    (r) =>
      !r.completed &&
      r.kind !== 'note' &&
      (exactDueDate ? r.due_date === viewDate : r.due_date <= viewDate),
  )

  const handleDismiss = useCallback((id: string) => onRemove(id), [onRemove])
  const { dismiss, getPhase, onFillAnimationEnd, onExitTransitionEnd } =
    useReminderDismissAnimation({ onDismiss: handleDismiss })

  useEffect(() => {
    if (composing) {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [composing])

  useEffect(() => {
    if (editingId) {
      const el = editInputRef.current
      if (!el) return
      el.focus()
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [editingId])

  useLayoutEffect(() => {
    const pending = [...enteringIds].filter((id) => visible.some((r) => r.id === id))
    if (pending.length === 0) return
    let frame2 = 0
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        setEnteringIds((prev) => {
          const next = new Set(prev)
          for (const id of pending) next.delete(id)
          return next
        })
      })
    })
    return () => {
      cancelAnimationFrame(frame1)
      cancelAnimationFrame(frame2)
    }
  }, [enteringIds, visible])

  const cancelCompose = () => {
    setComposing(false)
    setTitle('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
  }

  const startEdit = (item: Reminder) => {
    if (getPhase(item.id)) return
    cancelCompose()
    setEditingId(item.id)
    setEditTitle(item.title)
  }

  const commitEdit = (item: Reminder) => {
    const trimmed = editTitle.trim()
    if (!trimmed) {
      onRemove(item.id)
      cancelEdit()
      return
    }
    if (trimmed !== item.title) {
      onUpdate({ ...item, title: trimmed })
    }
    cancelEdit()
  }

  const commitCompose = (options?: { keepComposing?: boolean }) => {
    const trimmed = title.trim()
    if (!trimmed) {
      if (!options?.keepComposing) cancelCompose()
      return
    }
    const id = generateId()
    setEnteringIds((prev) => new Set(prev).add(id))
    onAdd({
      id,
      user_id: userId,
      title: trimmed,
      due_date: viewDate,
      due_time: null,
      completed: false,
      rescheduled_from: null,
      kind: 'task',
      created_at: new Date().toISOString(),
    })
    setTitle('')
    if (options?.keepComposing) {
      setComposing(true)
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        el.style.height = 'auto'
      })
    } else {
      cancelCompose()
    }
  }

  const startCompose = () => {
    cancelEdit()
    setComposing(true)
    setTitle('')
  }

  return (
    <Card title="Reminders" className={className}>
      <ul className="flex flex-col gap-1">
        {visible.map((item) => {
          const phase = getPhase(item.id)
          const completing = phase === 'completing'
          const exiting = phase === 'exiting'
          const checkActive = completing || exiting
          const isEditing = editingId === item.id
          const entering = enteringIds.has(item.id)

          return (
            <li
              key={item.id}
              className={cn(
                'reminder-row',
                entering && 'reminder-row-entering',
                exiting && 'reminder-row-exiting',
              )}
              onTransitionEnd={(event) => {
                if (exiting) onExitTransitionEnd(item.id, event.propertyName)
              }}
            >
              <div className="reminder-row-inner">
                <div
                  className={cn(
                    'reminder-row-content group relative flex items-start gap-2.5 overflow-hidden rounded-lg px-2 py-2 transition-colors',
                    !completing && !exiting && 'hover:bg-zinc-800/50',
                  )}
                >
                  <CompletionWaveFill
                    plain
                    phase={completing ? 'animating' : phase ? 'done' : undefined}
                    onAnimationEnd={
                      completing ? () => onFillAnimationEnd(item.id) : undefined
                    }
                  />
                  <button
                    type="button"
                    onClick={() => dismiss(item.id)}
                    disabled={!!phase || isEditing}
                    aria-label={`Complete ${item.title}`}
                    className={cn(
                      'relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200',
                      checkActive
                        ? 'border-[var(--accent-500)] bg-[var(--accent-500)] text-black'
                        : 'border-zinc-600 text-transparent group-hover:border-[var(--accent-500)]/70 group-hover:bg-[var(--accent-500)]/10 hover:!border-[var(--accent-500)] hover:!bg-[var(--accent-500)]/20 hover:!text-[var(--accent-400)]',
                    )}
                  >
                    {checkActive ? (
                      <Check size={11} strokeWidth={3} />
                    ) : (
                      <Check size={11} className="scale-0 transition-transform group-hover:scale-100" />
                    )}
                  </button>
                  {isEditing ? (
                    <textarea
                      ref={editInputRef}
                      rows={1}
                      value={editTitle}
                      onChange={(e) => {
                        setEditTitle(e.target.value)
                        e.target.style.height = 'auto'
                        e.target.style.height = `${e.target.scrollHeight}px`
                      }}
                      className="relative z-10 min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-sm leading-snug text-zinc-200 outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          commitEdit(item)
                        }
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      onBlur={() => commitEdit(item)}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={!!phase}
                      onClick={() => startEdit(item)}
                      className={cn(
                        'relative z-10 min-w-0 flex-1 whitespace-normal break-words text-left text-sm leading-snug transition-colors duration-300',
                        exiting ? 'text-[var(--accent-200)]' : 'text-zinc-200 hover:text-zinc-100',
                      )}
                    >
                      {item.title}
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}

        {composing && (
          <li className="flex items-start gap-2.5 rounded-lg px-2 py-2">
            <div
              aria-hidden
              className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-zinc-600"
            />
            <textarea
              ref={inputRef}
              rows={1}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${e.target.scrollHeight}px`
              }}
              placeholder="Reminder…"
              className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-sm leading-snug text-zinc-200 placeholder:text-zinc-600 outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  commitCompose({ keepComposing: true })
                }
                if (e.key === 'Escape') cancelCompose()
              }}
              onBlur={() => commitCompose()}
            />
          </li>
        )}

        {!composing && (
          <li>
            <button
              type="button"
              onClick={startCompose}
              aria-label="Add reminder"
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg border border-dashed border-zinc-800 px-2 py-2 text-zinc-600 transition-all duration-200',
                'hover:border-[var(--accent-500)]/50 hover:bg-[var(--accent-500)]/8 hover:text-[var(--accent-300)]',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-500)]',
              )}
            >
              <div
                aria-hidden
                className="h-5 w-5 shrink-0 rounded-full border-2 border-dashed border-zinc-700"
              />
            </button>
          </li>
        )}
      </ul>
    </Card>
  )
}
