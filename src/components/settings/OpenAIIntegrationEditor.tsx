import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { SettingsSection } from '@/components/settings/SettingsControls'
import {
  DEFAULT_OPENAI_MODEL,
  getOpenAIModel,
  OPENAI_CHANGED,
  OPENAI_MODELS,
  saveOpenAIModel,
} from '@/lib/openaiStore'

interface OpenAIIntegrationEditorProps {
  onSaved?: () => void
}

export function OpenAIIntegrationEditor({ onSaved }: OpenAIIntegrationEditorProps) {
  const [model, setModel] = useState(() => getOpenAIModel())
  const [savedModel, setSavedModel] = useState(() => getOpenAIModel())

  useEffect(() => {
    const sync = () => {
      const next = getOpenAIModel()
      setModel(next)
      setSavedModel(next)
    }
    window.addEventListener(OPENAI_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(OPENAI_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [])

  return (
    <SettingsSection
      title="ChatGPT"
      description="Coaching, insights, and contract proof use this site's ChatGPT. Pick which model to use."
    >
      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-400">Model</span>
          <select
            value={OPENAI_MODELS.some((item) => item.id === model) ? model : DEFAULT_OPENAI_MODEL}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[var(--accent-500)]"
          >
            {OPENAI_MODELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          onClick={() => {
            const next = saveOpenAIModel(model)
            setSavedModel(next)
            onSaved?.()
          }}
          disabled={model === savedModel}
          className="shrink-0"
        >
          Save model
        </Button>
      </div>
    </SettingsSection>
  )
}
