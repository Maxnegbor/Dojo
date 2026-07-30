import { useEffect, useRef, useState } from 'react'
import { playPulseRadiantSequenceSound } from '@/lib/timerSound'

const NUMBER_TICK_MS_MIN = 520
const NUMBER_TICK_MS_MAX = 2400
const NUMBER_TICK_MS_BASE = 360
const NUMBER_TICK_MS_PER_POINT = 38

/** Grow the core while the score is still below 100. */
export const PULSE_RADIANT_GROW_MS = 1750
/** Emit a pre-slam halo around the peak core. */
export const PULSE_RADIANT_NOVA_MS = 420
/** Slam duration — score flips to 100 exactly when this ends. */
export const PULSE_RADIANT_SLAM_MS = 200
export const PULSE_RADIANT_PEAK_SCALE = 1.78

export type PulseRadiantNova = {
  phase: 'emit' | 'implode'
  /** 0 → 1 within the current phase. */
  t: number
}

function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5)
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function easeInCubic(t: number): number {
  return t * t * t
}

function easeInQuint(t: number): number {
  return t * t * t * t * t
}

function numberTickDuration(from: number, to: number): number {
  const delta = Math.abs(to - from)
  if (delta === 0) return 0
  return Math.min(
    NUMBER_TICK_MS_MAX,
    Math.max(NUMBER_TICK_MS_MIN, NUMBER_TICK_MS_BASE + delta * NUMBER_TICK_MS_PER_POINT),
  )
}

type Segment = {
  duration: number
  fromDisplay: number
  toDisplay: number
  fromVisual: number
  toVisual: number
  fromScale: number
  toScale: number
  easeDisplay: (t: number) => number
  easeScale: (t: number) => number
  /** Keep display pinned until the segment completes (used for slam → 100). */
  pinDisplayUntilEnd?: boolean
  /** Tremor that ramps up in the last stretch of a grow. */
  shakeNearEnd?: boolean
  impactAtEnd?: boolean
  novaPhase?: 'emit' | 'implode'
  easeNova?: (t: number) => number
}

const GROW_SHAKE_START = 0.58

function growShakeOffset(progress: number, now: number): { x: number; y: number } {
  if (progress < GROW_SHAKE_START) return { x: 0, y: 0 }
  const u = (progress - GROW_SHAKE_START) / (1 - GROW_SHAKE_START)
  const amp = 0.8 + u * u * 5.2
  const freq = 0.052 + u * 0.045
  return {
    x: Math.sin(now * freq) * amp,
    y: Math.cos(now * freq * 1.37) * amp * 0.55,
  }
}

/** Lead-in SFX timed to the same grow → nova → slam segments about to run. */
function playRadiantLeadInForSegments(segments: Segment[]) {
  const growSeg = segments.find((s) => s.shakeNearEnd || (!s.novaPhase && s.toScale > s.fromScale))
  playPulseRadiantSequenceSound({
    growMs: growSeg?.duration ?? 0,
    novaMs: PULSE_RADIANT_NOVA_MS,
  })
}

function runSegments(
  segments: Segment[],
  refs: {
    displayRef: { current: number }
    visualRef: { current: number }
    scaleRef: { current: number }
  },
  setDisplayScore: (n: number) => void,
  setVisualScore: (n: number) => void,
  setCoreScale: (n: number) => void,
  setCoreShake: (shake: { x: number; y: number }) => void,
  setRadiantNova: (nova: PulseRadiantNova | null) => void,
  onImpact: (() => void) | undefined,
  rafRef: { current: number | undefined },
) {
  if (segments.length === 0) return

  let phaseIndex = 0
  let phaseStarted = performance.now()

  const tick = (now: number) => {
    const phase = segments[phaseIndex]
    if (!phase) return

    const progress = Math.min(1, (now - phaseStarted) / Math.max(1, phase.duration))
    const displayT = phase.easeDisplay(progress)
    const scaleT = phase.easeScale(progress)
    const novaT = (phase.easeNova ?? ((t: number) => t))(progress)

    let nextDisplay: number
    if (phase.pinDisplayUntilEnd) {
      nextDisplay = progress >= 1 ? phase.toDisplay : phase.fromDisplay
    } else {
      nextDisplay = Math.round(
        phase.fromDisplay + (phase.toDisplay - phase.fromDisplay) * displayT,
      )
    }
    const nextVisual = phase.fromVisual + (phase.toVisual - phase.fromVisual) * displayT
    const nextScale = phase.fromScale + (phase.toScale - phase.fromScale) * scaleT
    const nextShake =
      phase.shakeNearEnd && progress < 1 ? growShakeOffset(progress, now) : { x: 0, y: 0 }

    refs.displayRef.current = nextDisplay
    refs.visualRef.current = nextVisual
    refs.scaleRef.current = nextScale
    setDisplayScore(nextDisplay)
    setVisualScore(nextVisual)
    setCoreScale(nextScale)
    setCoreShake(nextShake)
    setRadiantNova(phase.novaPhase ? { phase: phase.novaPhase, t: novaT } : null)

    if (progress < 1) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    refs.displayRef.current = phase.toDisplay
    refs.visualRef.current = phase.toVisual
    refs.scaleRef.current = phase.toScale
    setDisplayScore(phase.toDisplay)
    setVisualScore(phase.toVisual)
    setCoreScale(phase.toScale)
    setCoreShake({ x: 0, y: 0 })

    if (phase.impactAtEnd) {
      setRadiantNova(null)
      onImpact?.()
    } else if (phase.novaPhase && phaseIndex < segments.length - 1) {
      // Hand off to next phase (emit → implode) without clearing.
      setRadiantNova({ phase: phase.novaPhase, t: 1 })
    } else {
      setRadiantNova(null)
    }

    if (phaseIndex < segments.length - 1) {
      phaseIndex += 1
      phaseStarted = now
      rafRef.current = requestAnimationFrame(tick)
    }
  }

  rafRef.current = requestAnimationFrame(tick)
}

function appendNovaAndSlam(segments: Segment[], scale: number, display: number, visual: number) {
  // Hold peak while a halo blooms around the core.
  segments.push({
    duration: PULSE_RADIANT_NOVA_MS,
    fromDisplay: display,
    toDisplay: display,
    fromVisual: visual,
    toVisual: visual,
    fromScale: scale,
    toScale: scale,
    easeDisplay: easeOutQuint,
    easeScale: easeOutCubic,
    novaPhase: 'emit',
    easeNova: easeOutCubic,
  })

  const slammingToHundred = display === 99
  // Halo collapses inward as the core slams down.
  segments.push({
    duration: PULSE_RADIANT_SLAM_MS,
    fromDisplay: display,
    toDisplay: slammingToHundred ? 100 : display,
    fromVisual: visual,
    toVisual: slammingToHundred ? 100 : visual,
    fromScale: scale,
    toScale: 1,
    easeDisplay: easeInCubic,
    easeScale: easeInCubic,
    pinDisplayUntilEnd: slammingToHundred,
    impactAtEnd: true,
    novaPhase: 'implode',
    easeNova: easeInQuint,
  })
}

function buildApproachHundredSegments(
  fromNumber: number,
  fromVisual: number,
  fromScale: number,
): Segment[] {
  const segments: Segment[] = []
  const preHundred = 99
  let scale = fromScale
  let visual = fromVisual
  let display = fromNumber

  if (display < preHundred) {
    // Grow starts immediately with the tick-up; peak as we arrive at 99.
    const tickMs = numberTickDuration(display, preHundred)
    const growTickMs = Math.max(tickMs, PULSE_RADIANT_GROW_MS)
    segments.push({
      duration: growTickMs,
      fromDisplay: display,
      toDisplay: preHundred,
      fromVisual: visual,
      toVisual: preHundred,
      fromScale: scale,
      toScale: PULSE_RADIANT_PEAK_SCALE,
      easeDisplay: easeOutQuint,
      easeScale: easeOutCubic,
      shakeNearEnd: true,
    })
    scale = PULSE_RADIANT_PEAK_SCALE
    display = preHundred
    visual = preHundred
  } else if (scale < PULSE_RADIANT_PEAK_SCALE - 0.01) {
    // Already at 99 — finish growing before the slam.
    segments.push({
      duration: PULSE_RADIANT_GROW_MS,
      fromDisplay: display,
      toDisplay: preHundred,
      fromVisual: visual,
      toVisual: preHundred,
      fromScale: scale,
      toScale: PULSE_RADIANT_PEAK_SCALE,
      easeDisplay: easeOutQuint,
      easeScale: easeOutCubic,
      shakeNearEnd: true,
    })
    scale = PULSE_RADIANT_PEAK_SCALE
  }

  appendNovaAndSlam(segments, scale, display, visual)
  return segments
}

function buildForceCelebrateSegments(score: number, fromScale: number): Segment[] {
  const segments: Segment[] = [
    {
      duration: PULSE_RADIANT_GROW_MS,
      fromDisplay: score,
      toDisplay: score,
      fromVisual: score,
      toVisual: score,
      fromScale,
      toScale: PULSE_RADIANT_PEAK_SCALE,
      easeDisplay: easeOutQuint,
      easeScale: easeOutCubic,
      shakeNearEnd: true,
    },
  ]
  appendNovaAndSlam(segments, PULSE_RADIANT_PEAK_SCALE, score, score)
  return segments
}

interface UsePulseScoreAnimationOptions {
  /** When true, animating to 100 includes grow→slam synced to the ticker. */
  celebrateRadiant?: boolean
  /** Increment to force grow→slam (dev replay). */
  forceCelebrateKey?: number
  onRadiantImpact?: () => void
}

export function usePulseScoreAnimation(
  targetScore: number,
  {
    celebrateRadiant = false,
    forceCelebrateKey = 0,
    onRadiantImpact,
  }: UsePulseScoreAnimationOptions = {},
) {
  const [displayScore, setDisplayScore] = useState(targetScore)
  const [visualScore, setVisualScore] = useState(targetScore)
  const [coreScale, setCoreScale] = useState(1)
  const [coreShake, setCoreShake] = useState({ x: 0, y: 0 })
  const [radiantNova, setRadiantNova] = useState<PulseRadiantNova | null>(null)
  const displayRef = useRef(targetScore)
  const visualRef = useRef(targetScore)
  const scaleRef = useRef(1)
  const rafRef = useRef<number | undefined>(undefined)
  const mountedRef = useRef(false)
  const onImpactRef = useRef(onRadiantImpact)
  onImpactRef.current = onRadiantImpact
  const celebrateRef = useRef(celebrateRadiant)
  celebrateRef.current = celebrateRadiant

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      displayRef.current = targetScore
      visualRef.current = targetScore
      scaleRef.current = 1
      setDisplayScore(targetScore)
      setVisualScore(targetScore)
      setCoreScale(1)
      setCoreShake({ x: 0, y: 0 })
      setRadiantNova(null)

      // Already at 100 on first paint — still run grow→slam if celebration is enabled.
      if (targetScore === 100 && celebrateRef.current) {
        const frame = window.requestAnimationFrame(() => {
          const segments = buildForceCelebrateSegments(100, 1)
          playRadiantLeadInForSegments(segments)
          runSegments(
            segments,
            { displayRef, visualRef, scaleRef },
            setDisplayScore,
            setVisualScore,
            setCoreScale,
            setCoreShake,
            setRadiantNova,
            () => onImpactRef.current?.(),
            rafRef,
          )
        })
        return () => {
          window.cancelAnimationFrame(frame)
          cancelAnimationFrame(rafRef.current ?? 0)
        }
      }
      return
    }

    if (displayRef.current === targetScore && visualRef.current === targetScore) return

    cancelAnimationFrame(rafRef.current ?? 0)

    const fromNumber = displayRef.current
    const fromVisual = visualRef.current
    const fromScale = scaleRef.current
    const to = targetScore
    const approachingHundred = to === 100 && fromNumber < 100 && celebrateRef.current

    let segments: Segment[]

    if (approachingHundred) {
      segments = buildApproachHundredSegments(fromNumber, fromVisual, fromScale)
      playRadiantLeadInForSegments(segments)
    } else {
      const duration = numberTickDuration(fromNumber, to)
      if (duration === 0) {
        displayRef.current = to
        visualRef.current = to
        setDisplayScore(to)
        setVisualScore(to)
        setRadiantNova(null)
        return
      }
      segments = [
        {
          duration,
          fromDisplay: fromNumber,
          toDisplay: to,
          fromVisual,
          toVisual: to,
          fromScale,
          toScale: fromScale,
          easeDisplay: easeOutQuint,
          easeScale: easeOutQuint,
        },
      ]
      setRadiantNova(null)
    }

    runSegments(
      segments,
      { displayRef, visualRef, scaleRef },
      setDisplayScore,
      setVisualScore,
      setCoreScale,
      setCoreShake,
      setRadiantNova,
      () => onImpactRef.current?.(),
      rafRef,
    )

    return () => cancelAnimationFrame(rafRef.current ?? 0)
  }, [targetScore])

  // Forced grow→slam (already at 100 / dev replay).
  useEffect(() => {
    if (!forceCelebrateKey) return
    cancelAnimationFrame(rafRef.current ?? 0)
    const score = displayRef.current
    const segments = buildForceCelebrateSegments(score, scaleRef.current)
    playRadiantLeadInForSegments(segments)
    runSegments(
      segments,
      { displayRef, visualRef, scaleRef },
      setDisplayScore,
      setVisualScore,
      setCoreScale,
      setCoreShake,
      setRadiantNova,
      () => onImpactRef.current?.(),
      rafRef,
    )
    return () => cancelAnimationFrame(rafRef.current ?? 0)
  }, [forceCelebrateKey])

  return { displayScore, visualScore, coreScale, coreShake, radiantNova }
}
