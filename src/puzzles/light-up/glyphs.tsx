import { Piece, Scene } from '../../components/scene'

/**
 * Every candle on the board is the OpenMoji candle, drawn straight by
 * `Board.tsx`, and the walls and the light are flat enamel. The one mark in
 * our own hand is the clue number on the card, and it is drawn rather than
 * typed — see `Two` below.
 */

const EDGE = 2.5
const CELL = 9
const SPAN = CELL * 3
const CELLS = [0, 1, 2]
const at = (i: number) => EDGE + CELL * i + CELL / 2

/** Two walls, each wanting two candles. Column and row, from the top left. */
const WALLS = [
  [0, 1],
  [2, 1],
]
/** The answer: three candles on the diagonal. */
const CANDLES = [
  [0, 0],
  [1, 1],
  [2, 2],
]

const isWall = (col: number, row: number) => WALLS.some(([c, r]) => c === col && r === row)
const isCandle = (col: number, row: number) => CANDLES.some(([c, r]) => c === col && r === row)

/**
 * A 2, drawn rather than typed.
 *
 * The board prints its clue numbers in the mono face, and this is the same
 * number in our own hand — 3.1 units across and 4.4 tall, on the wall's own
 * ink. A real `<text>` element would be the truer material, but a card sits
 * inside the puzzle's `<h1>`, and a numeral in there is two characters of the
 * page's heading that nobody wrote: the title would read "22The candles" to
 * anything taking the heading as plain text.
 */
function Two({ cx, cy }: { cx: number; cy: number }) {
  const x = cx - 1.55
  const y = cy - 2.2
  return (
    <path
      d={`M${x} ${y + 1.15}C${x} ${y - 0.35} ${x + 3.1} ${y - 0.35} ${x + 3.1} ${y + 1.25}C${x + 3.1} ${y + 2.4} ${x + 0.5} ${y + 3.3} ${x} ${y + 4.4}h3.1`}
      fill="none"
      stroke="var(--p-on-dark)"
      strokeWidth={1.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

/**
 * The card: a solved board, in the board's own two materials and nothing else.
 *
 * The ochre field is the largest thing on it, and it is what names the puzzle
 * at 28px — a warm board rather than a coloured one. The two slate blocks with
 * numerals on them are the silhouette that tells this card apart from every
 * other grid in the collection, and they are the only numbers in any of these
 * pictures: the clue is on the stage behind the card, and a card that dropped
 * it would be a picture of this puzzle without the thing it counts.
 *
 * It is a real answer, and a child can check it before opening the puzzle.
 * Each wall has exactly two candles beside it, every open square is lit, and
 * no candle stands in another candle's light.
 */
export function LightUpIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect x={EDGE} y={EDGE} width={SPAN} height={SPAN} rx={1.6} fill="var(--surface-sunk)" />

      {/* The light, at the two strengths the board itself uses: the square a
          candle stands on, and every square it reaches. */}
      {CELLS.map((row) =>
        CELLS.map((col) =>
          isWall(col, row) ? null : (
            <rect
              key={`lit${col},${row}`}
              x={EDGE + col * CELL}
              y={EDGE + row * CELL}
              width={CELL}
              height={CELL}
              fill="var(--p-ochre)"
              fillOpacity={isCandle(col, row) ? 0.46 : 0.22}
            />
          ),
        ),
      )}

      {/* The lattice, so a run of light reads as four lit squares rather than
          one smear. */}
      {[1, 2].map((k) => (
        <path
          key={`v${k}`}
          d={`M${EDGE + k * CELL} ${EDGE}v${SPAN}`}
          stroke="var(--rule)"
          strokeWidth={0.7}
          fill="none"
        />
      ))}
      {[1, 2].map((k) => (
        <path
          key={`h${k}`}
          d={`M${EDGE} ${EDGE + k * CELL}h${SPAN}`}
          stroke="var(--rule)"
          strokeWidth={0.7}
          fill="none"
        />
      ))}

      {WALLS.map(([col, row]) => (
        <g key={`w${col},${row}`}>
          <rect
            x={EDGE + col * CELL}
            y={EDGE + row * CELL}
            width={CELL}
            height={CELL}
            rx={1}
            fill="var(--p-slate)"
          />
          <Two cx={at(col)} cy={at(row)} />
        </g>
      ))}

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

      {CANDLES.map(([col, row]) => (
        <Piece key={`c${col},${row}`} name="candle" x={at(col)} y={at(row)} size={8.4} />
      ))}
    </Scene>
  )
}
