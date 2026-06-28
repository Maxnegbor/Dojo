import { useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { AccentPicker } from '@/components/settings/AccentPicker'
import {
  SegmentedControl,
  SettingsSection,
  ToggleRow,
} from '@/components/settings/SettingsControls'
import { TimelineRangePicker } from '@/components/settings/TimelineRangePicker'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useSettings } from '@/context/SettingsContext'
import { FRESH_START_QUOTE, resetAllAppData } from '@/lib/resetApp'

export function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettings()
  const [saved, setSaved] = useState(false)
  const [confirmFullReset, setConfirmFullReset] = useState(false)

  const flashSaved = () => {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  const handleReset = () => {
    resetSettings()
    flashSaved()
  }

  const handleFullReset = () => {
    resetAllAppData()
    window.location.reload()
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
          <p className="text-xs text-zinc-500">Make Dojo yours — changes apply instantly</p>
        </div>
        {saved && (
          <span className="rounded-full bg-emerald-950/60 px-2.5 py-1 text-[10px] font-medium text-emerald-400">
            Saved
          </span>
        )}
      </header>

      <Card>
        <SettingsSection
          title="Appearance"
          description="Colors and layout across the app"
        >
          <AccentPicker
            value={settings.accentColor}
            onChange={(accentColor) => {
              updateSettings({ accentColor })
              flashSaved()
            }}
          />
          <ToggleRow
            label="Focus badge in header"
            description="Show today's focus time in the top bar"
            checked={settings.showFocusBadge}
            onChange={(showFocusBadge) => {
              updateSettings({ showFocusBadge })
              flashSaved()
            }}
          />
        </SettingsSection>
      </Card>

      <Card>
        <SettingsSection title="Calendar & time" description="How dates and clocks are shown">
          <SegmentedControl
            label="Week starts on"
            value={settings.weekStartsOn === 0 ? 'sun' : 'mon'}
            options={[
              { value: 'sun', label: 'Sunday' },
              { value: 'mon', label: 'Monday' },
            ]}
            onChange={(v) => {
              updateSettings({ weekStartsOn: v === 'sun' ? 0 : 1 })
              flashSaved()
            }}
          />
          <SegmentedControl
            label="Time format"
            value={settings.timeFormat}
            options={[
              { value: '12h', label: '12-hour' },
              { value: '24h', label: '24-hour' },
            ]}
            onChange={(timeFormat) => {
              updateSettings({ timeFormat })
              flashSaved()
            }}
          />
          <TimelineRangePicker
            startHour={settings.timelineStartHour}
            endHour={settings.timelineEndHour}
            onChange={(range) => {
              updateSettings(range)
              flashSaved()
            }}
          />
        </SettingsSection>
      </Card>

      <Card>
        <SettingsSection title="Units" description="Measurement preferences for logging">
          <SegmentedControl
            label="Weight"
            value={settings.weightUnit}
            options={[
              { value: 'kg', label: 'Kilograms' },
              { value: 'lb', label: 'Pounds' },
            ]}
            onChange={(weightUnit) => {
              updateSettings({ weightUnit })
              flashSaved()
            }}
          />
        </SettingsSection>
      </Card>

      <Card>
        <SettingsSection title="Notifications">
          <ToggleRow
            label="Timer sounds"
            description="Play a chime when a focus or break phase ends"
            checked={settings.timerSoundEnabled}
            onChange={(timerSoundEnabled) => {
              updateSettings({ timerSoundEnabled })
              flashSaved()
            }}
          />
        </SettingsSection>
      </Card>

      <Card>
        <SettingsSection title="Reset preferences">
          <p className="text-xs text-zinc-500">
            Restore appearance, calendar, and display preferences to defaults. Your logs and goals
            are kept.
          </p>
          <Button
            variant="secondary"
            onClick={handleReset}
            className="w-full sm:w-auto"
          >
            <RotateCcw size={14} />
            Reset app settings
          </Button>
        </SettingsSection>
      </Card>

      <Card className="border-red-950/50">
        <SettingsSection title="Start over">
          <p className="text-xs text-zinc-500">
            Erase everything on this device — daily logs, workouts, schedule blocks, reminders,
            custom goals, drafts, and all settings. This cannot be undone.
          </p>
          <blockquote className="border-l-2 border-[var(--accent-500)]/40 py-1 pl-3 text-sm italic leading-relaxed text-zinc-400">
            {FRESH_START_QUOTE}
          </blockquote>
          {!confirmFullReset ? (
            <Button
              variant="danger"
              onClick={() => setConfirmFullReset(true)}
              className="w-full sm:w-auto"
            >
              <Trash2 size={14} />
              Reset everything
            </Button>
          ) : (
            <div className="space-y-2 rounded-xl border border-red-900/40 bg-red-950/20 p-3">
              <p className="text-xs text-red-300">Are you sure? All your data will be permanently deleted.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" onClick={handleFullReset}>
                  Yes, wipe it all
                </Button>
                <Button variant="secondary" onClick={() => setConfirmFullReset(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </SettingsSection>
      </Card>
    </div>
  )
}
