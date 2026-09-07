import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { syncWhoopDay, WhoopApiError } from '@/lib/whoopApi'
import {
  getWhoopDay,
  isWhoopConnected,
  WHOOP_CHANGED,
  WHOOP_DAYS_CHANGED,
  type WhoopDaySnapshot,
} from '@/lib/whoopStore'
import { cn } from '@/lib/utils'

function recoveryTone(score: number | null): string {
  if (score == null) return 'text-zinc-500'
  if (score >= 67) return 'text-emerald-300'
  if (score >= 34) return 'text-amber-300'
  return 'text-red-300'
}

function formatHours(minutes: number | null): string {
  if (minutes == null) return '—'
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
}

function Stat({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string
  value: string
  hint?: string
  valueClass?: string
}) {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={cn('mt-0.5 text-sm font-semibold tabular-nums text-zinc-100', valueClass)}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] text-zinc-600">{hint}</p> : null}
    </div>
  )
}

export interface WhoopPanelProps {
  viewDate: string
  className?: string
  headerLeading?: ReactNode
  collapsed?: boolean
}

export function WhoopPanel({
  viewDate,
  className,
  headerLeading,
  collapsed = false,
}: WhoopPanelProps) {
  const [connected, setConnected] = useState(() => isWhoopConnected())
  const [day, setDay] = useState<WhoopDaySnapshot | null>(() => getWhoopDay(viewDate))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isWhoopConnected()) {
      setConnected(false)
      setDay(null)
      return
    }
    setConnected(true)
    setLoading(true)
    setError(null)
    try {
      const next = await syncWhoopDay(viewDate)
      setDay(next)
    } catch (err) {
      setDay(getWhoopDay(viewDate))
      setError(
        err instanceof WhoopApiError && err.status === 401
          ? 'WHOOP authorization expired. Reconnect in Settings → Integrations.'
          : err instanceof Error
            ? err.message
            : 'Could not load WHOOP data',
      )
    } finally {
      setLoading(false)
    }
  }, [viewDate])

  useEffect(() => {
    const sync = () => {
      setConnected(isWhoopConnected())
      setDay(getWhoopDay(viewDate))
      void load()
    }
    const onDays = () => setDay(getWhoopDay(viewDate))
    window.addEventListener(WHOOP_CHANGED, sync)
    window.addEventListener(WHOOP_DAYS_CHANGED, onDays)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(WHOOP_CHANGED, sync)
      window.removeEventListener(WHOOP_DAYS_CHANGED, onDays)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [load, viewDate])

  useEffect(() => {
    void load()
  }, [load])

  if (!connected) {
    return (
      <div className={cn('space-y-2', className)}>
        {headerLeading}
        <p className="text-xs text-zinc-500">
          Connect WHOOP in{' '}
          <Link
            to="/settings"
            state={{ settingsSection: 'integrations' }}
            className="text-zinc-300 underline-offset-2 hover:underline"
          >
            Settings → Integrations
          </Link>{' '}
          to show recovery, sleep, and strain.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{headerLeading}</div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
          aria-label="Refresh WHOOP"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
        <a
          href="https://app.whoop.com/"
          target="_blank"
          rel="noreferrer"
          className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Open WHOOP"
        >
          <ExternalLink size={14} />
        </a>
      </div>

      {!collapsed && (
        <>
          {error && !day ? (
            <p className="text-xs text-red-400">{error}</p>
          ) : (
            <>
              {error ? <p className="text-[11px] text-amber-400/90">{error}</p> : null}
              <div className="grid grid-cols-3 gap-1.5">
            <Stat
              label="Recovery"
              value={day?.recoveryScore != null ? `${Math.round(day.recoveryScore)}` : '—'}
              hint="Score"
              valueClass={recoveryTone(day?.recoveryScore ?? null)}
            />
            <Stat
              label="Sleep"
              value={
                day?.sleepPerformance != null ? `${Math.round(day.sleepPerformance)}%` : '—'
              }
              hint={formatHours(day?.sleepMinutes ?? null)}
            />
            <Stat
              label="Strain"
              value={day?.strain != null ? day.strain.toFixed(1) : '—'}
              hint="Day"
            />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <span>
              HRV{' '}
              <span className="tabular-nums text-zinc-300">
                {day?.hrvMs != null ? `${Math.round(day.hrvMs)} ms` : '—'}
              </span>
            </span>
            <span>
              RHR{' '}
              <span className="tabular-nums text-zinc-300">
                {day?.restingHr != null ? `${Math.round(day.restingHr)} bpm` : '—'}
              </span>
            </span>
            {day?.workouts && day.workouts.length > 0 ? (
              <span>
                {day.workouts.length} workout{day.workouts.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
