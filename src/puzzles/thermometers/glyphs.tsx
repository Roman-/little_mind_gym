import { Scene, edge } from '../../components/scene'
import { CARD } from './logic'

/**
 * Nothing on this board is a thing a child could point at and name, so nothing
 * here is a pictogram: a thermometer is bone glass, a hairline and a run of
 * mercury, drawn in the board's own materials. The only mark in our own hand is
 * a numeral, and it is drawn rather than typed — see `Numeral` below.
 */

const MARGIN = 9
const CELL = 7.4
const SPAN = CELL * CARD.n
/** The paper's own ruling, between the squares and never round the outside. */
const RULES = Array.from({ length: CARD.n - 1 }, (_, k) => k + 1)
const at = (i: number) => MARGIN + CELL * i + CELL / 2
/** Where a number stands: halfway across the margin the field leaves it. */
const GUTTER = 4.4

/**
 * A numeral, drawn rather than typed.
 *
 * The board prints its numbers in the mono face, and these are the same numbers
 * in our own hand — three units across and four and a bit tall, in ink. A real
 * `<text>` element would be the truer material, but a card sits inside the
 * puzzle's `<h1>`, and a numeral in there is a character of the page's heading
 * that nobody wrote: the title would read "0The thermometers" to anything
 * taking the heading as plain text.
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

/** One thermometer standing in its column, with the mercury it holds. */
function Tube({ column, fill }: { column: number; fill: number }) {
  const x = at(column)
  const bulb = at(CARD.n - 1)
  const glassTop = MARGIN + 0.8
  /** The mercury stops at the top of the last square it fills. */
  const top = fill === CARD.n ? glassTop + 0.5 : MARGIN + CELL * (CARD.n - fill)
  return (
    <>
      <rect
        x={x - 1.8}
        y={glassTop}
        width={3.6}
        height={bulb - glassTop}
        rx={1.8}
        fill="var(--p-bone)"
        {...edge}
      />
      {fill > 0 && (
        <rect x={x - 1.25} y={top} width={2.5} height={bulb - top} rx={1.25} fill="var(--p-clay)" />
      )}
      <circle
        cx={x}
        cy={bulb}
        r={3}
        fill={fill > 0 ? 'var(--p-clay)' : 'var(--p-bone)'}
        {...edge}
      />
    </>
  )
}

/**
 * The card: a finished three-across board, with the numbers that count it
 * standing round the outside.
 *
 * The margin and the mercury are what tell this card apart from every other
 * grid in the collection, so both are given the room: an L of numerals outside
 * the field's rim, and three thermometers inside it at three different heights —
 * one part full, one empty, one with mercury only in the square above its bulb.
 * Which end fills first is the one thing this puzzle asks a child to hold on to,
 * so every bulb is drawn fat and at the bottom.
 *
 * It is a real answer, and a child can check it before opening the puzzle. Two
 * full squares in the bottom row, one in the row above it, none in the top row,
 * and each column counting its own thermometer.
 */
export function ThermometersIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      {CARD.rowClues.map((want, row) => (
        <Numeral key={`r${row}`} value={want} x={GUTTER} y={at(row)} />
      ))}
      {CARD.colClues.map((want, column) => (
        <Numeral key={`c${column}`} value={want} x={at(column)} y={GUTTER} />
      ))}

      <rect x={MARGIN} y={MARGIN} width={SPAN} height={SPAN} rx={1.6} fill="var(--surface)" />
      <g stroke="var(--rule)" strokeWidth={0.7}>
        {RULES.map((k) => (
          <path key={`h${k}`} d={`M${MARGIN} ${MARGIN + CELL * k}h${SPAN}`} />
        ))}
        {RULES.map((k) => (
          <path key={`v${k}`} d={`M${MARGIN + CELL * k} ${MARGIN}v${SPAN}`} />
        ))}
      </g>
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

      {CARD.fill.map((fill, column) => (
        <Tube key={column} column={column} fill={fill} />
      ))}
    </Scene>
  )
}
