import { useEffect, useRef, useState } from 'react'
import { Check, CornerDownLeft } from 'lucide-react'
import { OneThingHomeCard } from '@/components/oneThing/OneThingHomeCard'
import { useOneThing } from '@/hooks/useOneThing'
import { currentOneThing, nextOneThingToSet } from '@/lib/oneThingPeriods'
import { playOneThingSound } from '@/lib/timerSound'
import { cn } from '@/lib/utils'

export function RightNowHeader() {
  const { goals, now, weekStartsOn, ready, save, complete } = useOneThing()
  const goal = currentOneThing(goals, 'rightNow', now, weekStartsOn)
  const pending = nextOneThingToSet(goals, now, weekStartsOn)
  const [draft, setDraft] = useState('')
  const [focusNext, setFocusNext] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const pendingId = pending?.horizon.id
  useEffect(() => {
    if (focusNext && pendingId) {
      input.current?.focus()
      setFocusNext(false)
    }
  }, [focusNext, pendingId])
  if (!ready) return null
  const asking = pending
  const parentGoal = asking?.parent && asking.parentGoal ? asking.parentGoal : null
  const [promptBefore = '', promptAfter = ''] = (asking?.horizon.prompt ?? '').split('the ONE Thing')
  // Clear the fixed Day/Week control, then sit on the midpoint above the schedule.
  // The negative margin gives that top space back so the schedule stays put.
  return <section aria-label="Your right now focus" className="relative z-50 mx-auto w-full max-w-5xl shrink-0 px-3 pt-[4.5rem] pb-0 -mb-2 text-center sm:px-6">
    {parentGoal && asking?.parent && <p className="mx-auto mb-8 max-w-md whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-400"><span className="font-medium text-zinc-300">{asking.parent.label} goal:</span> {parentGoal.text}</p>}
    {!asking && goal ? <div className="inline-flex max-w-full items-center justify-center gap-3">
      <div className="group/one relative min-w-0">
        <h1 className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl lg:text-4xl"><span className="one-thing-gold-shine-occasional">{goal.text}</span></h1>
        <div className={cn(
          'pointer-events-none invisible absolute left-1/2 top-full z-[80] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 pt-2 text-left opacity-0 transition duration-150',
          'group-hover/one:pointer-events-auto group-hover/one:visible group-hover/one:opacity-100',
        )}>
          <OneThingHomeCard className="bg-zinc-950/95 shadow-2xl shadow-black/60 backdrop-blur-sm" />
        </div>
      </div>
      <button type="button" aria-label="Complete your right now One Thing" title="Done — choose your next One Thing" onClick={() => {
        if (complete()) {
          playOneThingSound('complete')
          setDraft('')
          setFocusNext(true)
        }
      }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--accent-500)]/40 text-[var(--accent-400)] transition-colors hover:bg-[var(--accent-500)]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-400)]"><Check size={18}/></button>
    </div> : asking ? <>
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
        <h1 className="flex flex-col items-center text-center text-xl font-semibold leading-snug tracking-tight text-[var(--accent-400)] sm:text-2xl">
          <span>{promptBefore.trim()}</span>
          <span className="one-thing-gold-shine my-1 whitespace-nowrap text-[1.55em] leading-snug pb-[0.1em]">The ONE Thing</span>
          <span>{promptAfter.trim()}</span>
        </h1>
      </div>
      <form className="mx-auto mt-3 flex max-w-2xl items-center gap-2 border-b border-zinc-700 pb-2 focus-within:border-[var(--accent-400)]" onSubmit={event => {
        event.preventDefault()
        if (save(asking.horizon.id, draft)) {
          playOneThingSound('lock')
          setDraft('')
          setFocusNext(true)
        }
      }}>
        <input ref={input} aria-label={`Your ${asking.horizon.label.toLowerCase()} One Thing`} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault() }} maxLength={1500} placeholder="Type your One Thing…" className="min-w-0 flex-1 bg-transparent text-center text-lg text-zinc-100 outline-none placeholder:text-zinc-600"/>
        <button type="submit" disabled={!draft.trim()} aria-label={`Set your ${asking.horizon.label.toLowerCase()} One Thing`} title="Press Enter to lock it in" className="rounded-lg p-2 text-[var(--accent-400)] hover:bg-zinc-800 disabled:opacity-30"><CornerDownLeft size={18}/></button>
      </form>
    </> : null}
  </section>
}
