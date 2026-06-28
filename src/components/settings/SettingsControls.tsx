import { cn } from '@/lib/utils'

interface SegmentedControlOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  label?: string
  value: T
  options: SegmentedControlOption<T>[]
  onChange: (value: T) => void
  className?: string
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div className={className}>
      {label && (
        <span className="mb-2 block text-xs font-medium text-zinc-400">{label}</span>
      )}
      <div
        className="flex rounded-xl border border-zinc-700/80 bg-zinc-900/80 p-1"
        role="group"
        aria-label={label}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-200',
              value === option.value
                ? 'bg-[var(--accent-600)] text-white shadow-[0_0_12px_var(--accent-glow)]'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface ToggleRowProps {
  label: string
  description?: string
  checked: boolean
  compact?: boolean
  onChange: (checked: boolean) => void
}

export function ToggleRow({ label, description, checked, compact, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className={cn('text-zinc-200', compact ? 'text-xs font-medium' : 'text-sm')}>{label}</p>
        {description && <p className="text-[11px] text-zinc-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative shrink-0 rounded-full transition-colors',
          compact ? 'h-5 w-9' : 'h-7 w-12',
          checked ? 'bg-[var(--accent-600)]' : 'bg-zinc-700',
        )}
      >
        <span
          className={cn(
            'absolute rounded-full bg-white shadow transition-transform',
            compact ? 'top-0.5 left-0.5 h-4 w-4' : 'top-0.5 left-0.5 h-6 w-6',
            compact ? checked && 'translate-x-4' : checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  )
}

interface SettingsSectionProps {
  title: string
  description?: string
  children: React.ReactNode
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
