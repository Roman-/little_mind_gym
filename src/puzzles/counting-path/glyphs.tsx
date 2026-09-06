import { Scene, edge } from '../../components/scene'

/**
 * Nothing on this board is a thing a child could point at and name, so there
 * is no pictogram anywhere near it — a numbered square is abstract in exactly
 * the way a Hanoi disc and a weighing ball are. Everything here is our own
 * hand: one stroke mark for the rubber, and flat enamel for the card.
 */

/**
 * A rubber resting on the paper. It stays a drawn glyph: rubbing a number out
 * is something you do inside this app, not a thing a child could point at.
 */
export function RubGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.2 15.6 11.2 7.6 17.4 13.8 9.4 21.8Z" />
      <path d="M6.8 12 13 18.2" />
      <path d="M2.4 21.8h19.2" />
    </svg>
  )
}

/* The card is drawn on a four by four, which is the smallest board here. */
const EDGE = 4
const CELL = 6
/** The middle of column or row `i`. */
const at = (i: number) => EDGE + CELL * i + CELL / 2

/**
 * The card: a chain folded twice across a small grid, with the two ends of it
 * printed on their bone plates.
 *
 * The chain is the whole silhouette. At the 28px the row above a puzzle gives
 * it, a board of numerals would be mush and the lattice under it is the first
 * thing to disappear — which is right, because what this puzzle is about is
 * the line running through the squares rather than the numbers written in
 * them. So no numeral appears here at all: one big folded line, and the two
 * squares it starts and ends on.
 */
export function CountingPathIcon({ className }: { className?: string }) {
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
      {/* The two printed numbers, drawn before the chain so it runs over them
          and the whole thing reads as one continuous line. */}
      {[
        [0, 0],
        [0, 3],
      ].map(([col, row]) => (
        <rect
          key={`${col},${row}`}
          x={at(col) - CELL / 2 + 0.5}
          y={at(row) - CELL / 2 + 0.5}
          width={CELL - 1}
          height={CELL - 1}
          rx={1.2}
          fill="var(--p-bone)"
          {...edge}
        />
      ))}
      <polyline
        points={`${at(0)},${at(0)} ${at(3)},${at(0)} ${at(3)},${at(2)} ${at(0)},${at(2)} ${at(0)},${at(3)}`}
        fill="none"
        stroke="var(--p-slate)"
        strokeOpacity={0.8}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Scene>
  )
}
