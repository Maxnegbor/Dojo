import { cn } from '@/lib/utils'
import { typedReminderMatches } from '@/lib/typedReminder'

interface TypedReminderConfirmProps {
  text: string
  value: string
  onChange: (value: string) => void
  className?: string
}

export function TypedReminderConfirm({
  text,
  value,
  onChange,
  className,
}: TypedReminderConfirmProps) {
  const matches = typedReminderMatches(text, value)
  const started = value.length > 0

  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <p className="mb-2 text-sm text-zinc-300">Type this reminder to continue:</p>
        <blockquote className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 px-4 py-3 text-sm leading-relaxed text-zinc-100">
          {text.trim()}
        </blockquote>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-zinc-400">Your typing</span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={Math.min(6, Math.max(3, text.trim().split('\n').length + 1))}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          placeholder="Type the reminder exactly…"
          className={cn(
            'w-full resize-y rounded-xl border bg-zinc-950/60 px-3 py-2.5 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:outline-none',
            matches
              ? 'border-emerald-500/50 focus:border-emerald-500'
              : started
                ? 'border-amber-500/40 focus:border-amber-500'
                : 'border-zinc-700 focus:border-[var(--accent-500)]',
          )}
        />
      </label>

      {started && !matches && (
        <p className="text-xs text-amber-400/90">Keep going — it needs to match exactly.</p>
      )}
      {matches && (
        <p className="text-xs text-emerald-400/90">Matched. You can continue.</p>
      )}
    </div>
  )
}
