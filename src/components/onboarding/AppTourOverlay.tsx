import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Brain, Sparkles, Target } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { stopOnboardingPreview } from '@/lib/onboarding'
import {
  getOnboardingTourStep,
  getTourTargetRect,
  isOnboardingTourPreview,
  ONBOARDING_TOUR_STOPS,
  setOnboardingTourStep,
  stopOnboardingTour,
} from '@/lib/onboardingTour'

const STOP_ICONS = [Sparkles, Brain, Target, Activity] as const

const SPOTLIGHT_PAD = 8

export function AppTourOverlay() {
  const navigate = useNavigate()
  const [stepIndex, setStepIndex] = useState(() => getOnboardingTourStep())
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const preview = isOnboardingTourPreview()

  const stop = ONBOARDING_TOUR_STOPS[stepIndex]
  const StopIcon = STOP_ICONS[stepIndex] ?? Sparkles
  const isLast = stepIndex >= ONBOARDING_TOUR_STOPS.length - 1

  const measureTarget = useCallback(() => {
    if (!stop) return
    setTargetRect(getTourTargetRect([stop.navTarget, stop.contentTarget]))
  }, [stop])

  useEffect(() => {
    if (!stop) return
    if (window.location.pathname !== stop.route) {
      navigate(stop.route)
    }
  }, [navigate, stop])

  useLayoutEffect(() => {
    measureTarget()
    const raf = requestAnimationFrame(measureTarget)
    const timer = window.setTimeout(measureTarget, 150)
    window.addEventListener('resize', measureTarget)
    window.addEventListener('scroll', measureTarget, true)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      window.removeEventListener('resize', measureTarget)
      window.removeEventListener('scroll', measureTarget, true)
    }
  }, [measureTarget, stepIndex])

  const persistStep = (next: number) => {
    setStepIndex(next)
    setOnboardingTourStep(next)
  }

  const finish = () => {
    stopOnboardingTour()
    if (preview) {
      stopOnboardingPreview()
      navigate('/settings')
      return
    }
    navigate('/')
  }

  const handleBack = () => {
    if (stepIndex === 0) return
    persistStep(stepIndex - 1)
  }

  const handleNext = () => {
    if (isLast) {
      finish()
      return
    }
    persistStep(stepIndex + 1)
  }

  if (!stop) return null

  const spotlightStyle = targetRect
    ? {
        top: targetRect.top - SPOTLIGHT_PAD,
        left: targetRect.left - SPOTLIGHT_PAD,
        width: targetRect.width + SPOTLIGHT_PAD * 2,
        height: targetRect.height + SPOTLIGHT_PAD * 2,
      }
    : { top: '50%', left: '50%', width: 0, height: 0, transform: 'translate(-50%, -50%)' }

  const tooltipTop = targetRect
    ? targetRect.bottom + SPOTLIGHT_PAD + 16
    : undefined

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none" aria-modal role="dialog">
      <div
        className="pointer-events-none absolute rounded-xl ring-2 ring-[var(--accent-400)] transition-all duration-300"
        style={{
          ...spotlightStyle,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.72)',
        }}
      />

      <div
        className="pointer-events-auto absolute inset-x-0 mx-auto w-full max-w-md px-5"
        style={tooltipTop != null ? { top: Math.min(tooltipTop, window.innerHeight - 280) } : { bottom: 32 }}
      >
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/95 p-5 shadow-2xl backdrop-blur-md">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-950)] ring-1 ring-[var(--accent-500)]/25">
              <StopIcon size={20} className="text-[var(--accent-400)]" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Quick tour · {stepIndex + 1} / {ONBOARDING_TOUR_STOPS.length}
              </p>
              <h2 className="text-base font-semibold text-zinc-100">{stop.title}</h2>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-zinc-400">{stop.body}</p>
          <p className="mt-3 rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-500">
            {stop.hint}
          </p>

          <div className="mt-4 flex justify-center gap-1.5">
            {ONBOARDING_TOUR_STOPS.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Tour stop ${i + 1}`}
                onClick={() => persistStep(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === stepIndex ? 'w-6 bg-[var(--accent-500)]' : 'w-1.5 bg-zinc-700 hover:bg-zinc-500',
                )}
              />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={stepIndex === 0}
            >
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={finish}>
                Skip
              </Button>
              <Button type="button" size="sm" onClick={handleNext}>
                {isLast ? (preview ? 'Finish preview' : 'Enter Dojo') : 'Next'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
