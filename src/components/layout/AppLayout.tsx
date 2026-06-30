import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Brain, FlaskConical, LayoutDashboard, Activity, Settings, Sparkles, Target } from 'lucide-react'
import { DojoLogo } from '@/components/ui/DojoLogo'
import { FocusBadge } from '@/components/layout/FocusBadge'
import { cn } from '@/lib/utils'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useSettings } from '@/context/SettingsContext'

const NAV = [
  { to: '/', label: 'Today', icon: Sparkles },
  { to: '/focus', label: 'Focus', icon: Brain },
  { to: '/goals', label: 'Metrics', icon: Target },
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/pulse', label: 'Pulse', icon: Activity },
]

export function AppLayout() {
  const { settings, updateSettings } = useSettings()
  const { pathname } = useLocation()
  const isOverview = pathname === '/overview'
  const shellMaxW = isOverview ? 'max-w-7xl' : 'max-w-5xl'

  return (
    <div className="flex min-h-dvh flex-col overflow-hidden bg-[#0a0a0f] text-zinc-100">
      {settings.devMode && (
        <div className="bg-violet-950/40 px-4 py-1.5 text-center text-[11px] text-violet-300">
          Developer mode — test flows and dev settings are enabled
        </div>
      )}

      {!isSupabaseConfigured && (
        <div className="bg-amber-950/50 px-4 py-2 text-center text-xs text-amber-300">
          Local mode — your account and data stay in this browser
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-[#0a0a0f]/90 backdrop-blur-md">
        <div className={cn('mx-auto flex flex-wrap items-center justify-between gap-3 px-5 py-3', shellMaxW)}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-600)] text-white">
                <DojoLogo size={18} />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm font-bold tracking-tight">Dojo</h1>
                <p className="text-[10px] text-zinc-500">Daily practice</p>
              </div>
            </div>

            <nav className="flex items-center gap-0.5">
              {NAV.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-[var(--accent-950)] text-[var(--accent-300)] ring-1 ring-[var(--accent-ring)]'
                        : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200',
                    )
                  }
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => updateSettings({ devMode: !settings.devMode })}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                settings.devMode
                  ? 'border-violet-500/50 bg-violet-500/15 text-violet-300'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300',
              )}
              aria-pressed={settings.devMode}
              title="Toggle developer mode"
            >
              <FlaskConical size={14} />
              <span className="hidden sm:inline">Dev</span>
            </button>
            {settings.showFocusBadge && <FocusBadge />}
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                  isActive
                    ? 'bg-[var(--accent-950)] text-[var(--accent-300)] ring-1 ring-[var(--accent-ring)]'
                    : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200',
                )
              }
              aria-label="Settings"
            >
              <Settings size={18} />
            </NavLink>
          </div>
        </div>
      </header>

      <main
        className={cn(
          'mx-auto flex w-full min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 sm:px-6 sm:py-6',
          shellMaxW,
        )}
      >
        <Outlet />
      </main>
    </div>
  )
}
