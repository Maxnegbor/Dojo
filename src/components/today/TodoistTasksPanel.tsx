import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Check, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  buildTodoistFilter,
  completeTodoistTask,
  createTodoistTask,
  fetchTodoistTasks,
  TodoistApiError,
  type TodoistTask,
} from '@/lib/todoistApi'
import {
  getTodoistToken,
  isTodoistConnected,
  TODOIST_CHANGED,
} from '@/lib/todoistStore'
import { cn, formatDate } from '@/lib/utils'

export interface TodoistTasksPanelProps {
  viewDate: string
  className?: string
  /** Hide the default “Todoist” title (toolbar can still render). */
  hideHeader?: boolean
  /** Hide refresh / open toolbar (when parent owns those controls). */
  hideToolbar?: boolean
  /** Compact empty / disconnect copy for modal flows. */
  compact?: boolean
  /** Optional extra controls rendered in the toolbar (e.g. collapse). */
  toolbarExtra?: ReactNode
  /** Replaces the default title; rendered on the same row as refresh / open. */
  headerLeading?: ReactNode
  /** Header only — hide the task list. */
  collapsed?: boolean
}

export function TodoistTasksPanel({
  viewDate,
  className,
  hideHeader = false,
  hideToolbar = false,
  compact = false,
  toolbarExtra,
  headerLeading,
  collapsed = false,
}: TodoistTasksPanelProps) {
  const [connected, setConnected] = useState(() => isTodoistConnected())
  const [tasks, setTasks] = useState<TodoistTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [completingIds, setCompletingIds] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    if (!getTodoistToken()) {
      setConnected(false)
      setTasks([])
      return
    }
    setConnected(true)
    setLoading(true)
    setError(null)
    try {
      const today = formatDate(new Date())
      const filter = buildTodoistFilter(viewDate, today)
      const next = await fetchTodoistTasks(filter)
      setTasks(next)
    } catch (err) {
      const message =
        err instanceof TodoistApiError && err.status === 401
          ? 'Todoist token is invalid. Update it in Settings → Integrations.'
          : err instanceof Error
            ? err.message
            : 'Could not load Todoist tasks'
      setError(message)
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [viewDate])

  useEffect(() => {
    const sync = () => {
      setConnected(isTodoistConnected())
      void load()
    }
    window.addEventListener(TODOIST_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(TODOIST_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [load])

  useEffect(() => {
    void load()
  }, [load])

  const handleComplete = async (task: TodoistTask) => {
    if (completingIds.has(task.id)) return
    setCompletingIds((prev) => new Set(prev).add(task.id))
    setTasks((prev) => prev.filter((t) => t.id !== task.id))
    try {
      await completeTodoistTask(task.id)
    } catch (err) {
      setTasks((prev) => [...prev, task].sort((a, b) => b.priority - a.priority))
      setError(err instanceof Error ? err.message : 'Could not complete task')
    } finally {
      setCompletingIds((prev) => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }
  }

  const commitCompose = async () => {
    const content = draft.trim()
    if (!content) {
      setComposing(false)
      setDraft('')
      return
    }
    setDraft('')
    setComposing(false)
    try {
      const created = await createTodoistTask({ content, dueDate: viewDate })
      setTasks((prev) => [...prev, created])
      void load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add task')
    }
  }

  const toolbar = !hideToolbar && connected && (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        aria-label="Refresh Todoist"
        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
      </button>
      <a
        href="https://todoist.com/app"
        target="_blank"
        rel="noreferrer"
        aria-label="Open Todoist"
        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
      >
        <ExternalLink size={14} />
      </a>
      {toolbarExtra}
    </div>
  )

  const showTitleHeader = !hideHeader || headerLeading != null
  const header = showTitleHeader ? (
    <div
      className={cn(
        'flex items-center justify-between gap-2',
        !collapsed && 'mb-2',
      )}
    >
      <div className="min-w-0 flex-1">
        {headerLeading ?? <p className="text-sm font-semibold text-zinc-200">Todoist</p>}
      </div>
      {toolbar}
    </div>
  ) : toolbar ? (
    <div className={cn('flex items-center justify-end gap-0.5', !collapsed && 'mb-2')}>
      {toolbar}
    </div>
  ) : null

  if (collapsed) {
    return <div className={cn(className)}>{header}</div>
  }

  if (!connected) {
    return (
      <div className={cn(className)}>
        {header}
        <p className={cn('leading-relaxed text-zinc-500', compact ? 'text-xs' : 'text-xs')}>
          Connect Todoist in{' '}
          <Link
            to="/settings"
            state={{ settingsSection: 'integrations' }}
            className="text-[var(--accent-300)] hover:underline"
          >
            Settings → Integrations
          </Link>{' '}
          to tick off and add tasks here.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {header}

      {error && <p className="mb-2 shrink-0 text-xs text-red-400">{error}</p>}

      <div className={cn('min-h-0 flex-1 overflow-y-auto scrollbar-hidden', !compact && 'overscroll-contain')}>
      <ul className="flex flex-col gap-1">
        {tasks.map((task) => {
          const overdue =
            task.due?.date &&
            task.due.date < formatDate(new Date()) &&
            viewDate === formatDate(new Date())
          return (
            <li
              key={task.id}
              className="group flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-zinc-800/50"
            >
              <button
                type="button"
                onClick={() => void handleComplete(task)}
                disabled={completingIds.has(task.id)}
                aria-label={`Complete ${task.content}`}
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-zinc-600 text-transparent transition-all group-hover:border-[var(--accent-500)]/70 group-hover:bg-[var(--accent-500)]/10 hover:!border-[var(--accent-500)] hover:!bg-[var(--accent-500)]/20 hover:!text-[var(--accent-400)]"
              >
                <Check size={11} className="scale-0 transition-transform group-hover:scale-100" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-zinc-200">{task.content}</p>
                {task.due?.string && (
                  <p
                    className={cn(
                      'mt-0.5 text-[10px]',
                      overdue ? 'text-red-400' : 'text-zinc-500',
                    )}
                  >
                    {task.due.string}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {!loading && tasks.length === 0 && !error && (
        <p className="px-2 py-3 text-center text-xs text-zinc-600">No Todoist tasks for this day</p>
      )}

      {composing ? (
        <div className="mt-2 px-1">
          <textarea
            autoFocus
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void commitCompose()
              } else if (e.key === 'Escape') {
                setComposing(false)
                setDraft('')
              }
            }}
            onBlur={() => void commitCompose()}
            placeholder="New Todoist task"
            className="w-full resize-none rounded-lg border border-zinc-700/80 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-500)]"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="mt-2 w-full rounded-lg px-2 py-2 text-left text-xs text-zinc-500 transition-colors hover:bg-zinc-800/40 hover:text-zinc-300"
        >
          + Add task
        </button>
      )}
      </div>
    </div>
  )
}
