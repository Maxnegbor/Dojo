import { NavLink } from 'react-router-dom'
import { PulseMeter } from '@/components/pulse/PulseMeter'
import { PULSE_HEADER_SCALE } from '@/lib/pulse'
import { cn } from '@/lib/utils'

interface HomePulseCardProps {
  score: number
  scale?: number
  className?: string
}

export function HomePulseCard({ score, scale = PULSE_HEADER_SCALE, className }: HomePulseCardProps) {
  return (
    <NavLink
      to="/pulse"
      aria-label="Open Pulse"
      className={cn(
        'flex w-fit',
        className,
      )}
    >
      <PulseMeter score={score} scale={scale} />
    </NavLink>
  )
}
