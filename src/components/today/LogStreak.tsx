import { Flame } from 'lucide-react'

interface LogStreakProps {
  streak: number
}

export function LogStreak({ streak }: LogStreakProps) {
  if (streak <= 0) return null

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-950/60 px-2.5 py-0.5 text-xs font-medium text-orange-400 ring-1 ring-orange-500/20">
      <Flame size={13} className="text-orange-500" />
      {streak} day{streak !== 1 ? 's' : ''}
    </span>
  )
}
