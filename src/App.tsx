import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { LoginPage } from '@/components/auth/LoginPage'
import { AppLayout } from '@/components/layout/AppLayout'
import { OnboardingGate } from '@/components/layout/OnboardingGate'
import { AppShell } from '@/components/layout/AppShell'
import { AuthProvider } from '@/context/AuthContext'
import { TodayPage } from '@/pages/TodayPage'
import { FocusTimerPage } from '@/pages/FocusTimerPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { OutcomeGoalsPage } from '@/pages/OutcomeGoalsPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { SettingsPage } from '@/pages/SettingsPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="onboarding" element={<OnboardingPage />} />
              <Route element={<OnboardingGate />}>
                <Route element={<AppLayout />}>
                  <Route index element={<TodayPage />} />
                  <Route path="focus" element={<FocusTimerPage />} />
                  <Route path="goals" element={<OutcomeGoalsPage />} />
                  <Route path="metrics" element={<GoalsPage />} />
                  <Route path="overview" element={<OverviewPage />} />
                  <Route path="pulse" element={<Navigate to="/overview" replace />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
