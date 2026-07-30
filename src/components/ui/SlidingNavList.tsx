import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

const INDICATOR_CLASS =
  'pointer-events-none absolute rounded-lg bg-[var(--accent-950)] ring-1 ring-inset ring-[var(--accent-ring)]'

type IndicatorState = {
  top: number
  left: number
  width: number
  height: number
  axis: 'vertical' | 'horizontal'
}

export interface SlidingNavListProps<T> {
  activeId: string
  items: readonly T[]
  getKey: (item: T) => string
  onSelect: (item: T) => void
  className?: string
  itemClassName?: string
  ariaLabel?: string
  renderItem: (item: T, active: boolean) => ReactNode
}

const SLIDING_NAV_HOVER_PILL =
  'before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-lg before:bg-zinc-800/60 before:opacity-0 before:transition-opacity hover:before:opacity-100'

function slidingNavItemClass(active: boolean, className?: string) {
  return cn(
    'relative z-10 shrink-0 rounded-lg text-left text-sm font-medium transition-colors',
    active
      ? 'text-[var(--accent-300)]'
      : cn('text-zinc-400 hover:text-zinc-200', SLIDING_NAV_HOVER_PILL),
    className,
  )
}

export function SlidingNavList<T>({
  activeId,
  items,
  getKey,
  onSelect,
  className,
  itemClassName,
  ariaLabel,
  renderItem,
}: SlidingNavListProps<T>) {
  const navRef = useRef<HTMLElement>(null)
  const itemRefs = useRef(new Map<string, HTMLElement>())
  const [indicator, setIndicator] = useState<IndicatorState | null>(null)

  const updateIndicator = useCallback(() => {
    const nav = navRef.current
    if (!nav) return

    const activeEl = itemRefs.current.get(activeId)
    if (!activeEl) {
      setIndicator(null)
      return
    }

    const style = getComputedStyle(nav)
    const isFlex = style.display === 'flex' || style.display === 'inline-flex'
    const axis = isFlex
      ? style.flexDirection === 'column' || style.flexDirection === 'column-reverse'
        ? 'vertical'
        : 'horizontal'
      : 'vertical'

    setIndicator({
      top: activeEl.offsetTop,
      left: activeEl.offsetLeft,
      width: activeEl.offsetWidth,
      height: activeEl.offsetHeight,
      axis,
    })
  }, [activeId])

  useLayoutEffect(() => {
    updateIndicator()
  }, [updateIndicator, items])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return

    const ro = new ResizeObserver(() => updateIndicator())
    ro.observe(nav)
    for (const el of itemRefs.current.values()) {
      ro.observe(el)
    }

    return () => ro.disconnect()
  }, [updateIndicator, items, activeId])

  return (
    <nav ref={navRef} aria-label={ariaLabel} className={cn('relative', className)}>
      {indicator && (
        <div
          aria-hidden
          className={cn(
            INDICATOR_CLASS,
            indicator.axis === 'vertical'
              ? 'left-0 right-0 transition-[top,height] duration-300 ease-out'
              : 'top-0 transition-[left,width] duration-300 ease-out',
          )}
          style={
            indicator.axis === 'vertical'
              ? { top: indicator.top, height: indicator.height }
              : {
                  left: indicator.left,
                  width: indicator.width,
                  height: indicator.height,
                }
          }
        />
      )}
      {items.map((item) => {
        const key = getKey(item)
        const active = key === activeId
        return (
          <button
            key={key}
            type="button"
            ref={(el) => {
              if (el) itemRefs.current.set(key, el)
              else itemRefs.current.delete(key)
            }}
            onClick={() => onSelect(item)}
            className={slidingNavItemClass(active, itemClassName)}
          >
            {renderItem(item, active)}
          </button>
        )
      })}
    </nav>
  )
}
