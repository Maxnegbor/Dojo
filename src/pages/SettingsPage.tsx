import { useEffect, useMemo, useState, useCallback, useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Database, LogOut, RotateCcw, Trash2 } from 'lucide-react'
import { PulseConfigureModal } from '@/components/pulse/PulseConfigureModal'
import { AccentPicker } from '@/components/settings/AccentPicker'
import {
  SegmentedControl,
  SettingsSection,
  ToggleRow,
} from '@/components/settings/SettingsControls'
import { SlidingNavList } from '@/components/ui/SlidingNavList'
import { SettingsDeveloperTab } from '@/components/settings/SettingsDeveloperTab'
import { SettingsWeeklyShutdownEditor } from '@/components/settings/SettingsWeeklyShutdownEditor'
import { SettingsDailyChecklistEditor } from '@/components/settings/SettingsDailyChecklistEditor'
import { SettingsShutdownStepsEditor } from '@/components/settings/SettingsShutdownStepsEditor'
import { MorningLogMetricsEditor } from '@/components/settings/MorningLogMetricsEditor'
import { ShutdownLogMetricsEditor } from '@/components/settings/ShutdownLogMetricsEditor'
import { TimelineRangePicker } from '@/components/settings/TimelineRangePicker'
import { ScheduleColorsEditor } from '@/components/settings/ScheduleColorsEditor'
import { ScheduleTemplatesEditor } from '@/components/settings/ScheduleTemplatesEditor'
import { ExerciseWeekPlanEditor } from '@/components/settings/ExerciseWeekPlanEditor'
import { FocusLabelsEditor } from '@/components/settings/FocusLabelsEditor'
import { TodoistIntegrationEditor } from '@/components/settings/TodoistIntegrationEditor'
import { WorkoutSubcategoriesEditor } from '@/components/settings/WorkoutSubcategoriesEditor'
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
import { getFocusSettings, saveFocusSettings } from '@/lib/focusStore'
import { resetAllAppData } from '@/lib/resetApp'
import { seedDemoData } from '@/lib/seedDemoData'
import { isSupabaseConfigured } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { formatShutdownRequireTimeLabel } from '@/lib/dailyShutdownRequire'

type SettingsSectionId =
  | 'account'
  | 'appearance'
  | 'home'
  | 'calendar'
  | 'tracking'
  | 'exercise'
  | 'pulse'
  | 'routines'
  | 'notifications'
  | 'integrations'
  | 'data'
  | 'developer'

export function SettingsPage() {
  const { email, signOut, userId, deleteAccount } = useAuth()
  const location = useLocation()
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
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() => {
    const fromState = (location.state as { settingsSection?: SettingsSectionId } | null)
      ?.settingsSection
    return fromState ?? 'account'
  })
  const [morningLogPickerOpen, setMorningLogPickerOpen] = useState(false)
  const [shutdownLogPickerOpen, setShutdownLogPickerOpen] = useState(false)
  const [focusTimerSettings, setFocusTimerSettings] = useState(getFocusSettings)
  const settingsLayoutRef = useRef<HTMLDivElement>(null)
  const mainScrollTopRef = useRef<number | null>(null)

  useEffect(() => {
    const fromState = (location.state as { settingsSection?: SettingsSectionId } | null)
      ?.settingsSection
    if (fromState) setActiveSection(fromState)
  }, [location.state])

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
      { id: 'home', label: 'Home & pages' },
      { id: 'calendar', label: 'Calendar & time' },
      { id: 'tracking', label: 'Tracking' },
      { id: 'exercise', label: 'Exercise plan' },
    ]
    if (pulseConfigured) {
      items.push({ id: 'pulse', label: 'Pulse' })
    }
    items.push(
      { id: 'routines', label: 'Routines' },
      { id: 'notifications', label: 'Notifications' },
      { id: 'integrations', label: 'Integrations' },
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

  const saveGoal = useCallback(
    async (goal: Goal) => {
      if (!userId) return
      if (isSupabaseConfigured) {
        const { upsertGoal } = await import('@/lib/supabase')
        await upsertGoal(goal)
      } else {
        localStore.upsertGoal(goal)
      }
      setGoals((prev) => {
        const idx = prev.findIndex((g) => g.id === goal.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = goal
          return next
        }
        return [...prev, goal]
      })
    },
    [userId],
  )

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
          label="Focus time in sidebar"
          description="Show today's focus total in the left navigation"
          checked={settings.showFocusBadge}
          onChange={(showFocusBadge) => {
            updateSettings({ showFocusBadge })
            flashSaved()
          }}
        />
      </SettingsSection>
    </Card>
  )

  const renderHome = () => (
    <div className="space-y-4">
      <Card>
        <SettingsSection
          title="Home page"
          description="Choose what appears on your Home screen"
        >
          <ToggleRow
            label="Show pulse on homepage"
            description="Pulse score meter in the Home header"
            checked={settings.showHomePulse}
            onChange={(showHomePulse) => {
              updateSettings({ showHomePulse })
              flashSaved()
            }}
          />
          <ToggleRow
            label="Show workout planner"
            description="Weekly exercise plan card under Morning Log / Shutdown"
            checked={settings.showHomeWorkoutPlanner}
            onChange={(showHomeWorkoutPlanner) => {
              updateSettings({ showHomeWorkoutPlanner })
              flashSaved()
            }}
          />
          <ToggleRow
            label="Hide completed habits in toggle"
            description="Collapse finished habits behind an “N done” control on Home. Turn off to remove the toggle and keep them in the main list."
            checked={settings.hideCompletedHabitsInToggle}
            onChange={(hideCompletedHabitsInToggle) => {
              updateSettings({ hideCompletedHabitsInToggle })
              flashSaved()
            }}
          />
        </SettingsSection>
      </Card>
      <Card>
        <SettingsSection
          title="Navigation"
          description="Pages shown in the left sidebar"
        >
          <ToggleRow
            label="Show Focus page"
            description="Focus timer in the sidebar"
            checked={settings.showFocusPage}
            onChange={(showFocusPage) => {
              updateSettings({ showFocusPage })
              flashSaved()
            }}
          />
          {settings.showFocusPage && (
            <>
              <ToggleRow
                label="Show schedule on Focus"
                description="Clean agenda of today’s blocks beside the timer — stay on track without the full schedule UI"
                checked={settings.showFocusSchedule}
                onChange={(showFocusSchedule) => {
                  updateSettings({ showFocusSchedule })
                  flashSaved()
                }}
              />
              <ToggleRow
                label="Ask for focus score"
                description="After each focus block, rate how focused you felt (1–10). Scores appear in Overview → Focus."
                checked={focusTimerSettings.promptFocusScore}
                onChange={(promptFocusScore) => {
                  const next = { ...getFocusSettings(), promptFocusScore }
                  saveFocusSettings(next)
                  setFocusTimerSettings(next)
                  flashSaved()
                }}
              />
              <div className="border-t border-zinc-800/80 pt-4">
                <p className="mb-3 text-sm font-medium text-zinc-200">Focus labels</p>
                <FocusLabelsEditor onSaved={flashSaved} />
              </div>
            </>
          )}
        </SettingsSection>
      </Card>
    </div>
  )

  const renderCalendar = () => (
    <div className="space-y-4">
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
        <SettingsSection
          title="Schedule block colors"
          description="What each color means when you plan your day"
        >
          <ScheduleColorsEditor onSaved={flashSaved} />
        </SettingsSection>
      </Card>
      <Card>
        <SettingsSection
          title="Schedule templates"
          description="Reusable day plans for Home and shutdown"
          collapsible
          defaultOpen={false}
        >
          <ScheduleTemplatesEditor onSaved={flashSaved} />
        </SettingsSection>
      </Card>
    </div>
  )

  const renderExercise = () => (
    <div className="space-y-4">
      <Card>
        <SettingsSection
          title="Workout subcategories"
          description="Customize sessions under a type — e.g. Strength → Push, Pull, Legs"
          collapsible
          defaultOpen
        >
          <WorkoutSubcategoriesEditor onSaved={flashSaved} />
        </SettingsSection>
      </Card>
      <Card>
        <SettingsSection
          title="Weekly exercise plan"
          description="A recurring week of workouts that repeats every week"
        >
          <ToggleRow
            label="Include start times"
            description="Ask for a clock time when planning weekly sessions (off = duration only)"
            checked={settings.exerciseWeekPlanIncludeTime}
            onChange={(exerciseWeekPlanIncludeTime) => {
              updateSettings({ exerciseWeekPlanIncludeTime })
              flashSaved()
            }}
          />
          <ExerciseWeekPlanEditor onSaved={flashSaved} />
        </SettingsSection>
      </Card>
    </div>
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
          collapsible
          defaultOpen={false}
        >
          <SegmentedControl
            label="Morning log mode"
            value={settings.requireMorningLog ? 'require' : 'free'}
            onChange={(mode) => {
              updateSettings({ requireMorningLog: mode === 'require' })
              flashSaved()
            }}
            options={[
              { value: 'require', label: 'Require morning log' },
              { value: 'free', label: 'Log freely' },
            ]}
          />
          <p className="text-[11px] leading-relaxed text-zinc-500">
            {settings.requireMorningLog
              ? 'Locks all screens until you complete your morning log. No morning log button on Home.'
              : 'Shows a Morning Log button on Home until you’ve logged today. No screen lock.'}
          </p>
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
            onSaveGoal={async (goal) => {
              await saveGoal(goal)
            }}
            onMovedToShutdown={flashSaved}
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
          <div className="mt-5 space-y-3 border-t border-zinc-800/80 pt-5">
            <ToggleRow
              label="Typed reminder"
              description="Require typing a short affirmation as the last step before finishing"
              checked={settings.requireTypedReminderMorning}
              onChange={(requireTypedReminderMorning) => {
                updateSettings({ requireTypedReminderMorning })
                flashSaved()
              }}
            />
            {settings.requireTypedReminderMorning && (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">Reminder text</span>
                <textarea
                  value={settings.typedReminderMorningText}
                  onChange={(e) => updateSettings({ typedReminderMorningText: e.target.value })}
                  onBlur={flashSaved}
                  rows={3}
                  placeholder="e.g. Contracts are active today, make sure you follow the rules."
                  className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none"
                />
                <p className="text-[11px] text-zinc-500">
                  {settings.typedReminderMorningText.trim()
                    ? 'You’ll need to type this exactly (same wording and capitalization) to finish.'
                    : 'Add reminder text above — the gate stays off until this field isn’t empty.'}
                </p>
              </label>
            )}
          </div>
        </SettingsSection>
      </Card>
      <Card className={cn(shutdownLogPickerOpen && 'relative z-50')}>
        <SettingsSection
          title="Daily shutdown"
          description="What you log at the end of your day, which steps run, and optional checklist items"
          collapsible
          defaultOpen={false}
        >
          <ToggleRow
            label="Require shutdown"
            description="Lock screens after the require time until you complete daily shutdown"
            checked={settings.requireShutdown}
            onChange={(requireShutdown) => {
              updateSettings({ requireShutdown })
              flashSaved()
            }}
          />
          {settings.requireShutdown && (
            <div className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
              <SegmentedControl
                label="Require at"
                value={settings.shutdownRequireAt}
                onChange={(shutdownRequireAt) => {
                  updateSettings({ shutdownRequireAt })
                  flashSaved()
                }}
                options={[
                  { value: 'schedule_end', label: 'End of schedule' },
                  { value: 'custom', label: 'Custom time' },
                ]}
              />
              {settings.shutdownRequireAt === 'schedule_end' ? (
                <p className="text-xs text-zinc-500">
                  Uses the end of your Home schedule window (
                  {formatShutdownRequireTimeLabel(settings, settings.timeFormat)}
                  ). Change it under Appearance → Calendar & time.
                </p>
              ) : (
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-400">Custom time</span>
                  <input
                    type="time"
                    value={settings.shutdownCustomTime}
                    onChange={(e) => {
                      updateSettings({
                        shutdownCustomTime: e.target.value || '21:00',
                      })
                      flashSaved()
                    }}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-[var(--accent-500)] focus:outline-none"
                  />
                </label>
              )}
            </div>
          )}
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
            <p className="mb-3 text-sm font-medium text-zinc-200">Shutdown steps</p>
            <SettingsShutdownStepsEditor
              steps={settings.dailyShutdownSteps}
              onChange={(dailyShutdownSteps) => updateSettings({ dailyShutdownSteps })}
              onSaved={flashSaved}
            />
          </div>
          <div className="mt-5 border-t border-zinc-800/80 pt-5">
            <p className="mb-3 text-sm font-medium text-zinc-200">Follow-up checklist</p>
            <SettingsDailyChecklistEditor
              checklist={settings.dailyShutdownChecklist}
              onChange={(dailyShutdownChecklist) => updateSettings({ dailyShutdownChecklist })}
              onSaved={flashSaved}
              emptyHint="No checklist yet. Add optional checkboxes, then include the Checklist step above to show them during shutdown."
            />
          </div>
          <div className="mt-5 space-y-3 border-t border-zinc-800/80 pt-5">
            <ToggleRow
              label="Typed reminder"
              description="Require typing a short affirmation as the last step before finishing"
              checked={settings.requireTypedReminderShutdown}
              onChange={(requireTypedReminderShutdown) => {
                updateSettings({ requireTypedReminderShutdown })
                flashSaved()
              }}
            />
            {settings.requireTypedReminderShutdown && (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">Reminder text</span>
                <textarea
                  value={settings.typedReminderShutdownText}
                  onChange={(e) => updateSettings({ typedReminderShutdownText: e.target.value })}
                  onBlur={flashSaved}
                  rows={3}
                  placeholder="e.g. Contracts are active today, make sure you follow the rules."
                  className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-[var(--accent-500)] focus:outline-none"
                />
                <p className="text-[11px] text-zinc-500">
                  {settings.typedReminderShutdownText.trim()
                    ? 'You’ll need to type this exactly (same wording and capitalization) to finish.'
                    : 'Add reminder text above — the gate stays off until this field isn’t empty.'}
                </p>
              </label>
            )}
          </div>
        </SettingsSection>
      </Card>
      <Card>
        <SettingsSection
          title="Weekly shutdown"
          description="Customize the checklist shown when you close out your week"
          collapsible
          defaultOpen={false}
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

  const renderIntegrations = () => (
    <Card>
      <TodoistIntegrationEditor onSaved={flashSaved} />
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
      case 'home':
        return renderHome()
      case 'calendar':
        return renderCalendar()
      case 'tracking':
        return renderTracking()
      case 'exercise':
        return renderExercise()
      case 'pulse':
        return renderPulse()
      case 'routines':
        return renderRoutines()
      case 'notifications':
        return renderNotifications()
      case 'integrations':
        return renderIntegrations()
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
        <SlidingNavList
          activeId={activeSection}
          items={navItems}
          getKey={(item) => item.id}
          onSelect={(item) => handleSectionChange(item.id)}
          ariaLabel="Settings sections"
          className="flex gap-1 overflow-x-auto pb-1 sm:flex-col sm:gap-0.5 sm:overflow-visible sm:pb-0"
          itemClassName="w-full shrink-0 px-3 py-2"
          renderItem={(item) => item.label}
        />

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
