import { useEffect, useState } from 'react'
import { SettingsSection } from '@/components/settings/SettingsControls'
import {
  COACH_CHANGED,
  COACH_SLOT_LABELS,
  COACH_SLOTS,
  getCoachSchedule,
  isCoachScheduleOrdered,
  saveCoachSchedule,
  type CoachSchedule,
} from '@/lib/coachStore'

interface SettingsCoachEditorProps {
  onSaved?: () => void
}

export function SettingsCoachEditor({ onSaved }: SettingsCoachEditorProps) {
  const [schedule, setSchedule] = useState<CoachSchedule>(() => getCoachSchedule())

  useEffect(() => {
    const sync = () => setSchedule(getCoachSchedule())
    window.addEventListener(COACH_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(COACH_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [])

  const updateSlot = (key: keyof CoachSchedule, value: string) => {
    const next = { ...schedule, [key]: value || schedule[key] }
    setSchedule(next)
    saveCoachSchedule(next)
    onSaved?.()
  }

  const ordered = isCoachScheduleOrdered(schedule)

  return (
    <SettingsSection
      title="Daily coaching"
      description="Coach writes three short check-ins a day on Home: morning, midday, and evening. Times use your local clock."
    >
      <div className="space-y-3">
        {COACH_SLOTS.map((slot) => (
          <label key={slot} className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-400">{COACH_SLOT_LABELS[slot]}</span>
            <input
              type="time"
              value={schedule[slot]}
              onChange={(e) => updateSlot(slot, e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-[var(--accent-500)] focus:outline-none"
            />
          </label>
        ))}
        {!ordered ? (
          <p className="text-xs text-amber-400/90">
            Morning should be before midday, and midday before evening.
          </p>
        ) : (
          <p className="text-[11px] leading-relaxed text-zinc-500">
            When Home is open at or after a time, that check-in generates if it is not already saved
            for today.
          </p>
        )}
      </div>
    </SettingsSection>
  )
}
