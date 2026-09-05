import { useEffect } from 'react'

/** Keeps the browser tab honest about which puzzle is open. */
export function usePageTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · Little Mind Gym` : 'Little Mind Gym'
    return () => {
      document.title = 'Little Mind Gym'
    }
  }, [title])
}
