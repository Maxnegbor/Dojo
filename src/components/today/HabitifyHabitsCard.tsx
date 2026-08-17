import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { HabitifyHabitsPanel } from '@/components/today/HabitifyHabitsPanel'
import { isHabitifyHomeCollapsed, setHabitifyHomeCollapsed } from '@/lib/habitifyStore'
import { cn } from '@/lib/utils'

interface HabitifyHabitsCardProps {
  viewDate: string
  className?: string
}

export function HabitifyHabitsCard({ viewDate, className }: HabitifyHabitsCardProps) {
  const [collapsed, setCollapsed] = useState(() => isHabitifyHomeCollapsed())

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      setHabitifyHomeCollapsed(next)
      return next
    })
  }

  return (
    <Card
      className={cn(
        'h-fit min-w-0 w-full shrink-0 overflow-visible',
        className,
      )}
    >
      <HabitifyHabitsPanel
        viewDate={viewDate}
        collapsed={collapsed}
        headerLeading={
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Show Habitify habits' : 'Hide Habitify habits'}
            className="-ml-0.5 flex min-w-0 items-center gap-1.5 text-left text-sm font-semibold text-zinc-200 hover:text-zinc-50"
          >
            {collapsed ? (
              <ChevronRight size={16} className="shrink-0 text-zinc-400" />
            ) : (
              <ChevronDown size={16} className="shrink-0 text-zinc-400" />
            )}
            <span className="truncate">Habitify</span>
          </button>
        }
      />
    </Card>
  )
}
