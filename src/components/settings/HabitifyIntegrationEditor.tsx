import { useEffect, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SettingsSection } from '@/components/settings/SettingsControls'
import { verifyHabitifyApiKey } from '@/lib/habitifyApi'
import {
  clearHabitifyConfig,
  getHabitifyApiKey,
  HABITIFY_CHANGED,
  saveHabitifyConfig,
} from '@/lib/habitifyStore'

interface HabitifyIntegrationEditorProps {
  onSaved?: () => void
}

export function HabitifyIntegrationEditor({ onSaved }: HabitifyIntegrationEditorProps) {
  const [keyInput, setKeyInput] = useState('')
  const [connected, setConnected] = useState(() => Boolean(getHabitifyApiKey()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMessage, setOkMessage] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => {
      setConnected(Boolean(getHabitifyApiKey()))
    }
    window.addEventListener(HABITIFY_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(HABITIFY_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [])

  const handleConnect = async () => {
    const apiKey = keyInput.trim()
    if (!apiKey) {
      setError('Paste your Habitify API key')
      return
    }
    setSaving(true)
    setError(null)
    setOkMessage(null)
    try {
      await verifyHabitifyApiKey(apiKey)
      saveHabitifyConfig({ apiKey })
      setKeyInput('')
      setConnected(true)
      setOkMessage('Connected to Habitify')
      onSaved?.()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not connect. Check the key and try again.'
      setError(message)
      setConnected(Boolean(getHabitifyApiKey()))
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = () => {
    clearHabitifyConfig()
    setConnected(false)
    setKeyInput('')
    setError(null)
    setOkMessage('Disconnected')
    onSaved?.()
  }

  return (
    <SettingsSection
      title="Habitify"
      description="Show today’s Habitify journal on Home. Generate a V2 API key in the Habitify mobile app → Settings → API Credentials."
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
            href="https://intercom.help/habitify-app/en/articles/6113937-use-habitify-api-v2"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-zinc-400 transition-colors hover:text-zinc-200"
          >
            Habitify API guide
            <ExternalLink size={12} />
          </a>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={keyInput}
            onChange={(e) => {
              setKeyInput(e.target.value)
              setError(null)
              setOkMessage(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleConnect()
            }}
            placeholder={connected ? 'Paste a new key to replace' : 'Paste API key'}
            className="min-w-0 flex-1 rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-500)]"
            aria-label="Habitify API key"
          />
          <Button
            onClick={() => void handleConnect()}
            disabled={saving || !keyInput.trim()}
            className="shrink-0"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Connecting
              </>
            ) : connected ? (
              'Update key'
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
            Disconnect Habitify
          </button>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
        {okMessage && !error && <p className="text-xs text-emerald-400">{okMessage}</p>}

        <p className="text-[11px] leading-relaxed text-zinc-600">
          Your key is stored in your Dojo account storage (synced when signed in). Use a V2 key
          (`hb_…`). Never share it publicly — if it was exposed, regenerate it in Habitify.
        </p>
      </div>
    </SettingsSection>
  )
}
