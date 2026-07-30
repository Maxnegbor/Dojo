import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Flame, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AddGhostCard } from '@/components/goals/AddGhostCard'
import { formatHabitCardSubtitle } from '@/lib/habitRamp'
import { reorderHabitTypesToIndex, type HabitTypeDefinition } from '@/lib/habitTypes'
import { cn } from '@/lib/utils'

interface HabitMetricsReorderListProps {
  habits: HabitTypeDefinition[]
  onReorder: (next: HabitTypeDefinition[]) => void
  onView: (habit: HabitTypeDefinition) => void
  onEdit: (habit: HabitTypeDefinition) => void
  onDelete: (habit: HabitTypeDefinition) => void
  deleteConfirmId?: string | null
  onConfirmDelete?: (habit: HabitTypeDefinition) => void
  onCancelDelete?: () => void
  onAdd?: () => void
  addForm?: ReactNode
  editingHabitId?: string | null
  renderInlineEditor?: () => ReactNode
}

type DragMeta = {
  offsetX: number
  offsetY: number
  width: number
}

function DropIndicator({ className }: { className?: string }) {
  return (
    <div className={cn('relative h-0 py-0.5', className)} aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-[var(--accent-500)] shadow-[0_0_10px_var(--accent-500)]" />
    </div>
  )
}

export function HabitMetricsReorderList({
  habits,
  onReorder,
  onView,
  onEdit,
  onDelete,
  deleteConfirmId = null,
  onConfirmDelete,
  onCancelDelete,
  onAdd,
  addForm,
  editingHabitId = null,
  renderInlineEditor,
}: HabitMetricsReorderListProps) {
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const dragMetaRef = useRef<DragMeta | null>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const habitsRef = useRef(habits)
  habitsRef.current = habits

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [, tick] = useState(0)

  const computeDropIndex = useCallback((clientY: number, list = habitsRef.current) => {
    for (let i = 0; i < list.length; i++) {
      const el = rowRefs.current.get(list[i].id)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    return list.length
  }, [])

  useEffect(() => {
    if (!draggingId) return

    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
      setDropIndex(computeDropIndex(event.clientY))
      tick((n) => n + 1)
    }

    const onPointerUp = () => {
      const currentHabits = habitsRef.current
      const fromIndex = currentHabits.findIndex((h) => h.id === draggingId)
      const targetIndex = computeDropIndex(pointerRef.current.y, currentHabits)

      if (fromIndex >= 0) {
        const next = reorderHabitTypesToIndex(currentHabits, draggingId, targetIndex)
        if (next.findIndex((h) => h.id === draggingId) !== fromIndex) {
          onReorder(next)
        }
      }

      dragMetaRef.current = null
      setDraggingId(null)
      setDropIndex(null)
    }

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)

    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [draggingId, computeDropIndex, onReorder])

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, habit: HabitTypeDefinition) => {
    event.preventDefault()
    event.stopPropagation()

    const row = rowRefs.current.get(habit.id)
    const card = row?.querySelector<HTMLElement>('[data-habit-card]')
    if (!card) return

    const rect = card.getBoundingClientRect()
    dragMetaRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
    }
    pointerRef.current = { x: event.clientX, y: event.clientY }
    setDraggingId(habit.id)
    setDropIndex(habits.findIndex((h) => h.id === habit.id))
  }

  const draggingHabit = draggingId ? habits.find((h) => h.id === draggingId) : null
  const dragMeta = dragMetaRef.current
  const pointer = pointerRef.current

  return (
    <>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        {habits.map((habit, index) => (
          <Fragment key={habit.id}>
            {draggingId && dropIndex === index && <DropIndicator className="col-span-2" />}
            <div
              ref={(el) => {
                if (el) rowRefs.current.set(habit.id, el)
                else rowRefs.current.delete(habit.id)
              }}
            >
              <div data-habit-card>
                {editingHabitId === habit.id && renderInlineEditor ? (
                  <Card className="p-3 ring-1 ring-[var(--accent-500)]/25">{renderInlineEditor()}</Card>
                ) : deleteConfirmId === habit.id ? (
                  <Card className="border-red-900/40 bg-red-950/20">
                    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                      <p className="text-xs leading-relaxed text-red-300">
                        Delete <span className="font-medium text-zinc-100">{habit.label}</span>?
                        All logged data for this metric will be permanently lost.
                      </p>
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={onCancelDelete}>
                          Cancel
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => onConfirmDelete?.(habit)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </Card>
                ) : (
                  <Card
                    onClick={() => {
                      if (!draggingId) onView(habit)
                    }}
                    className={cn(draggingId === habit.id && 'invisible')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <button
                          type="button"
                          onPointerDown={(e) => startDrag(e, habit)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 shrink-0 cursor-grab touch-none text-zinc-600 hover:text-zinc-400 active:cursor-grabbing"
                          aria-label={`Drag to reorder ${habit.label}`}
                        >
                          <GripVertical size={14} />
                        </button>
                        <Flame size={14} className="mt-0.5 shrink-0 text-[var(--accent-400)]" />
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium text-zinc-200">{habit.label}</h3>
                          <p className="text-[10px] text-zinc-500">{formatHabitCardSubtitle(habit)}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEdit(habit)
                          }}
                          className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                          aria-label={`Edit ${habit.label} settings`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(habit)
                          }}
                          disabled={habits.length <= 1}
                          className="rounded-lg p-1.5 text-zinc-600 hover:text-red-400 disabled:opacity-30"
                          aria-label={`Delete ${habit.label}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </Fragment>
        ))}
        {draggingId && dropIndex === habits.length && <DropIndicator className="col-span-2" />}
        {addForm ?? (onAdd && <AddGhostCard onClick={onAdd} label="Add habit" />)}
      </div>

      {draggingId &&
        draggingHabit &&
        dragMeta &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] rounded-xl border border-zinc-700/80 bg-zinc-900/95 p-4 shadow-2xl ring-1 ring-[var(--accent-500)]/50 backdrop-blur-sm"
            style={{
              left: pointer.x - dragMeta.offsetX,
              top: pointer.y - dragMeta.offsetY,
              width: dragMeta.width,
            }}
          >
            <div className="flex items-start gap-2">
              <GripVertical size={14} className="mt-0.5 shrink-0 text-zinc-500" />
              <Flame size={14} className="mt-0.5 shrink-0 text-[var(--accent-400)]" />
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-zinc-200">{draggingHabit.label}</h3>
                <p className="text-[10px] text-zinc-500">{formatHabitCardSubtitle(draggingHabit)}</p>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
