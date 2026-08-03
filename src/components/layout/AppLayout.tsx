import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Brain, FlaskConical, LayoutDashboard, Settings, Sparkles, Target } from 'lucide-react'
import { DojoLogo } from '@/components/ui/DojoLogo'
import { FocusBadge } from '@/components/layout/FocusBadge'
import { MorningLogGate } from '@/components/layout/MorningLogGate'
import { ShutdownGate } from '@/components/layout/ShutdownGate'
import { cn } from '@/lib/utils'
import { requestScheduleScrollToNow } from '@/lib/scheduleScroll'
import { useFocus } from '@/context/FocusContext'
import { useSettings } from '@/context/SettingsContext'

const NAV = [
  { to: '/', label: 'Home', icon: Sparkles },
  { to: '/focus', label: 'Focus', icon: Brain, setting: 'showFocusPage' as const },
  { to: '/goals', label: 'Metrics', icon: Target },
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
]

const SIDEBAR_ICON_SLOT = 'flex w-14 shrink-0 items-center justify-center'

const SIDEBAR_NAV_HOVER_PILL =
  'before:pointer-events-none before:absolute before:inset-y-0 before:left-1.5 before:right-1 before:-z-10 before:rounded-lg before:bg-zinc-800/60 before:opacity-0 before:transition-opacity hover:before:opacity-100'

type NavItem = (typeof NAV)[number]

function navLinkClass(isActive: boolean) {
  return cn(
    'relative z-10 flex w-full items-center rounded-lg py-2.5 text-sm font-medium',
    isActive
      ? 'text-[var(--accent-300)]'
      : cn('text-zinc-500 hover:text-zinc-200', SIDEBAR_NAV_HOVER_PILL),
  )
}

function isNavItemActive(to: string, pathname: string) {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

function SidebarMainNav({
  items,
  pathname,
  expanded,
  onHomeClick,
}: {
  items: NavItem[]
  pathname: string
  expanded: boolean
  onHomeClick: () => void
}) {
  const navRef = useRef<HTMLElement>(null)
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>())
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null)

  const activeTo = items.find((item) => isNavItemActive(item.to, pathname))?.to ?? null

  const updateIndicator = useCallback(() => {
    const activeEl = activeTo ? linkRefs.current.get(activeTo) : undefined
    if (!activeEl) {
      setIndicator(null)
      return
    }

    setIndicator({
      top: activeEl.offsetTop,
      height: activeEl.offsetHeight,
    })
  }, [activeTo])

  useLayoutEffect(() => {
    updateIndicator()
  }, [updateIndicator, pathname])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return

    const ro = new ResizeObserver(() => updateIndicator())
    ro.observe(nav)
    for (const el of linkRefs.current.values()) {
      ro.observe(el)
    }

    return () => ro.disconnect()
  }, [updateIndicator, items, pathname])

  useEffect(() => {
    const aside = navRef.current?.closest('aside')
    if (!aside) return

    const panel = aside.querySelector(':scope > div')
    if (!(panel instanceof HTMLElement)) return

    const onWidthTransitionEnd = (event: TransitionEvent) => {
      if (event.propertyName === 'width') updateIndicator()
    }

    panel.addEventListener('transitionend', onWidthTransitionEnd)
    return () => panel.removeEventListener('transitionend', onWidthTransitionEnd)
  }, [updateIndicator])

  return (
    <nav ref={navRef} className="relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto py-2 scrollbar-hidden">
      {indicator && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1.5 right-1 rounded-lg bg-[var(--accent-950)] ring-1 ring-inset ring-[var(--accent-ring)] transition-[top,height] duration-300 ease-out"
          style={{ top: indicator.top, height: indicator.height }}
        />
      )}
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          ref={(el) => {
            if (el) linkRefs.current.set(to, el)
            else linkRefs.current.delete(to)
          }}
          to={to}
          end={to === '/'}
          title={label}
          onClick={() => {
            if (to === '/') onHomeClick()
          }}
          className={({ isActive }) => navLinkClass(isActive)}
        >
          <span className={SIDEBAR_ICON_SLOT}>
            <Icon size={18} className="shrink-0" />
          </span>
          <span className={sidebarLabelClass(expanded)}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function footerNavLinkClass(isActive: boolean) {
  return cn(
    'relative z-10 flex w-full items-center rounded-lg py-2.5 text-sm font-medium',
    isActive
      ? 'bg-[var(--accent-950)] text-[var(--accent-300)] ring-1 ring-inset ring-[var(--accent-ring)]'
      : cn('text-zinc-500 hover:text-zinc-200', SIDEBAR_NAV_HOVER_PILL),
  )
}

const SIDEBAR_EXPAND_DELAY_MS = 800
const SIDEBAR_COLLAPSE_DELAY_MS = 100
/** Expanded width: 70% of prior w-56 (14rem). */
const SIDEBAR_EXPANDED_WIDTH_CLASS = 'w-[9.8rem]'

function sidebarLabelClass(expanded: boolean) {
  return cn(
    'min-w-0 overflow-hidden whitespace-nowrap pr-3 text-left transition-opacity',
    expanded
      ? 'max-w-none flex-1 opacity-100 duration-150'
      : 'max-w-0 flex-none opacity-0 duration-100',
  )
}

function sidebarHeaderLabelClass(expanded: boolean) {
  return cn(
    'min-w-0 overflow-hidden transition-opacity',
    expanded ? 'opacity-100 duration-150' : 'max-w-0 opacity-0 duration-100',
  )
}

export function AppLayout() {
  const { settings, updateSettings } = useSettings()
  const { focusImmersive, setFocusImmersive } = useFocus()
  const { pathname } = useLocation()
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const sidebarExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sidebarCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSidebarPointerEnter = () => {
    if (sidebarCollapseTimerRef.current) {
      clearTimeout(sidebarCollapseTimerRef.current)
      sidebarCollapseTimerRef.current = null
    }
    if (sidebarExpanded || sidebarExpandTimerRef.current) return
    sidebarExpandTimerRef.current = setTimeout(() => {
      sidebarExpandTimerRef.current = null
      setSidebarExpanded(true)
    }, SIDEBAR_EXPAND_DELAY_MS)
  }

  const handleSidebarPointerLeave = () => {
    if (sidebarExpandTimerRef.current) {
      clearTimeout(sidebarExpandTimerRef.current)
      sidebarExpandTimerRef.current = null
    }
    if (!sidebarExpanded || sidebarCollapseTimerRef.current) return
    sidebarCollapseTimerRef.current = setTimeout(() => {
      sidebarCollapseTimerRef.current = null
      setSidebarExpanded(false)
    }, SIDEBAR_COLLAPSE_DELAY_MS)
  }

  useEffect(() => {
    return () => {
      if (sidebarExpandTimerRef.current) {
        clearTimeout(sidebarExpandTimerRef.current)
      }
      if (sidebarCollapseTimerRef.current) {
        clearTimeout(sidebarCollapseTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (pathname !== '/focus' && focusImmersive) {
      setFocusImmersive(false)
    }
  }, [pathname, focusImmersive, setFocusImmersive])

  const navItems = NAV.filter((item) => {
    if (item.setting === 'showFocusPage') return settings.showFocusPage
    return true
  })

  if (pathname === '/focus' && !settings.showFocusPage) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="relative z-10 flex h-dvh overflow-hidden bg-[#0a0a0f] text-zinc-100">
      {!focusImmersive && (
      <aside className="relative z-30 w-14 shrink-0">
        <div
          className={cn(
            'absolute inset-y-0 left-0 z-30 flex w-14 flex-col overflow-hidden border-r border-zinc-800/80 bg-[#0a0a0f]',
            'transition-[width] duration-200 ease-in-out',
            sidebarExpanded && `${SIDEBAR_EXPANDED_WIDTH_CLASS} shadow-[4px_0_24px_rgba(0,0,0,0.5)]`,
          )}
          onPointerEnter={handleSidebarPointerEnter}
          onPointerLeave={handleSidebarPointerLeave}
        >
        <NavLink
          to="/"
          end
          title="Home"
          onClick={() => requestScheduleScrollToNow()}
          className="flex shrink-0 items-center border-b border-zinc-800/80 py-4 transition-opacity hover:opacity-90"
          aria-label="Go to Home"
        >
          <div className={SIDEBAR_ICON_SLOT}>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-600)] text-white">
              <DojoLogo size={20} />
            </div>
          </div>
          <div className={sidebarHeaderLabelClass(sidebarExpanded)}>
            <h1 className="text-sm font-bold tracking-tight text-zinc-100">Dojo</h1>
          </div>
        </NavLink>

        <SidebarMainNav
          items={navItems}
          pathname={pathname}
          expanded={sidebarExpanded}
          onHomeClick={() => requestScheduleScrollToNow()}
        />

        <div
          className={cn(
            'flex shrink-0 flex-col gap-2 border-t border-zinc-800/80 py-2',
            sidebarExpanded && 'px-1.5',
          )}
        >
          {settings.showFocusPage && settings.showFocusBadge && sidebarExpanded && (
            <FocusBadge />
          )}
          <button
            type="button"
            onClick={() => updateSettings({ devMode: !settings.devMode })}
            className={cn(
              'relative z-10 flex w-full items-center rounded-lg py-2.5 text-sm font-medium',
              settings.devMode
                ? 'text-violet-300 hover:text-violet-200'
                : cn('text-zinc-500 hover:text-zinc-200', SIDEBAR_NAV_HOVER_PILL),
            )}
            aria-pressed={settings.devMode}
            title="Toggle developer mode"
          >
            <span className={SIDEBAR_ICON_SLOT}>
              <FlaskConical size={18} className="shrink-0" />
            </span>
            <span className={sidebarLabelClass(sidebarExpanded)}>Dev</span>
          </button>
          <NavLink
            to="/settings"
            className={({ isActive }) => footerNavLinkClass(isActive)}
            title="Settings"
            aria-label="Settings"
          >
            <span className={SIDEBAR_ICON_SLOT}>
              <Settings size={18} className="shrink-0" />
            </span>
            <span className={sidebarLabelClass(sidebarExpanded)}>Settings</span>
          </NavLink>
        </div>
        </div>
      </aside>
      )}

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div
          id="dojo-bg-effects"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
          aria-hidden
        />
        <main
          className={cn(
            'relative z-10 flex min-h-0 flex-1 flex-col overflow-x-hidden px-6 py-6 scrollbar-hidden sm:px-8 lg:px-10',
            pathname === '/' ? 'overflow-hidden' : 'overflow-y-auto',
            focusImmersive && 'px-4 sm:px-6 lg:px-8',
          )}
        >
          <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
            <MorningLogGate />
            <ShutdownGate>
              <Outlet />
            </ShutdownGate>
          </div>
        </main>
      </div>
    </div>
  )
}
