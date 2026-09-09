import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { syncWhoopDay } from '@/lib/whoopApi'
import {
  getWhoopDay,
  isWhoopConnected,
  WHOOP_CHANGED,
  WHOOP_DAYS_CHANGED,
  type WhoopDaySnapshot,
} from '@/lib/whoopStore'

const RING_SIZE = 46
const RING_SPREAD_X = RING_SIZE * 1.38
const STRAIN_MAX = 21

const COLORS = {
  sleep: '#8b5cf6',
  strain: '#3b82f6',
} as const

const RECOVERY_RED: [number, number, number] = [239, 68, 68]
const RECOVERY_YELLOW: [number, number, number] = [234, 179, 8]
const RECOVERY_GREEN: [number, number, number] = [16, 185, 129]
const RECOVERY_GREEN_HIGH: [number, number, number] = [52, 211, 153]

function mixRgb(
  from: [number, number, number],
  to: [number, number, number],
  t: number,
): string {
  const u = Math.max(0, Math.min(1, t))
  const ch = (a: number, b: number) => Math.round(a + (b - a) * u)
  return `rgb(${ch(from[0], to[0])} ${ch(from[1], to[1])} ${ch(from[2], to[2])})`
}

/** WHOOP recovery: red → yellow → green as the score rises (green from 67). */
function recoveryRingColor(score: number | null): string {
  if (score == null) return '#71717a'
  const t = Math.max(0, Math.min(100, score))
  if (t < 34) return mixRgb(RECOVERY_RED, RECOVERY_YELLOW, t / 34)
  if (t < 67) return mixRgb(RECOVERY_YELLOW, RECOVERY_GREEN, (t - 34) / 33)
  return mixRgb(RECOVERY_GREEN, RECOVERY_GREEN_HIGH, (t - 67) / 33)
}

function formatHours(minutes: number | null): string {
  if (minutes == null) return '—'
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
}

function formatClock(minutes: number | null): string {
  if (minutes == null) return '—'
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440
  const hours = Math.floor(wrapped / 60)
  const mins = wrapped % 60
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(mins).padStart(2, '0')} ${period}`
}

function formatPercent(value: number | null): string {
  return value == null ? '—' : String(Math.round(value))
}

function formatStrain(value: number | null): string {
  if (value == null) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function MiniStatRing({
  label,
  display,
  value,
  max,
  color,
  details,
  className,
  style,
}: {
  label: string
  display: string
  value: number | null
  max: number
  color: string
  details: { label: string; value: string }[]
  className?: string
  style?: CSSProperties
}) {
  const size = RING_SIZE
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const fraction =
    value == null || max <= 0 ? 0 : Math.max(0, Math.min(1, value / max))
  const dashOffset = circumference * (1 - fraction)
  const track = `color-mix(in srgb, ${color} 28%, rgb(63 63 70))`
  const ringRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)

  const updateAnchor = () => {
    const el = ringRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setAnchor({ left: rect.left + rect.width / 2, top: rect.bottom + 8 })
  }

  useEffect(() => {
    if (!open) return
    updateAnchor()
    const onMove = () => updateAnchor()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  return (
    <div
      ref={ringRef}
      className={cn(
        'pointer-events-auto absolute flex items-center justify-center rounded-full bg-zinc-950',
        className,
      )}
      style={{ width: size, height: size, ...style }}
      aria-label={`WHOOP ${label} ${display}`}
      onMouseEnter={() => {
        updateAnchor()
        setOpen(true)
      }}
      onMouseLeave={() => setOpen(false)}
    >
      <svg
        className="pointer-events-none absolute inset-0 -rotate-90"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={track}
          strokeWidth={Math.max(1.5, stroke * 0.45)}
        />
        {fraction > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        )}
      </svg>
      <span className="relative text-[11px] font-bold tabular-nums leading-none text-zinc-50">
        {display}
      </span>
      {open &&
        anchor &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[200] w-max min-w-[9.5rem] -translate-x-1/2 rounded-lg border border-zinc-700/80 bg-zinc-950/95 px-2.5 py-2 shadow-lg shadow-black/50 backdrop-blur-sm"
            style={{ left: anchor.left, top: anchor.top }}
            role="tooltip"
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              {label}
            </p>
            <dl className="space-y-0.5">
              {details.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[10px] text-zinc-500">{row.label}</dt>
                  <dd className="text-[10px] font-medium tabular-nums text-zinc-200">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>,
          document.body,
        )}
    </div>
  )
}

export function WhoopPulseOrbits({ date }: { date: string }) {
  const [connected, setConnected] = useState(() => isWhoopConnected())
  const [day, setDay] = useState<WhoopDaySnapshot | null>(() => getWhoopDay(date))

  useEffect(() => {
    const sync = () => {
      setConnected(isWhoopConnected())
      setDay(getWhoopDay(date))
    }
    window.addEventListener(WHOOP_CHANGED, sync)
    window.addEventListener(WHOOP_DAYS_CHANGED, sync)
    window.addEventListener('user-storage-ready', sync)
    return () => {
      window.removeEventListener(WHOOP_CHANGED, sync)
      window.removeEventListener(WHOOP_DAYS_CHANGED, sync)
      window.removeEventListener('user-storage-ready', sync)
    }
  }, [date])

  useEffect(() => {
    setDay(getWhoopDay(date))
    setConnected(isWhoopConnected())
    if (!isWhoopConnected()) return
    let cancelled = false
    void syncWhoopDay(date)
      .then((next) => {
        if (!cancelled) setDay(next)
      })
      .catch(() => {
        if (!cancelled) setDay(getWhoopDay(date))
      })
    return () => {
      cancelled = true
    }
  }, [date])

  if (!connected) return null

  const recovery = day?.recoveryScore ?? null
  const sleep = day?.sleepPerformance ?? null
  const strain = day?.strain ?? null

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-visible">
      <MiniStatRing
        label="recovery"
        display={formatPercent(recovery)}
        value={recovery}
        max={100}
        color={recoveryRingColor(recovery)}
        details={[
          { label: 'HRV', value: day?.hrvMs != null ? `${Math.round(day.hrvMs)} ms` : '—' },
          { label: 'RHR', value: day?.restingHr != null ? `${Math.round(day.restingHr)} bpm` : '—' },
        ]}
        style={{
          left: '50%',
          top: -(RING_SIZE + 10),
          transform: 'translateX(-50%)',
        }}
      />
      <MiniStatRing
        label="sleep"
        display={formatPercent(sleep)}
        value={sleep}
        max={100}
        color={COLORS.sleep}
        details={[
          { label: 'Asleep', value: formatHours(day?.sleepMinutes ?? null) },
          { label: 'In bed', value: formatHours(day?.inBedMinutes ?? null) },
          {
            label: 'Efficiency',
            value: day?.sleepEfficiency != null ? `${Math.round(day.sleepEfficiency)}%` : '—',
          },
          { label: 'Bedtime', value: formatClock(day?.bedtimeMinutes ?? null) },
          { label: 'Wake', value: formatClock(day?.wakeMinutes ?? null) },
        ]}
        style={{
          left: '50%',
          top: -(RING_SIZE - 6),
          transform: `translateX(calc(-50% - ${RING_SPREAD_X}px))`,
        }}
      />
      <MiniStatRing
        label="strain"
        display={formatStrain(strain)}
        value={strain}
        max={STRAIN_MAX}
        color={COLORS.strain}
        details={[
          { label: 'Day strain', value: formatStrain(strain) },
        ]}
        style={{
          left: '50%',
          top: -(RING_SIZE - 6),
          transform: `translateX(calc(-50% + ${RING_SPREAD_X}px))`,
        }}
      />
    </div>
  )
}
