import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

export interface SlidingSegmentOption<T extends string> {
  value: T
  label: ReactNode
}

export interface SlidingSegmentedControlProps<T extends string> {
  value: T
  options: readonly SlidingSegmentOption<T>[]
  onChange: (value: T) => void
  className?: string
  buttonClassName?: string
  size?: 'sm' | 'md'
  bordered?: boolean
  equalWidth?: boolean
  'aria-label'?: string
}

const INDICATOR_CLASS =
  'pointer-events-none absolute rounded-lg bg-[var(--accent-600)] shadow-[0_0_12px_var(--accent-glow)] transition-[left,top,width,height] duration-300 ease-out'

export function SlidingSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
  buttonClassName,
  size = 'sm',
  bordered = false,
  equalWidth = true,
  'aria-label': ariaLabel,
}: SlidingSegmentedControlProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())
  const [indicator, setIndicator] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)

  const updateIndicator = useCallback(() => {
    const track = trackRef.current
    const activeEl = itemRefs.current.get(value)
    if (!track || !activeEl) {
      setIndicator(null)
      return
    }

    setIndicator({
      left: activeEl.offsetLeft,
      top: activeEl.offsetTop,
      width: activeEl.offsetWidth,
      height: activeEl.offsetHeight,
    })
  }, [value])

  useLayoutEffect(() => {
    updateIndicator()
  }, [updateIndicator, options])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const ro = new ResizeObserver(() => updateIndicator())
    ro.observe(track)
    for (const el of itemRefs.current.values()) {
      ro.observe(el)
    }

    return () => ro.disconnect()
  }, [updateIndicator, options, value])

  const buttonSizeClass =
    size === 'md' ? 'px-3 py-2 text-xs font-medium' : 'px-2 py-1 text-[11px] font-medium'

  return (
    <div
      ref={trackRef}
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'relative flex gap-1 rounded-xl p-1',
        bordered ? 'border border-zinc-800 bg-zinc-900/50' : 'rounded-lg bg-zinc-800',
        className,
      )}
    >
      {indicator && (
        <div
          aria-hidden
          className={INDICATOR_CLASS}
          style={{
            left: indicator.left,
            top: indicator.top,
            width: indicator.width,
            height: indicator.height,
          }}
        />
      )}
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            ref={(el) => {
              if (el) itemRefs.current.set(option.value, el)
              else itemRefs.current.delete(option.value)
            }}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative z-10 rounded-md transition-colors',
              buttonSizeClass,
              equalWidth && 'flex-1',
              active ? 'text-white' : 'text-zinc-400 hover:text-zinc-200',
              buttonClassName,
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
