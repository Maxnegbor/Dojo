import { useEffect, useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { TimeInput } from '@/components/ui/TimeInput'
import { Button } from '@/components/ui/Button'
import {
  FOCUS_LABELS_CHANGED,
  getFocusLabels,
  resolveFocusLabelMeta,
  type FocusLabel,
} from '@/lib/focusLabels'
import {
  FOCUS_SESSIONS_CHANGED,
  getFocusSessions,
  type FocusSession,
  type FocusSessionDraft,
} from '@/lib/focusSessions'
import { cn, formatDate, formatDuration, parseLocalDate } from '@/lib/utils'

const PREVIEW_COUNT = 12

interface FocusSessionHistoryProps {
  formatTime: (date: Date) => string
  onUpdate: (id: string, draft: FocusSessionDraft) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCreate: (draft: FocusSessionDraft) => Promise<void>
  className?: string
}

interface SessionDraftForm {
  date: string
  time: string
  minutes: string
  labelId: string | null
}

function timeValue(ms: number): string {
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function combineDateAndTime(date: string, time: string): number {
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0).getTime()
}

function dayLabel(date: string): string {
  const today = formatDate(new Date())
  if (date === today) return 'Today'
  const yesterday = formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
  if (date === yesterday) return 'Yesterday'
  return parseLocalDate(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function draftFromSession(session: FocusSession): SessionDraftForm {
  return {
    date: session.date,
    time: timeValue(session.startMs),
    minutes: String(session.minutes),
    labelId: session.label_id,
  }
}

function blankDraft(): SessionDraftForm {
  const now = new Date()
  return {
    date: formatDate(now),
    time: timeValue(now.getTime()),
    minutes: '',
    labelId: null,
  }
}

function draftToRecord(draft: SessionDraftForm): FocusSessionDraft | string {
  const minutes = Math.round(Number(draft.minutes))
  if (!Number.isFinite(minutes) || minutes < 1) return 'Enter at least 1 minute'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !/^\d{2}:\d{2}$/.test(draft.time)) {
    return 'Enter a valid date and time'
  }
  const startMs = combineDateAndTime(draft.date, draft.time)
  return {
    minutes,
    startMs,
    endMs: startMs + minutes * 60_000,
    date: draft.date,
    labelId: draft.labelId,
  }
}

function SessionFields({
  draft,
  labels,
  onChange,
}: {
  draft: SessionDraftForm
  labels: FocusLabel[]
  onChange: (next: SessionDraftForm) => void
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Date</span>
          <input
            type="date"
            required
            value={draft.date}
            onChange={(event) => onChange({ ...draft, date: event.target.value })}
            className="w-full rounded-md border border-zinc-700/80 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 [color-scheme:dark]"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Start</span>
          <TimeInput
            value={draft.time}
            onChange={(time) => onChange({ ...draft, time })}
            aria-label="Start time"
            className="w-full min-w-0"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Duration
          </span>
          <input
            type="number"
            required
            min={1}
            step={1}
            placeholder="Minutes"
            value={draft.minutes}
            onChange={(event) => onChange({ ...draft, minutes: event.target.value })}
            className="w-full rounded-md border border-zinc-700/80 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Label</span>
          <select
            value={draft.labelId ?? ''}
            onChange={(event) => onChange({ ...draft, labelId: event.target.value || null })}
            className="w-full rounded-md border border-zinc-700/80 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          >
            <option value="">None</option>
            {labels.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
            {draft.labelId && !labels.some((item) => item.id === draft.labelId) && (
              <option value={draft.labelId}>{resolveFocusLabelMeta(draft.labelId).label}</option>
            )}
          </select>
        </label>
      </div>
    </div>
  )
}

export function FocusSessionHistory({
  formatTime,
  onUpdate,
  onDelete,
  onCreate,
  className,
}: FocusSessionHistoryProps) {
  const [sessions, setSessions] = useState<FocusSession[]>(() => getFocusSessions())
  const [labels, setLabels] = useState<FocusLabel[]>(() => getFocusLabels())
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<SessionDraftForm | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const syncSessions = () => setSessions(getFocusSessions())
    const syncLabels = () => setLabels(getFocusLabels())
    window.addEventListener(FOCUS_SESSIONS_CHANGED, syncSessions)
    window.addEventListener(FOCUS_LABELS_CHANGED, syncLabels)
    window.addEventListener('user-storage-ready', syncSessions)
    window.addEventListener('user-storage-ready', syncLabels)
    return () => {
      window.removeEventListener(FOCUS_SESSIONS_CHANGED, syncSessions)
      window.removeEventListener(FOCUS_LABELS_CHANGED, syncLabels)
      window.removeEventListener('user-storage-ready', syncSessions)
      window.removeEventListener('user-storage-ready', syncLabels)
    }
  }, [])

  const ordered = [...sessions].sort((a, b) => b.startMs - a.startMs)
  const visible = expanded ? ordered : ordered.slice(0, PREVIEW_COUNT)

  const startAdd = () => {
    setConfirmDeleteId(null)
    setEditingId(null)
    setError(null)
    setOpen(true)
    setAdding(true)
    setDraft(blankDraft())
  }

  const startEdit = (session: FocusSession) => {
    setConfirmDeleteId(null)
    setAdding(false)
    setError(null)
    setEditingId(session.id)
    setDraft(draftFromSession(session))
  }

  const closeForm = () => {
    setEditingId(null)
    setAdding(false)
    setDraft(null)
    setError(null)
  }

  const saveEdit = async (session: FocusSession) => {
    if (!draft) return
    const record = draftToRecord(draft)
    if (typeof record === 'string') {
      setError(record)
      return
    }
    const timeSame = draft.date === session.date && draft.time === timeValue(session.startMs)
    const minutesSame = record.minutes === session.minutes
    const next = timeSame && minutesSame ? { ...record, startMs: session.startMs, endMs: session.endMs } : record

    setBusyId(session.id)
    setError(null)
    try {
      await onUpdate(session.id, next)
      closeForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this session')
    } finally {
      setBusyId(null)
    }
  }

  const saveNew = async () => {
    if (!draft) return
    const record = draftToRecord(draft)
    if (typeof record === 'string') {
      setError(record)
      return
    }
    setBusyId('new')
    setError(null)
    try {
      await onCreate(record)
      closeForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that session')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      await onDelete(id)
      setConfirmDeleteId(null)
      if (editingId === id) closeForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this session')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className={cn('w-full', className)}>
      <div className="mb-3 flex items-center gap-1">
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-zinc-200"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown
            size={16}
            className={cn('shrink-0 text-zinc-500 transition-transform', !open && '-rotate-90')}
          />
          Log
        </button>
        <button
          type="button"
          className="ml-auto rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="Add focus"
          onClick={startAdd}
        >
          <Plus size={16} />
        </button>
      </div>
      {open && adding && draft && (
        <form
          className="mb-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5"
          onSubmit={(event) => {
            event.preventDefault()
            void saveNew()
          }}
        >
          <SessionFields draft={draft} labels={labels} onChange={setDraft} />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busyId === 'new'}>
              Add
            </Button>
          </div>
        </form>
      )}
      {open && ordered.length === 0 && !adding ? (
        <p className="text-sm text-zinc-500">No focus sessions yet.</p>
      ) : open ? (
        <ul className="space-y-2">
          {visible.map((session) => {
            const label = session.label_id ? resolveFocusLabelMeta(session.label_id) : null
            const editing = editingId === session.id && draft
            const confirming = confirmDeleteId === session.id
            return (
              <li
                key={session.id}
                className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5"
              >
                {editing ? (
                  <form
                    className="space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void saveEdit(session)
                    }}
                  >
                    <SessionFields draft={draft} labels={labels} onChange={(next) => setDraft(next)} />
                    <div className="flex justify-end gap-2 pt-1">
                      <Button type="button" variant="ghost" size="sm" onClick={closeForm}>
                        Cancel
                      </Button>
                      <Button type="submit" size="sm" disabled={busyId === session.id}>
                        Save
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-100">
                        {dayLabel(session.date)}
                        <span className="text-zinc-500"> · </span>
                        <span className="tabular-nums">{formatTime(new Date(session.startMs))}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        <span className="tabular-nums">{formatDuration(session.minutes)}</span>
                        {label && (
                          <span style={{ color: label.color }}> · {label.label}</span>
                        )}
                      </p>
                      {confirming && (
                        <p className="mt-2 text-xs text-zinc-400">Delete this session?</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {confirming ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={busyId === session.id}
                            onClick={() => void remove(session.id)}
                          >
                            Delete
                          </Button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                            aria-label="Edit session"
                            onClick={() => startEdit(session)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
                            aria-label="Delete session"
                            onClick={() => {
                              setEditingId(null)
                              setDraft(null)
                              setError(null)
                              setConfirmDeleteId(session.id)
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
      {open && error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {open && ordered.length > PREVIEW_COUNT && (
        <button
          type="button"
          className="mt-3 text-xs font-medium text-zinc-400 hover:text-zinc-200"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : `Show all ${ordered.length}`}
        </button>
      )}
    </section>
  )
}
