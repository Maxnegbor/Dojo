import { cn } from '@/lib/utils'
import { ToggleRow } from '@/components/settings/SettingsControls'

interface MinuteSliderProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  onChange: (value: number) => void
}

export function MinuteSlider({
  label,
  value,
  min = 5,
  max = 120,
  step = 5,
  disabled = false,
  onChange,
}: MinuteSliderProps) {
  return (
    <div className={disabled ? 'opacity-50' : undefined}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-zinc-100">{value} min</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className={cn(
          'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-700/80',
          'disabled:cursor-not-allowed',
          '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
          '[&::-webkit-slider-thumb]:bg-[var(--accent-500)] [&::-webkit-slider-thumb]:shadow-[0_0_8px_var(--accent-glow)]',
          '[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110',
          '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--accent-500)]',
        )}
      />
      <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
        <span>{min}m</span>
        <span>{max}m</span>
      </div>
    </div>
  )
}

interface CycleStepperProps {
  label?: string
  labelBefore?: string
  labelAfter?: string
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}

export function CycleStepper({
  label,
  labelBefore,
  labelAfter,
  value,
  min = 1,
  max = 20,
  onChange,
}: CycleStepperProps) {
  const inline = labelBefore != null && labelAfter != null

  const controls = (
    <div className={cn('flex items-center', inline ? 'gap-1' : 'gap-3')}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={cn(
          'flex items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/80 text-zinc-200 transition-colors',
          'hover:border-[var(--accent-ring)] hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40',
          inline ? 'h-7 w-7 text-base' : 'h-9 w-9 text-lg',
        )}
        aria-label="Decrease"
      >
        −
      </button>
      <span
        className={cn(
          'text-center font-semibold tabular-nums text-[var(--accent-200)]',
          inline ? 'min-w-[1.25rem] text-sm' : 'min-w-[3rem] text-lg',
        )}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={cn(
          'flex items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/80 text-zinc-200 transition-colors',
          'hover:border-[var(--accent-ring)] hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40',
          inline ? 'h-7 w-7 text-base' : 'h-9 w-9 text-lg',
        )}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  )

  if (inline) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span className="text-xs font-medium text-zinc-400">{labelBefore}</span>
        {controls}
        <span className="text-xs font-medium text-zinc-400">{labelAfter}</span>
      </div>
    )
  }

  return (
    <div>
      {label && <span className="mb-2 block text-xs font-medium text-zinc-400">{label}</span>}
      {controls}
    </div>
  )
}

interface SkipBreaksToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
}

export function SkipBreaksToggle({ checked, onChange }: SkipBreaksToggleProps) {
  return (
    <div>
      <span className="mb-2 block text-xs font-medium text-zinc-400">Breaks</span>
      <div
        className="flex rounded-xl border border-zinc-700/80 bg-zinc-900/80 p-1"
        role="group"
        aria-label="Break mode"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!checked}
          onClick={() => onChange(false)}
          className={cn(
            'flex-1 rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-200',
            !checked
              ? 'bg-[var(--accent-600)] text-white shadow-[0_0_12px_var(--accent-glow)]'
              : 'text-zinc-500 hover:text-zinc-300',
          )}
        >
          With breaks
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={checked}
          onClick={() => onChange(true)}
          className={cn(
            'flex-1 rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-200',
            checked
              ? 'bg-[var(--accent-600)] text-white shadow-[0_0_12px_var(--accent-glow)]'
              : 'text-zinc-500 hover:text-zinc-300',
          )}
        >
          Skip breaks
        </button>
      </div>
    </div>
  )
}

interface LongBreakSettingsProps {
  enabled: boolean
  afterCycles: number
  minutes: number
  disabled?: boolean
  onEnabledChange: (enabled: boolean) => void
  onAfterCyclesChange: (cycles: number) => void
  onMinutesChange: (minutes: number) => void
}

export function LongBreakSettings({
  enabled,
  afterCycles,
  minutes,
  disabled = false,
  onEnabledChange,
  onAfterCyclesChange,
  onMinutesChange,
}: LongBreakSettingsProps) {
  return (
    <div className={cn(disabled && 'pointer-events-none opacity-50')}>
      <ToggleRow
        label="Long break"
        compact
        checked={enabled}
        onChange={onEnabledChange}
      />
      {enabled && (
        <div className="mt-4 space-y-4 border-t border-zinc-800/80 pt-4">
          <CycleStepper
            labelBefore="Every"
            labelAfter="focus sessions"
            value={afterCycles}
            min={1}
            max={20}
            onChange={onAfterCyclesChange}
          />
          <MinuteSlider
            label="Long break duration"
            value={minutes}
            min={5}
            max={60}
            onChange={onMinutesChange}
          />
        </div>
      )}
    </div>
  )
}
