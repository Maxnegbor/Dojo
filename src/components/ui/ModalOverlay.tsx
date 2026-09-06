import { useEffect, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

const ALIGN = {
  sheet:
    'items-end p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6',
  center:
    'items-center p-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6',
} as const

interface ModalOverlayProps {
  children: ReactNode
  onBackdropClick?: () => void
  className?: string
  /** `sheet` docks to the bottom on phones so actions sit above the home indicator. */
  align?: keyof typeof ALIGN
}

/** Full-viewport overlay portaled to `document.body` so it stacks above the mobile tab bar. */
export function ModalOverlay({
  children,
  onBackdropClick,
  className,
  align = 'sheet',
}: ModalOverlayProps) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onBackdropClick?.()
  }

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[80] flex justify-center bg-black/70 backdrop-blur-sm',
        ALIGN[align],
        className,
      )}
      onClick={onBackdropClick ? handleClick : undefined}
    >
      {children}
    </div>,
    document.body,
  )
}
