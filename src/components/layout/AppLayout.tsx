import { NavLink, Outlet } from 'react-router-dom'
import { Brain, FlaskConical, LayoutDashboard, Activity, Settings, Sparkles, Target } from 'lucide-react'
import { DojoLogo } from '@/components/ui/DojoLogo'
import { FocusBadge } from '@/components/layout/FocusBadge'
import { MorningLogGate } from '@/components/layout/MorningLogGate'
import { AppTourOverlay } from '@/components/onboarding/AppTourOverlay'
import { cn } from '@/lib/utils'
import { isSupabaseConfigured } from '@/lib/supabase'
import { requestScheduleScrollToNow } from '@/lib/scheduleScroll'
import { useOnboardingTourActive } from '@/hooks/useOnboardingTourActive'
import { useSettings } from '@/context/SettingsContext'

const NAV = [
  { to: '/', label: 'Home', icon: Sparkles, tourId: 'nav-today' },
  { to: '/focus', label: 'Focus', icon: Brain, tourId: 'nav-focus' },
  { to: '/goals', label: 'Metrics', icon: Target, tourId: 'nav-metrics' },
  { to: '/overview', label: 'Overview', icon: LayoutDashboard, tourId: 'nav-overview' },
  { to: '/pulse', label: 'Pulse', icon: Activity, tourId: 'nav-pulse' },
]

function navLinkClass(isActive: boolean) {
  return cn(
    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-[var(--accent-950)] text-[var(--accent-300)] ring-1 ring-[var(--accent-ring)]'
      : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200',
  )
}

export function AppLayout() {
  const { settings, updateSettings } = useSettings()
  const tourActive = useOnboardingTourActive()

  return (
    <div className="flex min-h-dvh overflow-hidden bg-[#0a0a0f] text-zinc-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800/80 bg-[#0a0a0f]/95 backdrop-blur-md">
        <div className="flex items-center gap-2.5 border-b border-zinc-800/80 px-4 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-600)] text-white">
            <DojoLogo size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight">Dojo</h1>
            <p className="text-[10px] text-zinc-500">Daily practice</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {NAV.map(({ to, label, icon: Icon, tourId }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              data-tour={tourId}
              onClick={() => {
                if (to === '/') requestScheduleScrollToNow()
              }}
              className={({ isActive }) => navLinkClass(isActive)}
            >
              <Icon size={18} className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-col gap-2 border-t border-zinc-800/80 p-3">
          <button
            type="button"
            onClick={() => updateSettings({ devMode: !settings.devMode })}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              settings.devMode
                ? 'border-violet-500/50 bg-violet-500/15 text-violet-300'
                : 'border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300',
            )}
            aria-pressed={settings.devMode}
            title="Toggle developer mode"
          >
            <FlaskConical size={18} className="shrink-0" />
            <span>Dev</span>
          </button>
          <NavLink
            to="/settings"
            className={({ isActive }) => navLinkClass(isActive)}
            aria-label="Settings"
          >
            <Settings size={18} className="shrink-0" />
            <span>Settings</span>
          </NavLink>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {settings.devMode && (
          <div className="shrink-0 bg-violet-950/40 px-4 py-1.5 text-center text-[11px] text-violet-300">
            Developer mode — test flows and dev settings are enabled
          </div>
        )}

        {!isSupabaseConfigured && (
          <div className="shrink-0 bg-amber-950/50 px-4 py-2 text-center text-xs text-amber-300">
            Local mode — your account and data stay in this browser
          </div>
        )}

        {settings.showFocusBadge && (
          <div className="sticky top-0 z-20 flex shrink-0 items-center justify-end border-b border-zinc-800/50 bg-[#0a0a0f]/90 px-5 py-3 backdrop-blur-md sm:px-6">
            <FocusBadge />
          </div>
        )}

        <MorningLogGate>
          <main className="scrollbar-gutter-stable mx-auto flex w-full min-h-0 max-w-7xl flex-1 flex-col overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            <Outlet />
          </main>
        </MorningLogGate>
      </div>

      {tourActive && <AppTourOverlay />}
    </div>
  )
}
