import { Scene } from '../../components/scene'
import { colourRegions, regionPaint } from '../../lib/regions'

/**
 * Nothing on this board is a picture. A square of a grid is abstract by
 * nature — docs/DESIGN.md names a sudoku cell in that list — so a square here
 * is flat enamel with a numeral on it and a heavy seam round its patch, and
 * that is the whole material list. The enamel is the patch's own colour.
 */

/**
 * A rubber resting on the paper. It stays a drawn mark: rubbing a square out
 * is something you do inside this app, not a thing a child could point at and
 * name — and it is the same rubber every board that writes numbers keeps on
 * its keypad.
 */
export function RubberGlyph({ className }: { className?: string }) {
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

/* --- the card ------------------------------------------------- */

const EDGE = 3
/** Nine squares, the same pitch the garden card is drawn on. */
const CELL = 8.6667
const SPAN = CELL * 3
/** The middle of column or row `i`. */
const at = (i: number) => EDGE + CELL * i + CELL / 2

/**
 * A real quilt, three squares by three, cut into three patches: a corner of
 * three, a domino down the right side, and a T of four along the bottom.
 *
 * ```
 *   A A B        . . 1
 *   A C B        . . 2
 *   C C C        . 3 .
 * ```
 *
 * Nine squares rather than sixteen is the whole of what this drawing has to
 * be. The plate on a collection card gives a scene 68px and the row above a
 * puzzle gives it 28, and at 28px a four-by-four lattice is thirty marks in a
 * space the width of a fingernail. Three patches and three numerals is a
 * silhouette; the seams keep their weight because there are fewer of them.
 */
const PATCH = [
  'A', 'A', 'B',
  'A', 'C', 'B',
  'C', 'C', 'C',
]
const of_ = (col: number, row: number) => PATCH[row * 3 + col]
const LINES = [0, 1, 2]

/**
 * The card's patches coloured by the same rule the board colours its own with,
 * rather than picked for the card: the corner of three is yellow because it
 * holds the top left square, and the domino and the T take the next two
 * colours because each of them touches both of the others.
 */
const REGIONS = PATCH.map((letter) => 'ABC'.indexOf(letter))
const COLOURS = colourRegions(3, REGIONS)
const fabricOf = (col: number, row: number) =>
  `color-mix(in oklab, ${regionPaint(COLOURS[REGIONS[row * 3 + col]])} var(--wash-ground), var(--surface-sunk))`

/**
 * The numerals written on the card, one to a square and 0 where the square is
 * empty. Read them against the diagram above: they are the three squares the
 * card has filled in.
 *
 * They are a position the quilt really takes, which is what docs/DESIGN.md
 * asks of a scene. The quilt above has exactly two fillings — 132/241/132 and
 * 231/142/231 — and these three numerals are the second of them part-written,
 * so a child who read the card as a puzzle could finish it, and would find one
 * answer. Fed to this puzzle's own `countSolutions` as patches
 * [0,0,1,0,2,1,2,2,2] and givens [0,0,1,0,0,2,0,3,0], that is what comes back:
 * one. Move a numeral and check it again — a 3 in the bottom left corner, which
 * is where this one used to be, makes the card a board with no answer at all.
 */
const WRITTEN = [
  0, 0, 1,
  0, 0, 2,
  0, 3, 0,
]

/**
 * A numeral in its own little box round the origin, 2.3 units across and 3.4
 * tall, drawn in the same round-capped stroke every other mark in the app is
 * drawn with. `Numeral` sits it in the middle of a square and scales it up.
 *
 * A real `<text>` element would be the truer material, but a card sits inside
 * the puzzle's `<h1>`, and numerals in there are characters of the page's
 * heading that nobody wrote: the title would read "123The patchwork quilt" to
 * anything taking the heading as plain text.
 */
const STROKES: Record<number, string> = {
  1: 'M-1.01 -0.98L-0.16 -1.72V1.72',
  2: 'M-1.17 -0.9C-1.17 -2.03 1.17 -1.95 1.17 -0.7C1.17 0.23 -0.78 0.9 -1.17 1.72h2.34',
  3:
    'M-1.09 -1.13C-0.7 -1.95 1.17 -1.83 1.17 -0.82C1.17 -0.12 0.47 0.04 -0.08 0.04' +
    'C0.62 0.04 1.17 0.47 1.17 1.01C1.17 2.03 -0.7 1.95 -1.09 1.09',
}

/**
 * How much bigger the numeral is drawn than it is written: 4.8 units tall in a
 * square of 8.67, a little over half of it, which is the share of its square
 * the board's own mono numeral takes.
 */
const NUMERAL = 1.4
/**
 * And how heavy: between the hairline inside a patch and the seam round it,
 * which is what a number on this board is. It is divided by the scale above,
 * because a scale takes the stroke width with it.
 */
const NUMERAL_STROKE = 1.25

function Numeral({ value, col, row }: { value: number; col: number; row: number }) {
  return (
    <path
      d={STROKES[value]}
      transform={`translate(${at(col)} ${at(row)}) scale(${NUMERAL})`}
      fill="none"
      stroke="var(--ink)"
      strokeWidth={NUMERAL_STROKE / NUMERAL}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

/**
 * The card: a quilt part written in. The patch of two squares down the right
 * side holds its 1 and its 2, which is the whole rule of the puzzle said
 * without a word — count the squares in a patch and that is how far its
 * numbers go. What carries at 28px is the three colours and the heavy seam
 * between them: it turns a corner round the patch of three and runs the length
 * of the domino, cutting the board into three shapes of three fabrics. The
 * garden cats are cut into coloured shapes too, and told apart from this by
 * the cats sitting in theirs.
 *
 * The weights are the scene's own: our 1.5 stroke is 2 units in a 32-unit box
 * and our hairline is 1, so a seam is twice the line inside a patch here, as
 * against three times on the board itself.
 */
export function SuguruIcon({ className }: { className?: string }) {
  const rule = (heavy: boolean) => ({
    stroke: heavy ? 'var(--ink)' : 'var(--rule-strong)',
    strokeWidth: heavy ? 2 : 1,
  })
  return (
    <Scene className={className}>
      <rect x={EDGE} y={EDGE} width={SPAN} height={SPAN} rx={1.6} fill="var(--surface-sunk)" />
      {LINES.map((row) =>
        LINES.map((col) => (
          <rect
            key={`${col},${row}`}
            x={EDGE + col * CELL}
            y={EDGE + row * CELL}
            width={CELL}
            height={CELL}
            fill={fabricOf(col, row)}
          />
        )),
      )}

      {/* Every seam between two squares, heavy where it parts two patches. */}
      {[1, 2].map((col) =>
        LINES.map((row) => (
          <path
            key={`v${col},${row}`}
            d={`M${EDGE + col * CELL} ${EDGE + row * CELL}v${CELL}`}
            {...rule(of_(col - 1, row) !== of_(col, row))}
          />
        )),
      )}
      {[1, 2].map((row) =>
        LINES.map((col) => (
          <path
            key={`h${col},${row}`}
            d={`M${EDGE + col * CELL} ${EDGE + row * CELL}h${CELL}`}
            {...rule(of_(col, row - 1) !== of_(col, row))}
          />
        )),
      )}

      <rect
        x={EDGE}
        y={EDGE}
        width={SPAN}
        height={SPAN}
        rx={1.6}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={2}
      />

      {WRITTEN.map((value, i) =>
        value === 0 ? null : (
          <Numeral key={i} value={value} col={i % 3} row={Math.floor(i / 3)} />
        ),
      )}
    </Scene>
  )
}
