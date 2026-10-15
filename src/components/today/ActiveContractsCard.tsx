import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { Handshake, Pencil, Plus, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useSettings } from '@/context/SettingsContext'
import {
  HABIT_CONTRACTS_CHANGED,
  PERSON_COLORS,
  deleteContract,
  getHabitContractsState,
  getSelfPersonId,
  upsertContract,
  upsertPerson,
} from '@/lib/habitContracts'
import { cn, formatDate, generateId, parseLocalDate } from '@/lib/utils'
import type { HabitContract } from '@/types'

type DueTone = 'muted' | 'upcoming' | 'today' | 'overdue'

function readContracts(): HabitContract[] {
  const today = formatDate(new Date())
  return [...getHabitContractsState().contracts].sort((a, b) => compareDue(a, b, today))
}

function compareDue(a: HabitContract, b: HabitContract, today: string) {
  const rank = (contract: HabitContract) => {
    if (!contract.end_date) return 2
    if (contract.end_date < today) return 0
    return 1
  }
  const byRank = rank(a) - rank(b)
  if (byRank !== 0) return byRank
  if (a.end_date && b.end_date && a.end_date !== b.end_date) {
    return a.end_date.localeCompare(b.end_date)
  }
  return a.name.localeCompare(b.name)
}

function useContracts() {
  const [contracts, setContracts] = useState<HabitContract[]>(readContracts)

  useEffect(() => {
    const refresh = () => setContracts(readContracts())
    refresh()
    window.addEventListener(HABIT_CONTRACTS_CHANGED, refresh)
    window.addEventListener('user-storage-ready', refresh)
    return () => {
      window.removeEventListener(HABIT_CONTRACTS_CHANGED, refresh)
      window.removeEventListener('user-storage-ready', refresh)
    }
  }, [])

  return contracts
}

function ensureOwner(): string {
  const state = getHabitContractsState()
  const selfId = getSelfPersonId()
  if (selfId && state.people.some((person) => person.id === selfId)) return selfId
  return upsertPerson({ name: 'Me', color: PERSON_COLORS[0] }).id
}

function dueCopy(contract: HabitContract, today: string): { text: string; tone: DueTone } {
  if (!contract.end_date) return { text: 'No due date', tone: 'muted' }
  const label = format(parseLocalDate(contract.end_date), 'EEE, MMM d')
  if (contract.end_date < today) return { text: `Overdue ${label}`, tone: 'overdue' }
  if (contract.end_date === today) return { text: 'Due today', tone: 'today' }
  return { text: `Due ${label}`, tone: 'upcoming' }
}

function ContractRows({ contracts }: { contracts: HabitContract[] }) {
  const today = formatDate(new Date())
  return (
    <ul className="space-y-1.5">
      {contracts.map((contract) => {
        const due = dueCopy(contract, today)
        return (
          <li
            key={contract.id}
            className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-2.5 py-2"
          >
            <p className="truncate text-sm font-medium text-zinc-100">{contract.name}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">
              {contract.penalty.trim() || 'No penalty written'}
            </p>
            <p
              className={cn(
                'mt-1 text-[11px]',
                due.tone === 'overdue' && 'font-medium text-rose-400',
                due.tone === 'today' && 'font-medium text-[var(--accent-300)]',
                (due.tone === 'upcoming' || due.tone === 'muted') && 'text-zinc-500',
              )}
            >
              {due.text}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

const fieldClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-[var(--accent-400)]'

function ContractEditor({
  mode,
  contracts,
  onClose,
}: {
  mode: 'add' | 'edit'
  contracts: HabitContract[]
  onClose: () => void
}) {
  const { settings, updateSettings } = useSettings()
  const [name, setName] = useState('')
  const [penalty, setPenalty] = useState('')
  const [endDate, setEndDate] = useState('')
  const [drafts, setDrafts] = useState(() =>
    contracts.map((contract) => ({
      id: contract.id,
      name: contract.name,
      penalty: contract.penalty,
      end_date: contract.end_date ?? '',
    })),
  )

  const saveNew = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    upsertContract({
      id: generateId(),
      person_ids: [ensureOwner()],
      name: trimmed,
      goal: '',
      penalty,
      how_to_calculate: '',
      start_date: formatDate(new Date()),
      end_date: endDate || null,
    })
    onClose()
  }

  const saveDraft = (draft: { id: string; name: string; penalty: string; end_date: string }) => {
    const contract = contracts.find((row) => row.id === draft.id)
    if (!contract) return
    if (!draft.name.trim()) {
      setDrafts((prev) =>
        prev.map((row) => (row.id === draft.id ? { ...row, name: contract.name } : row)),
      )
      return
    }
    upsertContract({
      id: contract.id,
      person_ids: contract.person_ids.length > 0 ? contract.person_ids : [ensureOwner()],
      name: draft.name,
      goal: contract.goal,
      penalty: draft.penalty,
      how_to_calculate: contract.how_to_calculate,
      start_date: contract.start_date,
      end_date: draft.end_date || null,
      created_at: contract.created_at,
    })
  }

  const saveDrafts = (rows: typeof drafts) => {
    for (const draft of rows) saveDraft(draft)
  }

  const closeEditor = () => {
    if (mode === 'edit') saveDrafts(drafts)
    onClose()
  }
  const closeRef = useRef(closeEditor)
  closeRef.current = closeEditor

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={closeEditor}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'add' ? 'Add a contract' : 'Edit contracts'}
        className="flex max-h-[min(32rem,100%)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-zinc-800/80 px-4 py-3">
          <h2 className="text-base font-semibold text-zinc-100">
            {mode === 'add' ? 'Add a contract' : 'Edit contracts'}
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {mode === 'add' ? (
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-zinc-400">Title</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      saveNew()
                    }
                  }}
                  className={fieldClass}
                  placeholder="What you agreed to"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-zinc-400">Penalty</span>
                <input
                  value={penalty}
                  onChange={(event) => setPenalty(event.target.value)}
                  className={fieldClass}
                  placeholder="What it costs if you miss it"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-zinc-400">Due</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className={cn(fieldClass, '[color-scheme:dark]')}
                />
              </label>
            </div>
          ) : drafts.length === 0 ? (
            <p className="text-sm text-zinc-500">No contracts yet.</p>
          ) : (
            <ul className="space-y-3">
              {drafts.map((draft) => (
                <li key={draft.id} className="space-y-2 rounded-xl border border-zinc-800/80 p-2.5">
                  <div className="flex items-start gap-2">
                    <input
                      value={draft.name}
                      aria-label="Contract title"
                      onChange={(event) =>
                        setDrafts((prev) =>
                          prev.map((row) =>
                            row.id === draft.id ? { ...row, name: event.target.value } : row,
                          ),
                        )
                      }
                      onBlur={(event) =>
                        saveDraft({ ...draft, name: event.target.value })
                      }
                      className={fieldClass}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        deleteContract(draft.id)
                        setDrafts((prev) => prev.filter((row) => row.id !== draft.id))
                      }}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-rose-400"
                      aria-label={`Delete ${draft.name || 'contract'}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <input
                    value={draft.penalty}
                    aria-label="Penalty"
                    onChange={(event) =>
                      setDrafts((prev) =>
                        prev.map((row) =>
                          row.id === draft.id ? { ...row, penalty: event.target.value } : row,
                        ),
                      )
                    }
                    onBlur={(event) => saveDraft({ ...draft, penalty: event.target.value })}
                    className={fieldClass}
                    placeholder="Penalty"
                  />
                  <input
                    type="date"
                    aria-label="Due date"
                    value={draft.end_date}
                    onChange={(event) => {
                      const end_date = event.target.value
                      setDrafts((prev) =>
                        prev.map((row) => (row.id === draft.id ? { ...row, end_date } : row)),
                      )
                    }}
                    onBlur={(event) => saveDraft({ ...draft, end_date: event.target.value })}
                    className={cn(fieldClass, '[color-scheme:dark]')}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        {mode === 'edit' && (
          <div className="border-t border-zinc-800/80 px-4 py-3">
            <button
              type="button"
              role="switch"
              aria-checked={settings.remindActiveContracts}
              onClick={() => updateSettings({ remindActiveContracts: !settings.remindActiveContracts })}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="text-sm text-zinc-300">Remind in morning log and shutdown</span>
              <span
                className={cn(
                  'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-300 ease-out',
                  settings.remindActiveContracts ? 'bg-[var(--accent-600)]' : 'bg-zinc-700',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-300 ease-out',
                    settings.remindActiveContracts && 'translate-x-4',
                  )}
                />
              </span>
            </button>
          </div>
        )}
        <div className="flex gap-2 border-t border-zinc-800/80 px-4 py-3">
          <button
            type="button"
            onClick={closeEditor}
            className="flex-1 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors duration-200 ease-out hover:bg-zinc-700"
          >
            {mode === 'add' ? 'Cancel' : 'Done'}
          </button>
          {mode === 'add' && (
            <button
              type="button"
              onClick={saveNew}
              disabled={!name.trim()}
              className="flex-1 rounded-xl bg-[var(--accent-500)] px-3 py-2 text-sm font-semibold text-black transition-colors duration-200 ease-out hover:bg-[var(--accent-400)] disabled:opacity-40"
            >
              Add
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function ActiveContractsCard({ className }: { className?: string }) {
  const contracts = useContracts()
  const [editor, setEditor] = useState<'add' | 'edit' | null>(null)

  return (
    <Card
      className={cn('home-contracts-card relative w-full shrink-0 overflow-visible', className)}
      title={
        <span className="flex items-center gap-1.5">
          <Handshake size={14} className="text-[var(--accent-400)]" />
          Contracts
        </span>
      }
    >
      <div className="contracts-actions absolute -right-2 -top-2 z-20 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditor('add')}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent-500)] text-black shadow-sm transition-colors hover:bg-[var(--accent-400)]"
          aria-label="Add a contract"
          title="Add a contract"
        >
          <Plus size={11} />
        </button>
        <button
          type="button"
          onClick={() => setEditor('edit')}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-200 shadow-sm transition-colors hover:bg-zinc-700"
          aria-label="Edit contracts"
          title="Edit contracts"
        >
          <Pencil size={11} />
        </button>
      </div>
      {contracts.length === 0 ? (
        <p className="text-xs text-zinc-500">No contracts yet.</p>
      ) : (
        <ContractRows contracts={contracts} />
      )}
      {editor && (
        <ContractEditor mode={editor} contracts={contracts} onClose={() => setEditor(null)} />
      )}
    </Card>
  )
}

/** Full-screen reminder shown over morning log and shutdown when the option is on. */
export function ActiveContractsPopup() {
  const { settings } = useSettings()
  const contracts = useContracts()
  const [dismissed, setDismissed] = useState(false)
  if (!settings.remindActiveContracts || dismissed || contracts.length === 0) return null

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Active contracts"
        className="flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0c0c14] shadow-2xl"
      >
        <div className="border-b border-zinc-800/80 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
            <Handshake size={16} className="text-[var(--accent-400)]" />
            Active contracts
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">A reminder before you continue.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <ContractRows contracts={contracts} />
        </div>
        <div className="border-t border-zinc-800/80 px-4 py-3">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="w-full rounded-xl bg-[var(--accent-500)] px-3 py-2 text-sm font-semibold text-black transition-colors duration-200 ease-out hover:bg-[var(--accent-400)]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
