import { Dumbbell, Crosshair, Moon, Sparkles, Target } from 'lucide-react'
import type { OverviewCategory } from '@/lib/overviewCategories'
import { OVERVIEW_CATEGORIES } from '@/lib/overviewCategories'
import { cn } from '@/lib/utils'

const CATEGORY_ICONS: Record<OverviewCategory, typeof Target> = {
  fitness: Dumbbell,
  sleep: Moon,
  habits: Sparkles,
  focus: Crosshair,
  goals: Target,
}

interface OverviewCategoryNavProps {
  value: OverviewCategory
  onChange: (category: OverviewCategory) => void
}

export function OverviewCategoryNav({ value, onChange }: OverviewCategoryNavProps) {
  return (
    <nav
      aria-label="Overview categories"
      className="flex gap-1.5 overflow-x-auto pb-1 lg:w-44 lg:shrink-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0"
    >
      {OVERVIEW_CATEGORIES.map(({ id, label }) => {
        const Icon = CATEGORY_ICONS[id]
        const active = value === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              'flex shrink-0 items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm font-medium transition-colors lg:w-full',
              active
                ? 'bg-[var(--accent-500)]/15 text-[var(--accent-300)] ring-1 ring-[var(--accent-500)]/25'
                : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200',
            )}
          >
            <Icon size={15} className="shrink-0 opacity-80" />
            <span className="whitespace-nowrap">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
