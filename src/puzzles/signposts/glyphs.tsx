import type { CSSProperties } from 'react'
import { Scene, edge } from '../../components/scene'

/**
 * Nothing on this board is a thing a child could point at and name, so no
 * pictogram comes near it: a square with an arrow on it is abstract in exactly
 * the way a Hanoi disc and a weighing ball are. Everything here is our own
 * hand — one stroke mark for the way a square points, and flat enamel for the
 * card.
 */

/**
 * The way a square points. It is drawn at the top of its box and the board
 * turns the whole box, so the mark lands on the rim of the square facing the
 * way it points. That is what a signpost does, and it leaves the middle of the
 * square free for the number and for the line running through it.
 *
 * Three things in here are load-bearing. The box is the whole square, so the
 * stroke is written thin — a 1.5 in a 24-unit box drawn at a hundred and
 * thirty pixels comes out eight pixels wide. The mark is kept out beyond a
 * fifth of the square from the middle, because the middle is where the
 * number's plate stands, and turned to any of the eight it has to clear that
 * plate. And it keeps its shaft, which the first draft of it did not: a bare
 * chevron turned to a diagonal has one arm lying flat and one standing up, and
 * reads as a corner bracket rather than as a way to go. The chain does leave a
 * square along the shaft and cover it — but a line ending in an arrowhead is a
 * true picture of what has been joined, so that costs nothing.
 */
export function ArrowMark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 7.2V2.16M9.6 5.04 12 2.16 14.4 5.04" />
    </svg>
  )
}

/* The card is drawn on a three by three, which is the smallest board here. */
const EDGE = 3
const CELL = 8.6667
/** The middle of column or row `i`. */
const at = (i: number) => EDGE + CELL * i + CELL / 2

/** Which way each square points, by column and row. The last square has none. */
const ARROWS: [number, number, number][] = [
  [0, 0, 4],
  [1, 0, 5],
  [2, 0, 6],
  [0, 1, 2],
  [1, 1, 3],
  [2, 1, 0],
  [0, 2, 1],
  [1, 2, 7],
]

/** Four squares joined, by column and row: down two, up one, down one. */
const RUN: [number, number][] = [
  [0, 0],
  [0, 2],
  [1, 1],
  [2, 2],
]

/**
 * The card: a board part way through, with the first stretch of the chain
 * joined up.
 *
 * The line is the whole silhouette, and it is drawn with a long leg in it on
 * purpose — the chain reaches any distance along an arrow, and that is the one
 * rule of this puzzle a picture can show. The arrows round it say which puzzle
 * the line belongs to; at the 28px the row above a puzzle gives the card they
 * are texture rather than marks, which is right, because what is being asked
 * for there is only "the one with the arrows".
 */
export function SignpostsIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect
        x={EDGE}
        y={EDGE}
        width={CELL * 3}
        height={CELL * 3}
        rx={1.6}
        fill="var(--surface-sunk)"
        stroke="var(--ink-muted)"
        strokeWidth={1.6}
      />
      {[1, 2].map((i) => (
        <path
          key={i}
          d={`M${EDGE + CELL * i} ${EDGE}v${CELL * 3}M${EDGE} ${EDGE + CELL * i}h${CELL * 3}`}
          stroke="var(--rule)"
          strokeWidth={0.7}
        />
      ))}
      {/* The two printed numbers, drawn before the chain so the line runs over
          them and the whole thing reads as one stretch. */}
      {[
        [0, 0],
        [2, 2],
      ].map(([col, row]) => (
        <rect
          key={`${col},${row}`}
          x={at(col) - CELL / 2 + 0.6}
          y={at(row) - CELL / 2 + 0.6}
          width={CELL - 1.2}
          height={CELL - 1.2}
          rx={1.2}
          fill="var(--p-bone)"
          {...edge}
        />
      ))}
      {ARROWS.map(([col, row, dir]) => (
        <path
          key={`${col},${row}`}
          d="M0 1.73V-3.55M-0.87 -2.51 0 -3.55 0.87 -2.51"
          transform={`translate(${at(col)} ${at(row)}) rotate(${dir * 45})`}
          fill="none"
          stroke="var(--ink-muted)"
          strokeWidth={0.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <polyline
        points={RUN.map(([col, row]) => `${at(col)},${at(row)}`).join(' ')}
        fill="none"
        stroke="var(--p-indigo)"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Scene>
  )
}
