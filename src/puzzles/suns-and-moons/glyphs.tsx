import { Pictogram } from '../../components/Pictogram'
import { Piece, Scene } from '../../components/scene'
import { MOON, SUN } from './logic'

/**
 * The two marks of the board. A sun and a moon are things a child can point at
 * and name, so both are OpenMoji pictures and nothing here is drawn in our own
 * hand. They tell each other apart by shape rather than by colour — a spiked
 * disc against an open hook — which is what lets the plate under them stay
 * neutral and leaves amber, moss and clay free to mean what they mean.
 */
export function MarkGlyph({ value, className }: { value: number; className?: string }) {
  if (value === SUN) return <Pictogram name="sun" className={className} />
  if (value === MOON) return <Pictogram name="moon" className={className} />
  return null
}

/* The card is drawn on a two by two: the smallest piece of this board that
   still has a row, a column and something to work out. */
const EDGE = 3
const CELL = 13
/** The middle of column or row `i`. */
const at = (i: number) => EDGE + CELL * i + CELL / 2

/**
 * The card: a corner of the board, part filled. A sun and a moon along the top,
 * a moon under the sun, and one square still empty — and the two rules settle
 * that square, because the row it is in and the column it is in each want one
 * more sun. So the picture is not just suns and moons on a grid; it is the
 * question the puzzle asks, small enough to answer from across the room.
 *
 * The materials are the board's own: the sunk ground it is engraved into, the
 * hairlines between squares, and one bone tile for the square you can still
 * press.
 */
export function SunsAndMoonsIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect
        x={EDGE}
        y={EDGE}
        width={CELL * 2}
        height={CELL * 2}
        rx={1.8}
        fill="var(--surface-sunk)"
        stroke="var(--ink-muted)"
        strokeWidth={1.5}
      />
      <path
        d={`M${EDGE + CELL} ${EDGE}v${CELL * 2}M${EDGE} ${EDGE + CELL}h${CELL * 2}`}
        stroke="var(--rule)"
        strokeWidth={1}
      />
      <rect
        x={at(1) - 5.4}
        y={at(1) - 5.4}
        width={10.8}
        height={10.8}
        rx={1.4}
        fill="var(--surface)"
        stroke="var(--rule-strong)"
        strokeWidth={1}
      />
      <Piece name="sun" x={at(0)} y={at(0)} size={10.5} />
      <Piece name="moon" x={at(1)} y={at(0)} size={10.5} />
      <Piece name="moon" x={at(0)} y={at(1)} size={10.5} />
    </Scene>
  )
}
