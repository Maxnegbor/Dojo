import { getPublicSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { formatUnknownError, generateId } from '@/lib/utils'
import type { DojoChallenge, DojoChallengeMember, DojoChallengeStatus } from '@/types'

export const DOJO_CHALLENGES_CHANGED = 'personal-os-dojo-challenges-changed'
const LOCAL_KEY = 'personal-os-dojo-challenges'
const NAME_KEY = 'personal-os-dojo-challenge-name'
const ADMIN_KEY_STORAGE = 'personal-os-dojo-challenge-host'

export type DojoChallengeDraft = {
  id?: string
  title: string
  description: string
  status: DojoChallengeStatus
  starts_on: string | null
  ends_on: string | null
}

let tableReady: boolean | null = null

function notify() {
  window.dispatchEvent(new Event(DOJO_CHALLENGES_CHANGED))
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeMember(raw: unknown): DojoChallengeMember | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = asString(row.id)
  const challenge_id = asString(row.challenge_id)
  const name = asString(row.name).trim()
  if (!id || !challenge_id || !name) return null
  return {
    id,
    challenge_id,
    name,
    joined_at: asString(row.joined_at, new Date().toISOString()),
  }
}

function normalizeChallenge(raw: unknown): DojoChallenge | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = asString(row.id)
  const title = asString(row.title).trim()
  if (!id || !title) return null
  const status = asString(row.status, 'open')
  const membersRaw = Array.isArray(row.members)
    ? row.members
    : Array.isArray(row.dojo_challenge_members)
      ? row.dojo_challenge_members
      : []
  const members = membersRaw
    .map(normalizeMember)
    .filter((entry): entry is DojoChallengeMember => entry != null)
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at) || a.name.localeCompare(b.name))
  return {
    id,
    title,
    description: asString(row.description),
    status: status === 'closed' ? 'closed' : 'open',
    starts_on: asString(row.starts_on) || null,
    ends_on: asString(row.ends_on) || null,
    created_at: asString(row.created_at, new Date().toISOString()),
    updated_at: asString(row.updated_at, new Date().toISOString()),
    members,
  }
}

function readLocal(): DojoChallenge[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeChallenge)
      .filter((entry): entry is DojoChallenge => entry != null)
  } catch {
    return []
  }
}

function writeLocal(challenges: DojoChallenge[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(challenges))
  } catch {
    /* quota */
  }
}

function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as Record<string, unknown>
  const message = typeof record.message === 'string' ? record.message : ''
  return (
    record.code === '42P01' ||
    record.code === 'PGRST205' ||
    message.toLowerCase().includes('dojo_challenge')
  )
}

export function isDojoChallengesShared(): boolean {
  return tableReady === true
}

export function getSavedDojoName(): string {
  try {
    return localStorage.getItem(NAME_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function saveDojoName(name: string) {
  try {
    const trimmed = name.trim()
    if (trimmed) localStorage.setItem(NAME_KEY, trimmed)
    else localStorage.removeItem(NAME_KEY)
  } catch {
    /* ignore */
  }
}

export function getStoredHostKey(): string {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function clearStoredHostKey() {
  try {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE)
  } catch {
    /* ignore */
  }
}

function storeHostKey(key: string) {
  try {
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key)
  } catch {
    /* ignore */
  }
}

function requireHostKey(): string {
  const key = getStoredHostKey()
  if (!key) throw new Error('Enter the host key to edit challenges')
  return key
}

function sortChallenges(challenges: DojoChallenge[]): DojoChallenge[] {
  return [...challenges].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    return b.created_at.localeCompare(a.created_at)
  })
}

export async function fetchDojoChallenges(): Promise<DojoChallenge[]> {
  const client = getPublicSupabase()
  if (!isSupabaseConfigured || !client) {
    tableReady = false
    return sortChallenges(readLocal())
  }

  const { data, error } = await client
    .from('dojo_challenges')
    .select('*, members:dojo_challenge_members(*)')
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingTable(error)) {
      tableReady = false
      return sortChallenges(readLocal())
    }
    throw new Error(formatUnknownError(error, 'Could not load challenges'))
  }

  tableReady = true
  const next = (data ?? [])
    .map(normalizeChallenge)
    .filter((entry): entry is DojoChallenge => entry != null)
  writeLocal(next)
  return sortChallenges(next)
}

export async function joinDojoChallenge(challengeId: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Enter your name')
  if (trimmed.length > 40) throw new Error('Keep your name under 40 characters')

  const client = getPublicSupabase()
  if (!isSupabaseConfigured || !client || tableReady === false) {
    const challenges = readLocal()
    const challenge = challenges.find((row) => row.id === challengeId)
    if (!challenge) throw new Error('Challenge not found')
    if (challenge.status !== 'open') throw new Error('This challenge is closed')
    const taken = challenge.members.some(
      (member) => member.name.toLowerCase() === trimmed.toLowerCase(),
    )
    if (taken) throw new Error('That name is already in')
    challenge.members = [
      ...challenge.members,
      {
        id: generateId(),
        challenge_id: challengeId,
        name: trimmed,
        joined_at: new Date().toISOString(),
      },
    ]
    writeLocal(challenges)
    saveDojoName(trimmed)
    notify()
    return
  }

  const { error } = await client.from('dojo_challenge_members').insert({
    challenge_id: challengeId,
    name: trimmed,
  })
  if (error) {
    if (error.code === '23505') throw new Error('That name is already in')
    throw new Error(formatUnknownError(error, 'Could not join'))
  }
  saveDojoName(trimmed)
  notify()
}

export async function verifyDojoHostKey(key: string): Promise<boolean> {
  const trimmed = key.trim()
  if (!trimmed) return false

  const client = getPublicSupabase()
  if (!isSupabaseConfigured || !client || tableReady === false) {
    throw new Error('Host controls need the shared Dojo database.')
  }

  const { data, error } = await client.rpc('dojo_verify_admin_key', { p_key: trimmed })
  if (error) throw new Error(formatUnknownError(error, 'Could not check host key'))
  const ok = data === true
  if (ok) storeHostKey(trimmed)
  return ok
}

export async function upsertDojoChallenge(draft: DojoChallengeDraft): Promise<void> {
  const key = requireHostKey()
  const title = draft.title.trim()
  if (!title) throw new Error('Title is required')

  const client = getPublicSupabase()
  if (!isSupabaseConfigured || !client || tableReady === false) {
    throw new Error('Host controls need the shared Dojo database.')
  }

  const { error } = await client.rpc('dojo_admin_upsert_challenge', {
    p_key: key,
    p_id: draft.id ?? null,
    p_title: title,
    p_description: draft.description.trim(),
    p_status: draft.status,
    p_starts_on: draft.starts_on || null,
    p_ends_on: draft.ends_on || null,
  })
  if (error) throw new Error(formatUnknownError(error, 'Could not save challenge'))
  notify()
}

export async function deleteDojoChallenge(id: string): Promise<void> {
  const key = requireHostKey()
  const client = getPublicSupabase()
  if (!isSupabaseConfigured || !client || tableReady === false) {
    throw new Error('Host controls need the shared Dojo database.')
  }
  const { error } = await client.rpc('dojo_admin_delete_challenge', {
    p_key: key,
    p_id: id,
  })
  if (error) throw new Error(formatUnknownError(error, 'Could not delete challenge'))
  notify()
}

export async function removeDojoChallengeMember(memberId: string): Promise<void> {
  const key = requireHostKey()
  const client = getPublicSupabase()
  if (!isSupabaseConfigured || !client || tableReady === false) {
    throw new Error('Host controls need the shared Dojo database.')
  }
  const { error } = await client.rpc('dojo_admin_remove_member', {
    p_key: key,
    p_member_id: memberId,
  })
  if (error) throw new Error(formatUnknownError(error, 'Could not remove person'))
  notify()
}

export function subscribeDojoChallenges(onChange: () => void): () => void {
  window.addEventListener(DOJO_CHALLENGES_CHANGED, onChange)
  const client = getPublicSupabase()
  if (!isSupabaseConfigured || !client) {
    return () => window.removeEventListener(DOJO_CHALLENGES_CHANGED, onChange)
  }

  const channel = client
    .channel('dojo-challenges')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'dojo_challenges' },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'dojo_challenge_members' },
      () => onChange(),
    )
    .subscribe()

  const poll = window.setInterval(() => {
    onChange()
  }, 15000)

  return () => {
    window.removeEventListener(DOJO_CHALLENGES_CHANGED, onChange)
    window.clearInterval(poll)
    void client.removeChannel(channel)
  }
}

export function memberJoinedAs(challenge: DojoChallenge, name: string): boolean {
  const trimmed = name.trim().toLowerCase()
  if (!trimmed) return false
  return challenge.members.some((member) => member.name.toLowerCase() === trimmed)
}

export function formatChallengeDates(challenge: DojoChallenge): string | null {
  if (!challenge.starts_on && !challenge.ends_on) return null
  const start = challenge.starts_on ?? '…'
  const end = challenge.ends_on ?? '…'
  return `${start} → ${end}`
}
