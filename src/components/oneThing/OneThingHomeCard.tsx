import { Link } from 'react-router-dom'
import { ArrowUpRight, CircleDot } from 'lucide-react'
import { useOneThing } from '@/hooks/useOneThing'
import { ONE_THING_HORIZONS, currentOneThing } from '@/lib/oneThingPeriods'

export function OneThingHomeCard() {
  const { goals, now, weekStartsOn, ready } = useOneThing()
  if (!ready) return null
  const current = (id: typeof ONE_THING_HORIZONS[number]['id']) => currentOneThing(goals, id, now, weekStartsOn)
  const today = current('today')
  const due = ONE_THING_HORIZONS.filter(h => h.id !== 'today' && !current(h.id))
  return <section className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><CircleDot size={15} className="text-[var(--accent-400)]"/>The One Thing</h2>
      <Link to="/one-thing" aria-label="Open The One Thing" className="rounded p-1 text-zinc-500 hover:text-zinc-200"><ArrowUpRight size={16}/></Link>
    </div>
    <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent-400)]">Today</p>
    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-200">{today?.text ?? ONE_THING_HORIZONS.find(h => h.id === 'today')!.prompt}</p>
    {!today && <Link to="/one-thing?horizon=today#one-thing-today" className="mt-3 inline-flex rounded-lg bg-[var(--accent-500)]/15 px-3 py-1.5 text-xs font-medium text-[var(--accent-300)] hover:bg-[var(--accent-500)]/25">Set today’s One Thing</Link>}
    <div className="mt-4 space-y-3 border-t border-zinc-800 pt-3">
      {(['week', 'month'] as const).map(id => <div key={id}><p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{id === 'week' ? 'This week' : 'This month'}</p><p className="mt-1 whitespace-pre-wrap break-words text-xs text-zinc-300">{current(id)?.text ?? 'Time to choose a new focus'}</p></div>)}
    </div>
    {due.length > 0 && <Link to="/one-thing" className="mt-3 block text-xs leading-relaxed text-amber-300/90">Set or review: {due.map(h => h.label.toLowerCase()).join(', ')} →</Link>}
  </section>
}
