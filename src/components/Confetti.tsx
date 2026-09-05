import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import s from './Confetti.module.css'

/** Enough to read as a handful of paper thrown, few enough to stay quiet. */
const PIECES = 16

interface Bit {
  /** Where it starts across the width, as a percentage. */
  x: number
  /** How far sideways it wanders on the way down, in pixels. */
  drift: number
  /** How far it turns over the fall, in degrees. */
  spin: number
  /** Its share of --dur-5. Never above 1: the burst has to finish inside it. */
  speed: number
}

/**
 * One lane each, jittered inside the lane. Pure random leaves half the page
 * bare about as often as it doesn't.
 */
function scatter(): Bit[] {
  return Array.from({ length: PIECES }, (_, i) => ({
    x: Math.round(((i + Math.random()) / PIECES) * 1000) / 10,
    drift: Math.round((Math.random() - 0.5) * 40),
    spin: Math.round((180 + Math.random() * 400) * (Math.random() < 0.5 ? -1 : 1)),
    speed: Math.round((0.7 + Math.random() * 0.3) * 100) / 100,
  }))
}

/**
 * A second of paper falling past the page, and then nothing.
 *
 * It is fixed to the viewport with `pointer-events: none`, so it cannot move
 * anything on the page or catch a tap meant for the board, and it holds
 * nothing focusable, so a child playing by keyboard never meets it. The shell
 * mounts it for one run on the move that solves a level, and never under
 * reduced motion — see `PuzzleShell` in `src/routes/PuzzlePage.tsx`.
 */
export function Confetti() {
  // Scattered once, when it mounts. It gets one fall and is thrown away.
  const bits = useMemo(() => scatter(), [])

  return (
    <div className={s.confetti} aria-hidden="true">
      {bits.map((bit, i) => (
        <span
          key={i}
          className={s.bit}
          style={
            {
              '--x': `${bit.x}%`,
              '--drift': `${bit.drift}px`,
              '--spin': `${bit.spin}deg`,
              '--speed': bit.speed,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
