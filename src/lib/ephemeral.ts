import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

/**
 * Board-local state that clears itself the instant `token` changes.
 *
 * Every board keeps a little state that is not part of the puzzle — which peg
 * is lifted, which pieces are in the boat, which square is chosen — and all of
 * it has to vanish when the puzzle state moves, including when the shell
 * rewinds through the move tape.
 *
 * Doing that in an effect works, but the effect runs after paint, so the frame
 * between the move landing and the effect firing shows the old selection over
 * the new position. Resetting during render (React's documented way of
 * adjusting state when a prop changes) means that frame never exists.
 */
export function useEphemeral<T>(token: unknown, blank: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(blank)
  const [seen, setSeen] = useState(token)

  if (seen !== token) {
    // React throws this render away and immediately runs another with the
    // cleared value, so nothing stale is ever committed to the DOM.
    setSeen(token)
    setValue(blank)
    return [blank, setValue]
  }
  return [value, setValue]
}
