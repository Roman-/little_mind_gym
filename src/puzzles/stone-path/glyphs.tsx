import type { CSSProperties } from 'react'
import { Scene, edge } from '../../components/scene'

/**
 * Nothing on this board is a thing a child could point at and name, so no
 * pictogram comes near it. A go stone is abstract in exactly the way a Hanoi
 * disc is — a plain enamel counter — and it is drawn as
 * one. What is drawn here in our own hand is the one mark the board needs, the
 * arrow that says which way the walk is going, and then the card.
 */

const strokes = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/**
 * The way the walk came in, worn on the square it is standing on.
 *
 * Without it the never-turn-back rule has no input on the board: a child would
 * have to remember which way they arrived, and a rule you cannot see is a rule
 * you cannot keep. It is drawn pointing up and the board turns it, so the four
 * ways are one mark rather than four.
 *
 * It keeps its shaft on purpose. A bare arrowhead says "that way"; a shaft
 * with a head on it says "I came along here and I am going on" — and the tail
 * points at the square the walk may not go back to, which is the whole rule.
 * The strokes are heavy because this is read at the size of a fingernail
 * rather than beside a label.
 */
export function WayMark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" {...strokes} strokeWidth={3}>
      <path d="M12 19.5V6.4" />
      <path d="M6.6 11.8 12 6.4l5.4 5.4" />
    </svg>
  )
}

/* The card is drawn on a four by four, which is the smallest board here. */
const EDGE = 3
const CELL = 6.5
/** The middle of column or row `i`. */
const at = (i: number) => EDGE + CELL * i + CELL / 2

/** The stones still lying on the board, by column and row. */
const STONES: [number, number][] = [
  [0, 0],
  [2, 1],
  [1, 2],
]

/** Where the walk has been: in at the bottom left, along the bottom, then up. */
const TRAIL: [number, number][] = [
  [0, 3],
  [3, 3],
  [3, 1],
]

/**
 * The card: a board part way through, with three stones still to pick up.
 *
 * The trail is the whole silhouette, and it is drawn with a corner in it on
 * purpose — a route that turns is the one thing about this puzzle a picture
 * can show, and no other card in the collection has round dark counters on a
 * grid. The amber disc at the head of the trail is where the walk is standing;
 * every square the trail runs over is empty, exactly as it always is on the
 * stage, because a walk only ever crosses ground it has already cleared.
 */
export function StonePathIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect
        x={EDGE}
        y={EDGE}
        width={CELL * 4}
        height={CELL * 4}
        rx={1.6}
        fill="var(--surface-sunk)"
        stroke="var(--ink-muted)"
        strokeWidth={1.6}
      />
      {[1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M${EDGE + CELL * i} ${EDGE}v${CELL * 4}M${EDGE} ${EDGE + CELL * i}h${CELL * 4}`}
          stroke="var(--rule)"
          strokeWidth={0.7}
        />
      ))}
      <polyline
        points={TRAIL.map(([col, row]) => `${at(col)},${at(row)}`).join(' ')}
        fill="none"
        stroke="var(--amber)"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Flat enamel under a hairline, exactly as the board draws a stone. */}
      {STONES.map(([col, row]) => (
        <circle
          key={`${col},${row}`}
          cx={at(col)}
          cy={at(row)}
          r={2.6}
          fill="var(--p-slate)"
          {...edge}
        />
      ))}
      <circle
        cx={at(TRAIL[2][0])}
        cy={at(TRAIL[2][1])}
        r={2.8}
        fill="var(--amber-soft)"
        stroke="var(--amber)"
        strokeWidth={1.5}
      />
    </Scene>
  )
}
