import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export function RequireAuth() {
  const { userId, loading, storageReady } = useAuth()

  // Only wait for remote storage hydrate when a session exists.
  if (loading || (userId && !storageReady)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#06060b] text-sm text-zinc-500">
        Loading…
      </div>
    )
  }

  if (!userId) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
