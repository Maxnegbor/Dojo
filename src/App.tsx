import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { FocusProvider } from '@/context/FocusContext'
import { SettingsProvider } from '@/context/SettingsContext'
import { TodayPage } from '@/pages/TodayPage'
import { FocusTimerPage } from '@/pages/FocusTimerPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { SettingsPage } from '@/pages/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <FocusProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<TodayPage />} />
              <Route path="focus" element={<FocusTimerPage />} />
              <Route path="goals" element={<GoalsPage />} />
              <Route path="overview" element={<OverviewPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </FocusProvider>
      </SettingsProvider>
    </BrowserRouter>
  )
}
