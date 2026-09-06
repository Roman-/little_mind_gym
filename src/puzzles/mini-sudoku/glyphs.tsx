import { Pictogram } from '../../components/Pictogram'
import { Piece, Scene } from '../../components/scene'
import { FRUIT_NAMES } from './logic'

/**
 * The four symbols of a 4x4 board. A drawn circle and a drawn diamond had to
 * be learned before the puzzle could start; an apple and a bunch of grapes do
 * not. Each fruit brings its own colour, so the plate under it stays neutral
 * and amber, moss and clay are left free to mean what they mean.
 */
export function FruitGlyph({ value, className }: { value: number; className?: string }) {
  const name = FRUIT_NAMES[value - 1]
  if (!name) return null
  return <Pictogram name={name} className={className} />
}

/**
 * A rubber resting on the paper. This one stays a drawn glyph: rubbing a
 * square out is something you do inside this app, not a thing a child could
 * point at and name.
 */
export function ClearGlyph({ className }: { className?: string }) {
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
      <path d="M3.4 13.6 12.4 4.6 18.6 10.8 9.6 19.8Z" />
      <path d="M7.5 9.6 13.7 15.8" />
      <path d="M2.8 20.5h18.4" />
    </svg>
  )
}

/* The card is drawn on a four by four, which is the smallest board here. */
const EDGE = 3.5
const CELL = 6.25
/** The middle of column or row `i`. */
const at = (i: number) => EDGE + CELL * i + CELL / 2

/**
 * The card: a small square with its four boxes ruled off, and one fruit
 * standing in each of them. Four boxes and four fruits is the rule the whole
 * puzzle runs on — one of each in every box — said without a word.
 *
 * The heavy line is `--ink-muted` and the light one is `--rule`, the same two
 * weights the board rules its boxes and its cells with.
 */
export function SudokuIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect
        x={EDGE}
        y={EDGE}
        width={CELL * 4}
        height={CELL * 4}
        rx={1.6}
        fill="var(--surface)"
        stroke="var(--ink-muted)"
        strokeWidth={1.5}
      />
      {[1, 3].map((i) => (
        <path
          key={i}
          d={`M${EDGE + CELL * i} ${EDGE}v${CELL * 4}M${EDGE} ${EDGE + CELL * i}h${CELL * 4}`}
          stroke="var(--rule)"
          strokeWidth={0.9}
        />
      ))}
      <path
        d={`M${EDGE + CELL * 2} ${EDGE}v${CELL * 4}M${EDGE} ${EDGE + CELL * 2}h${CELL * 4}`}
        stroke="var(--ink-muted)"
        strokeWidth={1.5}
      />
      <Piece name="apple" x={at(0)} y={at(0)} size={6} />
      <Piece name="grapes" x={at(3)} y={at(1)} size={6} />
      <Piece name="banana" x={at(2)} y={at(2)} size={6} />
      <Piece name="pear" x={at(1)} y={at(3)} size={6} />
    </Scene>
  )
}
