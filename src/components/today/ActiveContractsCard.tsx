import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Handshake } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useSettings } from '@/context/SettingsContext'
import {
  HABIT_CONTRACTS_CHANGED,
  contractIsOngoing,
  getHabitContractsState,
} from '@/lib/habitContracts'
import { cn, parseLocalDate } from '@/lib/utils'
import type { HabitContract } from '@/types'

function readActiveContracts(): HabitContract[] {
  return getHabitContractsState()
    .contracts.filter((contract) => contractIsOngoing(contract))
    .sort((a, b) => {
      if (!a.end_date) return 1
      if (!b.end_date) return -1
      return a.end_date.localeCompare(b.end_date)
    })
}

function useActiveContracts() {
  const [contracts, setContracts] = useState<HabitContract[]>(readActiveContracts)

  useEffect(() => {
    const refresh = () => setContracts(readActiveContracts())
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

function endLabel(contract: HabitContract) {
  if (!contract.end_date) return 'No end date'
  return format(parseLocalDate(contract.end_date), 'EEE, MMM d')
}

function ContractRows({ contracts }: { contracts: HabitContract[] }) {
  return (
    <ul className="space-y-1.5">
      {contracts.map((contract) => (
        <li
          key={contract.id}
          className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-2.5 py-2"
        >
          <p className="truncate text-sm font-medium text-zinc-100">{contract.name}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">
            {contract.penalty.trim() || 'No penalty written'}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {contract.end_date ? `Ends ${endLabel(contract)}` : 'No end date'}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function ActiveContractsCard({ className }: { className?: string }) {
  const { settings, updateSettings } = useSettings()
  const contracts = useActiveContracts()
  if (contracts.length === 0) return null

  return (
    <Card
      className={cn('w-full', className)}
      title={
        <span className="flex items-center gap-1.5">
          <Handshake size={14} className="text-[var(--accent-400)]" />
          Contracts
        </span>
      }
    >
      <ContractRows contracts={contracts} />
      <button
        type="button"
        role="switch"
        aria-checked={settings.remindActiveContracts}
        onClick={() => updateSettings({ remindActiveContracts: !settings.remindActiveContracts })}
        className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg px-0.5 text-left"
      >
        <span className="text-xs text-zinc-400">Remind in morning log and shutdown</span>
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
    </Card>
  )
}

/** Full-screen reminder shown over morning log and shutdown when the option is on. */
export function ActiveContractsPopup() {
  const { settings } = useSettings()
  const contracts = useActiveContracts()
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
