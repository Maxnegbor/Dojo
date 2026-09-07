import { useEffect, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SettingsSection } from '@/components/settings/SettingsControls'
import { verifyOpenAIApiKey } from '@/lib/openaiApi'
import {
  clearOpenAIConfig,
  DEFAULT_OPENAI_MODEL,
  getOpenAIApiKey,
  getOpenAIModel,
  OPENAI_CHANGED,
  OPENAI_MODELS,
  saveOpenAIConfig,
} from '@/lib/openaiStore'

interface OpenAIIntegrationEditorProps {
  onSaved?: () => void
}

export function OpenAIIntegrationEditor({ onSaved }: OpenAIIntegrationEditorProps) {
  const [keyInput, setKeyInput] = useState('')
  const [model, setModel] = useState(() => getOpenAIModel())
  const [connected, setConnected] = useState(() => Boolean(getOpenAIApiKey()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMessage, setOkMessage] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => {
      setConnected(Boolean(getOpenAIApiKey()))
      setModel(getOpenAIModel())
    }
    window.addEventListener(OPENAI_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(OPENAI_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [])

  const handleConnect = async () => {
    const apiKey = keyInput.trim() || getOpenAIApiKey()
    if (!apiKey) {
      setError('Paste your OpenAI API key')
      return
    }
    setSaving(true)
    setError(null)
    setOkMessage(null)
    try {
      if (keyInput.trim()) await verifyOpenAIApiKey(apiKey)
      saveOpenAIConfig({ apiKey, model: model || DEFAULT_OPENAI_MODEL })
      setKeyInput('')
      setConnected(true)
      setOkMessage(keyInput.trim() ? 'Connected to ChatGPT' : 'Model saved')
      onSaved?.()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not connect. Check the API key and try again.'
      setError(message)
      setConnected(Boolean(getOpenAIApiKey()))
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = () => {
    clearOpenAIConfig()
    setConnected(false)
    setKeyInput('')
    setError(null)
    setOkMessage('Disconnected')
    onSaved?.()
  }

  return (
    <SettingsSection
      title="ChatGPT"
      description="Use OpenAI for morning, midday, and evening coaching on Home, plus insight summaries on Overview. Create a secret key at platform.openai.com."
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
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-zinc-400 transition-colors hover:text-zinc-200"
          >
            Open OpenAI API keys
            <ExternalLink size={12} />
          </a>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-400">Model</span>
          <select
            value={OPENAI_MODELS.some((item) => item.id === model) ? model : DEFAULT_OPENAI_MODEL}
            onChange={(e) => {
              setModel(e.target.value)
              setOkMessage(null)
            }}
            className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[var(--accent-500)]"
          >
            {OPENAI_MODELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

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
            placeholder={connected ? 'Paste a new key to replace' : 'Paste API key (sk-...)'}
            className="min-w-0 flex-1 rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-500)]"
            aria-label="OpenAI API key"
          />
          <Button
            onClick={() => void handleConnect()}
            disabled={saving || (!keyInput.trim() && !connected)}
            className="shrink-0"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Connecting
              </>
            ) : connected && !keyInput.trim() ? (
              'Save model'
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
            Disconnect ChatGPT
          </button>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
        {okMessage && !error && <p className="text-xs text-emerald-400">{okMessage}</p>}

        <p className="text-[11px] leading-relaxed text-zinc-600">
          Your key is stored in your Dojo account storage (synced when signed in) and sent to OpenAI
          through a same-origin proxy. Never share it publicly — if it was exposed, revoke it in
          OpenAI and paste a new one.
        </p>
      </div>
    </SettingsSection>
  )
}
