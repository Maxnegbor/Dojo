import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

interface OnboardingLayoutProps {
  step: number
  totalSteps: number
  title: string
  subtitle?: string
  preview?: boolean
  children: React.ReactNode
  footer: React.ReactNode
}

export function OnboardingLayout({
  step,
  totalSteps,
  title,
  subtitle,
  preview,
  children,
  footer,
}: OnboardingLayoutProps) {
  const [animateProgress, setAnimateProgress] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimateProgress(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="flex min-h-dvh flex-col bg-[#06060b] text-zinc-100">
      <header className="border-b border-zinc-800/80 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-semibold tracking-tight">Dojo</span>
          </div>
          <div className="flex items-center gap-2">
            {preview && (
              <span className="rounded-full border border-violet-500/40 bg-violet-950/40 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-300">
                Preview
              </span>
            )}
            <span className="text-[11px] tabular-nums text-zinc-500">
              {step + 1} / {totalSteps}
            </span>
          </div>
        </div>
        <div className="mx-auto mt-4 max-w-lg">
          <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={cn(
                    'h-full w-full origin-left rounded-full bg-[var(--accent-500)]',
                    animateProgress && 'transition-transform duration-500 ease-out',
                  )}
                  style={{ transform: `scaleX(${i <= step ? 1 : 0})` }}
                />
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-8 sm:px-6">
        <div className="mb-6 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">{title}</h1>
          {subtitle && <p className="text-sm leading-relaxed text-zinc-400">{subtitle}</p>}
        </div>
        <div className="flex-1">{children}</div>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-between">{footer}</div>
      </main>
    </div>
  )
}

export function OnboardingOption({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean
  onClick: () => void
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border px-4 py-3 text-left transition-colors',
        selected
          ? 'border-[var(--accent-500)]/60 bg-[var(--accent-950)]/40 ring-1 ring-[var(--accent-500)]/30'
          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
      )}
    >
      <p className="text-sm font-medium text-zinc-100">{title}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
    </button>
  )
}

export function OnboardingField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  )
}

export const onboardingInputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-[var(--accent-ring)] focus:border-[var(--accent-500)] focus:ring-1'

export function OnboardingSelect<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          onboardingInputClass,
          'flex w-full items-center justify-between gap-2 whitespace-nowrap text-left',
        )}
      >
        <span>{selected.label}</span>
        <ChevronDown
          size={14}
          className={cn('shrink-0 text-zinc-500 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  'block w-full px-3 py-2 text-left text-sm transition-colors',
                  option.value === value
                    ? 'bg-[var(--accent-950)] text-[var(--accent-300)]'
                    : 'text-zinc-300 hover:bg-zinc-800',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function OnboardingNavButtons({
  onBack,
  onSkip,
  onNext,
  nextLabel = 'Continue',
  nextDisabled,
  loading,
}: {
  onBack?: () => void
  onSkip?: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
  loading?: boolean
}) {
  return (
    <>
      {onBack ? (
        <Button variant="ghost" onClick={onBack} className="order-3 sm:order-1">
          Back
        </Button>
      ) : (
        <span className="hidden sm:block sm:flex-1 sm:order-1" />
      )}
      <div className="order-1 flex w-full gap-2 sm:order-2 sm:ml-auto sm:w-auto">
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} disabled={loading} className="flex-1 sm:flex-none">
            Skip for now
          </Button>
        )}
        <Button
          className="min-w-[120px] flex-1 sm:flex-none sm:min-w-[140px]"
          onClick={onNext}
          disabled={nextDisabled || loading}
        >
          {loading ? 'Saving…' : nextLabel}
        </Button>
      </div>
    </>
  )
}
