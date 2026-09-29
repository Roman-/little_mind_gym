import { Piece, Scene } from '../../components/scene'
import { CARD, colOf, isEnd, rowOf } from './logic'
import type { SnakeState } from './logic'

/**
 * The snake's picture on the board is an OpenMoji pictogram, drawn by
 * `Board.tsx`, and its body is flat enamel. The one thing in our own hand here
 * is a numeral, and it is drawn rather than typed — see `Numeral` below.
 */

const MARGIN = 9
const CELL = 7.4
const SPAN = CELL * 3
const CELLS = [0, 1, 2]
/** Rounded, so a centre does not print sixteen digits into the markup. */
const at = (i: number) => Math.round((MARGIN + CELL * i + CELL / 2) * 1000) / 1000
/** Where a number stands: halfway across the margin the field leaves it. */
const GUTTER = 4.4
/** The body's width, and the width of the tail that it narrows to: the board's 0.46 and 0.26 of a square, near enough. */
const BODY = 3.6
const TAIL = 2
/** The hairline round both, each side. */
const HAIR = 0.5

/** The card's board as a position, so the one answer it draws is the answer `CARD` holds. */
const BOARD: SnakeState = {
  ...CARD,
  snake: Array.from({ length: CARD.n * CARD.n }, (_, i) => CARD.snake.includes(i)),
}

/** The centre of one of the card's squares. */
const centre = (i: number) => [at(colOf(CARD.n, i)), at(rowOf(CARD.n, i))]

/**
 * The body's last run, into the tail, as the four corners of a taper from
 * `wide` each side down to `narrow`: the board's own taper (see `TAIL` in
 * `Board.tsx`), on the card's scale. The way across is a quarter turn of the
 * way along.
 */
function taper(wide: number, narrow: number): string {
  const [[fx, fy], [tx, ty]] = CARD.snake.slice(-2).map(centre)
  const along = Math.hypot(tx - fx, ty - fy)
  const [ax, ay] = [(fy - ty) / along, (tx - fx) / along]
  const corner = (x: number, y: number, half: number) =>
    `${Math.round((x + ax * half) * 1000) / 1000},${Math.round((y + ay * half) * 1000) / 1000}`
  return [corner(fx, fy, wide), corner(tx, ty, narrow), corner(tx, ty, -narrow), corner(fx, fy, -wide)].join(' ')
}

/**
 * A numeral, drawn rather than typed.
 *
 * The board prints its numbers in the mono face, and these are the same
 * numbers in our own hand — three units across and four and a half tall, in
 * ink. A real `<text>` element would be the truer material, but a card sits
 * inside the puzzle's `<h1>`, and a numeral in there is a character of the
 * page's heading that nobody wrote. This is the tents' own `Numeral`, less the
 * 0 this card never prints and with a flat-topped 3, which it does: the card
 * prints 1, 2 and 3 and nothing else.
 */
function Numeral({ value, x, y }: { value: number; x: number; y: number }) {
  const ink = {
    fill: 'none',
    stroke: 'var(--ink)',
    strokeWidth: 1.3,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const
  if (value === 1) {
    return (
      <path
        d={`M${x - 1.35} ${y - 1.25}L${x - 0.15} ${y - 2.2}V${y + 2.2}M${x - 1.5} ${y + 2.2}h3`}
        {...ink}
      />
    )
  }
  if (value === 3) {
    return (
      <path
        d={`M${x - 1.45} ${y - 2.2}h2.9l-1.6 1.85c1.1 0 1.7 .6 1.7 1.3c0 .8-.7 1.25-1.6 1.25c-.65 0-1.15-.25-1.45-.7`}
        {...ink}
      />
    )
  }
  return (
    <path
      d={`M${x - 1.45} ${y - 1.25}C${x - 1.45} ${y - 2.7} ${x + 1.55} ${y - 2.7} ${x + 1.55} ${y - 0.95}C${x + 1.55} ${y + 0.25} ${x - 0.95} ${y + 1.15} ${x - 1.45} ${y + 2.2}h3`}
      {...ink}
    />
  )
}

/**
 * The card: a finished snake, with the numbers that count it standing round
 * the outside.
 *
 * It is `CARD` from `logic.ts`, a real three-across answer a child can check
 * before opening the puzzle: down from the head, across the middle row, down
 * to the tail, and every number counting its line with the two ends in. Four
 * big shapes — the margin of numerals, the field, the S of the snake's body,
 * and the snake itself — drawn in the order the board draws them: the field
 * with a bone tile on every square a child can press and the sunk floor
 * showing where the head and the tail are given, then the body over it, then
 * the picture last, on the body's first square, so the body runs out of the
 * snake and narrows over its last square into the round end that is the tail.
 *
 * The body is `--p-teal` enamel under the same hairline the board gives it,
 * for the board's reason: the picture's own green is the green that says a
 * thing is right. It stays off the rim: drawn as a C round the edge, it read
 * at 28px as a frame round the field.
 *
 * The hairline is three shapes that overlap, so its four tenths of ink are
 * the group's rather than each shape's, and the overlaps do not darken — the
 * board's own `.bandEdge`, for the same reason.
 */
export function LongSnakeIcon({ className }: { className?: string }) {
  const body = CARD.snake
    .slice(0, -1)
    .map((i) => centre(i).join(','))
    .join(' ')
  const [tailX, tailY] = centre(CARD.tail)
  return (
    <Scene className={className}>
      {CARD.rowClues.map((want, row) => (
        <Numeral key={`r${row}`} value={want} x={GUTTER} y={at(row)} />
      ))}
      {CARD.colClues.map((want, col) => (
        <Numeral key={`c${col}`} value={want} x={at(col)} y={GUTTER} />
      ))}

      <rect x={MARGIN} y={MARGIN} width={SPAN} height={SPAN} rx={1.6} fill="var(--surface-sunk)" />

      {/* A bone tile on every square a child can press. The head and the tail
          are given, so there the floor of the field shows through, exactly as
          the board leaves it. */}
      {CELLS.map((row) =>
        CELLS.map((col) =>
          isEnd(BOARD, row * CARD.n + col) ? null : (
            <rect
              key={`t${col},${row}`}
              x={MARGIN + col * CELL + 0.45}
              y={MARGIN + row * CELL + 0.45}
              width={CELL - 0.9}
              height={CELL - 0.9}
              rx={1.1}
              fill="var(--surface)"
              stroke="var(--rule-strong)"
              strokeWidth={0.6}
            />
          ),
        ),
      )}

      <rect
        x={MARGIN}
        y={MARGIN}
        width={SPAN}
        height={SPAN}
        rx={1.6}
        fill="none"
        stroke="var(--ink-muted)"
        strokeWidth={1.6}
      />

      {/* The body, as one band: its hairline first, then the enamel over it,
          each a run from the head to the square before the tail, a taper
          into the tail, and the tail's round end. */}
      <g opacity={0.4}>
        <polyline
          points={body}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={BODY + 2 * HAIR}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polygon points={taper(BODY / 2 + HAIR, TAIL / 2 + HAIR)} fill="var(--ink)" />
        <circle cx={tailX} cy={tailY} r={TAIL / 2 + HAIR} fill="var(--ink)" />
      </g>
      <polyline
        points={body}
        fill="none"
        stroke="var(--p-teal)"
        strokeWidth={BODY}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points={taper(BODY / 2, TAIL / 2)} fill="var(--p-teal)" />
      <circle cx={tailX} cy={tailY} r={TAIL / 2} fill="var(--p-teal)" />

      <Piece
        name="snake"
        x={at(colOf(CARD.n, CARD.head))}
        y={at(rowOf(CARD.n, CARD.head))}
        size={7}
      />
    </Scene>
  )
}
