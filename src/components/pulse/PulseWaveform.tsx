import { format, parseISO } from 'date-fns'
import type { DayPulse } from '@/lib/pulse'
import { buildWavePath } from '@/lib/pulse'

interface PulseWaveformProps {
  series: DayPulse[]
  today: string
}

export function PulseWaveform({ series, today }: PulseWaveformProps) {
  const width = 360
  const height = 120
  const padding = 14
  const recent = series.slice(-14)
  const linePath = buildWavePath(recent, width, height, padding)
  const baseline = height - padding

  const areaPath =
    recent.length > 0 && linePath
      ? `${linePath} L ${padding + ((recent.length - 1) / Math.max(recent.length - 1, 1)) * (width - padding * 2)} ${baseline} L ${padding} ${baseline} Z`
      : ''

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">14-day waveform</h2>
          <p className="text-[10px] text-zinc-500">How your rhythm rises and falls</p>
        </div>
      </div>

      {recent.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Log a few days to see your wave.</p>
      ) : (
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full min-w-[280px]"
            aria-hidden
          >
            <defs>
              <linearGradient id="pulse-wave-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-500)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--accent-500)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {areaPath && <path d={areaPath} fill="url(#pulse-wave-fill)" />}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="var(--accent-400)"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="pulse-wave-line"
              />
            )}
            {recent.map((day, i) => {
              const x =
                padding +
                (i / Math.max(recent.length - 1, 1)) * (width - padding * 2)
              const maxScore = Math.max(...recent.map((d) => d.score), 1)
              const y = padding + (height - padding * 2) - (day.score / maxScore) * (height - padding * 2)
              const isToday = day.date === today

              if (isToday) {
                return (
                  <g key={day.date} transform={`translate(${x}, ${y})`}>
                    <circle cx={0} cy={0} r={5} className="fill-[var(--accent-400)]" />
                    <circle
                      cx={0}
                      cy={0}
                      r={9}
                      fill="none"
                      stroke="var(--accent-500)"
                      strokeWidth={1.5}
                      className="pulse-wave-dot-ring"
                    />
                  </g>
                )
              }

              return (
                <circle key={day.date} cx={x} cy={y} r={3} className="fill-zinc-600" />
              )
            })}
          </svg>
          <div className="mt-1 flex justify-between px-1 text-[9px] text-zinc-600">
            <span>{format(parseISO(recent[0].date + 'T12:00:00'), 'MMM d')}</span>
            <span>{format(parseISO(recent[recent.length - 1].date + 'T12:00:00'), 'MMM d')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
