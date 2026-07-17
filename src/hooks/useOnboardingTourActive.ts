import { useEffect, useState } from 'react'
import {
  isOnboardingTourActive,
  ONBOARDING_TOUR_CHANGED,
} from '@/lib/onboardingTour'

export function useOnboardingTourActive(): boolean {
  const [active, setActive] = useState(() => isOnboardingTourActive())

  useEffect(() => {
    const sync = () => setActive(isOnboardingTourActive())
    window.addEventListener(ONBOARDING_TOUR_CHANGED, sync)
    return () => window.removeEventListener(ONBOARDING_TOUR_CHANGED, sync)
  }, [])

  return active
}
