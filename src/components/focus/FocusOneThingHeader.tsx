import { useState } from 'react'
import { Check, CornerDownLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { playOneThingSound } from '@/lib/timerSound'

export function FocusOneThingHeader({
  answer,
  compact = false,
  onAnswer,
}: {
  answer: string
  compact?: boolean
  onAnswer: (answer: string) => void
}) {
  const [draft, setDraft] = useState('')

  return (
    <section aria-label="Your focus session One Thing" className="mx-auto w-full max-w-5xl shrink-0 px-3 pt-4 pb-4 text-center sm:px-6">
      {answer ? (
        <div className="flex items-center justify-center gap-3">
        <h1 className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl lg:text-4xl">
          <span className="one-thing-gold-shine-occasional">{answer}</span>
        </h1>
        <button
          type="button"
          aria-label="Complete your focus session One Thing"
          title="Done — choose your next One Thing"
          onClick={() => {
            playOneThingSound('complete')
            setDraft('')
            onAnswer('')
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--accent-500)]/40 text-[var(--accent-400)] transition-colors hover:bg-[var(--accent-500)]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-400)]"
        >
          <Check size={18} />
        </button>
        </div>
      ) : (
        <>
          <h1 data-focus-one-thing className={cn(
            'mx-auto flex max-w-3xl flex-col items-center font-semibold leading-snug tracking-tight text-[var(--accent-400)]',
            compact ? 'text-sm sm:text-base' : 'text-xl sm:text-2xl',
          )}>
            <span>What's</span>
            <span className={cn('one-thing-gold-shine whitespace-nowrap', !compact && 'my-1 text-[1.55em] leading-none')}>The ONE Thing</span>
            <span>I can do in this focus session such that everything else becomes easier or unnecessary?</span>
          </h1>
          <form
            data-focus-one-thing
            className="mx-auto mt-3 flex max-w-2xl items-center gap-2 border-b border-zinc-700 pb-2 focus-within:border-[var(--accent-400)]"
            onSubmit={event => {
              event.preventDefault()
              const next = draft.trim()
              if (!next) return
              onAnswer(next)
              playOneThingSound('lock')
              setDraft('')
            }}
          >
            <input
              aria-label="Your focus session One Thing"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault()
              }}
              maxLength={1500}
              placeholder="Type your One Thing…"
              className={cn('min-w-0 flex-1 bg-transparent text-center text-zinc-100 outline-none placeholder:text-zinc-600', compact ? 'text-sm' : 'text-lg')}
            />
            <button type="submit" disabled={!draft.trim()} aria-label="Set your focus session One Thing" title="Press Enter to lock it in" className="rounded-lg p-2 text-[var(--accent-400)] hover:bg-zinc-800 disabled:opacity-30">
              <CornerDownLeft size={18} />
            </button>
          </form>
        </>
      )}
    </section>
  )
}
