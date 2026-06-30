import { Flame, Lightbulb, TrendingUp, Waves } from 'lucide-react'
import type { PulseInsight } from '@/lib/pulse'
import { cn } from '@/lib/utils'

interface PulseEchoesProps {
  insights: PulseInsight[]
}

const TONE_META = {
  rise: { icon: TrendingUp, className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  pattern: { icon: Waves, className: 'text-[var(--accent-300)] bg-[var(--accent-950)] border-[var(--accent-500)]/25' },
  streak: { icon: Flame, className: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  tip: { icon: Lightbulb, className: 'text-zinc-300 bg-zinc-800/50 border-zinc-700/50' },
} as const

export function PulseEchoes({ insights }: PulseEchoesProps) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-zinc-200">Echoes</h2>
        <p className="text-[10px] text-zinc-500">Patterns your data is whispering back</p>
      </div>

      <ul className="space-y-2">
        {insights.map((insight) => {
          const meta = TONE_META[insight.tone]
          const Icon = meta.icon
          return (
            <li
              key={insight.id}
              className={cn(
                'flex gap-3 rounded-xl border p-3',
                meta.className,
              )}
            >
              <Icon size={16} className="mt-0.5 shrink-0 opacity-90" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-100">{insight.title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">{insight.body}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
