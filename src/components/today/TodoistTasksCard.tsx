import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { TodoistTasksPanel } from '@/components/today/TodoistTasksPanel'
import { isTodoistHomeCollapsed, setTodoistHomeCollapsed } from '@/lib/todoistStore'
import { cn } from '@/lib/utils'

interface TodoistTasksCardProps {
  viewDate: string
  className?: string
}

export function TodoistTasksCard({ viewDate, className }: TodoistTasksCardProps) {
  const [collapsed, setCollapsed] = useState(() => isTodoistHomeCollapsed())

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      setTodoistHomeCollapsed(next)
      return next
    })
  }

  return (
    <Card
      className={cn(
        'min-w-0 w-full overflow-visible',
        !collapsed && className,
      )}
    >
      <TodoistTasksPanel
        viewDate={viewDate}
        collapsed={collapsed}
        className={collapsed ? undefined : 'min-h-0 flex-1'}
        headerLeading={
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Show Todoist tasks' : 'Hide Todoist tasks'}
            className="-ml-0.5 flex min-w-0 items-center gap-1.5 text-left text-sm font-semibold text-zinc-200 hover:text-zinc-50"
          >
            {collapsed ? (
              <ChevronRight size={16} className="shrink-0 text-zinc-400" />
            ) : (
              <ChevronDown size={16} className="shrink-0 text-zinc-400" />
            )}
            <span className="truncate">Todoist</span>
          </button>
        }
      />
    </Card>
  )
}
