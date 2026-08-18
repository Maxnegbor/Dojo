import { createContext, useContext } from 'react'

export const ScreensaverContext = createContext(false)

export function useScreensaver(): boolean {
  return useContext(ScreensaverContext)
}
