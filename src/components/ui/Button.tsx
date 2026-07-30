import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' && 'px-3 py-1.5 text-xs',
        size === 'md' && 'px-4 py-2 text-sm',
        size === 'lg' && 'px-6 py-3 text-base',
        variant === 'primary' &&
          'bg-[var(--accent-600)] text-white hover:bg-[var(--accent-500)] active:bg-[var(--accent-700)]',
        variant === 'secondary' &&
          'border border-zinc-700/80 bg-zinc-900 text-zinc-200 hover:bg-zinc-800',
        variant === 'ghost' && 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
        variant === 'danger' &&
          'bg-red-600/20 text-red-400 hover:bg-red-600/30',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
