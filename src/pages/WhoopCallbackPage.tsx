import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { exchangeWhoopCode, fetchWhoopProfile } from '@/lib/whoopApi'
import {
  WHOOP_OAUTH_RESULT_KEY,
  WHOOP_OAUTH_STATE_KEY,
  getWhoopCredentials,
} from '@/lib/whoopStore'

export function WhoopCallbackPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  useEffect(() => {
    const finish = async () => {
      const error = params.get('error_description') || params.get('error')
      const code = params.get('code')
      const state = params.get('state')
      let expected = ''
      try {
        expected = sessionStorage.getItem(WHOOP_OAUTH_STATE_KEY) ?? ''
        sessionStorage.removeItem(WHOOP_OAUTH_STATE_KEY)
      } catch {
        expected = ''
      }

      const fail = (message: string) => {
        try {
          sessionStorage.setItem(WHOOP_OAUTH_RESULT_KEY, message)
        } catch {
          /* ignore */
        }
        navigate('/settings', { replace: true, state: { settingsSection: 'integrations' } })
      }

      if (error) {
        fail(error)
        return
      }
      if (!code) {
        fail('WHOOP did not return an authorization code')
        return
      }
      if (!expected || state !== expected) {
        fail('WHOOP authorization state did not match. Try connecting again.')
        return
      }
      if (!getWhoopCredentials()) {
        fail('WHOOP app credentials are missing. Save your client ID and secret, then connect again.')
        return
      }

      try {
        await exchangeWhoopCode({ code })
        await fetchWhoopProfile()
        try {
          sessionStorage.setItem(WHOOP_OAUTH_RESULT_KEY, 'ok')
        } catch {
          /* ignore */
        }
        navigate('/settings', { replace: true, state: { settingsSection: 'integrations' } })
      } catch (err) {
        fail(err instanceof Error ? err.message : 'Could not finish WHOOP authorization')
      }
    }

    void finish()
  }, [navigate, params])

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#06060b] text-sm text-zinc-400">
      Connecting WHOOP…
    </div>
  )
}
