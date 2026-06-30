import { Outlet } from 'react-router-dom'
import { FocusProvider } from '@/context/FocusContext'
import { SettingsProvider } from '@/context/SettingsContext'

export function AppShell() {
  return (
    <SettingsProvider>
      <FocusProvider>
        <Outlet />
      </FocusProvider>
    </SettingsProvider>
  )
}
