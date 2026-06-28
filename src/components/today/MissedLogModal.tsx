import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { MetricInput } from '@/components/ui/MetricInput'
import { useSettings } from '@/context/SettingsContext'
import type { DailyLog } from '@/types'
import { dismissMissedLog, isMandatoryLogComplete, isMissedLogDismissed } from '@/lib/dailyLog'
import { clearDraft } from '@/lib/dailyLogDraft'
import { formatWeightValue, parseWeightInput } from '@/lib/settingsStore'
import { formatDate } from '@/lib/utils'

interface MissedLogModalProps {
  date: string
  log: DailyLog | null
  onSave: (updates: Partial<DailyLog>) => Promise<void>
  onDismiss: () => void
}

export function MissedLogModal({ date, log, onSave, onDismiss }: MissedLogModalProps) {
  const { settings } = useSettings()
  const [sleep, setSleep] = useState(log?.sleep_hours?.toString() ?? '')
  const [weight, setWeight] = useState(formatWeightValue(log?.weight, settings.weightUnit))
  const [steps, setSteps] = useState(log?.steps?.toString() ?? '')
  const [screen, setScreen] = useState(log?.screen_time_minutes?.toString() ?? '')
  const [saving, setSaving] = useState(false)

  const formatted = new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  const handleSave = async () => {
    setSaving(true)
    await onSave({
      sleep_hours: sleep ? parseFloat(sleep) : null,
      weight: parseWeightInput(weight, settings.weightUnit),
      steps: steps ? parseInt(steps, 10) : null,
      screen_time_minutes: screen ? parseInt(screen, 10) : null,
    })
    clearDraft(date)
    setSaving(false)
    onDismiss()
  }

  const handleSkip = () => {
    dismissMissedLog(date)
    onDismiss()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-labelledby="missed-log-title"
        className="w-full max-w-md rounded-2xl border border-zinc-700/80 bg-zinc-900 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-950/60 text-amber-400">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 id="missed-log-title" className="text-base font-semibold text-zinc-100">
                Missed log for {formatted}
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Complete yesterday&apos;s health metrics to keep your streak on track.
              </p>
            </div>
          </div>
          <button
            onClick={handleSkip}
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Dismiss"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <MetricInput label="Sleep" unit="hrs" step="0.5" value={sleep} onChange={(e) => setSleep(e.target.value)} />
          <MetricInput label="Weight" unit={settings.weightUnit} step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
          <MetricInput label="Steps" unit="steps" value={steps} onChange={(e) => setSteps(e.target.value)} />
          <MetricInput label="Screentime" unit="min" value={screen} onChange={(e) => setScreen(e.target.value)} />
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={handleSkip}>
            Skip for now
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save log'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function shouldShowMissedLogModal(
  yesterday: string,
  log: DailyLog | null | undefined,
): boolean {
  const today = formatDate(new Date())
  if (yesterday >= today) return false
  if (isMissedLogDismissed(yesterday)) return false
  return !isMandatoryLogComplete(log)
}
