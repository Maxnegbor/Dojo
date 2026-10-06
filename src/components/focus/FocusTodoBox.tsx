import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { cn, generateId } from '@/lib/utils'

interface FocusTodo {
  id: string
  text: string
  done: boolean
}

const STORAGE_KEY = 'personal-os-focus-todos'

function readTodos(): FocusTodo[] {
  try {
    const saved: unknown = JSON.parse(storageGetItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((item): item is FocusTodo =>
      item != null && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.done === 'boolean',
    )
  } catch {
    return []
  }
}

export function FocusTodoBox() {
  const [todos, setTodos] = useState(readTodos)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    const sync = () => setTodos(readTodos())
    window.addEventListener('user-storage-ready', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('user-storage-ready', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const update = (change: (items: FocusTodo[]) => FocusTodo[]) => {
    const next = change(readTodos())
    storageSetItem(STORAGE_KEY, JSON.stringify(next))
    setTodos(next)
  }

  return (
    <section aria-label="Focus to-do list" className="rounded-2xl border border-zinc-800/70 bg-zinc-950/40 p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-200">To-Do</h2>
      {todos.length > 0 && (
        <ul className="mb-3 max-h-60 space-y-2 overflow-y-auto">
          {todos.map(todo => (
            <li key={todo.id} className="flex items-start gap-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 py-1">
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => update(items => items.map(item => item.id === todo.id ? { ...item, done: !item.done } : item))}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-500)]"
                />
                <span className={cn('min-w-0 break-words text-sm leading-5', todo.done ? 'text-zinc-600 line-through' : 'text-zinc-300')}>{todo.text}</span>
              </label>
              <button
                type="button"
                aria-label={`Delete task: ${todo.text}`}
                onClick={() => update(items => items.filter(item => item.id !== todo.id))}
                className="shrink-0 rounded-md p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-400)]"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="flex items-center gap-2" onSubmit={event => {
        event.preventDefault()
        const text = draft.trim()
        if (!text) return
        update(items => [...items, { id: generateId(), text, done: false }])
        setDraft('')
      }}>
        <input
          aria-label="New focus to-do"
          placeholder="Jot down a to-do…"
          value={draft}
          maxLength={500}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault() }}
          className="min-w-0 flex-1 border-b border-zinc-800 bg-transparent py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-400)]"
        />
        <button type="submit" aria-label="Add to-do" disabled={!draft.trim()} className="rounded-lg p-2 text-[var(--accent-400)] hover:bg-zinc-800 disabled:opacity-30">
          <Plus size={16} />
        </button>
      </form>
    </section>
  )
}
