import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface PulseRadiantBurstProps {
  /** Viewport coordinates for the burst origin (pulse center). */
  origin: { x: number; y: number }
  onComplete: () => void
  className?: string
}

/** Keep in sync with CSS animation duration. */
export const PULSE_RADIANT_BURST_MS = 1600

const BG_EFFECTS_ROOT_ID = 'dojo-bg-effects'

export function PulseRadiantBurst({ origin, onComplete, className }: PulseRadiantBurstProps) {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
  const [localOrigin, setLocalOrigin] = useState(origin)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    setMountNode(document.getElementById(BG_EFFECTS_ROOT_ID))
  }, [])

  useEffect(() => {
    const layer = document.getElementById(BG_EFFECTS_ROOT_ID)
    if (!layer) {
      setLocalOrigin(origin)
      return
    }
    const layerRect = layer.getBoundingClientRect()
    setLocalOrigin({
      x: origin.x - layerRect.left,
      y: origin.y - layerRect.top,
    })
  }, [origin])

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      onCompleteRef.current()
      return
    }

    const doneTimer = window.setTimeout(() => {
      onCompleteRef.current()
    }, PULSE_RADIANT_BURST_MS)

    return () => {
      window.clearTimeout(doneTimer)
    }
  }, [])

  if (!mountNode) return null

  return createPortal(
    <div
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      aria-hidden
    >
      <div
        className="pulse-radiant-burst-wave"
        style={{
          left: localOrigin.x,
          top: localOrigin.y,
        }}
      >
        {/* Glow trails behind the solid ring (inward from the wave front). */}
        <div className="pulse-radiant-burst-glow" />
        <div className="pulse-radiant-burst-ring" />
      </div>
    </div>,
    mountNode,
  )
}
