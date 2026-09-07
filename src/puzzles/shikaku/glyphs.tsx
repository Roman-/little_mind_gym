import { Scene, edge } from '../../components/scene'

/**
 * Nothing on this board is a picture. A square of a grid is abstract by
 * nature — docs/DESIGN.md names a sudoku cell in that list — so the bar is
 * flat enamel with a numeral on it, and an OpenMoji chocolate bar stapled on
 * top of the grid would be a picture of the thing the grid already is.
 *
 * So the one mark here in our own hand is the numeral, and it is drawn rather
 * than typed. The board prints its numbers in the mono face; this is the same
 * number as a stroke. A real `<text>` element would be the truer material, but
 * a card sits inside the puzzle's `<h1>`, and numerals in there are characters
 * of the page's heading that nobody wrote: the title would read
 * "432The chocolate bar" to anything taking the heading as plain text.
 */

const EDGE = 3
const SPAN = 26
const CELL = SPAN / 3
/** Every piece is inset by this much inside the squares it covers: the groove. */
const GAP = 0.6

/** Rounded, so a third of the bar does not print sixteen digits. */
const tidy = (n: number) => Math.round(n * 1000) / 1000

const box = (col: number, row: number, w: number, h: number) => ({
  x: tidy(EDGE + col * CELL + GAP),
  y: tidy(EDGE + row * CELL + GAP),
  width: tidy(w * CELL - 2 * GAP),
  height: tidy(h * CELL - 2 * GAP),
})
/** The middle of a block of squares, which is where its number stands. */
const mid = (col: number, row: number, w: number, h: number) => ({
  x: tidy(EDGE + (col + w / 2) * CELL),
  y: tidy(EDGE + (row + h / 2) * CELL),
})

/**
 * A numeral, 3.1 units across and 4.4 tall, in the same round-capped stroke
 * every other mark in the app is drawn with.
 */
const STROKES: Record<number, (x: number, y: number) => string> = {
  2: (x, y) =>
    `M${x} ${y + 1.15}C${x} ${y - 0.35} ${x + 3.1} ${y - 0.35} ${x + 3.1} ${y + 1.25}` +
    `C${x + 3.1} ${y + 2.4} ${x + 0.5} ${y + 3.3} ${x} ${y + 4.4}h3.1`,
  3: (x, y) =>
    `M${x + 0.1} ${y + 0.8}C${x + 0.6} ${y - 0.25} ${x + 3.1} ${y - 0.05} ${x + 3.1} ${y + 1.2}` +
    `C${x + 3.1} ${y + 2.05} ${x + 2.2} ${y + 2.2} ${x + 1.5} ${y + 2.2}` +
    `C${x + 2.4} ${y + 2.2} ${x + 3.1} ${y + 2.65} ${x + 3.1} ${y + 3.35}` +
    `C${x + 3.1} ${y + 4.65} ${x + 0.6} ${y + 4.75} ${x + 0.1} ${y + 3.6}`,
  4: (x, y) => `M${x + 2.25} ${y}v4.4M${x + 2.25} ${y}L${x} ${y + 3.05}h3.1`,
}

function Numeral({ value, x, y }: { value: number; x: number; y: number }) {
  return (
    <path
      d={STROKES[value](tidy(x - 1.55), tidy(y - 2.2))}
      fill="none"
      stroke="var(--ink)"
      strokeWidth={1.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

/**
 * The card: a bar one snap from finished, in the board's own two materials and
 * nothing else. A piece of four and a piece of three have come away, and the
 * last two squares are still in their little lattice with a 2 printed on them.
 *
 * It is a real board and a child can check it before opening the puzzle: four
 * and three and two is nine, which is the whole bar. It is also the only card
 * in the collection built out of gaps — at 28px the numerals go to texture and
 * what carries is the silhouette, two chunky caramel rectangles with a real
 * gap of stage between them and a strip of small separated squares along the
 * bottom. Nothing else in the collection looks like that.
 */
export function ShikakuIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect x={EDGE} y={EDGE} width={SPAN} height={SPAN} rx={1.6} fill="var(--surface-sunk)" />

      {/* A piece of four, and a piece of three: chocolate that has come away. */}
      <rect {...box(0, 0, 2, 2)} rx={1.6} fill="var(--p-ochre)" fillOpacity={0.52} {...edge} />
      <rect {...box(2, 0, 1, 3)} rx={1.6} fill="var(--p-ochre)" fillOpacity={0.52} {...edge} />

      {/* And two squares still on the bar, in the weaker wash the board uses. */}
      <rect {...box(0, 2, 1, 1)} rx={1} fill="var(--p-ochre)" fillOpacity={0.2} {...edge} />
      <rect {...box(1, 2, 1, 1)} rx={1} fill="var(--p-ochre)" fillOpacity={0.2} {...edge} />

      {/* The bar's own rim, over the top, so no piece runs into it. */}
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

      <Numeral value={4} {...mid(0, 0, 2, 2)} />
      <Numeral value={3} {...mid(2, 0, 1, 3)} />
      <Numeral value={2} {...mid(0, 2, 1, 1)} />
    </Scene>
  )
}
