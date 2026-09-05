import { useCallback, useEffect, useRef, useState } from 'react'
import cues from '../styles/motion.module.css'

/**
 * The shared one-shot animations, defined in `src/styles/motion.module.css`:
 * `cues.shake`, `cues.flash`, `cues.no`, `cues.highlight`. A board reaches for
 * one of these rather than writing keyframes of its own, so a refused move
 * looks the same in every puzzle.
 */
export { cues }

/**
 * Join class names, dropping the ones that are not there. A cue class comes
 * and goes with the cue, so every element that can wear one is written the
 * same way: `cx(s.frog, 'u-press', refusal.flash(id))`.
 */
export function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(' ')
}

/**
 * How long a cue stays on screen, named as the duration token it runs for:
 * `--dur-4` for a cue that has to be noticed (a shake, a flash, a "no"),
 * `--dur-5` for one the eye has to follow or read (a held highlight, the
 * confetti fall).
 */
export type CueLength = '--dur-4' | '--dur-5'

/**
 * The token's own value, so the timer that takes the class off and the
 * keyframes that animate it cannot drift apart — and so reduced motion, which
 * collapses the tokens to 1ms, shortens both at once.
 */
function lengthOf(token: CueLength): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return 0
  return raw.endsWith('ms') ? value : value * 1000
}

/**
 * Fire a one-shot animation.
 *
 *     const [wrong, sayNo] = useCue<string>()
 *     ...
 *     sayNo(item.id)                                    // in the handler
 *     <span className={wrong === item.id ? cues.shake : undefined} />
 *
 * The first value holds whatever was fired for exactly one run of the
 * animation and then goes back to null by itself, so the class comes off on
 * its own and the element is left as it was. Nothing else in the puzzle sees
 * it: a cue is decoration over a state the logic has already settled.
 */
export function useCue<T = boolean>(
  length: CueLength = '--dur-4',
): [T | null, (value: T) => void] {
  const [cue, setCue] = useState<T | null>(null)
  const live = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const frame = useRef(0)

  const show = useCallback((value: T | null) => {
    live.current = value !== null
    setCue(value)
  }, [])

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      cancelAnimationFrame(frame.current)
    },
    [],
  )

  const fire = useCallback(
    (value: T) => {
      clearTimeout(timer.current)
      cancelAnimationFrame(frame.current)
      const start = () => {
        show(value)
        timer.current = setTimeout(() => show(null), lengthOf(length))
      }
      // A CSS animation only starts when it is newly applied, so a second cue
      // arriving while the first is still on screen has to take the class off
      // for one frame before putting it back. Without that, a child's second
      // wrong tap in a row looks ignored.
      if (live.current) {
        show(null)
        frame.current = requestAnimationFrame(start)
      } else {
        start()
      }
    },
    [length, show],
  )

  return [cue, fire]
}
