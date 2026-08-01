import { useEffect, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SettingsSection } from '@/components/settings/SettingsControls'
import { verifyTodoistToken } from '@/lib/todoistApi'
import {
  clearTodoistConfig,
  getTodoistToken,
  saveTodoistConfig,
  TODOIST_CHANGED,
} from '@/lib/todoistStore'

interface TodoistIntegrationEditorProps {
  onSaved?: () => void
}

export function TodoistIntegrationEditor({ onSaved }: TodoistIntegrationEditorProps) {
  const [tokenInput, setTokenInput] = useState('')
  const [connected, setConnected] = useState(() => Boolean(getTodoistToken()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMessage, setOkMessage] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => {
      setConnected(Boolean(getTodoistToken()))
    }
    window.addEventListener(TODOIST_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(TODOIST_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [])

  const handleConnect = async () => {
    const token = tokenInput.trim()
    if (!token) {
      setError('Paste your Todoist API token')
      return
    }
    setSaving(true)
    setError(null)
    setOkMessage(null)
    try {
      await verifyTodoistToken(token)
      saveTodoistConfig({ apiToken: token })
      setTokenInput('')
      setConnected(true)
      setOkMessage('Connected to Todoist')
      onSaved?.()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not connect. Check the token and try again.'
      setError(message)
      setConnected(Boolean(getTodoistToken()))
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = () => {
    clearTodoistConfig()
    setConnected(false)
    setTokenInput('')
    setError(null)
    setOkMessage('Disconnected')
    onSaved?.()
  }

  return (
    <SettingsSection
      title="Todoist"
      description="Show today’s Todoist tasks on Home. Get your token from Todoist → Settings → Integrations → Developer."
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
            {connected ? 'Connected' : 'Not connected'}
          </span>
          <a
            href="https://app.todoist.com/app/settings/integrations/developer"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-zinc-400 transition-colors hover:text-zinc-200"
          >
            Open Todoist developer settings
            <ExternalLink size={12} />
          </a>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={tokenInput}
            onChange={(e) => {
              setTokenInput(e.target.value)
              setError(null)
              setOkMessage(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleConnect()
            }}
            placeholder={connected ? 'Paste a new token to replace' : 'Paste API token'}
            className="min-w-0 flex-1 rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-500)]"
            aria-label="Todoist API token"
          />
          <Button
            onClick={() => void handleConnect()}
            disabled={saving || !tokenInput.trim()}
            className="shrink-0"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Connecting
              </>
            ) : connected ? (
              'Update token'
            ) : (
              'Connect'
            )}
          </Button>
        </div>

        {connected && (
          <button
            type="button"
            onClick={handleDisconnect}
            className="text-xs text-zinc-500 transition-colors hover:text-red-400"
          >
            Disconnect Todoist
          </button>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
        {okMessage && !error && <p className="text-xs text-emerald-400">{okMessage}</p>}

        <p className="text-[11px] leading-relaxed text-zinc-600">
          Your token is stored in your Dojo account storage (synced when signed in). Never share it
          publicly — if it was exposed, regenerate it in Todoist.
        </p>
      </div>
    </SettingsSection>
  )
}
