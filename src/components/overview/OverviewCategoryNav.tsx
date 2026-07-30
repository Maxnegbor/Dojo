import { useEffect, useMemo, useState } from 'react'
import { Crosshair, Dumbbell, Folder, Moon, Sparkles, type LucideIcon } from 'lucide-react'
import { SlidingNavList } from '@/components/ui/SlidingNavList'
import {
  getOverviewCategories,
  type OverviewCategory,
  type OverviewCategoryItem,
} from '@/lib/overviewCategories'
import { METRICS_SECTIONS_CHANGED } from '@/lib/metricsSections'

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  fitness: Dumbbell,
  sleep: Moon,
  habits: Sparkles,
  focus: Crosshair,
}

interface OverviewCategoryNavProps {
  value: OverviewCategory
  onChange: (category: OverviewCategory) => void
  categories?: OverviewCategoryItem[]
}

export function OverviewCategoryNav({
  value,
  onChange,
  categories: categoriesProp,
}: OverviewCategoryNavProps) {
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const refresh = () => setRevision((n) => n + 1)
    window.addEventListener(METRICS_SECTIONS_CHANGED, refresh)
    return () => window.removeEventListener(METRICS_SECTIONS_CHANGED, refresh)
  }, [])

  const categories = useMemo(
    () => categoriesProp ?? getOverviewCategories(),
    [categoriesProp, revision],
  )

  useEffect(() => {
    if (categories.length === 0) return
    if (!categories.some((category) => category.id === value)) {
      onChange(categories[0].id)
    }
  }, [categories, value, onChange])

  if (categories.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-4 text-sm text-zinc-500 lg:w-44">
        Add metrics categories on the Metrics page to see overview tabs.
      </p>
    )
  }

  return (
    <SlidingNavList
      activeId={value}
      items={categories}
      getKey={(category) => category.id}
      onSelect={(category) => onChange(category.id)}
      ariaLabel="Overview categories"
      className="flex gap-1.5 overflow-x-auto pb-1 lg:w-44 lg:shrink-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0"
      itemClassName="flex shrink-0 items-center gap-2.5 px-3.5 py-2.5 lg:w-full"
      renderItem={({ id, label }) => {
        const Icon = CATEGORY_ICONS[id] ?? Folder
        return (
          <>
            <Icon size={15} className="shrink-0 opacity-80" />
            <span className="whitespace-nowrap">{label}</span>
          </>
        )
      }}
    />
  )
}
