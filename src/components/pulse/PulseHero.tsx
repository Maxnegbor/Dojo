import { PulseMeter } from '@/components/pulse/PulseMeter'
import { PULSE_PAGE_SCALE } from '@/lib/pulse'

interface PulseHeroProps {
  score: number
  configured: boolean
  scale?: number
}

export function PulseHero({
  score,
  configured,
  scale = PULSE_PAGE_SCALE,
}: PulseHeroProps) {
  return (
    <div className="relative flex flex-col items-center overflow-visible py-2">
      <PulseMeter score={score} scale={scale} />

      {!configured && (
        <p className="mt-6 max-w-sm text-center text-sm text-zinc-400">
          Configure Pulse to choose individual metrics and how much each counts toward your daily
          score.
        </p>
      )}
    </div>
  )
}
