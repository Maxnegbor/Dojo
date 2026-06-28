import { NavLink, Outlet } from 'react-router-dom'
import { Brain, LayoutDashboard, Settings, Sparkles, Target } from 'lucide-react'
import { cn, formatDuration } from '@/lib/utils'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useFocus } from '@/context/FocusContext'
import { useSettings } from '@/context/SettingsContext'

const NAV = [
  { to: '/', label: 'Today', icon: Sparkles },
  { to: '/focus', label: 'Focus', icon: Brain },
  { to: '/goals', label: 'Metrics', icon: Target },
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
]

export function AppLayout() {
  const { focusToday } = useFocus()
  const { settings } = useSettings()

  return (
    <div className="flex min-h-dvh flex-col bg-[#0a0a0f] text-zinc-100">
      {!isSupabaseConfigured && (
        <div className="bg-amber-950/50 px-4 py-2 text-center text-xs text-amber-300">
          Running in local mode — add Supabase credentials to <code className="text-amber-200">.env</code> for cloud sync
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-[#0a0a0f]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-600)]">
                <Sparkles size={16} className="text-white" />
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
            {settings.showFocusBadge && (
              <div className="flex items-center gap-2 rounded-full border border-[var(--accent-ring)] bg-[var(--accent-950)] px-3 py-1.5">
                <Brain size={14} className="text-[var(--accent-400)]" />
                <span className="text-xs font-medium text-[var(--accent-200)]">
                  {formatDuration(focusToday)} focused today
                </span>
              </div>
            )}
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-4">
        <Outlet />
      </main>
    </div>
  )
}
