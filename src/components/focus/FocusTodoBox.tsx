import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { cn, generateId } from '@/lib/utils'

interface FocusTodo {
  id: string
  text: string
  done: boolean
}

const STORAGE_KEY = 'personal-os-focus-todos'
const COPY_KEY = 'personal-os-focus-copy-pasta'

interface CopyPasta {
  id: string
  name: string
  content: string
}

function readCopyPastas(): CopyPasta[] {
  try {
    const saved: unknown = JSON.parse(storageGetItem(COPY_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter(
      (item): item is CopyPasta =>
        item != null &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.content === 'string',
    )
  } catch {
    return []
  }
}

function storedCopyPastas(items: CopyPasta[]): CopyPasta[] {
  return items.filter((item) => item.name.trim() || item.content.trim())
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.left = '-9999px'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

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

function CopyPastaEditor({
  items,
  onChange,
  onClose,
}: {
  items: CopyPasta[]
  onChange: (items: CopyPasta[]) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <ModalOverlay align="center" onBackdropClick={onClose}>
      <div
        role="dialog"
        aria-labelledby="copy-pasta-title"
        className="flex max-h-[min(88vh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 px-5 py-4">
          <h2 id="copy-pasta-title" className="text-lg font-semibold text-zinc-100">
            Copy pasta
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  aria-label="Copy pasta name"
                  placeholder="Name"
                  value={item.name}
                  maxLength={80}
                  onChange={(event) =>
                    onChange(
                      items.map((entry) =>
                        entry.id === item.id ? { ...entry, name: event.target.value } : entry,
                      ),
                    )
                  }
                  className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-400)]"
                />
                <button
                  type="button"
                  aria-label={`Delete ${item.name.trim() || 'copy pasta'}`}
                  onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-red-950/40 hover:text-red-400"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <textarea
                aria-label={`Content for ${item.name.trim() || 'copy pasta'}`}
                placeholder="Paste the text you want copied"
                value={item.content}
                onChange={(event) =>
                  onChange(
                    items.map((entry) =>
                      entry.id === item.id ? { ...entry, content: event.target.value } : entry,
                    ),
                  )
                }
                className="min-h-48 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm leading-6 text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-400)]"
              />
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onChange([...items, { id: generateId(), name: '', content: '' }])}
          >
            <Plus size={14} />
            Add copy pasta
          </Button>
        </div>
        <div className="flex justify-end border-t border-zinc-800/80 px-5 py-4">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

export function FocusTodoBox() {
  const [todos, setTodos] = useState(readTodos)
  const [draft, setDraft] = useState('')
  const [pastas, setPastas] = useState(readCopyPastas)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorItems, setEditorItems] = useState<CopyPasta[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => {
      setTodos(readTodos())
      setPastas(readCopyPastas())
    }
    window.addEventListener('user-storage-ready', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('user-storage-ready', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const savePastas = (items: CopyPasta[]) => {
    const stored = storedCopyPastas(items)
    storageSetItem(COPY_KEY, JSON.stringify(stored))
    setPastas(stored)
    setEditorItems(items)
  }

  const openEditor = () => {
    const current = readCopyPastas()
    setEditorItems(current.length > 0 ? current : [{ id: generateId(), name: '', content: '' }])
    setEditorOpen(true)
  }

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
      <div className="mt-4 border-t border-zinc-800/80 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Copy pasta</h3>
          <button
            type="button"
            onClick={openEditor}
            aria-label="Edit copy pasta"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <Pencil size={14} />
          </button>
        </div>
        {pastas.length > 0 && (
          <ul className="space-y-1">
            {pastas.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    void copyToClipboard(item.content).then((ok) => {
                      if (!ok) return
                      setCopiedId(item.id)
                      window.setTimeout(() => {
                        setCopiedId((current) => (current === item.id ? null : current))
                      }, 1200)
                    })
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-800"
                  aria-label={`Copy ${item.name.trim() || 'copy pasta'}`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                    {item.name.trim() || 'Untitled'}
                  </span>
                  {copiedId === item.id && (
                    <span className="shrink-0 text-[10px] font-medium text-[var(--accent-300)]">Copied</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editorOpen && (
        <CopyPastaEditor
          items={editorItems}
          onChange={savePastas}
          onClose={() => {
            setPastas(storedCopyPastas(editorItems))
            setEditorOpen(false)
          }}
        />
      )}
    </section>
  )
}
