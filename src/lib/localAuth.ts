import { generateId } from '@/lib/utils'

const USERS_KEY = 'personal-os-local-users'
const SESSION_KEY = 'personal-os-local-session'
const LEGACY_DATA_KEY = 'personal-os-data'

interface LocalUser {
  id: string
  email: string
  passwordHash: string
}

interface LocalSession {
  userId: string
  email: string
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function loadUsers(): LocalUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (raw) return JSON.parse(raw) as LocalUser[]
  } catch {
    /* ignore */
  }
  return []
}

function saveUsers(users: LocalUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function setSession(userId: string, email: string) {
  const session: LocalSession = { userId, email }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function getLocalSession(): LocalSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) return JSON.parse(raw) as LocalSession
  } catch {
    /* ignore */
  }
  return null
}

export function localSignOut() {
  localStorage.removeItem(SESSION_KEY)
}

export function getLocalDataKey(userId: string) {
  return `personal-os-data-${userId}`
}

/** Copy legacy single-user blob into the new per-user key once. */
export function migrateLegacyDataForUser(userId: string) {
  const key = getLocalDataKey(userId)
  if (localStorage.getItem(key)) return
  const legacy = localStorage.getItem(LEGACY_DATA_KEY)
  if (legacy) localStorage.setItem(key, legacy)
}

export async function localSignUp(email: string, password: string): Promise<LocalSession> {
  const normalized = email.trim().toLowerCase()
  if (!normalized || password.length < 6) {
    throw new Error('Use a valid email and a password of at least 6 characters')
  }

  const users = loadUsers()
  if (users.some((u) => u.email === normalized)) {
    throw new Error('An account with this email already exists')
  }

  const user: LocalUser = {
    id: generateId(),
    email: normalized,
    passwordHash: await hashPassword(password),
  }
  users.push(user)
  saveUsers(users)
  setSession(user.id, user.email)
  migrateLegacyDataForUser(user.id)
  return { userId: user.id, email: user.email }
}

export async function localSignIn(email: string, password: string): Promise<LocalSession> {
  const normalized = email.trim().toLowerCase()
  const users = loadUsers()
  const user = users.find((u) => u.email === normalized)
  if (!user || user.passwordHash !== (await hashPassword(password))) {
    throw new Error('Invalid email or password')
  }
  setSession(user.id, user.email)
  migrateLegacyDataForUser(user.id)
  return { userId: user.id, email: user.email }
}

/** Removes a local user, their data blob, and the active session. */
export function deleteLocalAccount(userId: string) {
  const users = loadUsers().filter((u) => u.id !== userId)
  saveUsers(users)
  localStorage.removeItem(getLocalDataKey(userId))
  localSignOut()
}
