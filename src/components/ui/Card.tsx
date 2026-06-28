import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  action?: ReactNode
}

export function Card({ children, className, title, action }: CardProps) {
  return (
    <section
      className={cn(
        'rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 backdrop-blur-sm',
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
