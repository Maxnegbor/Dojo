import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AddGhostCardProps {
  onClick: () => void
  label?: string
  className?: string
}

export function AddGhostCard({ onClick, label = 'Add', className }: AddGhostCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex min-h-[4.5rem] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-800 bg-transparent p-4 text-zinc-600 transition-all duration-200',
        'hover:border-[var(--accent-500)]/50 hover:bg-[var(--accent-500)]/8 hover:text-[var(--accent-300)] hover:shadow-[0_0_20px_var(--accent-glow)]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-500)]',
        className,
      )}
    >
      <Plus size={18} strokeWidth={2} />
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}
