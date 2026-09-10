import { Scene } from '../../components/scene'

/**
 * Nothing on this board is a thing a child could point at and name. A square
 * of a grid is abstract by nature — docs/DESIGN.md names a sudoku cell in that
 * list — so a square here is bone paper or flat enamel with a numeral on it,
 * and that is the whole material list. There is no control on the board but
 * the squares themselves, so there is no mark in our own hand on it either.
 */

const EDGE = 3
/** Nine squares, on the pitch the garden and the quilt draw their cards on. */
const CELL = 8.6667
const SPAN = CELL * 3
/** The middle of column or row `i`. */
const at = (i: number) => EDGE + CELL * i + CELL / 2
const LINES = [0, 1, 2]

/**
 * The answer the card is drawn on: a cross, five squares of the nine filled in.
 *
 * ```
 *   . # .
 *   # # #
 *   . # .
 * ```
 *
 * Nine squares rather than sixteen or twenty-five is the whole of what this
 * drawing has to be. The plate on a collection card gives a scene 68px and the
 * row above a puzzle gives it 28, and at 28px a five-across lattice is
 * twenty-five marks in the width of a fingernail. A cross of enamel is one
 * shape, and it is the shape nothing else in the collection makes: the other
 * grids here are a scatter of small pieces on ruled paper, and this one is a
 * block of ink with the paper showing at the corners.
 */
const FILLED = [
  false, true, false,
  true, true, true,
  false, true, false,
]

/**
 * The two numbers printed on it, and they are both right — which is what
 * docs/DESIGN.md asks of a scene: a position the board really takes.
 *
 * The 5 in the middle counts all nine squares and five of them are filled in.
 * The 3 in the top left corner counts only the four squares it can reach, and
 * three of those are filled in. Between them they say the two things a child
 * has to know before the first tap: a number counts its own square, and a
 * number in a corner counts fewer squares than one in the middle. Fed to this
 * puzzle's own `isSolved` as clues [3,-1,-1,-1,5,-1,-1,-1,-1] over these five
 * filled squares, that is what comes back — logic.test.ts checks it, and
 * checks that moving either numeral one square makes it wrong.
 */
const PRINTED: Record<number, number> = { 0: 3, 4: 5 }

/**
 * A numeral in its own little box round the origin, drawn rather than typed.
 * `Numeral` sits it in the middle of a square and scales it up.
 *
 * A real `<text>` element would be the truer material, but a card sits inside
 * the puzzle's `<h1>`, and numerals in there are characters of the page's
 * heading that nobody wrote: the title would read "35The counting squares" to
 * anything taking the heading as plain text.
 */
const STROKES: Record<number, string> = {
  3:
    'M-1.09 -1.13C-0.7 -1.95 1.17 -1.83 1.17 -0.82C1.17 -0.12 0.47 0.04 -0.08 0.04' +
    'C0.62 0.04 1.17 0.47 1.17 1.01C1.17 2.03 -0.7 1.95 -1.09 1.09',
  5: 'M0.95 -1.72h-1.9v1.3C-0.45 -0.62 1.2 -0.6 1.2 0.55C1.2 1.75 -0.55 2.05 -1.12 1.05',
}

/**
 * How much bigger a numeral is drawn than it is written. The two paths above
 * stand about 3.4 units tall in their own little box, so at this scale a
 * numeral is about 4.6 units tall in a square of 8.67 — a little over half of
 * it, which is the share of its square that the board's own mono numeral takes:
 * `font-size: 10cqw` against a five-across column of 20cqw, and the same half
 * again at six across and at seven.
 */
const NUMERAL = 1.35
/**
 * And how heavy. `strokeWidth` is written in the numeral's own box and the
 * scale carries it out along with everything else, so dividing by the scale
 * above leaves what the card really draws as `NUMERAL_STROKE` itself: 1.35
 * units.
 *
 * That is between the two weights this box already has, and nearer the lighter
 * one — the hairline that every enamel piece wears is 1 unit here, and the 1.5
 * stroke that the rest of our marks are drawn in is 2. It has to be. A numeral
 * only 4.6 units tall has its bends inside that: the 3's two bowls run about
 * 1.94 units apart, centre of stroke to centre of stroke, so at 2 units the
 * strokes meet and both bowls fill in, and the 5's bar swallows the top of its
 * own curve at 1.63 apart. At 1.35 the 3 keeps about 0.6 units of daylight in
 * each bowl and the 5 about 0.3. (Those gaps are the closest approach between
 * the `STROKES` curves above, times this scale.) The board says the same thing
 * in its own materials: a number there is a mono face at weight 600, not a
 * mark in our own hand.
 */
const NUMERAL_STROKE = 1.35

function Numeral({ value, col, row, ink }: { value: number; col: number; row: number; ink: string }) {
  return (
    <path
      d={STROKES[value]}
      transform={`translate(${at(col)} ${at(row)}) scale(${NUMERAL})`}
      fill="none"
      stroke={ink}
      strokeWidth={NUMERAL_STROKE / NUMERAL}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

/**
 * The card: a small board with every number on it already right.
 *
 * The enamel runs to the edge of each square it fills, so the five of them read
 * as one cross rather than as five tiles, and the paper's own ruling is drawn
 * over the top. That last part is the one place where this card is not simply
 * the board drawn small. On the board a square sits in a seat — `padding:
 * var(--seat)` on `.cell`, 2px of the sunk stage that the grid is set into —
 * and the ruling is the cell's own border, so it runs down the middle of that
 * seat: two filled squares are two tiles of enamel with a band of stage between
 * them, and no bone shows there at all. The seat is 2px of the 56px column that
 * the five-across board sets as its floor, and the same share of this card's
 * 8.67-unit pitch is 0.31 units — a quarter of a pixel at the 28px that the row
 * above a puzzle gives a scene, which would print as a smudge rather than as a
 * gap. So the seat goes and the ruling stands in for it.
 *
 * What carries at 28px is that cross; what rewards a longer look at 68px is the
 * light 5 standing on the enamel in the middle of it, counting the square it is
 * standing on.
 */
export function CountingSquaresIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect x={EDGE} y={EDGE} width={SPAN} height={SPAN} rx={1.6} fill="var(--surface)" />

      {FILLED.map((on, i) =>
        on ? (
          <rect
            key={`f${i}`}
            x={EDGE + (i % 3) * CELL}
            y={EDGE + Math.floor(i / 3) * CELL}
            width={CELL}
            height={CELL}
            fill="var(--p-indigo)"
          />
        ) : null,
      )}

      {/* The paper's ruling, over the enamel as well as the bone. On the board
          it is the cell's own border and runs down the seat between two
          squares, which is the stage showing through rather than bone; the
          card has no room for that seat, so the ruling carries the division on
          its own. See the note above. */}
      <g stroke="var(--rule)" strokeWidth={0.8}>
        {[1, 2].map((k) => (
          <path key={`v${k}`} d={`M${EDGE + k * CELL} ${EDGE}v${SPAN}`} />
        ))}
        {[1, 2].map((k) => (
          <path key={`h${k}`} d={`M${EDGE} ${EDGE + k * CELL}h${SPAN}`} />
        ))}
      </g>

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

      {LINES.flatMap((row) =>
        LINES.map((col) => {
          const i = row * 3 + col
          const value = PRINTED[i]
          if (value === undefined) return null
          return (
            <Numeral
              key={`n${i}`}
              value={value}
              col={col}
              row={row}
              ink={FILLED[i] ? 'var(--p-on-dark)' : 'var(--ink)'}
            />
          )
        }),
      )}
    </Scene>
  )
}
