import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { WhoopPanel } from '@/components/today/WhoopPanel'
import { isWhoopHomeCollapsed, setWhoopHomeCollapsed } from '@/lib/whoopStore'
import { cn } from '@/lib/utils'

interface WhoopCardProps {
  viewDate: string
  className?: string
}

export function WhoopCard({ viewDate, className }: WhoopCardProps) {
  const [collapsed, setCollapsed] = useState(() => isWhoopHomeCollapsed())

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      setWhoopHomeCollapsed(next)
      return next
    })
  }

  return (
    <Card
      className={cn(
        'home-integration-card h-fit min-w-0 w-full shrink-0 overflow-visible',
        className,
      )}
    >
      <WhoopPanel
        viewDate={viewDate}
        collapsed={collapsed}
        headerLeading={
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Show WHOOP' : 'Hide WHOOP'}
            className="-ml-0.5 flex min-w-0 items-center gap-1.5 text-left text-sm font-semibold text-zinc-200 hover:text-zinc-50"
          >
            {collapsed ? (
              <ChevronRight size={16} className="shrink-0 text-zinc-400" />
            ) : (
              <ChevronDown size={16} className="shrink-0 text-zinc-400" />
            )}
            <span className="truncate">WHOOP</span>
          </button>
        }
      />
    </Card>
  )
}
