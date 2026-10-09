import { cn } from '@/lib/utils'

export function ScheduleViewToggle({
  mode,
  onChange,
}: {
  mode: 'day' | 'week'
  onChange: (mode: 'day' | 'week') => void
}) {
  return (
    <div
      role="group"
      aria-label="Schedule view"
      className="relative grid w-[9.5rem] shrink-0 grid-cols-2 rounded-full border border-zinc-800/80 bg-zinc-950/80 p-0.5"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0.5 top-0.5 rounded-full bg-[var(--accent-950)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] transition-[left] duration-300 ease-out"
        style={{
          left: mode === 'week' ? 'calc(50%)' : '2px',
          width: 'calc(50% - 2px)',
        }}
      />
      {(['day', 'week'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            'relative z-10 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-300 ease-out',
            mode === value ? 'text-[var(--accent-300)]' : 'text-zinc-500 hover:text-zinc-300',
          )}
        >
          {value === 'day' ? 'Day' : 'Week'}
        </button>
      ))}
    </div>
  )
}
