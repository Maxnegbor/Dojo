import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Check, ExternalLink, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { HabitStreakBadge } from '@/components/today/HabitStreakBadge'
import {
  completeHabitifyHabit,
  fetchHabitifyJournal,
  HabitifyApiError,
  undoHabitifyHabit,
  type HabitifyJournalEntry,
} from '@/lib/habitifyApi'
import {
  getHabitifyApiKey,
  HABITIFY_CHANGED,
  isHabitifyConnected,
} from '@/lib/habitifyStore'
import { cn } from '@/lib/utils'

export interface HabitifyHabitsPanelProps {
  viewDate: string
  className?: string
  hideHeader?: boolean
  hideToolbar?: boolean
  compact?: boolean
  toolbarExtra?: ReactNode
  headerLeading?: ReactNode
  collapsed?: boolean
}

export function HabitifyHabitsPanel({
  viewDate,
  className,
  hideHeader = false,
  hideToolbar = false,
  compact = false,
  toolbarExtra,
  headerLeading,
  collapsed = false,
}: HabitifyHabitsPanelProps) {
  const [connected, setConnected] = useState(() => isHabitifyConnected())
  const [entries, setEntries] = useState<HabitifyJournalEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    if (!getHabitifyApiKey()) {
      setConnected(false)
      setEntries([])
      return
    }
    setConnected(true)
    setLoading(true)
    setError(null)
    try {
      const next = await fetchHabitifyJournal(viewDate)
      setEntries(next)
    } catch (err) {
      const message =
        err instanceof HabitifyApiError && (err.status === 401 || err.status === 403)
          ? 'Habitify key is invalid. Update it in Settings → Integrations.'
          : err instanceof Error
            ? err.message
            : 'Could not load Habitify habits'
      setError(message)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [viewDate])

  useEffect(() => {
    const sync = () => {
      setConnected(isHabitifyConnected())
      void load()
    }
    window.addEventListener(HABITIFY_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(HABITIFY_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [load])

  useEffect(() => {
    void load()
  }, [load])

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleComplete = async (entry: HabitifyJournalEntry) => {
    if (busyIds.has(entry.id) || entry.status === 'completed') return
    setBusy(entry.id, true)
    setEntries((prev) =>
      prev.map((item) =>
        item.id === entry.id
          ? {
              ...item,
              status: 'completed' as const,
              streakLength: (item.streakLength ?? 0) + 1,
            }
          : item,
      ),
    )
    try {
      await completeHabitifyHabit(entry.id, viewDate)
    } catch (err) {
      setEntries((prev) =>
        prev.map((item) => (item.id === entry.id ? entry : item)),
      )
      setError(err instanceof Error ? err.message : 'Could not complete habit')
    } finally {
      setBusy(entry.id, false)
    }
  }

  const handleUndo = async (entry: HabitifyJournalEntry) => {
    if (busyIds.has(entry.id) || entry.status === 'inprogress') return
    setBusy(entry.id, true)
    setEntries((prev) =>
      prev.map((item) =>
        item.id === entry.id
          ? {
              ...item,
              status: 'inprogress' as const,
              streakLength:
                item.streakLength != null && item.streakLength > 0
                  ? item.streakLength - 1
                  : item.streakLength,
            }
          : item,
      ),
    )
    try {
      await undoHabitifyHabit(entry.id, viewDate)
      void load()
    } catch (err) {
      setEntries((prev) =>
        prev.map((item) => (item.id === entry.id ? entry : item)),
      )
      setError(err instanceof Error ? err.message : 'Could not undo habit')
    } finally {
      setBusy(entry.id, false)
    }
  }

  const toolbar = !hideToolbar && connected && (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        aria-label="Refresh Habitify"
        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
      </button>
      <a
        href="https://habitify.me"
        target="_blank"
        rel="noreferrer"
        aria-label="Open Habitify"
        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
      >
        <ExternalLink size={14} />
      </a>
      {toolbarExtra}
    </div>
  )

  const showTitleHeader = !hideHeader || headerLeading != null
  const header = showTitleHeader ? (
    <div className={cn('flex items-center justify-between gap-2', !collapsed && 'mb-2')}>
      <div className="min-w-0 flex-1">
        {headerLeading ?? <p className="text-sm font-semibold text-zinc-200">Habitify</p>}
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
          Connect Habitify in{' '}
          <Link
            to="/settings"
            state={{ settingsSection: 'integrations' }}
            className="text-[var(--accent-300)] hover:underline"
          >
            Settings → Integrations
          </Link>{' '}
          to track habits here.
        </p>
      </div>
    )
  }

  const doneCount = entries.filter((e) => e.status === 'completed').length

  return (
    <div className={cn('flex h-fit flex-col', className)}>
      {header}
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      {loading && entries.length === 0 ? (
        <div className="flex items-center gap-2 py-3 text-xs text-zinc-500">
          <Loader2 size={14} className="animate-spin" />
          Loading habits…
        </div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-zinc-500">No Habitify habits scheduled for this day.</p>
      ) : (
        <>
          <p className="mb-2 text-[10px] tabular-nums text-zinc-500">
            {doneCount}/{entries.length} done
          </p>
          <ul className="space-y-2 pr-0.5">
            {entries.map((entry) => {
              const done = entry.status === 'completed'
              const busy = busyIds.has(entry.id)
              const streak = entry.streakLength ?? 0
              const progressLabel =
                entry.progressTarget != null && entry.progressTarget > 1
                  ? `${entry.progressCurrent ?? 0}/${entry.progressTarget}${
                      entry.progressUnit ? ` ${entry.progressUnit}` : ''
                    }`
                  : null
              return (
                <li
                  key={entry.id}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-2 py-1.5',
                    done
                      ? 'border-zinc-800/60 bg-zinc-950/40'
                      : 'border-zinc-800/80 bg-zinc-900/50',
                  )}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void (done ? handleUndo(entry) : handleComplete(entry))
                    }
                    aria-label={done ? `Undo ${entry.name}` : `Complete ${entry.name}`}
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                      done
                        ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                        : 'border-zinc-600 text-transparent hover:border-[var(--accent-500)] hover:bg-[var(--accent-500)]/15 hover:text-[var(--accent-400)]',
                      busy && 'opacity-50',
                    )}
                  >
                    {busy ? (
                      <Loader2 size={11} className="animate-spin text-zinc-400" />
                    ) : (
                      <Check size={11} strokeWidth={2.5} />
                    )}
                  </button>
                  <p
                    className={cn(
                      'min-w-0 flex-1 truncate text-xs font-medium',
                      done ? 'text-zinc-500 line-through' : 'text-zinc-100',
                    )}
                  >
                    {entry.name}
                  </p>
                  {progressLabel && (
                    <span className="shrink-0 text-[10px] tabular-nums text-[var(--accent-400)]">
                      {progressLabel}
                    </span>
                  )}
                  <HabitStreakBadge streak={streak} variant="circle" />
                  {done && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleUndo(entry)}
                      aria-label={`Undo ${entry.name}`}
                      className="rounded-md p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40"
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
