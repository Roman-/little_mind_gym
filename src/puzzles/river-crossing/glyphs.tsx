import { Piece, Scene } from '../../components/scene'

/**
 * The passengers are OpenMoji pictograms — a goat that looks like a goat — so
 * the only thing drawn in our own hand here is the arrow the boat carries. An
 * arrow is an affordance, not a thing.
 */

/**
 * The card: the board seen from above. Two shores, the river between them, the
 * boat out on the water, and the goat and the cabbage still waiting on the
 * near bank. A boat on its own says boating; a boat between two shores with
 * somebody left behind says the puzzle.
 */
export function RiverIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect x="2" y="2.6" width="28" height="6.6" rx="1.6" fill="var(--p-ochre)" fillOpacity={0.32} />
      <rect x="2" y="22.8" width="28" height="6.6" rx="1.6" fill="var(--p-ochre)" fillOpacity={0.32} />
      <rect x="2" y="9.8" width="28" height="13" fill="var(--p-teal)" fillOpacity={0.22} />
      <g stroke="var(--p-teal)" strokeOpacity={0.5} strokeWidth={1} strokeLinecap="round">
        <path d="M4.5 12.8h6.5M21 12.8h6.5" />
        <path d="M4.5 19.6h5M22.5 19.6h5" />
      </g>
      <Piece name="boat" x={16} y={16.2} size={14} />
      <Piece name="goat" x={9} y={26.1} size={7} />
      <Piece name="cabbage" x={23} y={26.1} size={6.4} />
    </Scene>
  )
}

/** Points at the bank the boat will land on. */
export function BoatArrow({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20V5M5.5 11.5 12 5l6.5 6.5" />
    </svg>
  )
}
