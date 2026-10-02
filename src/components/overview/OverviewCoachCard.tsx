import { useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { CoachAdviceBody } from '@/components/today/CoachCard'
import { generateCoachAdvice } from '@/lib/coach'
import { buildPeriodCoachSnapshot } from '@/lib/coachContext'
import {
  COACH_CHANGED,
  getCoachAdvice,
  type CoachAdvice,
} from '@/lib/coachStore'
import { OpenAIApiError } from '@/lib/openaiApi'
import { formatDate } from '@/lib/utils'
import type { OverviewPeriod, OverviewPeriodStats } from '@/lib/overviewPeriods'
import type { DailyLog, Goal, Workout } from '@/types'

interface OverviewCoachCardProps {
  period: OverviewPeriod
  label: string
  stats: OverviewPeriodStats
  logs: DailyLog[]
  workouts: Workout[]
  goals: Goal[]
  asOf: Date
}

export function OverviewCoachCard({
  period,
  label,
  stats,
  logs,
  workouts,
  goals,
  asOf,
}: OverviewCoachCardProps) {
  const storageDate = `overview:${period}:${formatDate(asOf)}`
  const [advice, setAdvice] = useState<CoachAdvice | null>(() =>
    getCoachAdvice(storageDate, 'insights'),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => {
      setAdvice(getCoachAdvice(storageDate, 'insights'))
    }
    window.addEventListener(COACH_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(COACH_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [storageDate])

  useEffect(() => {
    setAdvice(getCoachAdvice(storageDate, 'insights'))
    setError(null)
  }, [storageDate])

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const snapshot = buildPeriodCoachSnapshot({
        period,
        label,
        stats,
        logs,
        workouts,
        goals,
        asOf,
      })
      setAdvice(await generateCoachAdvice('insights', snapshot, storageDate))
    } catch (err) {
      setError(
        err instanceof OpenAIApiError || err instanceof Error
          ? err.message
          : 'Could not summarize insights',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      className="w-full"
      title={
        <span className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-[var(--accent-400)]" />
          Insights
        </span>
      }
      action={
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-60"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : null}
          {advice ? 'Refresh' : 'Summarize'}
        </button>
      }
    >
      {error ? (
        <p className="text-[11px] text-red-400">{error}</p>
      ) : advice ? (
        <CoachAdviceBody advice={advice} />
      ) : (
        <p className="text-[12px] text-zinc-500">
          Summarize patterns for {label.toLowerCase()} — Pulse, sleep, training, focus, and goals.
        </p>
      )}
    </Card>
  )
}
