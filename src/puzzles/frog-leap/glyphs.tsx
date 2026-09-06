import { Piece, Scene } from '../../components/scene'
import s from './board.module.css'

const strokes = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/**
 * The frogs are OpenMoji artwork now — the hand-drawn crouching frog read as a
 * pale blob at the size a stone allows, which is exactly the complaint that
 * started this. What is drawn here are marks: the arrow every frog wears and
 * the two end labels' arrows, and then the card at the bottom of the file.
 */

/** Points left. Flip it with CSS for the other end of the row. */
export function EndArrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokes} aria-hidden="true">
      <path d="M20 12H4.6M10.4 6.2 4.6 12l5.8 5.8" />
    </svg>
  )
}

/**
 * Which way this one frog travels, drawn on the frog itself. Points left, and
 * the green frogs flip it. Heavier strokes and a shorter shaft than EndArrow:
 * this one is read at the size of a fingernail rather than beside a label.
 */
export function WayArrow({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      {...strokes}
      strokeWidth={3}
      aria-hidden="true"
    >
      <path d="M18 12H7M12 6.5 6.5 12l5.5 5.5" />
    </svg>
  )
}

/** A stepping stone: the same pale grey the board sets its row in. */
const STONE = {
  fill: 'var(--rule-strong)',
  fillOpacity: 0.6,
  stroke: 'var(--ink)',
  strokeOpacity: 0.28,
  strokeWidth: 1,
} as const

/**
 * The card: the row, cut down to the three stones that matter. A green frog
 * facing a blue one across the one free stone is the whole shape of this
 * puzzle — the only way past a frog of the other colour is over it, and the
 * empty stone is the only place there is to land.
 *
 * The free stone is drawn the way the board draws it, warm and dashed, so the
 * place a child has to look for is already marked on the card.
 */
export function FrogLeapIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect x="1.6" y="19.4" width="28.8" height="5.4" rx="1" fill="var(--p-clay)" fillOpacity={0.3} />
      <circle cx={6.5} cy={15.2} r={5.1} {...STONE} />
      <circle
        cx={16}
        cy={15.2}
        r={5.1}
        fill="var(--amber)"
        fillOpacity={0.18}
        stroke="var(--amber)"
        strokeOpacity={0.75}
        strokeWidth={1.1}
        strokeDasharray="2.2 1.9"
      />
      <circle cx={25.5} cy={15.2} r={5.1} {...STONE} />
      <Piece name="frog" x={6.5} y={14.4} size={9.4} />
      <Piece name="frog" x={25.5} y={14.4} size={9.4} className={s.blue} />
    </Scene>
  )
}
