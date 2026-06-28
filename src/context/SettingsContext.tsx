import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { format } from 'date-fns'
import { DEFAULT_APP_SETTINGS, type AppSettings } from '@/types'
import { getAppSettings, saveAppSettings } from '@/lib/settingsStore'

interface SettingsContextValue {
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  resetSettings: () => void
  formatTime: (date: Date) => string
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

function applyDocumentSettings(settings: AppSettings) {
  const root = document.documentElement
  root.dataset.accent = settings.accentColor
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const loaded = getAppSettings()
    applyDocumentSettings(loaded)
    return loaded
  })

  useEffect(() => {
    applyDocumentSettings(settings)
  }, [settings])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveAppSettings(next)
      return next
    })
  }, [])

  const resetSettings = useCallback(() => {
    saveAppSettings(DEFAULT_APP_SETTINGS)
    setSettings({ ...DEFAULT_APP_SETTINGS })
  }, [])

  const formatTime = useCallback(
    (date: Date) =>
      settings.timeFormat === '24h' ? format(date, 'HH:mm') : format(date, 'h:mm a'),
    [settings.timeFormat],
  )

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings, formatTime }),
    [settings, updateSettings, resetSettings, formatTime],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
