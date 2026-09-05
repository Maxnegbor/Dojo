import { useEffect, useState } from 'react'

const PHONE_QUERY = '(max-width: 1023px)'

/** True below the `lg` breakpoint — stacked Home layout, bottom nav, no screensaver. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(PHONE_QUERY).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY)
    const onChange = () => setIsMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
