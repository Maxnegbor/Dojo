import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl'
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
      <SlidingSegmentedControl
        value={value}
        options={options}
        onChange={onChange}
        size="md"
        bordered
        equalWidth
        aria-label={label}
        className="rounded-xl border-zinc-700/80 bg-zinc-900/80"
        buttonClassName="rounded-lg px-3 py-2.5 text-xs"
      />
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
  /** When true, the section body can be toggled from the header. */
  collapsible?: boolean
  /** Initial open state when collapsible. Defaults to true. */
  defaultOpen?: boolean
}

export function SettingsSection({
  title,
  description,
  children,
  collapsible = false,
  defaultOpen = true,
}: SettingsSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const showBody = !collapsible || open

  return (
    <section className="space-y-4">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="-m-1 flex w-[calc(100%+0.5rem)] items-start gap-3 rounded-lg p-1 text-left transition-colors hover:bg-zinc-900/50"
          aria-expanded={open}
          aria-controls={panelId}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
          </div>
          <ChevronDown
            size={16}
            className={cn(
              'mt-0.5 shrink-0 text-zinc-500 transition-transform',
              open && 'rotate-180',
            )}
            aria-hidden
          />
        </button>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
        </div>
      )}
      {showBody && (
        <div id={collapsible ? panelId : undefined} className="space-y-4">
          {children}
        </div>
      )}
    </section>
  )
}
