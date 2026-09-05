import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import s from './Confetti.module.css'

/** Enough for the fall to have a texture, few enough to keep the page readable. */
const PIECES = 42

/**
 * What a scrap of paper gets cut into. Four shapes rather than one rectangle:
 * a fall of identical oblongs is the thing that read as a screensaver.
 */
const SHAPES = ['strip', 'square', 'disc', 'ribbon'] as const

/**
 * The enamel palette, by name. A token rather than a colour, so the paper
 * retunes with everything else — and every piece is dealt one, so the burst
 * carries all six instead of whatever six draws happened to land.
 */
const TINTS = ['--p-ochre', '--p-moss', '--p-indigo', '--p-clay', '--p-plum', '--p-teal']

interface Bit {
  /** Where it starts across the width, as a percentage. */
  x: number
  /** Which cut of paper this one is. */
  shape: (typeof SHAPES)[number]
  /** The token holding its colour. */
  tint: string
  /** Its size against the shape's own, roughly two thirds to one and a third. */
  size: number
  /** How far it swings either side of its lane, in pixels. */
  sway: number
  /** How long one swing out and back takes, in ms. */
  swayMs: number
  /** How long one full turn takes, in ms. Negative turns it the other way. */
  spinMs: number
  /** The axis it turns about, as an x/y pair. Tilted axes flip it edge-on. */
  axis: [number, number]
  /** Its share of --dur-6 spent falling. */
  speed: number
  /** How far into --dur-6 it is let go. Never enough to outlast the burst. */
  delay: number
}

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places

/** Every colour dealt out evenly, then shuffled so the lanes carry no order. */
function deal(count: number): string[] {
  const out = Array.from({ length: count }, (_, i) => TINTS[i % TINTS.length])
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * One lane each, jittered inside the lane. Pure random leaves half the page
 * bare about as often as it doesn't.
 */
function scatter(): Bit[] {
  const tints = deal(PIECES)
  return Array.from({ length: PIECES }, (_, i) => ({
    x: round(((i + Math.random()) / PIECES) * 100, 1),
    shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    tint: tints[i],
    size: round(between(0.65, 1.35)),
    sway: Math.round(between(10, 38)),
    swayMs: Math.round(between(700, 1500)),
    // A turn every second or so, and half of them the other way round.
    spinMs: Math.round(between(650, 1600)) * (Math.random() < 0.5 ? -1 : 1),
    axis: [round(between(0.15, 1)), round(between(0.15, 1))],
    // Falling and waiting together never come to more than one --dur-6, so the
    // last piece is off the bottom before the shell unmounts the burst.
    speed: round(between(0.62, 0.82)),
    delay: round(between(0, 0.18)),
  }))
}

/**
 * A handful of paper thrown over the page, and then nothing.
 *
 * Three nested elements, because one element runs one transform: the outer one
 * falls, the middle one swings the piece from side to side as it goes, and the
 * paper itself turns about a tilted axis inside a perspective, so it flashes
 * edge-on the way a real scrap does instead of spinning flat like a wheel.
 * Every piece falls at its own rate, swings at its own rate, turns at its own
 * rate and is let go at its own moment, so nothing in the burst keeps time
 * with anything else.
 *
 * It is fixed to the viewport with `pointer-events: none`, so it cannot move
 * anything on the page or catch a tap meant for the board, and it holds
 * nothing focusable, so a child playing by keyboard never meets it. The shell
 * mounts it for one run on the move that solves a level — never under reduced
 * motion, and only where **Throw confetti** has been turned on. See
 * `PuzzleShell` in `src/routes/PuzzlePage.tsx`.
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
              '--speed': bit.speed,
              '--delay': bit.delay,
            } as CSSProperties
          }
        >
          <span
            className={s.sway}
            style={
              {
                '--sway': `${bit.sway}px`,
                '--sway-ms': `${bit.swayMs}ms`,
              } as CSSProperties
            }
          >
            <span
              className={s.paper}
              data-shape={bit.shape}
              style={
                {
                  '--tint': `var(${bit.tint})`,
                  '--size': bit.size,
                  '--spin-ms': `${Math.abs(bit.spinMs)}ms`,
                  '--turn': bit.spinMs < 0 ? '-1turn' : '1turn',
                  '--ax': bit.axis[0],
                  '--ay': bit.axis[1],
                } as CSSProperties
              }
            />
          </span>
        </span>
      ))}
    </div>
  )
}
