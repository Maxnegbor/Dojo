import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSettings } from '@/context/SettingsContext'
import { isOnboardingPreview, needsOnboarding } from '@/lib/onboarding'
import { useOnboardingTourActive } from '@/hooks/useOnboardingTourActive'

export function OnboardingGate() {
  const { settings } = useSettings()
  const location = useLocation()
  const tourActive = useOnboardingTourActive()

  if (needsOnboarding(settings) && !tourActive && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  if (
    !isOnboardingPreview() &&
    settings.onboardingCompleted &&
    location.pathname === '/onboarding'
  ) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
