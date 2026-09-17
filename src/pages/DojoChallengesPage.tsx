import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Swords, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
  clearStoredHostKey,
  deleteDojoChallenge,
  fetchDojoChallenges,
  formatChallengeDates,
  getSavedDojoName,
  getStoredHostKey,
  isDojoChallengesShared,
  joinDojoChallenge,
  memberJoinedAs,
  removeDojoChallengeMember,
  saveDojoName,
  subscribeDojoChallenges,
  upsertDojoChallenge,
  verifyDojoHostKey,
  type DojoChallengeDraft,
} from '@/lib/dojoChallenges'
import { cn } from '@/lib/utils'
import type { DojoChallenge, DojoChallengeStatus } from '@/types'

const FIELD =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-[var(--accent-ring)] focus:border-[var(--accent-500)] focus:ring-1'

const MEMBER_COLORS = ['#d97706', '#8b5cf6', '#10b981', '#3b82f6', '#f43f5e', '#14b8a6', '#eab308', '#ec4899']

function emptyDraft(): DojoChallengeDraft {
  return {
    title: '',
    description: '',
    status: 'open',
    starts_on: null,
    ends_on: null,
  }
}

function draftFromChallenge(challenge: DojoChallenge): DojoChallengeDraft {
  return {
    id: challenge.id,
    title: challenge.title,
    description: challenge.description,
    status: challenge.status,
    starts_on: challenge.starts_on,
    ends_on: challenge.ends_on,
  }
}

export function DojoChallengesPage() {
  const [challenges, setChallenges] = useState<DojoChallenge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(() => getSavedDojoName())
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [hostUnlocked, setHostUnlocked] = useState(() => Boolean(getStoredHostKey()))
  const [editingChallenge, setEditingChallenge] = useState<DojoChallenge | null>(null)
  const [shared, setShared] = useState(true)

  const reload = useCallback(async () => {
    try {
      const next = await fetchDojoChallenges()
      setChallenges(next)
      setShared(isDojoChallengesShared())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load challenges')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    return subscribeDojoChallenges(() => {
      void reload()
    })
  }, [reload])

  const openChallenges = useMemo(
    () => challenges.filter((challenge) => challenge.status === 'open'),
    [challenges],
  )
  const closedChallenges = useMemo(
    () => challenges.filter((challenge) => challenge.status === 'closed'),
    [challenges],
  )

  const handleJoin = async (challengeId: string) => {
    setJoiningId(challengeId)
    setError(null)
    try {
      await joinDojoChallenge(challengeId, name)
      saveDojoName(name)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join')
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#06060b] px-4 py-8 text-zinc-100">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-600)]/20 text-[var(--accent-300)]">
            <Swords size={22} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Dojo</h1>
          <p className="mt-1 text-sm text-zinc-500">
            No account needed. Fill in your name and join.
          </p>
        </header>

        {error && (
          <p className="mb-4 rounded-xl border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        {!shared && !loading && (
          <p className="mb-4 rounded-xl border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
            Challenges are on this device until the shared table is set up. Run{' '}
            <code className="text-amber-100">supabase/migrations/005_dojo_challenges.sql</code>.
          </p>
        )}

        {loading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading challenges…</p>
        ) : (
          <div className="space-y-4">
            <AdminPanel
              unlocked={hostUnlocked}
              challenges={challenges}
              initial={editingChallenge}
              onUnlocked={() => setHostUnlocked(true)}
              onLock={() => {
                clearStoredHostKey()
                setHostUnlocked(false)
                setEditingChallenge(null)
              }}
              onSaved={async () => {
                setEditingChallenge(null)
                await reload()
              }}
            />

            {openChallenges.map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                name={name}
                onNameChange={setName}
                joining={joiningId === challenge.id}
                hostUnlocked={hostUnlocked}
                onJoin={() => void handleJoin(challenge.id)}
                onChanged={() => void reload()}
                onStartEdit={() => setEditingChallenge(challenge)}
              />
            ))}
            {closedChallenges.length > 0 && (
              <section className="space-y-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-600">Closed</p>
                {closedChallenges.map((challenge) => (
                  <ChallengeCard
                    key={challenge.id}
                    challenge={challenge}
                    name={name}
                    onNameChange={setName}
                    joining={false}
                    hostUnlocked={hostUnlocked}
                    onJoin={() => undefined}
                    onChanged={() => void reload()}
                    onStartEdit={() => setEditingChallenge(challenge)}
                  />
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ChallengeCard({
  challenge,
  name,
  onNameChange,
  joining,
  hostUnlocked,
  onJoin,
  onChanged,
  onStartEdit,
}: {
  challenge: DojoChallenge
  name: string
  onNameChange: (value: string) => void
  joining: boolean
  hostUnlocked: boolean
  onJoin: () => void
  onChanged: () => void
  onStartEdit: () => void
}) {
  const joined = memberJoinedAs(challenge, name)
  const dates = formatChallengeDates(challenge)
  const open = challenge.status === 'open'

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-100">{challenge.title}</h2>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                open ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800 text-zinc-500',
              )}
            >
              {open ? 'Open' : 'Closed'}
            </span>
          </div>
          {dates && <p className="mt-0.5 text-[11px] text-zinc-500">{dates}</p>}
        </div>
        {hostUnlocked && (
          <button
            type="button"
            onClick={onStartEdit}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label={`Edit ${challenge.title}`}
          >
            <Pencil size={14} />
          </button>
        )}
      </div>

      {challenge.description.trim() && (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
          {challenge.description}
        </p>
      )}

      <div className="mt-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {challenge.members.length} joined
        </p>
        {challenge.members.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-600">Nobody yet — be first.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {challenge.members.map((member, index) => {
              const color = MEMBER_COLORS[index % MEMBER_COLORS.length]
              return (
                <li
                  key={member.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950/80 py-1 pl-1 pr-2.5 text-xs text-zinc-200"
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-zinc-950"
                    style={{ backgroundColor: color }}
                  >
                    {member.name.slice(0, 1).toUpperCase()}
                  </span>
                  {member.name}
                  {hostUnlocked && (
                    <button
                      type="button"
                      aria-label={`Remove ${member.name}`}
                      className="ml-0.5 text-zinc-600 hover:text-red-400"
                      onClick={() => {
                        void removeDojoChallengeMember(member.id)
                          .then(onChanged)
                          .catch((err: unknown) => {
                            window.alert(err instanceof Error ? err.message : 'Could not remove')
                          })
                      }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {open && (
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            onJoin()
          }}
        >
          {joined ? (
            <p className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
              You’re in as <span className="font-semibold">{name.trim()}</span>
            </p>
          ) : (
            <>
              <input
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                className={cn(FIELD, 'sm:flex-1')}
                placeholder="Your name"
                maxLength={40}
                aria-label="Your name"
              />
              <Button type="submit" disabled={joining || !name.trim()} className="shrink-0">
                {joining ? 'Joining…' : 'Join'}
              </Button>
            </>
          )}
        </form>
      )}
    </Card>
  )
}

function AdminPanel({
  unlocked,
  challenges,
  initial,
  onUnlocked,
  onLock,
  onSaved,
}: {
  unlocked: boolean
  challenges: DojoChallenge[]
  initial: DojoChallenge | null
  onUnlocked: () => void
  onLock: () => void
  onSaved: () => Promise<void>
}) {
  const [keyInput, setKeyInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<DojoChallengeDraft>(() =>
    initial ? draftFromChallenge(initial) : emptyDraft(),
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(initial ? draftFromChallenge(initial) : emptyDraft())
  }, [initial])

  const handleUnlock = async (event: FormEvent) => {
    event.preventDefault()
    setChecking(true)
    setError(null)
    try {
      const ok = await verifyDojoHostKey(keyInput)
      if (!ok) {
        setError('Wrong admin password')
        return
      }
      onUnlocked()
      setKeyInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify password')
    } finally {
      setChecking(false)
    }
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await upsertDojoChallenge(draft)
      await onSaved()
      setDraft(emptyDraft())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this challenge?')) return
    setSaving(true)
    setError(null)
    try {
      await deleteDojoChallenge(id)
      await onSaved()
      if (draft.id === id) setDraft(emptyDraft())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">
            {unlocked ? (draft.id ? 'Edit challenge' : 'Admin — set the challenge') : 'Admin login'}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {unlocked
              ? 'You decide what people join. Everyone else just fills in a name.'
              : 'Unlock to create or change the challenge.'}
          </p>
        </div>
        {unlocked && (
          <Button type="button" variant="ghost" size="sm" onClick={onLock}>
            Lock
          </Button>
        )}
      </div>

      {!unlocked ? (
        <form className="mt-4 space-y-3" onSubmit={(event) => void handleUnlock(event)}>
          <input
            type="password"
            autoComplete="current-password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            className={FIELD}
            placeholder="Admin password"
            aria-label="Admin password"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button type="submit" disabled={checking || !keyInput.trim()} className="w-full">
            {checking ? 'Checking…' : 'Log in'}
          </Button>
        </form>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={(event) => void handleSave(event)}>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">Title</span>
            <input
              value={draft.title}
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
              className={FIELD}
              placeholder="What the challenge is called"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">The challenge</span>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              className={cn(FIELD, 'min-h-[6rem] resize-y')}
              placeholder="What people are signing up for"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-zinc-400">Starts</span>
              <input
                type="date"
                value={draft.starts_on ?? ''}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, starts_on: e.target.value || null }))
                }
                className={FIELD}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-zinc-400">Ends</span>
              <input
                type="date"
                value={draft.ends_on ?? ''}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, ends_on: e.target.value || null }))
                }
                className={FIELD}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">Status</span>
            <select
              value={draft.status}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, status: e.target.value as DojoChallengeStatus }))
              }
              className={FIELD}
            >
              <option value="open">Open — people can join</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || !draft.title.trim()}>
              {saving ? 'Saving…' : draft.id ? 'Save' : 'Create'}
            </Button>
            {draft.id && (
              <Button type="button" variant="ghost" onClick={() => setDraft(emptyDraft())}>
                New instead
              </Button>
            )}
            {draft.id && (
              <Button type="button" variant="danger" onClick={() => void handleDelete(draft.id!)}>
                <Trash2 size={14} />
                Delete
              </Button>
            )}
          </div>

          {challenges.length > 0 && (
            <div className="border-t border-zinc-800 pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                All challenges
              </p>
              <ul className="mt-2 space-y-1">
                {challenges.map((challenge) => (
                  <li key={challenge.id}>
                    <button
                      type="button"
                      onClick={() => setDraft(draftFromChallenge(challenge))}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zinc-900',
                        draft.id === challenge.id && 'bg-zinc-900 text-[var(--accent-300)]',
                      )}
                    >
                      <span className="truncate">{challenge.title}</span>
                      <span className="ml-2 shrink-0 text-[11px] text-zinc-500">
                        {challenge.members.length} in
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      )}
    </Card>
  )
}
