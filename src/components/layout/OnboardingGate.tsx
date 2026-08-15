import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useSettings } from '@/context/SettingsContext'
import {
  hasExistingUserSetup,
  hasRemoteUserSetup,
  isOnboardingPreview,
  needsOnboarding,
} from '@/lib/onboarding'

export function OnboardingGate() {
  const { settings, updateSettings } = useSettings()
  const { userId, storageReady } = useAuth()
  const location = useLocation()
  const [remoteChecked, setRemoteChecked] = useState(() => !userId)
  const [remoteHasSetup, setRemoteHasSetup] = useState(false)

  useEffect(() => {
    if (!userId || !storageReady) {
      setRemoteChecked(!userId)
      return
    }

    if (settings.onboardingCompleted === true || hasExistingUserSetup(settings)) {
      setRemoteHasSetup(hasExistingUserSetup(settings))
      setRemoteChecked(true)
      return
    }

    let cancelled = false
    setRemoteChecked(false)
    void hasRemoteUserSetup(userId).then((hasSetup) => {
      if (cancelled) return
      setRemoteHasSetup(hasSetup)
      setRemoteChecked(true)
    })

    return () => {
      cancelled = true
    }
  }, [userId, storageReady, settings])

  useEffect(() => {
    if (!storageReady || settings.onboardingCompleted === true) return
    if (hasExistingUserSetup(settings) || remoteHasSetup) {
      updateSettings({ onboardingCompleted: true })
    }
  }, [storageReady, settings, remoteHasSetup, updateSettings])

  if (!storageReady || !remoteChecked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#06060b] text-sm text-zinc-500">
        Loading…
      </div>
    )
  }

  const showOnboarding =
    needsOnboarding(settings) && !remoteHasSetup && !hasExistingUserSetup(settings)

  if (showOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  if (
    !isOnboardingPreview() &&
    (settings.onboardingCompleted || remoteHasSetup || hasExistingUserSetup(settings)) &&
    location.pathname === '/onboarding'
  ) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
