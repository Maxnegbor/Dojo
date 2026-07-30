import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { Moon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useSettings } from '@/context/SettingsContext'
import {
  formatShutdownRequireTimeLabel,
  isPastShutdownRequireTime,
  isShutdownSubmitted,
  requestOpenShutdown,
  SHUTDOWN_CHANGED,
  SHUTDOWN_FLOW_CLOSED,
  SHUTDOWN_OPEN_REQUESTED,
} from '@/lib/dailyShutdownRequire'
import { cn, formatDate } from '@/lib/utils'

interface ShutdownGateProps {
  children: React.ReactNode
}

export function ShutdownGate({ children }: ShutdownGateProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { settings } = useSettings()
  const today = formatDate(new Date())
  const [submitted, setSubmitted] = useState(() => isShutdownSubmitted(today))
  const [pastRequireTime, setPastRequireTime] = useState(() =>
    isPastShutdownRequireTime(settings),
  )
  /** Hide the require blur while the shutdown modal is open so it isn't trapped behind. */
  const [flowOpen, setFlowOpen] = useState(false)

  useEffect(() => {
    setSubmitted(isShutdownSubmitted(today))
    setFlowOpen(false)
  }, [today])

  useEffect(() => {
    const sync = () => {
      const done = isShutdownSubmitted(today)
      setSubmitted(done)
      if (done) setFlowOpen(false)
    }
    window.addEventListener(SHUTDOWN_CHANGED, sync)
    return () => window.removeEventListener(SHUTDOWN_CHANGED, sync)
  }, [today])

  useEffect(() => {
    const onOpen = () => setFlowOpen(true)
    const onClose = () => setFlowOpen(false)
    window.addEventListener(SHUTDOWN_OPEN_REQUESTED, onOpen)
    window.addEventListener(SHUTDOWN_FLOW_CLOSED, onClose)
    return () => {
      window.removeEventListener(SHUTDOWN_OPEN_REQUESTED, onOpen)
      window.removeEventListener(SHUTDOWN_FLOW_CLOSED, onClose)
    }
  }, [])

  useEffect(() => {
    const tick = () => setPastRequireTime(isPastShutdownRequireTime(settings))
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [settings])

  const shutdownPending =
    pathname !== '/settings' &&
    settings.requireShutdown &&
    pastRequireTime &&
    !submitted

  const requireLabel = formatShutdownRequireTimeLabel(settings, settings.timeFormat)
  const lockHomeLayout = pathname === '/'

  const openShutdown = () => {
    setFlowOpen(true)
    if (pathname === '/') {
      requestOpenShutdown()
      return
    }
    navigate('/', { state: { openShutdown: true } })
  }

  const overlay =
    shutdownPending && !flowOpen
      ? createPortal(
          <div
            className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-black/50 p-6 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shutdown-gate-title"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-950/80 ring-1 ring-violet-500/30">
              <Moon size={24} className="text-violet-400" />
            </div>
            <div className="max-w-xs text-center">
              <h2 id="shutdown-gate-title" className="text-base font-semibold text-zinc-100">
                Time to shut down
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Daily shutdown is required from {requireLabel}. Wrap up your day to continue.
              </p>
            </div>
            <Button size="lg" onClick={openShutdown}>
              <Moon size={16} className="text-violet-300" />
              Shutdown
            </Button>
          </div>,
          document.body,
        )
      : null

  return (
    <div
      className={cn(
        'relative flex flex-col',
        lockHomeLayout && 'min-h-0 flex-1 overflow-hidden',
      )}
    >
      {children}
      {overlay}
    </div>
  )
}
