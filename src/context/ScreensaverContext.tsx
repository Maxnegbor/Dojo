import { createContext, useContext } from 'react'

export interface ScreensaverState {
  /** Screensaver visuals are active (includes the exit animation). */
  active: boolean
  /** User activity triggered exit — animate back to normal layout. */
  waking: boolean
}

export const ScreensaverContext = createContext<ScreensaverState>({
  active: false,
  waking: false,
})

export function useScreensaver(): ScreensaverState {
  return useContext(ScreensaverContext)
}
