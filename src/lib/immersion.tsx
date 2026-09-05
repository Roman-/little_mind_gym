import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Immerse: the puzzle, and nothing else on the page.
 *
 * The browser's screen is the source of truth. A child can hand it back four
 * ways — the button under the board, Escape, F11, the browser's own control —
 * and only one of those goes through us, so the mode listens for
 * `fullscreenchange` instead of keeping a flag that drifts out of step with
 * the window it is describing.
 *
 * The flag stands on its own in one case: a browser that will not give the
 * screen at all. An iframe without the permission is refused outright, and a
 * request has to be able to point at a tap that asked for it — the tap that
 * opened a bookmark does not carry across a navigation, so /random_instantly
 * never has one. The page goes quiet either way, because what is missing then
 * is the screen and not the mode, and the toolbar under the board draws the
 * way in.
 */
interface Ctx {
  /** True while everything but the board and its controls is out of the way. */
  immersed: boolean
  /** True only while the browser has actually handed the screen over. */
  fullscreen: boolean
  /** False where a request could not be granted, so nothing offers one. */
  canFullscreen: boolean
  enter: () => void
  leave: () => void
}

const ImmersionContext = createContext<Ctx | null>(null)

/** Whether asking for the screen is worth doing, let alone worth a button. */
function screenIsAvailable(): boolean {
  return (
    document.fullscreenEnabled === true &&
    typeof document.documentElement.requestFullscreen === 'function'
  )
}

/** A refused screen is an ordinary answer, and an old browser throws it. */
function attempt(call: () => Promise<void>) {
  try {
    void call().catch(() => {})
  } catch {
    /* an implementation that throws rather than rejecting is saying the same thing */
  }
}

export function ImmersionProvider({ children }: { children: ReactNode }) {
  const [immersed, setImmersed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const canFullscreen = screenIsAvailable()

  useEffect(() => {
    const changed = () => {
      const held = document.fullscreenElement != null
      setFullscreen(held)
      // Whichever way the screen went back, the rest of the page comes with it.
      if (!held) setImmersed(false)
    }
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])

  /**
   * The mode is written on the root element, the way the theme is. What a page
   * still holds while immersed is a question for the components that draw it;
   * how the room they give back is shared out is CSS, and one attribute saves
   * every one of them handing a flag down to its own stylesheet.
   */
  useEffect(() => {
    const root = document.documentElement
    if (immersed) root.setAttribute('data-immersed', 'true')
    else root.removeAttribute('data-immersed')
    return () => root.removeAttribute('data-immersed')
  }, [immersed])

  const enter = useCallback(() => {
    setImmersed(true)
    if (screenIsAvailable()) attempt(() => document.documentElement.requestFullscreen())
  }, [])

  const leave = useCallback(() => {
    setImmersed(false)
    if (document.fullscreenElement != null) attempt(() => document.exitFullscreen())
  }, [])

  const value = useMemo(
    () => ({ immersed, fullscreen, canFullscreen, enter, leave }),
    [immersed, fullscreen, canFullscreen, enter, leave],
  )

  return <ImmersionContext.Provider value={value}>{children}</ImmersionContext.Provider>
}

export function useImmersion(): Ctx {
  const ctx = useContext(ImmersionContext)
  if (!ctx) throw new Error('useImmersion must be used inside ImmersionProvider')
  return ctx
}
