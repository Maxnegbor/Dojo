import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  getLocalSession,
  localSignIn,
  localSignOut,
  localSignUp,
  migrateLegacyDataForUser,
} from '@/lib/localAuth'
import { localStore } from '@/lib/localStore'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import {
  clearUserStorageSession,
  initUserStorage,
} from '@/lib/userStorage'

interface AuthContextValue {
  userId: string | null
  email: string | null
  loading: boolean
  storageReady: boolean
  isConfigured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [storageReady, setStorageReady] = useState(!isSupabaseConfigured)

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data }) => {
        const session = data.session
        setUserId(session?.user.id ?? null)
        setEmail(session?.user.email ?? null)
        setLoading(false)
      })

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        setUserId(session?.user.id ?? null)
        setEmail(session?.user.email ?? null)
        setLoading(false)
      })

      return () => sub.subscription.unsubscribe()
    }

    const session = getLocalSession()
    if (session) {
      localStore.setUserId(session.userId)
      migrateLegacyDataForUser(session.userId)
      setUserId(session.userId)
      setEmail(session.email)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!userId) {
      clearUserStorageSession()
      setStorageReady(!isSupabaseConfigured)
      return
    }

    if (!isSupabaseConfigured) {
      localStore.setUserId(userId)
      setStorageReady(true)
      return
    }

    setStorageReady(false)
    void initUserStorage(userId).finally(() => setStorageReady(true))
  }, [userId])

  const signIn = useCallback(async (rawEmail: string, password: string) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signInWithPassword({
        email: rawEmail.trim(),
        password,
      })
      if (error) throw error
      return
    }

    const session = await localSignIn(rawEmail, password)
    localStore.setUserId(session.userId)
    setUserId(session.userId)
    setEmail(session.email)
  }, [])

  const signUp = useCallback(async (rawEmail: string, password: string) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signUp({
        email: rawEmail.trim(),
        password,
      })
      if (error) throw error
      return
    }

    const session = await localSignUp(rawEmail, password)
    localStore.setUserId(session.userId)
    setUserId(session.userId)
    setEmail(session.email)
  }, [])

  const signOut = useCallback(async () => {
    clearUserStorageSession()
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut()
      return
    }

    localSignOut()
    setUserId(null)
    setEmail(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        userId,
        email,
        loading,
        storageReady,
        isConfigured: isSupabaseConfigured,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
