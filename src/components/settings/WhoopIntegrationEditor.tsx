import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SettingsSection } from '@/components/settings/SettingsControls'
import {
  buildWhoopAuthorizeUrl,
  createWhoopOAuthState,
  revokeWhoopAccess,
  WhoopApiError,
} from '@/lib/whoopApi'
import {
  clearWhoopConfig,
  clearWhoopTokens,
  getWhoopCredentials,
  isWhoopConnected,
  saveWhoopCredentials,
  WHOOP_CHANGED,
  WHOOP_OAUTH_RESULT_KEY,
  WHOOP_OAUTH_STATE_KEY,
  whoopDisplayName,
  whoopRedirectUri,
} from '@/lib/whoopStore'

interface WhoopIntegrationEditorProps {
  onSaved?: () => void
}

export function WhoopIntegrationEditor({ onSaved }: WhoopIntegrationEditorProps) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [connected, setConnected] = useState(() => isWhoopConnected())
  const [displayName, setDisplayName] = useState(() => whoopDisplayName())
  const [hasCredentials, setHasCredentials] = useState(() => Boolean(getWhoopCredentials()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMessage, setOkMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const redirectUri = useMemo(() => whoopRedirectUri(), [])

  useEffect(() => {
    const sync = () => {
      setConnected(isWhoopConnected())
      setDisplayName(whoopDisplayName())
      setHasCredentials(Boolean(getWhoopCredentials()))
    }
    window.addEventListener(WHOOP_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(WHOOP_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [])

  useEffect(() => {
    try {
      const result = sessionStorage.getItem(WHOOP_OAUTH_RESULT_KEY)
      if (!result) return
      sessionStorage.removeItem(WHOOP_OAUTH_RESULT_KEY)
      if (result === 'ok') {
        setOkMessage('Connected to WHOOP')
        setConnected(true)
        setDisplayName(whoopDisplayName())
        onSaved?.()
      } else {
        setError(result)
      }
    } catch {
      /* ignore */
    }
  }, [onSaved])

  const handleConnect = async () => {
    const existing = getWhoopCredentials()
    const nextId = clientId.trim() || existing?.clientId || ''
    const nextSecret = clientSecret.trim() || existing?.clientSecret || ''
    if (!nextId || !nextSecret) {
      setError('Enter your WHOOP client ID and client secret')
      return
    }

    setSaving(true)
    setError(null)
    setOkMessage(null)
    try {
      saveWhoopCredentials({ clientId: nextId, clientSecret: nextSecret })
      const state = createWhoopOAuthState()
      sessionStorage.setItem(WHOOP_OAUTH_STATE_KEY, state)
      window.location.assign(
        buildWhoopAuthorizeUrl({
          clientId: nextId,
          redirectUri,
          state,
        }),
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not start WHOOP authorization.'
      setError(message)
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    setSaving(true)
    setError(null)
    setOkMessage(null)
    try {
      await revokeWhoopAccess()
    } catch (err) {
      if (!(err instanceof WhoopApiError && err.status === 401)) {
        const message = err instanceof Error ? err.message : 'Could not revoke WHOOP access'
        setError(message)
        setSaving(false)
        return
      }
    }
    clearWhoopTokens()
    setConnected(false)
    setDisplayName(null)
    setOkMessage('Disconnected')
    setSaving(false)
    onSaved?.()
  }

  const handleRemoveCredentials = async () => {
    if (isWhoopConnected()) {
      try {
        await revokeWhoopAccess()
      } catch {
        /* still wipe local credentials */
      }
    }
    clearWhoopConfig()
    setClientId('')
    setClientSecret('')
    setConnected(false)
    setHasCredentials(false)
    setDisplayName(null)
    setError(null)
    setOkMessage('Removed WHOOP credentials')
    onSaved?.()
  }

  const handleCopyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Could not copy the redirect URL')
    }
  }

  return (
    <SettingsSection
      title="WHOOP"
      description="Pull recovery, sleep, and strain onto Home and into Pulse. Create an app in the WHOOP Developer Dashboard, enable the scopes below, then authorize Dojo."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={
              connected
                ? 'rounded-full bg-emerald-500/15 px-2.5 py-1 font-medium text-emerald-300'
                : 'rounded-full bg-zinc-800 px-2.5 py-1 font-medium text-zinc-400'
            }
          >
            {connected
              ? displayName
                ? `Connected · ${displayName}`
                : 'Connected'
              : 'Not connected'}
          </span>
          <a
            href="https://developer-dashboard.whoop.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-zinc-400 transition-colors hover:text-zinc-200"
          >
            WHOOP developer dashboard
            <ExternalLink size={12} />
          </a>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-zinc-400">Redirect URL</span>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] text-zinc-300">
              {redirectUri}
            </code>
            <button
              type="button"
              onClick={() => void handleCopyRedirect()}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-700/80 px-2.5 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-600">
            Add this exact URL as a Redirect URI on your WHOOP app. Local and production hosts are
            different — add both if you use Dojo in more than one place.
          </p>
          <p className="text-[11px] leading-relaxed text-zinc-600">
            On the same app, enable these scopes: <code className="text-zinc-400">offline</code>,{' '}
            <code className="text-zinc-400">read:profile</code>,{' '}
            <code className="text-zinc-400">read:recovery</code>,{' '}
            <code className="text-zinc-400">read:cycles</code>,{' '}
            <code className="text-zinc-400">read:sleep</code>,{' '}
            <code className="text-zinc-400">read:workout</code>. Then reconnect — client ID and
            secret alone are not enough.
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-400">Client ID</span>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value)
              setError(null)
              setOkMessage(null)
            }}
            placeholder={hasCredentials ? 'Saved · paste a new ID to replace' : 'WHOOP client ID'}
            className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-500)]"
            aria-label="WHOOP client ID"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-400">Client secret</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={clientSecret}
            onChange={(e) => {
              setClientSecret(e.target.value)
              setError(null)
              setOkMessage(null)
            }}
            placeholder={
              hasCredentials ? 'Saved · paste a new secret to replace' : 'WHOOP client secret'
            }
            className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-500)]"
            aria-label="WHOOP client secret"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void handleConnect()}
            disabled={saving || (!clientId.trim() && !clientSecret.trim() && !hasCredentials)}
            className="shrink-0"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Connecting
              </>
            ) : connected ? (
              'Reconnect'
            ) : (
              'Connect WHOOP'
            )}
          </Button>
        </div>

        {connected && (
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            className="text-xs text-zinc-500 transition-colors hover:text-red-400"
          >
            Disconnect WHOOP
          </button>
        )}

        {(hasCredentials || connected) && (
          <button
            type="button"
            onClick={() => void handleRemoveCredentials()}
            className="block text-xs text-zinc-600 transition-colors hover:text-red-400"
          >
            Remove app credentials
          </button>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
        {okMessage && !error && <p className="text-xs text-emerald-400">{okMessage}</p>}

        <p className="text-[11px] leading-relaxed text-zinc-600">
          Client ID, secret, and tokens are stored in your Dojo account storage (synced when signed
          in). Token refresh goes through a same-origin proxy. If the secret was exposed, rotate it
          in the WHOOP dashboard.
        </p>
      </div>
    </SettingsSection>
  )
}
