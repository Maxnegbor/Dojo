import { useEffect, useState } from 'react'
import { Check, Pencil, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { useSearchParams } from 'react-router-dom'
import { OneThingGoalPath } from '@/components/oneThing/OneThingGoalPath'
import { Button } from '@/components/ui/Button'
import { useOneThing } from '@/hooks/useOneThing'
import { ONE_THING_HORIZONS, currentOneThing, previousOneThing, oneThingPeriod, type OneThingHorizon } from '@/lib/oneThingPeriods'

const DISPLAY_HORIZONS = [...ONE_THING_HORIZONS].reverse()
const CARD_ORDER = ['md:order-1', 'md:order-2', 'md:order-4', 'md:order-3', 'md:order-5', 'md:order-6']

export function OneThingPage() {
  const { goals, now, weekStartsOn, ready, save } = useOneThing()
  const [params] = useSearchParams()
  const [editing, setEditing] = useState<OneThingHorizon | null>(null)
  const [draft, setDraft] = useState('')
  const requestedHorizon = params.get('horizon')
  useEffect(() => {
    if (ready && requestedHorizon && ONE_THING_HORIZONS.some(h => h.id === requestedHorizon)) {
      document.getElementById(`one-thing-${requestedHorizon}`)?.scrollIntoView({ block: 'start' })
    }
  }, [ready, requestedHorizon])
  const current = (id: OneThingHorizon) => currentOneThing(goals, id, now, weekStartsOn)
  const due = DISPLAY_HORIZONS.filter(h => !current(h.id))
  const edit = (id: OneThingHorizon) => {
    const goal = current(id) ?? previousOneThing(goals, id, now, weekStartsOn)
    setDraft(goal?.text ?? '')
    setEditing(id)
  }
  if (!ready) return <p className="p-8 text-zinc-400">Loading your goals…</p>
  return (
    <div className="mx-auto w-full max-w-5xl space-y-7 px-4 py-8 sm:px-8">
      <header>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-400)]">Big picture. Small next step.</p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">The One Thing</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">Work backward from the future you want. Choose one meaningful result at each horizon, then make room for the action that matters today.</p>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4" role="status">
        <div>
          <p className="text-sm font-medium text-zinc-100">{due.length ? `${due.length} horizons need your attention` : 'Your goals are set for the current periods'}</p>
          <p className="mt-1 text-xs text-zinc-400">{due.length ? due.map(h => h.label).join(' · ') : 'Come back to your next step whenever you need to refocus.'}</p>
        </div>
        {due.length > 0 && <a href={`#one-thing-${due[0].id}`} className="text-sm text-[var(--accent-400)]">Review goals ↓</a>}
      </div>
      <div className="relative isolate grid grid-cols-1 gap-y-12 md:grid-cols-2 md:gap-x-12 md:px-9">
        <OneThingGoalPath />
        {DISPLAY_HORIZONS.map((horizon, index) => {
          const goal = current(horizon.id)
          const previous = previousOneThing(goals, horizon.id, now, weekStartsOn)
          const period = oneThingPeriod(horizon.id, now, weekStartsOn)
          const isEditing = editing === horizon.id
          const selected = params.get('horizon') === horizon.id
          return <section key={horizon.id} id={`one-thing-${horizon.id}`} className={`relative z-10 scroll-mt-6 rounded-2xl border p-5 sm:p-6 ${CARD_ORDER[index]} ${horizon.id === 'today' || selected ? 'border-[var(--accent-500)]/40 bg-[color-mix(in_srgb,var(--accent-500)_5%,#09090b)]' : 'border-zinc-800 bg-[#0e0e12]'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-xs text-zinc-500">{String(index + 1).padStart(2, '0')}</span>
                <div><h2 className="font-semibold text-zinc-100">{horizon.label}</h2><p className="mt-0.5 text-xs text-zinc-500">{horizon.cadence} · Next {format(period.next, 'MMM d, yyyy')}</p></div>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${goal ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-300'}`}>
                {goal ? <Check size={12}/> : <RefreshCw size={12}/>}{goal ? 'Set' : previous ? 'Review due' : 'Not set'}
              </span>
            </div>
            {isEditing ? <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); if (save(horizon.id, draft, current(horizon.id)?.nextAction ?? '')) setEditing(null) }}>
              <label className="block text-sm text-zinc-300" htmlFor={`goal-${horizon.id}`}>{horizon.prompt}</label>
              <textarea id={`goal-${horizon.id}`} autoFocus rows={3} maxLength={1500} required value={draft} onChange={e => setDraft(e.target.value)} className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100 outline-none focus:border-[var(--accent-400)]" placeholder="One clear, meaningful outcome…"/>
              <div className="flex gap-2"><Button type="submit" size="sm" disabled={!draft.trim()}>Save {horizon.label.toLowerCase()}</Button><Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button></div>
            </form> : <div className="mt-5">
              {goal ? <><p className="whitespace-pre-wrap break-words text-lg leading-relaxed text-zinc-100">{goal.text}</p></> : <>
                <p className="text-sm leading-relaxed text-zinc-400">{horizon.prompt}</p>
                {previous && <div className="mt-3 rounded-xl bg-black/20 p-3"><p className="mb-1 text-xs text-zinc-500">Previous goal · {format(new Date(`${previous.period}T12:00:00`), 'MMM d, yyyy')}</p><p className="whitespace-pre-wrap break-words text-sm text-zinc-300">{previous.text}</p></div>}
              </>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant={goal ? 'ghost' : 'secondary'} size="sm" onClick={() => edit(horizon.id)}><Pencil size={12}/>{goal ? 'Edit goal' : previous ? 'Review & update' : 'Set goal'}</Button>
                {!goal && previous && <Button variant="ghost" size="sm" onClick={() => save(horizon.id, previous.text)}>Keep this goal</Button>}
              </div>
            </div>}

          </section>
        })}
      </div>
      <p className="pb-4 text-xs leading-relaxed text-zinc-500">Daily, weekly, monthly, and yearly goals renew with the calendar. Weeks follow your Settings preference. Someday goals are reviewed each January; keeping a goal confirms that review. Right now is your next action for today. Inspired by <a className="underline hover:text-zinc-300" href="https://the1thing.com/now-is-the-time/" target="_blank" rel="noreferrer">The ONE Thing’s Goal Setting to the Now</a>.</p>
    </div>
  )
}
