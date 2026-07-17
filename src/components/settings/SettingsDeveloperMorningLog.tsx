import { useMemo, useState, useEffect, useCallback } from 'react'
import { FlaskConical, Moon, Sun } from 'lucide-react'
import { DailyChecklistModal } from '@/components/today/DailyChecklistModal'
import { MorningLogModal } from '@/components/today/MorningLogModal'
import { SleepOverviewPanel } from '@/components/overview/SleepOverviewPanel'
import { Button } from '@/components/ui/Button'
import { SettingsSection } from '@/components/settings/SettingsControls'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import { useSleepMetricsConfig } from '@/hooks/useSleepMetricsConfig'
import { computeMorningLogFields } from '@/lib/morningLog'
import { isSupabaseConfigured } from '@/lib/supabase'
import { localStore } from '@/lib/localStore'
import { formatDate } from '@/lib/utils'
import type { DailyLog, Goal } from '@/types'

function sampleMorningLogs(userId: string): DailyLog[] {
  const dates = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
    const d = new Date()
    d.setDate(d.getDate() - offset)
    return formatDate(d)
  })

  return dates.map((date, index) => {
    const bedtime = index % 2 === 0 ? '23:15' : '00:05'
    const wake = index % 3 === 0 ? '06:30' : '07:15'
    const sleepMinutes = index % 2 === 0 ? 420 : 390
    const morning_log = computeMorningLogFields({
      bedtime,
      wake_time: wake,
      sleep_minutes: sleepMinutes,
      alertness: 6 + (index % 4),
    })
    return {
      id: `dev-sleep-${date}`,
      user_id: userId,
      date,
      sleep_hours: morning_log.sleep_minutes / 60,
      weight: null,
      steps: null,
      screen_time_minutes: null,
      focus_minutes: 0,
      notes: '',
      morning_log,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  })
}

export function SettingsDeveloperMorningLog() {
  const { userId } = useAuth()
  const { settings } = useSettings()
  const { config: sleepMetricsConfig } = useSleepMetricsConfig()
  const [showMorningModal, setShowMorningModal] = useState(false)
  const [showMorningChecklist, setShowMorningChecklist] = useState(false)
  const [showShutdownChecklist, setShowShutdownChecklist] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])

  const loadGoals = useCallback(async () => {
    if (isSupabaseConfigured) {
      const { fetchGoals } = await import('@/lib/supabase')
      if (userId) setGoals(await fetchGoals(userId))
    } else {
      setGoals(localStore.getGoals())
    }
  }, [userId])

  useEffect(() => {
    void loadGoals()
  }, [loadGoals])

  const previewLogs = useMemo(() => sampleMorningLogs('dev-preview'), [])

  const flash = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(null), 2200)
  }

  return (
    <SettingsSection
      title="Morning log & sleep"
      description="Preview morning log UI, optional checklists, and the Sleep overview section."
    >
      {message && (
        <p className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-300">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setShowMorningModal(true)}>
          <Sun size={14} />
          Preview morning log
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setShowMorningChecklist(true)}>
          <FlaskConical size={14} />
          Preview morning checklist
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setShowShutdownChecklist(true)}>
          <Moon size={14} />
          Preview shutdown checklist
        </Button>
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Sleep overview preview
        </p>
        <SleepOverviewPanel
          logs={previewLogs}
          rangeStart={previewLogs[previewLogs.length - 1]?.date ?? formatDate(new Date())}
          rangeEnd={previewLogs[0]?.date ?? formatDate(new Date())}
          periodLabel="Preview week"
          timeFormat={settings.timeFormat}
        />
      </div>

      {showMorningModal && userId && (
        <MorningLogModal
          date={formatDate(new Date())}
          goals={goals}
          yesterdayLog={null}
          sleepMetricsConfig={sleepMetricsConfig}
          morningChecklist={settings.morningLogChecklist}
          onClose={() => setShowMorningModal(false)}
          onSave={async () => {
            flash('Morning log preview saved (not persisted).')
            setShowMorningModal(false)
          }}
        />
      )}

      {showMorningChecklist && (
        <DailyChecklistModal
          title="Morning checklist"
          subtitle="Preview — uses your morning log checklist settings"
          checklist={settings.morningLogChecklist}
          buttonLabel="Start the day"
          onClose={() => setShowMorningChecklist(false)}
          onComplete={async () => {
            flash('Morning checklist preview complete.')
            setShowMorningChecklist(false)
          }}
        />
      )}

      {showShutdownChecklist && (
        <DailyChecklistModal
          title="Shutdown checklist"
          subtitle="Preview — uses your shutdown checklist settings"
          checklist={settings.dailyShutdownChecklist}
          buttonLabel="Continue"
          onClose={() => setShowShutdownChecklist(false)}
          onComplete={async () => {
            flash('Shutdown checklist preview complete.')
            setShowShutdownChecklist(false)
          }}
        />
      )}
    </SettingsSection>
  )
}
