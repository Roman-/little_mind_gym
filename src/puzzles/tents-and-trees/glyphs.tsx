import { Piece, Scene } from '../../components/scene'

/**
 * The tents and the trees on the board are OpenMoji pictograms, drawn straight
 * by `Board.tsx`, and the field is flat enamel. The one thing in our own hand
 * here is a numeral, and it is drawn rather than typed — see `Numeral` below.
 */

const MARGIN = 9
const CELL = 7.4
const SPAN = CELL * 3
const CELLS = [0, 1, 2]
const at = (i: number) => MARGIN + CELL * i + CELL / 2
/** Where a number stands: halfway across the margin the field leaves it. */
const GUTTER = 4.4

/** The answer on the card: two tents in the top row, and a tree for each. */
const TENTS = [
  [0, 0],
  [2, 0],
]
const TREES = [
  [1, 0],
  [2, 1],
]
/** What the margin says, read off that answer. Rows down the side, columns along the top. */
const ROWS = [2, 0, 0]
const COLUMNS = [1, 0, 1]

const isTree = (col: number, row: number) => TREES.some(([c, r]) => c === col && r === row)

/**
 * A numeral, drawn rather than typed.
 *
 * The board prints its numbers in the mono face, and these are the same
 * numbers in our own hand — three units across and four and a half tall, in
 * ink. A real `<text>` element would be the truer material, but a card sits
 * inside the puzzle's `<h1>`, and a numeral in there is a character of the
 * page's heading that nobody wrote: the title would read "2The tents and
 * trees" to anything taking the heading as plain text.
 */
function Numeral({ value, x, y }: { value: number; x: number; y: number }) {
  const ink = {
    fill: 'none',
    stroke: 'var(--ink)',
    strokeWidth: 1.3,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const
  if (value === 0) return <ellipse cx={x} cy={y} rx={1.35} ry={2.2} {...ink} />
  if (value === 1) {
    return (
      <path
        d={`M${x - 1.35} ${y - 1.25}L${x - 0.15} ${y - 2.2}V${y + 2.2}M${x - 1.5} ${y + 2.2}h3`}
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
 * The card: a finished camp, with the numbers that count it standing round the
 * outside.
 *
 * The margin is what tells this card apart from every other grid in the
 * collection, so it is drawn first and given the room: an L of numerals along
 * the top and down the side, outside the field's rim. Inside it, the board's
 * own two materials — a bone tile for a square a tent may stand on, and the
 * sunk floor of the field showing through where a tree grows.
 *
 * It is a real answer, and a child can check it before opening the puzzle. Two
 * tents, two trees, one tent for each tree, no two tents touching, and every
 * number counting the tents in its own line.
 */
export function TentsAndTreesIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      {ROWS.map((want, row) => (
        <Numeral key={`r${row}`} value={want} x={GUTTER} y={at(row)} />
      ))}
      {COLUMNS.map((want, col) => (
        <Numeral key={`c${col}`} value={want} x={at(col)} y={GUTTER} />
      ))}

      <rect x={MARGIN} y={MARGIN} width={SPAN} height={SPAN} rx={1.6} fill="var(--surface-sunk)" />

      {/* A bone tile in every square a tent may stand on. Where a tree grows,
          the floor of the field is left showing, exactly as the board leaves
          it. */}
      {CELLS.map((row) =>
        CELLS.map((col) =>
          isTree(col, row) ? null : (
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

      {TREES.map(([col, row]) => (
        <Piece key={`w${col},${row}`} name="tree" x={at(col)} y={at(row)} size={7} />
      ))}
      {TENTS.map(([col, row]) => (
        <Piece key={`p${col},${row}`} name="tent" x={at(col)} y={at(row)} size={6.6} />
      ))}
    </Scene>
  )
}
