import { Piece, Scene, edge } from '../../components/scene'
import s from './board.module.css'

/**
 * The horses are OpenMoji artwork, drawn straight by `Board.tsx` and by the
 * card below. What is drawn here in our own hand are two marks: the L a horse
 * jumps in, which stands under the board for the whole game, and the drop mark
 * that says "let go here".
 */

const strokes = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/**
 * The rule, drawn once and left there: an arrow that leaves one square, runs
 * two squares one way, and turns one square across. A crook, not a curve — the
 * corner is the whole point of it.
 *
 * It is not a legal-move tell. It says nothing about the position on the board
 * — it is the same picture at every move of every level — so a child still has
 * to work out which squares an L reaches from where a horse is standing.
 */
export function JumpMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokes} strokeWidth={2.6}>
      {/* Where the horse set off from. */}
      <circle cx={8} cy={19.6} r={2.3} fill="currentColor" stroke="none" opacity={0.45} />
      <path d="M8 19.6V5.2h7" />
      <path d="M14.2 2 17.4 5.2 14.2 8.4" />
    </svg>
  )
}

/**
 * Sits over a square while a horse is in the air. It means "let go here", and
 * it is on every empty square — never on only the two an L would reach, which
 * would hand over the one thing the child is here to work out.
 */
export function DropMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokes}>
      <path d="M12 4.5v11" />
      <path d="M7.5 11l4.5 4.5L16.5 11" />
      <path d="M6 19.5h12" />
    </svg>
  )
}

const EDGE = 3
const CELL = 8.6667
const at = (i: number) => EDGE + CELL * i + CELL / 2

/** The four corners, with the mat under each and the team standing on it. */
const CORNERS = [
  { col: 0, row: 0, mat: 'var(--p-slate)', grey: false },
  { col: 2, row: 0, mat: 'var(--p-slate)', grey: false },
  { col: 0, row: 2, mat: 'var(--p-ochre)', grey: true },
  { col: 2, row: 2, mat: 'var(--p-ochre)', grey: true },
]

/**
 * The card: the 1512 board at move zero. Two brown horses on the top corners,
 * two grey ones on the bottom, and under every horse a mat in the other team's
 * colour — so the card says the whole puzzle before it is opened. Everybody has
 * to change places.
 *
 * The middle is drawn empty, which is honest: it is empty in every position
 * this puzzle can reach.
 */
export function FourHorsesIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect
        x={EDGE}
        y={EDGE}
        width={CELL * 3}
        height={CELL * 3}
        rx={1.6}
        fill="var(--surface-sunk)"
      />
      {/* The eight seams that cut the block into nine. */}
      {[1, 2].map((col) => (
        <path
          key={`v${col}`}
          d={`M${EDGE + col * CELL} ${EDGE}v${CELL * 3}`}
          stroke="var(--rule)"
          strokeWidth={0.7}
        />
      ))}
      {[1, 2].map((row) => (
        <path
          key={`h${row}`}
          d={`M${EDGE} ${EDGE + row * CELL}h${CELL * 3}`}
          stroke="var(--rule)"
          strokeWidth={0.7}
        />
      ))}
      {/* The mats: the strongest colour in the picture, and what carries the
          shape at 28px — four tinted corners with something standing on each. */}
      {CORNERS.map((corner) => (
        <rect
          key={`mat${corner.col},${corner.row}`}
          x={EDGE + corner.col * CELL + 0.9}
          y={EDGE + (corner.row + 1) * CELL - 3.4}
          width={CELL - 1.8}
          height={2.6}
          rx={1}
          fill={corner.mat}
          {...edge}
        />
      ))}
      <rect
        x={EDGE}
        y={EDGE}
        width={CELL * 3}
        height={CELL * 3}
        rx={1.6}
        fill="none"
        stroke="var(--ink-muted)"
        strokeWidth={1.6}
      />
      {/* Standing on the mat rather than on top of it, exactly as the board
          draws them. */}
      {CORNERS.map((corner) => (
        <Piece
          key={`horse${corner.col},${corner.row}`}
          name="horse"
          x={at(corner.col)}
          y={at(corner.row) - 1.9}
          size={8.8}
          className={corner.grey ? s.grey : undefined}
        />
      ))}
    </Scene>
  )
}
