import { cn } from '@/lib/utils'
import type { CSSProperties, ReactNode } from 'react'

interface CardProps {
  children?: ReactNode
  className?: string
  title?: ReactNode
  action?: ReactNode
  onClick?: () => void
  style?: CSSProperties
}

export function Card({ children, className, title, action, onClick, style }: CardProps) {
  return (
    <section
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      style={style}
      className={cn(
        'rounded-xl border border-zinc-800/80 bg-zinc-900 p-4',
        onClick &&
          'cursor-pointer text-left transition-colors hover:border-zinc-700/80 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-500)]',
        className,
      )}
    >
      {(title || action) && (
        <header className={cn('flex items-center justify-between', children != null && children !== false && 'mb-3')}>
          {title && <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
