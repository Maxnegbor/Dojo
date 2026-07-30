import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, parseISO } from 'date-fns'
import { FlaskConical, RefreshCw, Rocket, TrendingDown, TrendingUp, Zap } from 'lucide-react'
import { HabitRampFailureModal } from '@/components/today/HabitRampFailureModal'
import { SettingsDeveloperDailyShutdown } from '@/components/settings/SettingsDeveloperDailyShutdown'
import { SettingsDeveloperMorningLog } from '@/components/settings/SettingsDeveloperMorningLog'
import { Button } from '@/components/ui/Button'
import { SettingsSection } from '@/components/settings/SettingsControls'
import { useAuth } from '@/context/AuthContext'
import {
  adjustHabitRampLevel,
  applyRampLevelSync,
  buildPreviewRampFailurePrompt,
  clearAllRampFailurePrompts,
  resetAllRampLevels,
  type HabitRampFailurePrompt,
} from '@/lib/habitRamp'
import { getHabitStreaksForDate } from '@/lib/habitStreaks'
import { getDailyLogHabitTypes, getHabitTypes, saveHabitTypes } from '@/lib/habitTypes'
import { localStore } from '@/lib/localStore'
import {
  markPulseRadiantTestPending,
} from '@/lib/pulseRadiantBurst'
import { isSupabaseConfigured } from '@/lib/supabase'
import { unlockAudio } from '@/lib/timerSound'
import { formatDate } from '@/lib/utils'
import { startOnboardingPreview } from '@/lib/onboarding'

export function SettingsDeveloperTab() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const [message, setMessage] = useState<string | null>(null)
  const [previewPrompt, setPreviewPrompt] = useState<HabitRampFailurePrompt | null>(null)

  const rampHabits = useMemo(
    () => getDailyLogHabitTypes().filter((habit) => habit.ramp?.enabled),
    [],
  )

  const flash = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(null), 2500)
  }

  const refreshPreview = () => {
    setPreviewPrompt(null)
  }

  const syncRampLevelsFromStreaks = async () => {
    const today = formatDate(new Date())
    const streakStart = formatDate(addDays(parseISO(today), -400))
    let logs = []

    if (isSupabaseConfigured) {
      flash('Streak sync is local-only for now.')
      return
    }

    if (!userId) {
      flash('Sign in to sync ramp levels.')
      return
    }

    localStore.setUserId(userId)
    logs = localStore.getDailyLogs(streakStart, today)
    const streakByHabit = getHabitStreaksForDate(logs, today)
    const { habits, changed } = applyRampLevelSync(getHabitTypes(), streakByHabit)
    if (changed) {
      saveHabitTypes(habits)
      flash('Synced ramp levels from current streaks.')
    } else {
      flash('No ramp level changes needed.')
    }
    refreshPreview()
  }

  const adjustFirstRampHabit = (delta: number) => {
    const habit = findFirstRampHabit()
    if (!habit) {
      flash('No ramping habit found. Enable ramping on a daily habit first.')
      return
    }
    const habits = getHabitTypes()
    const next = habits.map((item) => (item.id === habit.id ? adjustHabitRampLevel(item, delta) : item))
    saveHabitTypes(next)
    flash(`${delta > 0 ? 'Increased' : 'Decreased'} ${habit.label} ramp level.`)
    refreshPreview()
  }

  const resetRampLevels = () => {
    saveHabitTypes(resetAllRampLevels(getHabitTypes()))
    flash('Reset all ramp levels to 0.')
    refreshPreview()
  }

  const clearPrompts = () => {
    clearAllRampFailurePrompts()
    flash('Cleared ramp failure prompts.')
  }

  return (
    <div className="space-y-4">
      {message && (
        <p className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-300">
          {message}
        </p>
      )}

      <SettingsSection
        title="New user onboarding"
        description="Walk through the exact intake flow a new account sees after sign-up."
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            startOnboardingPreview()
            navigate('/onboarding')
          }}
        >
          <Rocket size={14} />
          Preview onboarding flow
        </Button>
        <p className="text-xs text-zinc-500">
          Opens the same screens as a new user — track selection, preferences, and goals.
          Nothing is saved when you finish in preview mode.
        </p>
      </SettingsSection>

      <SettingsSection
        title="Pulse radiant slam"
        description="Replay the home Pulse grow → slam → burst celebration."
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            unlockAudio()
            markPulseRadiantTestPending()
            navigate('/')
            flash('Playing radiant slam on Home.')
          }}
        >
          <Zap size={14} />
          Test radiant slam
        </Button>
        <p className="text-xs text-zinc-500">
          Goes to Home and plays the 100-score radiant animation. Safe to run repeatedly.
        </p>
      </SettingsSection>

      <SettingsSection
        title="Habit ramping"
        description="Tools for testing streak-based ramp levels and failure prompts."
      >
        <p className="text-xs text-zinc-500">
          {rampHabits.length > 0
            ? `${rampHabits.length} ramping habit${rampHabits.length === 1 ? '' : 's'}: ${rampHabits
                .map((habit) => `${habit.label} (level ${habit.ramp?.level ?? 0})`)
                .join(', ')}`
            : 'No ramping habits yet. Enable ramping on a daily habit in Metrics.'}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => adjustFirstRampHabit(1)}>
            <TrendingUp size={14} />
            +1 ramp level
          </Button>
          <Button variant="secondary" size="sm" onClick={() => adjustFirstRampHabit(-1)}>
            <TrendingDown size={14} />
            −1 ramp level
          </Button>
          <Button variant="secondary" size="sm" onClick={syncRampLevelsFromStreaks}>
            <RefreshCw size={14} />
            Sync from streaks
          </Button>
          <Button variant="secondary" size="sm" onClick={resetRampLevels}>
            Reset ramp levels
          </Button>
          <Button variant="secondary" size="sm" onClick={clearPrompts}>
            Clear failure prompts
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const habit = findFirstRampHabit()
              if (!habit) {
                flash('Need a ramping habit with level > 0 to preview the failure modal.')
                return
              }
              const today = formatDate(new Date())
              const streakStart = formatDate(addDays(parseISO(today), -400))
              let logs: ReturnType<typeof localStore.getDailyLogs> = []
              if (userId) {
                localStore.setUserId(userId)
                logs = localStore.getDailyLogs(streakStart, today)
              }
              const prompt = buildPreviewRampFailurePrompt(
                habit,
                formatDate(addDays(new Date(), -1)),
                logs,
                today,
              )
              if (!prompt) {
                flash('Need a ramping habit with level > 0 to preview the failure modal.')
                return
              }
              setPreviewPrompt(prompt)
            }}
          >
            <FlaskConical size={14} />
            Preview failure modal
          </Button>
        </div>
      </SettingsSection>

      <SettingsDeveloperDailyShutdown />

      <SettingsDeveloperMorningLog />

      {previewPrompt && (
        <HabitRampFailureModal
          prompt={previewPrompt}
          onDecrease={() => {
            adjustFirstRampHabit(-1)
            setPreviewPrompt(null)
          }}
          onKeep={() => setPreviewPrompt(null)}
        />
      )}
    </div>
  )
}

function findFirstRampHabit() {
  return getDailyLogHabitTypes().find((habit) => habit.ramp?.enabled && (habit.ramp.level ?? 0) > 0)
    ?? getDailyLogHabitTypes().find((habit) => habit.ramp?.enabled)
}
