import { Scene, edge } from '../../components/scene'
import { POST_COLOURS } from './logic'

/**
 * Nothing on this board is a thing a child could point at and name, so no
 * pictogram comes near it. A post is a height and nothing else — abstract in
 * exactly the way a Hanoi disc and a water level are — so it is flat enamel
 * under a hairline, and the two marks below are our own hand.
 */

/**
 * A sign, drawn pointing right. The board turns it to whichever of the four
 * ways round it points, and it always points at the shorter of the two posts
 * either side of it — so the wide open end is at the taller one, and it is the
 * same wedge between two squares in a row as between two in a column.
 *
 * The stroke is written heavy because the box is small. Our 1.5 in a 24-unit
 * box is drawn for a glyph with a whole button under it; this one is rendered
 * about twenty pixels wide, where 1.5 would come out a pixel and a quarter and
 * the one mark a child has to read would be the faintest thing on the board.
 */
export function SignMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 4.5 16.5 12 8.5 19.5" />
    </svg>
  )
}

/**
 * Taking a post out again: the post lifting off the floor it was standing on.
 * A rubber would be the wrong mark here — nothing on this board is drawn in
 * pencil, it is stood up and taken away again.
 */
export function LiftMark({ className }: { className?: string }) {
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
      <path d="M3.5 20.5h17" />
      <path d="M12 16V3.5M7 8.5 12 3.5l5 5" />
    </svg>
  )
}

/* The card is drawn on two squares of a board, side by side, with the sign
   that stands between them. */
const TILE = 13
const TOP = 9.5
const FLOOR = 1
const ROOM = TILE - 2 * FLOOR
const POST_W = 5.5

/** One post standing in the square whose left edge is at `x`, `height` of five. */
function Post({ x, height }: { x: number; height: number }) {
  const tall = (ROOM * height) / 5
  const foot = TOP + TILE - FLOOR
  const left = x + (TILE - POST_W) / 2
  return (
    <>
      <rect
        x={left}
        y={foot - tall}
        width={POST_W}
        height={tall}
        fill={POST_COLOURS[height - 1]}
        {...edge}
      />
      {/* The seams between the blocks: the square showing through, exactly as
          it does on the board, so a post on the card counts itself out too. */}
      {Array.from({ length: height - 1 }, (_, k) => (
        <path
          key={k}
          d={`M${left} ${foot - (tall * (k + 1)) / height}h${POST_W}`}
          stroke="var(--surface)"
          strokeWidth={0.6}
        />
      ))}
    </>
  )
}

/** One square of the board, empty. */
function Tile({ x }: { x: number }) {
  return (
    <rect
      x={x}
      y={TOP}
      width={TILE}
      height={TILE}
      rx={1.6}
      fill="var(--surface)"
      stroke="var(--rule-strong)"
      strokeWidth={1}
    />
  )
}

/**
 * The card: two squares of a board with the sign that stands between them, one
 * post five blocks high and the other two.
 *
 * Three big shapes, and the tallest and the shortest thing this puzzle holds
 * are two of them. Two big squares rather than a ruled grid, on purpose: a
 * ruled grid with something in every cell is the small square's card, and the
 * two of them sit next to each other in the collection.
 */
export function TallAndShortIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <Tile x={1} />
      <Tile x={18} />
      <Post x={1} height={5} />
      <Post x={18} height={2} />
      {/* The sign points at the shorter of the two, which is the whole rule. */}
      <path
        d="M14.1 12.9 17.9 16 14.1 19.1"
        fill="none"
        stroke="var(--ink)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Scene>
  )
}
