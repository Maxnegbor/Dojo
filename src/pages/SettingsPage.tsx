import { useEffect, useState } from 'react'
import { Database, LogOut, RotateCcw, Trash2 } from 'lucide-react'
import { AccentPicker } from '@/components/settings/AccentPicker'
import {
  SegmentedControl,
  SettingsSection,
  ToggleRow,
} from '@/components/settings/SettingsControls'
import { SettingsDeveloperTab } from '@/components/settings/SettingsDeveloperTab'
import { SettingsWeeklyShutdownEditor } from '@/components/settings/SettingsWeeklyShutdownEditor'
import { SettingsDailyChecklistEditor } from '@/components/settings/SettingsDailyChecklistEditor'
import { TimelineRangePicker } from '@/components/settings/TimelineRangePicker'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { resetAllAppData } from '@/lib/resetApp'
import { seedDemoData } from '@/lib/seedDemoData'
import { isSupabaseConfigured } from '@/lib/supabase'

export function SettingsPage() {
  const { email, signOut, userId } = useAuth()
  const { settings, updateSettings, resetSettings } = useSettings()
  const [saved, setSaved] = useState(false)
  const [confirmFullReset, setConfirmFullReset] = useState(false)
  const [confirmSampleData, setConfirmSampleData] = useState(false)
  const [sampleSummary, setSampleSummary] = useState<string | null>(null)
  const [settingsTab, setSettingsTab] = useState<'general' | 'developer'>('general')

  useEffect(() => {
    if (!settings.devMode && settingsTab === 'developer') {
      setSettingsTab('general')
    }
  }, [settings.devMode, settingsTab])

  const flashSaved = () => {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  const handleReset = () => {
    resetSettings()
    flashSaved()
  }

  const handleFullReset = async () => {
    await resetAllAppData(userId)
    window.location.reload()
  }

  const handleLoadSampleData = () => {
    if (!userId || isSupabaseConfigured) return
    const result = seedDemoData(userId)
    setSampleSummary(`Loaded ${result.logs} daily logs and ${result.workouts} workouts.`)
    setConfirmSampleData(false)
    window.setTimeout(() => window.location.reload(), 800)
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

      <SegmentedControl
        value={settingsTab}
        options={[
          { value: 'general', label: 'General' },
          ...(settings.devMode ? [{ value: 'developer' as const, label: 'Developer' }] : []),
        ]}
        onChange={(tab) => setSettingsTab(tab as 'general' | 'developer')}
      />

      {settingsTab === 'developer' && settings.devMode ? (
        <Card>
          <SettingsDeveloperTab />
        </Card>
      ) : (
        <>
      <Card>
        <SettingsSection
          title="Account"
          description={
            isSupabaseConfigured
              ? 'Signed in with Supabase'
              : 'Local account — stored in this browser'
          }
        >
          {email && (
            <p className="text-sm text-zinc-300">{email}</p>
          )}
          <Button
            variant="secondary"
            onClick={() => signOut()}
            className="w-full sm:w-auto"
          >
            <LogOut size={14} />
            Sign out
          </Button>
        </SettingsSection>
      </Card>

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
        <SettingsSection title="Metrics" description="What you track in goals and daily log">
          <ToggleRow
            label="Show workouts"
            description="Workout types on Metrics and workout logging at shutdown"
            checked={settings.showWorkoutMetrics}
            onChange={(showWorkoutMetrics) => {
              updateSettings({ showWorkoutMetrics })
              flashSaved()
            }}
          />
        </SettingsSection>
      </Card>

      <Card>
        <SettingsSection
          title="Morning log checklist"
          description="Optional checkboxes shown after you save your morning log"
        >
          <SettingsDailyChecklistEditor
            checklist={settings.morningLogChecklist}
            onChange={(morningLogChecklist) => updateSettings({ morningLogChecklist })}
            onSaved={flashSaved}
            emptyHint="No morning checklist yet. Add sections to show optional checkboxes after logging sleep."
          />
        </SettingsSection>
      </Card>

      <Card>
        <SettingsSection
          title="Daily shutdown checklist"
          description="Optional checkboxes shown after shutdown logging, before goal progress"
        >
          <SettingsDailyChecklistEditor
            checklist={settings.dailyShutdownChecklist}
            onChange={(dailyShutdownChecklist) => updateSettings({ dailyShutdownChecklist })}
            onSaved={flashSaved}
            emptyHint="No shutdown checklist yet. Add sections to show optional checkboxes after logging."
          />
        </SettingsSection>
      </Card>

      <Card>
        <SettingsSection
          title="Weekly shutdown"
          description="Customize the checklist shown when you close out your week"
        >
          <SettingsWeeklyShutdownEditor
            checklist={settings.weeklyShutdownChecklist}
            onChange={(weeklyShutdownChecklist) => updateSettings({ weeklyShutdownChecklist })}
            onSaved={flashSaved}
          />
        </SettingsSection>
      </Card>

      <Card>
        <SettingsSection title="Notifications">
          <ToggleRow
            label="Timer sounds"
            description="Chimes for focus timer and break phases"
            checked={settings.timerSoundEnabled}
            onChange={(timerSoundEnabled) => {
              updateSettings({ timerSoundEnabled })
              flashSaved()
            }}
          />
        </SettingsSection>
      </Card>

      {!isSupabaseConfigured && (
        <Card>
          <SettingsSection
            title="Sample data"
            description="Replace local logs, workouts, and goals with ~14 months of realistic demo data for testing Overview."
          >
            {sampleSummary && (
              <p className="text-xs text-emerald-400">{sampleSummary}</p>
            )}
            {!confirmSampleData ? (
              <Button
                variant="secondary"
                onClick={() => setConfirmSampleData(true)}
                className="w-full sm:w-auto"
                disabled={!userId}
              >
                <Database size={14} />
                Load sample data
              </Button>
            ) : (
              <div className="space-y-2 rounded-xl border border-zinc-700/80 bg-zinc-900/60 p-3">
                <p className="text-xs text-zinc-400">
                  This replaces your current logs, workouts, and goals on this device. Continue?
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={handleLoadSampleData}>
                    Load sample data
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmSampleData(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </SettingsSection>
        </Card>
      )}

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
        </>
      )}
    </div>
  )
}
