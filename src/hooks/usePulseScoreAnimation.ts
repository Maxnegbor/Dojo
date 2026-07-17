import { useEffect, useRef, useState } from 'react'
import { pulseScoreTier } from '@/lib/pulse'

const NUMBER_TICK_MS = 420
const VISUAL_TIER_MS = 720

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function usePulseScoreAnimation(targetScore: number) {
  const [displayScore, setDisplayScore] = useState(targetScore)
  const [visualScore, setVisualScore] = useState(targetScore)
  const displayRef = useRef(targetScore)
  const visualRef = useRef(targetScore)
  const numberRafRef = useRef<number | undefined>(undefined)
  const visualRafRef = useRef<number | undefined>(undefined)
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      displayRef.current = targetScore
      visualRef.current = targetScore
      setDisplayScore(targetScore)
      setVisualScore(targetScore)
      return
    }

    if (displayRef.current === targetScore && visualRef.current === targetScore) return

    cancelAnimationFrame(numberRafRef.current ?? 0)
    const fromNumber = displayRef.current
    const toNumber = targetScore
    if (fromNumber !== toNumber) {
      const started = performance.now()
      const tickNumber = (now: number) => {
        const progress = Math.min(1, (now - started) / NUMBER_TICK_MS)
        const next = Math.round(fromNumber + (toNumber - fromNumber) * easeOutCubic(progress))
        displayRef.current = next
        setDisplayScore(next)
        if (progress < 1) {
          numberRafRef.current = requestAnimationFrame(tickNumber)
        } else {
          displayRef.current = toNumber
          setDisplayScore(toNumber)
        }
      }
      numberRafRef.current = requestAnimationFrame(tickNumber)
    }

    const fromTier = pulseScoreTier(visualRef.current)
    const toTier = pulseScoreTier(targetScore)
    cancelAnimationFrame(visualRafRef.current ?? 0)

    if (fromTier === toTier) {
      return () => cancelAnimationFrame(numberRafRef.current ?? 0)
    }

    const fromVisual = visualRef.current
    const toVisual = targetScore
    const visualStarted = performance.now()
    const tickVisual = (now: number) => {
      const progress = Math.min(1, (now - visualStarted) / VISUAL_TIER_MS)
      const next = fromVisual + (toVisual - fromVisual) * easeOutCubic(progress)
      visualRef.current = next
      setVisualScore(next)
      if (progress < 1) {
        visualRafRef.current = requestAnimationFrame(tickVisual)
      } else {
        visualRef.current = toVisual
        setVisualScore(toVisual)
      }
    }
    visualRafRef.current = requestAnimationFrame(tickVisual)

    return () => {
      cancelAnimationFrame(numberRafRef.current ?? 0)
      cancelAnimationFrame(visualRafRef.current ?? 0)
    }
  }, [targetScore])

  return { displayScore, visualScore }
}
