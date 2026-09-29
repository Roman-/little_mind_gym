import { Scene } from '../../components/scene'
import { colourRegions, regionPaint } from '../../lib/regions'
import { CARD } from './logic'

/**
 * Nothing on this board is a thing a child could point at and name, so nothing
 * here is a pictogram. A tile is abstract by nature, and paint is not a thing
 * you could point to apart from the tile it covers: both are drawn in the
 * board's own materials. The only mark in our own hand is a numeral, and it is
 * drawn rather than typed — see `Numeral` below.
 */

/** The margin frame the thermometers and the tents draw their numbers in. */
const MARGIN = 9
const CELL = 7.4
const SPAN = CELL * CARD.n
const at = (i: number) => MARGIN + CELL * i + CELL / 2
/** Where a number stands: halfway across the margin the field leaves it. */
const GUTTER = 4.4
/** How far a button stands in from the edge of its square: the seat. */
const SEAT = 0.9

/**
 * A numeral, drawn rather than typed.
 *
 * The board prints its numbers in the mono face, and these are the same numbers
 * in our own hand — three units across and four and a bit tall, in ink. A real
 * `<text>` element would be the truer material, but a card sits inside the
 * puzzle's `<h1>`, and a numeral in there is a character of the page's heading
 * that nobody wrote: the title would read "2The painted tiles" to anything
 * taking the heading as plain text. The thermometers' numeral, unchanged.
 */
function Numeral({ value, x, y }: { value: number; x: number; y: number }) {
  const ink = {
    fill: 'none',
    stroke: 'var(--ink)',
    strokeWidth: 1.3,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const
  if (value === 0) return <ellipse cx={x} cy={y} rx={1.3} ry={2.15} {...ink} />
  if (value === 1) {
    return (
      <path
        d={`M${x - 1.3} ${y - 1.2}L${x - 0.1} ${y - 2.15}V${y + 2.15}M${x - 1.5} ${y + 2.15}h3`}
        {...ink}
      />
    )
  }
  return (
    <path
      d={`M${x - 1.4} ${y - 1.2}C${x - 1.4} ${y - 2.65} ${x + 1.5} ${y - 2.65} ${x + 1.5} ${y - 0.9}C${x + 1.5} ${y + 0.3} ${x - 0.9} ${y + 1.15} ${x - 1.4} ${y + 2.15}h2.9`}
      {...ink}
    />
  )
}

/**
 * The card's tiles coloured by the same rule the board colours its own with,
 * rather than picked for the card: a is yellow because it holds the top left
 * square, and B, c and D take blue, green and purple, the next three in the
 * palette's order, because a board with no more tiles than colours never
 * repeats one.
 */
const COLOURS = colourRegions(CARD.n, CARD.tiles)
const colourOf = (tile: number) => regionPaint(COLOURS[tile])

/** Every edge between two squares, and whether it parts two tiles. */
const EDGES = CARD.tiles.flatMap((tile, i) => {
  const r = Math.floor(i / CARD.n)
  const c = i % CARD.n
  const out: { key: string; d: string; tile: number; seam: boolean }[] = []
  if (c + 1 < CARD.n) {
    const other = CARD.tiles[i + 1]
    out.push({
      key: `v${i}`,
      d: `M${MARGIN + CELL * (c + 1)} ${MARGIN + CELL * r}v${CELL}`,
      tile,
      seam: other !== tile,
    })
  }
  if (r + 1 < CARD.n) {
    const other = CARD.tiles[i + CARD.n]
    out.push({
      key: `h${i}`,
      d: `M${MARGIN + CELL * c} ${MARGIN + CELL * (r + 1)}h${CELL}`,
      tile,
      seam: other !== tile,
    })
  }
  return out
})

/**
 * The card: a finished three-across board, with the numbers that count it
 * standing round the outside.
 *
 * What the eye picks up first is the two painted bars, flat along the top and
 * the bottom — dark in the light theme and pale in the dark — against the
 * washed tiles round them. No other card in the collection has a solid bar of
 * one tile's colour lying across its field; the thermometers' card, which
 * shares this margin, has three upright tubes instead.
 *
 * It is a real answer, and a child can check it before opening the puzzle. The
 * middle row wants none, so the bent tile on the right stays plain in the
 * bottom row as well; the top row's 2 is the bar along the top, and the bottom
 * row's 2 the bar along the bottom.
 *
 * Every square sits in its seat, exactly as on the board: a full square of the
 * tile's ground wash, and a button on it inset by the seat, in the raised wash
 * where the tile is plain and in the board's own paint where it is painted.
 */
export function PaintedTilesIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      {CARD.rowClues.map((want, row) => (
        <Numeral key={`r${row}`} value={want} x={GUTTER} y={at(row)} />
      ))}
      {CARD.colClues.map((want, column) => (
        <Numeral key={`c${column}`} value={want} x={at(column)} y={GUTTER} />
      ))}

      <rect x={MARGIN} y={MARGIN} width={SPAN} height={SPAN} rx={1.6} fill="var(--surface-sunk)" />

      {CARD.tiles.map((tile, i) => (
        <rect
          key={`seat${i}`}
          x={MARGIN + CELL * (i % CARD.n)}
          y={MARGIN + CELL * Math.floor(i / CARD.n)}
          width={CELL}
          height={CELL}
          fill={`color-mix(in oklab, ${colourOf(tile)} var(--wash-ground), var(--surface-sunk))`}
        />
      ))}

      {CARD.tiles.map((tile, i) => (
        <rect
          key={`tile${i}`}
          x={MARGIN + CELL * (i % CARD.n) + SEAT}
          y={MARGIN + CELL * Math.floor(i / CARD.n) + SEAT}
          width={CELL - 2 * SEAT}
          height={CELL - 2 * SEAT}
          rx={1.1}
          fill={
            CARD.painted[tile]
              ? `color-mix(in oklab, ${colourOf(tile)} 40%, var(--ink))`
              : `color-mix(in oklab, ${colourOf(tile)} var(--wash-raised), var(--surface))`
          }
        />
      ))}

      {/* The stitching inside a tile, then the seams between tiles over it. */}
      {EDGES.filter((edge) => !edge.seam).map((edge) => (
        <path
          key={edge.key}
          d={edge.d}
          fill="none"
          stroke={`color-mix(in oklab, ${colourOf(edge.tile)} 55%, var(--rule-strong))`}
          strokeWidth={0.7}
        />
      ))}
      {EDGES.filter((edge) => edge.seam).map((edge) => (
        <path
          key={edge.key}
          d={edge.d}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1.3}
          strokeLinecap="round"
        />
      ))}

      <rect
        x={MARGIN}
        y={MARGIN}
        width={SPAN}
        height={SPAN}
        rx={1.6}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.6}
      />
    </Scene>
  )
}
