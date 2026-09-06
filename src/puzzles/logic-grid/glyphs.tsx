import { Piece, Scene } from '../../components/scene'

/**
 * Two marks and the pictures.
 *
 * The children, the pets, the snacks and the hats are OpenMoji pictograms,
 * because a child has to recognise a rabbit without being told it is one. A
 * tick and a cross are not things: they are the marks a solver writes in a
 * box, so they stay our own stroked glyphs.
 */

/** The tick a solver writes when two things go together. */
export function Tick({ className }: { className?: string }) {
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
      <path d="M4.6 12.6 9.4 17.6 19.4 6.8" />
    </svg>
  )
}

/** The cross a solver writes when two things are ruled out. */
export function Cross({ className }: { className?: string }) {
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
      <path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4" />
    </svg>
  )
}

/* Two children down the side, two pets along the top, and the four boxes
   where they meet. The top-left corner of a grid like this is always empty. */
const BOX = 8.8
const HEAD = 5.8
const COLS = [15.4, 24.6]

/**
 * The card: the grid itself, with two ticks and two crosses already written
 * in. The pictures on the edges say what the rows and the columns are — this
 * child, that pet — and the marks inside say what a solver does about them.
 *
 * The tick is amber and not moss for the same reason it is on the board: a
 * tick is the solver's decision, not a verdict. Nothing here knows whether it
 * is right, which is the puzzle.
 */
export function LogicGridIcon({ className }: { className?: string }) {
  const cell = (col: number, row: number) => ({ x: COLS[col], y: COLS[row] })
  return (
    <Scene className={className}>
      {[0, 1].map((row) =>
        [0, 1].map((col) => {
          const { x, y } = cell(col, row)
          const yes = col === row
          return (
            <rect
              key={`${col},${row}`}
              x={x - BOX / 2}
              y={y - BOX / 2}
              width={BOX}
              height={BOX}
              rx={1.3}
              fill={yes ? 'var(--amber-soft)' : 'var(--surface-raised)'}
              stroke={yes ? 'var(--amber)' : 'var(--rule-strong)'}
              strokeWidth={1}
            />
          )
        }),
      )}
      {[0, 1].map((row) =>
        [0, 1].map((col) => {
          const { x, y } = cell(col, row)
          return col === row ? (
            <path
              key={`m${col},${row}`}
              d={`M${x - 2.6} ${y + 0.2}l1.8 2 3.5-4.2`}
              fill="none"
              stroke="var(--amber)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              key={`m${col},${row}`}
              d={`M${x - 2} ${y - 2}l4 4M${x + 2} ${y - 2}l-4 4`}
              fill="none"
              stroke="var(--ink-muted)"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          )
        }),
      )}
      <Piece name="fish" x={COLS[0]} y={HEAD} size={8.4} />
      <Piece name="dog" x={COLS[1]} y={HEAD} size={8.4} />
      <Piece name="child-girl" x={HEAD} y={COLS[0]} size={8.4} />
      <Piece name="child-boy" x={HEAD} y={COLS[1]} size={8.4} />
    </Scene>
  )
}
