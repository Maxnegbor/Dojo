import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  action?: ReactNode
  onClick?: () => void
}

export function Card({ children, className, title, action, onClick }: CardProps) {
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
      className={cn(
        'rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 backdrop-blur-sm',
        onClick &&
          'cursor-pointer text-left transition-colors hover:border-zinc-700/80 hover:bg-zinc-900/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-500)]',
        className,
      )}
    >
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between">
          {title && <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
