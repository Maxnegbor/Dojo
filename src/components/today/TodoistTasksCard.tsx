import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { TodoistTasksPanel } from '@/components/today/TodoistTasksPanel'
import { isTodoistConnected } from '@/lib/todoistStore'

interface TodoistTasksCardProps {
  viewDate: string
  className?: string
}

export function TodoistTasksCard({ viewDate, className }: TodoistTasksCardProps) {
  if (!isTodoistConnected()) {
    return (
      <Card title="Todoist" className={className}>
        <p className="text-xs leading-relaxed text-zinc-500">
          Connect Todoist to see today’s tasks here.{' '}
          <Link
            to="/settings"
            state={{ settingsSection: 'integrations' }}
            className="text-[var(--accent-300)] hover:underline"
          >
            Settings → Integrations
          </Link>
        </p>
      </Card>
    )
  }

  return (
    <Card title="Todoist" className={className}>
      <TodoistTasksPanel viewDate={viewDate} hideHeader />
    </Card>
  )
}
