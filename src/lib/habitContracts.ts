import { isSupabaseConfigured } from '@/lib/supabase'
import { generateId, formatDate, parseLocalDate } from '@/lib/utils'
import { format } from 'date-fns'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import type {
  HabitContract,
  HabitContractPerson,
  HabitContractProof,
  HabitContractProofStatus,
  HabitContractsState,
  HabitContractSettlement,
} from '@/types'

export const HABIT_CONTRACTS_CHANGED = 'personal-os-habit-contracts-changed'
export const HABIT_CONTRACTS_KEY = 'habit_contracts'
const LOCAL_KEY = 'personal-os-habit-contracts'
const SELF_KEY = 'personal-os-habit-contract-self'
const SEEN_KEY = 'personal-os-habit-contract-seen'

export const PERSON_COLORS = [
  '#d97706',
  '#8b5cf6',
  '#10b981',
  '#3b82f6',
  '#f43f5e',
  '#14b8a6',
  '#eab308',
  '#ec4899',
] as const

const emptyState = (): HabitContractsState => ({
  people: [],
  contracts: [],
  proofs: [],
  updated_at: new Date().toISOString(),
})

let memory = emptyState()
let loaded = false
let sharedTableReady: boolean | null = null
let saveTail: Promise<void> = Promise.resolve()

function notify() {
  window.dispatchEvent(new Event(HABIT_CONTRACTS_CHANGED))
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizePenaltyRule(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return `€${raw} if the goal is missed`
  }
  return ''
}

function normalizePerson(raw: unknown): HabitContractPerson | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = asString(row.id)
  const name = asString(row.name).trim()
  if (!id || !name) return null
  return {
    id,
    name,
    color: asString(row.color, PERSON_COLORS[0]),
    created_at: asString(row.created_at, new Date().toISOString()),
  }
}

export const BOTH_WHO = '__both__'

function normalizePersonIds(row: Record<string, unknown>): string[] {
  if (Array.isArray(row.person_ids)) {
    const ids = row.person_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    if (ids.length > 0) return [...new Set(ids)]
  }
  const single = asString(row.person_id)
  return single ? [single] : []
}

function normalizeContract(raw: unknown): HabitContract | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = asString(row.id)
  const person_ids = normalizePersonIds(row)
  const name = asString(row.name).trim()
  if (!id || person_ids.length === 0 || !name) return null
  const end = asString(row.end_date)
  return {
    id,
    person_ids,
    name,
    goal: asString(row.goal),
    penalty: normalizePenaltyRule(row.penalty),
    how_to_calculate: asString(row.how_to_calculate).trim(),
    start_date: asString(row.start_date, formatDate(new Date())),
    end_date: end || null,
    created_at: asString(row.created_at, new Date().toISOString()),
    updated_at: asString(row.updated_at, new Date().toISOString()),
  }
}

function normalizeProofImages(row: Record<string, unknown>): string[] {
  if (Array.isArray(row.image_data_urls)) {
    return row.image_data_urls.filter(
      (url): url is string => typeof url === 'string' && url.startsWith('data:image/'),
    )
  }
  const legacy = asString(row.image_data_url)
  return legacy.startsWith('data:image/') ? [legacy] : []
}

function normalizeProof(raw: unknown): HabitContractProof | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = asString(row.id)
  const contract_id = asString(row.contract_id)
  const person_id = asString(row.person_id)
  const notes = asString(row.notes)
  const image_data_urls = normalizeProofImages(row)
  if (!id || !contract_id || !person_id) return null
  if (image_data_urls.length === 0 && !notes.trim()) return null
  const status = asString(row.status, 'pending')
  const analysisRaw = row.analysis
  const analysis =
    analysisRaw && typeof analysisRaw === 'object'
      ? {
          met_goal:
            (analysisRaw as { met_goal?: unknown }).met_goal === true
              ? true
              : (analysisRaw as { met_goal?: unknown }).met_goal === false
                ? false
                : null,
          extracted: asString((analysisRaw as { extracted?: unknown }).extracted),
          penalty_due: Math.max(0, asNumber((analysisRaw as { penalty_due?: unknown }).penalty_due)),
          penalty_calculation: asString((analysisRaw as { penalty_calculation?: unknown }).penalty_calculation),
          explanation: asString((analysisRaw as { explanation?: unknown }).explanation),
          confidence: Math.min(1, Math.max(0, asNumber((analysisRaw as { confidence?: unknown }).confidence))),
        }
      : null
  return {
    id,
    contract_id,
    person_id,
    date: asString(row.date, formatDate(new Date())),
    image_data_urls,
    notes,
    analysis,
    status: status === 'accepted' || status === 'disputed' ? status : 'pending',
    created_by: asString(row.created_by) || null,
    created_at: asString(row.created_at, new Date().toISOString()),
  }
}

export function normalizeHabitContractsState(raw: unknown): HabitContractsState {
  if (!raw || typeof raw !== 'object') return emptyState()
  const row = raw as Record<string, unknown>
  return {
    people: Array.isArray(row.people) ? row.people.map(normalizePerson).filter(Boolean) as HabitContractPerson[] : [],
    contracts: Array.isArray(row.contracts)
      ? (row.contracts.map(normalizeContract).filter(Boolean) as HabitContract[])
      : [],
    proofs: Array.isArray(row.proofs)
      ? (row.proofs.map(normalizeProof).filter(Boolean) as HabitContractProof[])
      : [],
    updated_at: asString(row.updated_at, new Date().toISOString()),
  }
}

function readLocal(): HabitContractsState {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return emptyState()
    return normalizeHabitContractsState(JSON.parse(raw) as unknown)
  } catch {
    return emptyState()
  }
}

function writeLocal(state: HabitContractsState) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state))
  } catch {
    /* quota */
  }
}

export function getHabitContractsState(): HabitContractsState {
  if (!loaded) {
    memory = readLocal()
    loaded = true
  }
  return memory
}

export function getSelfPersonId(): string | null {
  const raw = storageGetItem(SELF_KEY)
  return raw && raw.trim() ? raw.trim() : null
}

export function setSelfPersonId(id: string | null) {
  if (!id) {
    storageSetItem(SELF_KEY, '')
    notify()
    return
  }
  storageSetItem(SELF_KEY, id)
  notify()
}

export function formatEuros(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  return `€${rounded.toFixed(2)}`
}

export function formatContractDate(dateStr: string): string {
  if (!dateStr) return ''
  return format(parseLocalDate(dateStr), 'EEE d')
}

export function contractCoversEveryone(
  contract: HabitContract,
  people: HabitContractPerson[],
): boolean {
  if (people.length < 2) return false
  const ids = new Set(contract.person_ids)
  return people.every((person) => ids.has(person.id))
}

export function contractIsOngoing(contract: HabitContract, today = formatDate(new Date())): boolean {
  if (contract.start_date > today) return false
  if (contract.end_date && contract.end_date < today) return false
  return true
}

export type ContractTone = 'due' | 'ongoing' | 'neutral'

export function contractTone(
  contract: HabitContract,
  proofs: HabitContractProof[],
  today = formatDate(new Date()),
): ContractTone {
  const pending = proofs.some(
    (proof) => proof.contract_id === contract.id && proof.status === 'pending',
  )
  if (pending) return 'due'
  if (contractIsOngoing(contract, today)) return 'ongoing'
  return 'neutral'
}

export function contractNameClass(tone: ContractTone): string {
  if (tone === 'due') return 'text-red-400'
  if (tone === 'ongoing') return 'text-sky-400'
  return 'text-zinc-500'
}

export function computeSettlements(state: HabitContractsState): HabitContractSettlement[] {
  const net = new Map<string, number>()
  const pairKey = (from: string, to: string) => `${from}→${to}`

  const add = (from: string, to: string, amount: number) => {
    if (from === to || amount <= 0) return
    const forward = pairKey(from, to)
    const back = pairKey(to, from)
    const reverse = net.get(back) ?? 0
    if (reverse > 0) {
      if (reverse >= amount) {
        net.set(back, reverse - amount)
        return
      }
      net.set(back, 0)
      net.set(forward, amount - reverse)
      return
    }
    net.set(forward, (net.get(forward) ?? 0) + amount)
  }

  for (const proof of state.proofs) {
    if (proof.status !== 'accepted') continue
    const due = proof.analysis?.penalty_due ?? 0
    if (due <= 0) continue
    const others = state.people.filter((person) => person.id !== proof.person_id)
    if (others.length === 0) continue
    const share = due / others.length
    for (const other of others) add(proof.person_id, other.id, share)
  }

  const settlements: HabitContractSettlement[] = []
  for (const [key, amount] of net) {
    if (amount <= 0.004) continue
    const [from_person_id, to_person_id] = key.split('→')
    if (!from_person_id || !to_person_id) continue
    settlements.push({
      from_person_id,
      to_person_id,
      amount: Math.round(amount * 100) / 100,
    })
  }
  return settlements.sort((a, b) => b.amount - a.amount)
}

async function persistRemote(state: HabitContractsState): Promise<boolean> {
  if (!isSupabaseConfigured || sharedTableReady === false) return false
  try {
    const { upsertSharedAppData } = await import('@/lib/supabase')
    await upsertSharedAppData(HABIT_CONTRACTS_KEY, state)
    sharedTableReady = true
    return true
  } catch (error) {
    const { isSharedAppDataUnavailable } = await import('@/lib/supabase')
    if (isSharedAppDataUnavailable(error)) {
      sharedTableReady = false
      return false
    }
    console.error('Failed to save shared habit contracts', error)
    return false
  }
}

function enqueueSave(state: HabitContractsState) {
  memory = state
  writeLocal(state)
  notify()
  saveTail = saveTail
    .catch(() => undefined)
    .then(() => persistRemote(state).then(() => undefined))
}

export async function loadHabitContracts(): Promise<HabitContractsState> {
  loaded = true
  const local = readLocal()
  if (!isSupabaseConfigured) {
    memory = local
    notify()
    return memory
  }

  try {
    const { fetchSharedAppData } = await import('@/lib/supabase')
    const remote = await fetchSharedAppData(HABIT_CONTRACTS_KEY)
    sharedTableReady = true
    if (remote?.value) {
      const next = normalizeHabitContractsState(remote.value)
      next.updated_at = remote.updated_at ?? next.updated_at
      memory = next
      writeLocal(next)
      notifyNewProofs(next.proofs)
      notify()
      return memory
    }
    if (local.people.length || local.contracts.length) {
      memory = local
      await persistRemote(local)
      notify()
      return memory
    }
    memory = emptyState()
    notify()
    return memory
  } catch (error) {
    const { isSharedAppDataUnavailable } = await import('@/lib/supabase')
    if (isSharedAppDataUnavailable(error)) sharedTableReady = false
    memory = local
    notify()
    return memory
  }
}

export function isHabitContractsShared(): boolean {
  return sharedTableReady === true
}

function mutate(fn: (state: HabitContractsState) => HabitContractsState) {
  const next = fn(getHabitContractsState())
  next.updated_at = new Date().toISOString()
  enqueueSave(next)
  return next
}

export function upsertPerson(input: { id?: string; name: string; color: string }): HabitContractPerson {
  const now = new Date().toISOString()
  const person: HabitContractPerson = {
    id: input.id ?? generateId(),
    name: input.name.trim(),
    color: input.color,
    created_at: now,
  }
  mutate((state) => {
    const existing = state.people.find((row) => row.id === person.id)
    return {
      ...state,
      people: existing
        ? state.people.map((row) => (row.id === person.id ? { ...existing, ...person, created_at: existing.created_at } : row))
        : [...state.people, person],
    }
  })
  if (!getSelfPersonId()) setSelfPersonId(person.id)
  return person
}

export function deletePerson(id: string) {
  mutate((state) => ({
    ...state,
    people: state.people.filter((row) => row.id !== id),
    contracts: state.contracts
      .map((row) => ({
        ...row,
        person_ids: row.person_ids.filter((personId) => personId !== id),
      }))
      .filter((row) => row.person_ids.length > 0),
    proofs: state.proofs.filter((row) => row.person_id !== id),
  }))
  if (getSelfPersonId() === id) setSelfPersonId(null)
}

export function upsertContract(
  input: Omit<HabitContract, 'created_at' | 'updated_at'> & { created_at?: string },
): HabitContract {
  const now = new Date().toISOString()
  const contract: HabitContract = {
    ...input,
    name: input.name.trim(),
    goal: input.goal.trim(),
    penalty: input.penalty.trim(),
    how_to_calculate: input.how_to_calculate.trim(),
    created_at: input.created_at ?? now,
    updated_at: now,
  }
  mutate((state) => ({
    ...state,
    contracts: state.contracts.some((row) => row.id === contract.id)
      ? state.contracts.map((row) => (row.id === contract.id ? contract : row))
      : [...state.contracts, contract],
  }))
  return contract
}

export function deleteContract(id: string) {
  mutate((state) => ({
    ...state,
    contracts: state.contracts.filter((row) => row.id !== id),
    proofs: state.proofs.filter((row) => row.contract_id !== id),
  }))
}

export function addProof(proof: HabitContractProof): HabitContractProof {
  mutate((state) => ({
    ...state,
    proofs: [...state.proofs, proof],
  }))
  return proof
}

export function updateProofStatus(id: string, status: HabitContractProofStatus) {
  mutate((state) => ({
    ...state,
    proofs: state.proofs.map((row) => (row.id === id ? { ...row, status } : row)),
  }))
}

export function patchProof(id: string, patch: Partial<Omit<HabitContractProof, 'id'>>) {
  mutate((state) => ({
    ...state,
    proofs: state.proofs.map((row) => (row.id === id ? { ...row, ...patch, id: row.id } : row)),
  }))
}

export function deleteProof(id: string) {
  mutate((state) => ({
    ...state,
    proofs: state.proofs.filter((row) => row.id !== id),
  }))
}

export async function subscribeHabitContracts(onChange: () => void): Promise<() => void> {
  window.addEventListener(HABIT_CONTRACTS_CHANGED, onChange)
  let unsubRemote = () => undefined as void
  if (isSupabaseConfigured) {
    try {
      const { subscribeSharedAppData } = await import('@/lib/supabase')
      unsubRemote = subscribeSharedAppData(HABIT_CONTRACTS_KEY, () => {
        void loadHabitContracts()
      })
    } catch {
      /* local only */
    }
  }
  const poll = window.setInterval(() => {
    if (isSupabaseConfigured && sharedTableReady !== false) void loadHabitContracts()
  }, 20000)
  return () => {
    window.removeEventListener(HABIT_CONTRACTS_CHANGED, onChange)
    unsubRemote()
    window.clearInterval(poll)
  }
}

function notifyNewProofs(proofs: HabitContractProof[]) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const seen = storageGetItem(SEEN_KEY)
  if (!seen) {
    markProofsSeen(proofs)
    return
  }
  const self = getSelfPersonId()
  const newest = proofs
    .filter((proof) => proof.created_at > seen && proof.status === 'pending' && proof.person_id !== self)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  if (newest.length === 0) {
    markProofsSeen(proofs)
    return
  }
  const latest = newest[0]!
  const contract = getHabitContractsState().contracts.find((row) => row.id === latest.contract_id)
  const person = getHabitContractsState().people.find((row) => row.id === latest.person_id)
  try {
    new Notification('Habit contract proof to review', {
      body: `${person?.name ?? 'Someone'} uploaded proof for ${contract?.name ?? 'a contract'}`,
    })
  } catch {
    /* ignore */
  }
  markProofsSeen(proofs)
}

export function markProofsSeen(proofs: HabitContractProof[]) {
  const latest = proofs.reduce((max, proof) => (proof.created_at > max ? proof.created_at : max), '')
  if (latest) storageSetItem(SEEN_KEY, latest)
}

export async function enableContractNotifications(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}
