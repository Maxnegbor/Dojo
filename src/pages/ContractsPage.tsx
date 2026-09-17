import { useEffect, useMemo, useState } from 'react'
import { Bell, ChevronDown, Handshake, Plus, UserPlus } from 'lucide-react'
import { ContractDetailModal } from '@/components/contracts/ContractDetailModal'
import { ContractFormModal } from '@/components/contracts/ContractFormModal'
import { PeopleEditorModal } from '@/components/contracts/PeopleEditorModal'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/context/AuthContext'
import {
  BOTH_WHO,
  addProof,
  computeSettlements,
  contractNameClass,
  contractTone,
  deleteContract,
  deletePerson,
  deleteProof,
  enableContractNotifications,
  formatContractDate,
  formatEuros,
  getHabitContractsState,
  getSelfPersonId,
  isHabitContractsShared,
  loadHabitContracts,
  setSelfPersonId,
  subscribeHabitContracts,
  patchProof,
  updateProofStatus,
  upsertContract,
  upsertPerson,
} from '@/lib/habitContracts'
import { cn, formatDate } from '@/lib/utils'
import type { HabitContract, HabitContractsState } from '@/types'

export function ContractsPage() {
  const { userId } = useAuth()
  const [state, setState] = useState<HabitContractsState>(() => getHabitContractsState())
  const [selfId, setSelfId] = useState<string | null>(() => getSelfPersonId())
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<HabitContract | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [notifyOn, setNotifyOn] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted',
  )
  const [shared, setShared] = useState(true)

  useEffect(() => {
    void loadHabitContracts().then((next) => {
      setState(next)
      setShared(isHabitContractsShared())
      setSelfId(getSelfPersonId())
    })
    let unsub: (() => void) | undefined
    void subscribeHabitContracts(() => {
      setState(getHabitContractsState())
      setSelfId(getSelfPersonId())
      setShared(isHabitContractsShared())
    }).then((fn) => {
      unsub = fn
    })
    return () => unsub?.()
  }, [])

  const today = formatDate(new Date())
  const settlements = useMemo(() => computeSettlements(state), [state])
  const personName = (id: string) => state.people.find((person) => person.id === id)?.name ?? 'Someone'

  const grouped = useMemo(() => {
    const shared = state.contracts.filter((contract) => contract.person_ids.length > 1)
    const bothLabel = state.people.length === 2 ? 'Both' : 'Everyone'
    const groups: { id: string; label: string; color: string; contracts: HabitContract[] }[] = []
    if (shared.length > 0) {
      groups.push({
        id: BOTH_WHO,
        label: bothLabel,
        color: 'var(--accent-300)',
        contracts: shared,
      })
    }
    for (const person of state.people) {
      groups.push({
        id: person.id,
        label: person.name,
        color: person.color,
        contracts: state.contracts.filter(
          (contract) => contract.person_ids.length === 1 && contract.person_ids[0] === person.id,
        ),
      })
    }
    return groups
  }, [state.people, state.contracts])

  const detail = state.contracts.find((contract) => contract.id === detailId) ?? null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Contracts</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Shared habit contracts for everyone on this Dojo. Upload proof photos and the API
            figures out who pays whom.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={notifyOn ? 'secondary' : 'ghost'}
            onClick={() => {
              void enableContractNotifications().then(setNotifyOn)
            }}
          >
            <Bell size={14} />
            {notifyOn ? 'Alerts on' : 'Notify me'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPeopleOpen(true)}>
            <UserPlus size={14} />
            Add friend
          </Button>
          <Button
            size="sm"
            disabled={state.people.length === 0}
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={14} />
            New
          </Button>
        </div>
      </div>

      {!shared && (
        <p className="rounded-xl border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          Contracts are saved on this device until the shared table exists. Run{' '}
          <code className="text-amber-100">supabase/migrations/004_habit_contracts.sql</code> in
          Supabase so you and your friend see the same data.
        </p>
      )}

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Balance</p>
            {settlements.length === 0 ? (
              <p className="mt-1 text-sm text-zinc-200">Settled — nobody owes anything</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {settlements.map((row) => (
                  <li key={`${row.from_person_id}-${row.to_person_id}`} className="text-sm text-zinc-100">
                    {personName(row.from_person_id)} owes {personName(row.to_person_id)}{' '}
                    <span className="font-semibold text-[var(--accent-300)]">
                      {formatEuros(row.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {state.people.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              I am
              <select
                value={selfId ?? ''}
                onChange={(e) => {
                  const value = e.target.value || null
                  setSelfPersonId(value)
                  setSelfId(value)
                }}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
              >
                <option value="">Not set</option>
                {state.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </Card>

      {state.people.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <Handshake className="mx-auto text-zinc-600" size={28} />
          <p className="mt-3 text-sm text-zinc-400">No people yet</p>
          <p className="mt-1 text-xs text-zinc-600">
            Add yourself and your friend, then create a screentime or exercise contract.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setPeopleOpen(true)}>
            <UserPlus size={14} />
            Add friend
          </Button>
        </div>
      ) : grouped.every((group) => group.contracts.length === 0) ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">No contracts yet</p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={14} />
            New contract
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ id, label, color, contracts }) => {
            if (contracts.length === 0) return null
            const open = !collapsed[id]
            return (
              <section key={id} className="overflow-hidden rounded-xl border border-zinc-800/80">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
                  }
                  className="flex w-full items-center gap-2 bg-zinc-900/70 px-3 py-2 text-left"
                >
                  <ChevronDown
                    size={14}
                    className={cn('text-zinc-500 transition-transform', !open && '-rotate-90')}
                  />
                  <span
                    className="rounded-md px-2 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: `${color}22`, color }}
                  >
                    {label}
                  </span>
                  <span className="text-[11px] text-zinc-500">{contracts.length}</span>
                </button>
                {open && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[40rem] text-left text-sm">
                      <thead className="border-b border-zinc-800/80 text-[11px] uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Goal</th>
                          <th className="px-3 py-2 font-medium">Penalty</th>
                          <th className="px-3 py-2 font-medium">Start</th>
                          <th className="px-3 py-2 font-medium">End</th>
                          <th className="px-3 py-2 font-medium">Proof</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contracts.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-4 text-xs text-zinc-600">
                              No contracts for {label}
                            </td>
                          </tr>
                        ) : (
                          contracts.map((contract) => {
                            const pending = state.proofs.filter(
                              (proof) =>
                                proof.contract_id === contract.id && proof.status === 'pending',
                            ).length
                            const total = state.proofs.filter(
                              (proof) => proof.contract_id === contract.id,
                            ).length
                            return (
                              <tr
                                key={contract.id}
                                className="cursor-pointer border-t border-zinc-800/60 hover:bg-zinc-900/80"
                                onClick={() => setDetailId(contract.id)}
                              >
                                <td
                                  className={cn(
                                    'px-3 py-2.5 font-medium',
                                    contractNameClass(
                                      contractTone(contract, state.proofs, today),
                                    ),
                                  )}
                                >
                                  {contract.name}
                                </td>
                                <td className="max-w-[16rem] truncate px-3 py-2.5 text-zinc-400">
                                  {contract.goal || '—'}
                                </td>
                                <td className="max-w-[16rem] truncate px-3 py-2.5 text-zinc-200">
                                  {contract.penalty || '—'}
                                </td>
                                <td className="px-3 py-2.5 text-zinc-400">
                                  {formatContractDate(contract.start_date)}
                                </td>
                                <td className="px-3 py-2.5 text-zinc-400">
                                  {contract.end_date ? formatContractDate(contract.end_date) : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-zinc-400">
                                  {pending > 0
                                    ? `${pending} to review`
                                    : total > 0
                                      ? `${total} proof${total === 1 ? '' : 's'}`
                                      : 'Upload'}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {peopleOpen && (
        <PeopleEditorModal
          people={state.people}
          selfPersonId={selfId}
          onSave={(input) => upsertPerson(input)}
          onDelete={(id) => deletePerson(id)}
          onClose={() => setPeopleOpen(false)}
        />
      )}

      {formOpen && (
        <ContractFormModal
          people={state.people}
          initial={editing}
          defaultPersonId={selfId}
          onSave={(contract) => {
            upsertContract(contract)
            setFormOpen(false)
            setEditing(null)
            setDetailId(contract.id)
          }}
          onClose={() => {
            setFormOpen(false)
            setEditing(null)
          }}
        />
      )}

      {detail && (
        <ContractDetailModal
          contract={detail}
          people={state.people.filter((person) => detail.person_ids.includes(person.id))}
          selfPersonId={selfId}
          state={state}
          userId={userId}
          onAddProof={(proof) => addProof(proof)}
          onUpdateProofStatus={(id, status) => updateProofStatus(id, status)}
          onPatchProof={(id, patch) => patchProof(id, patch)}
          onDeleteProof={(id) => deleteProof(id)}
          onEdit={() => {
            setEditing(detail)
            setDetailId(null)
            setFormOpen(true)
          }}
          onDelete={() => {
            deleteContract(detail.id)
            setDetailId(null)
          }}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}
