import { Scene } from '../../components/scene'
import type { Mark } from './logic'
import { FLAT, PLUS, STANDING } from './logic'

/**
 * Nothing on this board is a picture. A mat is abstract by nature, the way a
 * sudoku cell or a Hanoi disc is, so it is flat enamel; and the three marks are
 * marks — a child could not point at one and name a thing — so they are drawn
 * in our own hand rather than fetched from OpenMoji.
 *
 * They are told apart by silhouette alone: a plus, a flat line and a standing
 * line, in ink, with no colour plate behind any of them. A colour would have to
 * say which kind of mark this is, and a mark is not a thing that gets a colour
 * of its own on this board: the only colours here say state.
 */

const strokes = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  'aria-hidden': true,
  focusable: 'false',
} as const

/**
 * One mark, in a 24-unit box. The stroke is heavier than the 1.5 every control
 * glyph takes, because these are the clues the whole board is read by: 2.5
 * units comes to about 3px at the six-wide floor's smallest square, which is
 * the weight of the chocolate bar's mono numerals at the same size.
 */
export function MarkGlyph({ mark, className }: { mark: Mark; className?: string }) {
  if (mark === PLUS) {
    return (
      <svg className={className} viewBox="0 0 24 24" {...strokes} strokeWidth={2.5}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    )
  }
  if (mark === FLAT) {
    return (
      <svg className={className} viewBox="0 0 24 24" {...strokes} strokeWidth={2.5}>
        <path d="M4.5 12h15" />
      </svg>
    )
  }
  if (mark === STANDING) {
    return (
      <svg className={className} viewBox="0 0 24 24" {...strokes} strokeWidth={2.5}>
        <path d="M12 4.5v15" />
      </svg>
    )
  }
  return null
}

/* The card is drawn on a four by four: the first level's own floor. */
const EDGE = 3
const SPAN = 26
const CELL = SPAN / 4
/**
 * Every mat is inset by this much inside the squares it covers, and it has to
 * be more than half the binding, or the bindings of two mats side by side meet
 * and the floor reads as one plum lattice. At 0.55 under a 1.3 binding they
 * overlapped by 0.2, and where four rounded corners met, a speck of the recess
 * showed through at every joint of the pinwheel. On the board two mats are
 * always binding, a sunk groove, binding; at 0.9 under a 1 binding the card is
 * too, with 0.8 of the recess between them, which is 1.7px at 68px.
 */
const GAP = 0.9

/** Rounded, so a quarter of the floor does not print sixteen digits. */
const tidy = (n: number) => Math.round(n * 1000) / 1000

const box = (col: number, row: number, w: number, h: number) => ({
  x: tidy(EDGE + col * CELL + GAP),
  y: tidy(EDGE + row * CELL + GAP),
  width: tidy(w * CELL - 2 * GAP),
  height: tidy(h * CELL - 2 * GAP),
})

/** The middle of a block of squares, which is where its mark stands. */
const mid = (col: number, row: number, w: number, h: number) => ({
  x: tidy(EDGE + (col + w / 2) * CELL),
  y: tidy(EDGE + (row + h / 2) * CELL),
})

/** The board's mat: plum at the raised wash, bound in plum, exactly as `.mat` is. */
const MAT = {
  fill: 'color-mix(in oklab, var(--p-plum) var(--wash-raised), var(--surface))',
  stroke: 'var(--p-plum)',
  strokeWidth: 1,
}

/** A mark on the card: the board's ink stroke, drawn at the card's scale. */
const INK = {
  fill: 'none',
  stroke: 'var(--ink)',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
} as const

/** Half a mark's length. */
const ARM = 2.3

type Point = { x: number; y: number }
const flat = (c: Point) => `M${tidy(c.x - ARM)} ${c.y}h${ARM * 2}`
const standing = (c: Point) => `M${c.x} ${tidy(c.y - ARM)}v${ARM * 2}`
const plus = (c: Point) => `${flat(c)}${standing(c)}`

/**
 * The card: a finished four-by-four floor, laid the way tatami are laid round
 * a middle mat. Four strips of three turn round a two-by-two, a flat line on
 * the strips along the top and the bottom, a standing line on the strips down
 * the sides, and a plus in the middle.
 *
 * It is a floor the puzzle really takes — the first level's size, five mats,
 * none bigger than six squares and none of one — and four of the ways to mark
 * it have exactly one answer. It is deliberately not three mats on a three by
 * three: every such cut into a square, a wide and a tall mat is the chocolate
 * bar's card turned round.
 *
 * Five mats is one more than the three or four big shapes a card is meant to
 * hold, and it earns it. At 28px the eye takes the four strips as one pinwheel
 * round a plus rather than as five things, every mat stays a big slab, and no
 * other card in the collection has that silhouette.
 */
export function FloorMatsIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect x={EDGE} y={EDGE} width={SPAN} height={SPAN} rx={1.6} fill="var(--surface-sunk)" />

      {/* The four strips, clockwise from the top, and the square mat they turn round. */}
      <rect {...box(0, 0, 3, 1)} rx={1.2} {...MAT} />
      <rect {...box(3, 0, 1, 3)} rx={1.2} {...MAT} />
      <rect {...box(1, 3, 3, 1)} rx={1.2} {...MAT} />
      <rect {...box(0, 1, 1, 3)} rx={1.2} {...MAT} />
      <rect {...box(1, 1, 2, 2)} rx={1.2} {...MAT} />

      {/* The floor's own rim, over the top, so no mat runs into it. */}
      <rect
        x={EDGE}
        y={EDGE}
        width={SPAN}
        height={SPAN}
        rx={1.6}
        fill="none"
        stroke="var(--ink-muted)"
        strokeWidth={1.6}
      />

      <path d={flat(mid(0, 0, 3, 1))} {...INK} />
      <path d={standing(mid(3, 0, 1, 3))} {...INK} />
      <path d={flat(mid(1, 3, 3, 1))} {...INK} />
      <path d={standing(mid(0, 1, 1, 3))} {...INK} />
      <path d={plus(mid(1, 1, 2, 2))} {...INK} />
    </Scene>
  )
}
