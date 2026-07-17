import { useEffect, useMemo, useState, useCallback, useLayoutEffect, useRef } from 'react'
import { Database, LogOut, RotateCcw, Trash2 } from 'lucide-react'
import { PulseConfigureModal } from '@/components/pulse/PulseConfigureModal'
import { AccentPicker } from '@/components/settings/AccentPicker'
import {
  SegmentedControl,
  SettingsNavButton,
  SettingsSection,
  ToggleRow,
} from '@/components/settings/SettingsControls'
import { SettingsDeveloperTab } from '@/components/settings/SettingsDeveloperTab'
import { SettingsWeeklyShutdownEditor } from '@/components/settings/SettingsWeeklyShutdownEditor'
import { SettingsDailyChecklistEditor } from '@/components/settings/SettingsDailyChecklistEditor'
import { MorningLogMetricsEditor } from '@/components/settings/MorningLogMetricsEditor'
import { ShutdownLogMetricsEditor } from '@/components/settings/ShutdownLogMetricsEditor'
import { TimelineRangePicker } from '@/components/settings/TimelineRangePicker'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { useMorningLogGoalKeys } from '@/hooks/useMorningLogGoalKeys'
import { useMorningLogYesterdayKeys } from '@/hooks/useMorningLogYesterdayKeys'
import { useMorningLogSleepFieldIds } from '@/hooks/useMorningLogSleepFieldIds'
import { useShutdownLogGoalKeys } from '@/hooks/useShutdownLogGoalKeys'
import { useShutdownLogSleepFieldIds } from '@/hooks/useShutdownLogSleepFieldIds'
import { usePulseConfig } from '@/hooks/usePulseConfig'
import { localStore } from '@/lib/localStore'
import type { Goal } from '@/types'
import type { PulseFormula } from '@/lib/pulseConfig'
import { formatDeleteAccountError } from '@/lib/deleteAccount'
import { resetAllAppData } from '@/lib/resetApp'
import { seedDemoData } from '@/lib/seedDemoData'
import { isSupabaseConfigured } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type SettingsSectionId =
  | 'account'
  | 'appearance'
  | 'calendar'
  | 'tracking'
  | 'pulse'
  | 'routines'
  | 'notifications'
  | 'data'
  | 'developer'

export function SettingsPage() {
  const { email, signOut, userId, deleteAccount } = useAuth()
  const { settings, updateSettings, resetSettings } = useSettings()
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()
  const { goalKeys: morningLogGoalKeys, saveGoalKeys: saveMorningLogGoalKeys } = useMorningLogGoalKeys()
  const { yesterdayKeys: morningLogYesterdayKeys, saveYesterdayKeys: saveMorningLogYesterdayKeys } =
    useMorningLogYesterdayKeys()
  const { sleepFieldIds: morningLogSleepFieldIds, saveSleepFieldIds: saveMorningLogSleepFieldIds } =
    useMorningLogSleepFieldIds()
  const { goalKeys: shutdownLogGoalKeys, saveGoalKeys: saveShutdownLogGoalKeys } =
    useShutdownLogGoalKeys()
  const { sleepFieldIds: shutdownLogSleepFieldIds, saveSleepFieldIds: saveShutdownLogSleepFieldIds } =
    useShutdownLogSleepFieldIds()
  const { configured: pulseConfigured, currentFormula, saveFormula } = usePulseConfig()
  const [goals, setGoals] = useState<Goal[]>([])
  const [showPulseConfigure, setShowPulseConfigure] = useState(false)
  const [pulseFormulaNotice, setPulseFormulaNotice] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmFullReset, setConfirmFullReset] = useState(false)
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false)
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState('')
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [confirmSampleData, setConfirmSampleData] = useState(false)
  const [sampleSummary, setSampleSummary] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('account')
  const [morningLogPickerOpen, setMorningLogPickerOpen] = useState(false)
  const [shutdownLogPickerOpen, setShutdownLogPickerOpen] = useState(false)
  const settingsLayoutRef = useRef<HTMLDivElement>(null)
  const mainScrollTopRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const layout = settingsLayoutRef.current
    const main = layout?.closest('main')
    if (!layout || !main) return

    if (mainScrollTopRef.current == null) {
      mainScrollTopRef.current = main.scrollTop
      return
    }

    main.scrollTop = mainScrollTopRef.current
  }, [activeSection])

  const handleSectionChange = (section: SettingsSectionId) => {
    const main = settingsLayoutRef.current?.closest('main')
    if (main) {
      mainScrollTopRef.current = main.scrollTop
    }
    if (section !== 'routines') {
      setMorningLogPickerOpen(false)
    }
    setActiveSection(section)
  }

  const navItems = useMemo((): { id: SettingsSectionId; label: string }[] => {
    const items: { id: SettingsSectionId; label: string }[] = [
      { id: 'account', label: 'Account' },
      { id: 'appearance', label: 'Appearance' },
      { id: 'calendar', label: 'Calendar & time' },
      { id: 'tracking', label: 'Tracking' },
    ]
    if (pulseConfigured) {
      items.push({ id: 'pulse', label: 'Pulse' })
    }
    items.push(
      { id: 'routines', label: 'Routines' },
      { id: 'notifications', label: 'Notifications' },
      { id: 'data', label: 'Data' },
    )
    if (settings.devMode) {
      items.push({ id: 'developer', label: 'Developer' })
    }
    return items
  }, [settings.devMode, pulseConfigured])

  const loadGoals = useCallback(async () => {
    if (!userId) return
    if (isSupabaseConfigured) {
      const { fetchGoals } = await import('@/lib/supabase')
      setGoals(await fetchGoals(userId))
    } else {
      setGoals(localStore.getGoals())
    }
  }, [userId])

  useEffect(() => {
    void loadGoals()
  }, [loadGoals])

  useEffect(() => {
    if (!pulseConfigured && activeSection === 'pulse') {
      setActiveSection('account')
    }
  }, [pulseConfigured, activeSection])

  useEffect(() => {
    if (!settings.devMode && activeSection === 'developer') {
      setActiveSection('account')
    }
  }, [settings.devMode, activeSection])

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

  const handleDeleteAccount = async () => {
    setDeleteAccountError(null)
    setDeletingAccount(true)
    try {
      await deleteAccount()
      window.location.href = '/login'
    } catch (err) {
      setDeleteAccountError(formatDeleteAccountError(err))
      setDeletingAccount(false)
    }
  }

  const deleteAccountConfirmReady =
    deleteAccountConfirmText.trim().toLowerCase() === (email ?? '').trim().toLowerCase()

  const handleLoadSampleData = () => {
    if (!userId || isSupabaseConfigured) return
    const result = seedDemoData(userId)
    setSampleSummary(`Loaded ${result.logs} daily logs and ${result.workouts} workouts.`)
    setConfirmSampleData(false)
    window.setTimeout(() => window.location.reload(), 800)
  }

  const renderAccount = () => (
    <Card>
      <SettingsSection
        title="Account"
        description={
          isSupabaseConfigured
            ? 'Signed in with Supabase'
            : 'Local account — stored in this browser'
        }
      >
        {email && <p className="text-sm text-zinc-300">{email}</p>}
        <Button variant="secondary" onClick={() => signOut()} className="w-full sm:w-auto">
          <LogOut size={14} />
          Sign out
        </Button>
      </SettingsSection>
    </Card>
  )

  const renderAppearance = () => (
    <Card>
      <SettingsSection title="Appearance" description="Colors and layout across the app">
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
  )

  const renderCalendar = () => (
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
  )

  const renderTracking = () => (
    <div className="space-y-4">
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
    </div>
  )

  const renderRoutines = () => (
    <div className="space-y-4">
      <Card className={cn(morningLogPickerOpen && 'relative z-50')}>
        <SettingsSection
          title="Morning log"
          description="What you log at the start of your day and optional follow-up checklist"
        >
          <ToggleRow
            label="Require morning log"
            description="Lock all screens until you complete your morning log each day"
            checked={settings.requireMorningLog}
            onChange={(requireMorningLog) => {
              updateSettings({ requireMorningLog })
              flashSaved()
            }}
          />
          <MorningLogMetricsEditor
            goals={goals}
            sleepConfig={sleepMetricsConfig}
            morningLogGoalKeys={morningLogGoalKeys}
            morningLogYesterdayKeys={morningLogYesterdayKeys}
            morningLogSleepFieldIds={morningLogSleepFieldIds}
            showWorkouts={settings.showWorkoutMetrics}
            onMorningLogGoalKeysChange={(keys) => {
              saveMorningLogGoalKeys(keys)
              flashSaved()
            }}
            onMorningLogYesterdayKeysChange={(keys) => {
              saveMorningLogYesterdayKeys(keys)
              flashSaved()
            }}
            onMorningLogSleepFieldIdsChange={(ids) => {
              saveMorningLogSleepFieldIds(ids)
              flashSaved()
            }}
            onPickerOpenChange={setMorningLogPickerOpen}
          />
          <div className="mt-5 border-t border-zinc-800/80 pt-5">
            <p className="mb-3 text-sm font-medium text-zinc-200">Follow-up checklist</p>
            <SettingsDailyChecklistEditor
              checklist={settings.morningLogChecklist}
              onChange={(morningLogChecklist) => updateSettings({ morningLogChecklist })}
              onSaved={flashSaved}
              emptyHint="No checklist yet. Add optional checkboxes after logging your morning metrics."
            />
          </div>
        </SettingsSection>
      </Card>
      <Card className={cn(shutdownLogPickerOpen && 'relative z-50')}>
        <SettingsSection
          title="Daily shutdown"
          description="What you log at the end of your day and optional follow-up checklist"
        >
          <ShutdownLogMetricsEditor
            goals={goals}
            sleepConfig={sleepMetricsConfig}
            shutdownLogGoalKeys={shutdownLogGoalKeys}
            shutdownLogSleepFieldIds={shutdownLogSleepFieldIds}
            showWorkouts={settings.showWorkoutMetrics}
            onShutdownLogGoalKeysChange={(keys) => {
              saveShutdownLogGoalKeys(keys)
              flashSaved()
            }}
            onShutdownLogSleepFieldIdsChange={(ids) => {
              saveShutdownLogSleepFieldIds(ids)
              flashSaved()
            }}
            onPickerOpenChange={setShutdownLogPickerOpen}
          />
          <div className="mt-5 border-t border-zinc-800/80 pt-5">
            <p className="mb-3 text-sm font-medium text-zinc-200">Follow-up checklist</p>
            <SettingsDailyChecklistEditor
              checklist={settings.dailyShutdownChecklist}
              onChange={(dailyShutdownChecklist) => updateSettings({ dailyShutdownChecklist })}
              onSaved={flashSaved}
              emptyHint="No checklist yet. Add optional checkboxes after logging your shutdown metrics."
            />
          </div>
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
    </div>
  )

  const handleSavePulseFormula = (formula: PulseFormula) => {
    const { isReconfigure } = saveFormula(formula)
    setShowPulseConfigure(false)
    if (isReconfigure) {
      setPulseFormulaNotice(true)
    }
    flashSaved()
  }

  const renderPulse = () => (
    <Card>
      <SettingsSection
        title="Pulse"
        description="How your daily rhythm score is calculated"
      >
        <p className="text-sm text-zinc-400">
          Adjust which areas count toward your Pulse and how much each one weighs.
        </p>
        {pulseFormulaNotice && (
          <p className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
            Formula updated — past days keep their old weights.
            <button
              type="button"
              className="ml-2 text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
              onClick={() => setPulseFormulaNotice(false)}
            >
              Dismiss
            </button>
          </p>
        )}
        <Button variant="secondary" onClick={() => setShowPulseConfigure(true)}>
          Reconfigure Pulse
        </Button>
      </SettingsSection>
    </Card>
  )

  const renderNotifications = () => (
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
  )

  const renderData = () => (
    <div className="space-y-4">
      {!isSupabaseConfigured && (
        <Card>
          <SettingsSection
            title="Sample data"
            description="Replace local logs, workouts, and goals with ~14 months of realistic demo data for testing Overview."
          >
            {sampleSummary && <p className="text-xs text-emerald-400">{sampleSummary}</p>}
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
          <Button variant="secondary" onClick={handleReset} className="w-full sm:w-auto">
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
              <p className="text-xs text-red-300">
                Are you sure? All your data will be permanently deleted.
              </p>
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
      <Card className="border-red-950/50">
        <SettingsSection title="Delete account">
          <p className="text-xs text-zinc-500">
            Permanently delete your account
            {isSupabaseConfigured ? ' and all cloud data' : ''}. You can sign up again with the
            same email afterward. This cannot be undone.
          </p>
          {!confirmDeleteAccount ? (
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDeleteAccount(true)
                setDeleteAccountConfirmText('')
                setDeleteAccountError(null)
              }}
              className="w-full sm:w-auto"
              disabled={!userId || !email}
            >
              <Trash2 size={14} />
              Delete account
            </Button>
          ) : (
            <div className="space-y-2 rounded-xl border border-red-900/40 bg-red-950/20 p-3">
              <p className="text-xs text-red-300">
                Type your email <span className="font-medium text-red-200">{email}</span> to
                confirm.
              </p>
              <input
                type="email"
                value={deleteAccountConfirmText}
                onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
                placeholder={email ?? 'your@email.com'}
                className="w-full rounded-lg border border-red-900/50 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-700 focus:outline-none"
                autoComplete="off"
                disabled={deletingAccount}
              />
              {deleteAccountError && (
                <p className="text-xs text-red-400">{deleteAccountError}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  onClick={handleDeleteAccount}
                  disabled={!deleteAccountConfirmReady || deletingAccount}
                >
                  {deletingAccount ? 'Deleting…' : 'Yes, delete my account'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setConfirmDeleteAccount(false)
                    setDeleteAccountConfirmText('')
                    setDeleteAccountError(null)
                  }}
                  disabled={deletingAccount}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </SettingsSection>
      </Card>
    </div>
  )

  const renderDeveloper = () => (
    <Card>
      <SettingsDeveloperTab />
    </Card>
  )

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'account':
        return renderAccount()
      case 'appearance':
        return renderAppearance()
      case 'calendar':
        return renderCalendar()
      case 'tracking':
        return renderTracking()
      case 'pulse':
        return renderPulse()
      case 'routines':
        return renderRoutines()
      case 'notifications':
        return renderNotifications()
      case 'data':
        return renderData()
      case 'developer':
        return renderDeveloper()
    }
  }

  return (
    <div ref={settingsLayoutRef} className="w-full">
      <header className="mb-6 flex min-h-10 items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
          <p className="text-xs text-zinc-500">Make Dojo yours — changes apply instantly</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full bg-emerald-950/60 px-2.5 py-1 text-[10px] font-medium text-emerald-400 transition-opacity',
            saved ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          aria-hidden={!saved}
        >
          Saved
        </span>
      </header>

      <div className="grid grid-cols-1 items-start gap-x-10 gap-y-4 sm:grid-cols-[11rem_32rem] lg:gap-x-16">
        <nav className="flex gap-1 overflow-x-auto pb-1 sm:flex-col sm:gap-0.5 sm:overflow-visible sm:pb-0">
          {navItems.map((item) => (
            <SettingsNavButton
              key={item.id}
              label={item.label}
              active={activeSection === item.id}
              onClick={() => handleSectionChange(item.id)}
            />
          ))}
        </nav>

        <div className="min-w-0 w-full [overflow-anchor:none]">{renderActiveSection()}</div>
      </div>

      {showPulseConfigure && (
        <PulseConfigureModal
          goals={goals}
          initialFormula={currentFormula}
          isReconfigure
          onClose={() => setShowPulseConfigure(false)}
          onSave={handleSavePulseFormula}
        />
      )}
    </div>
  )
}
