import { Scene, edge } from '../../components/scene'
import type { Tip } from './logic'

/* The instrument on the card, in the units of the scene. The board's own rig
   is built out of the same handful of numbers, for the same reason: the pans
   have to hang off the beam wherever the beam ends up. */
const PIVOT = { x: 16, y: 10.8 }
const ARM = 10.5
const TILT = -10
const CORD = 5.6
/** Half a pan. Two balls sit across it. */
const RIM = 4.2

/** Where one end of the beam gets to once the beam has tipped. */
function hang(side: -1 | 1) {
  const a = (TILT * Math.PI) / 180
  return { x: PIVOT.x + side * ARM * Math.cos(a), y: PIVOT.y + side * ARM * Math.sin(a) }
}

/** A pan on its cord, with two balls in it. */
function Pan({ x, y }: { x: number; y: number }) {
  const rim = y + CORD
  return (
    <>
      <path d={`M${x} ${y}v${CORD}`} stroke="var(--rule-strong)" strokeWidth={1.1} />
      <path
        d={`M${x - RIM} ${rim}Q${x} ${rim + 4.2} ${x + RIM} ${rim}`}
        fill="var(--surface)"
        stroke="var(--ink-muted)"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <path d={`M${x - RIM} ${rim}h${RIM * 2}`} stroke="var(--ink)" strokeWidth={1.3} strokeLinecap="round" />
      <circle cx={x - 1.6} cy={rim - 0.7} r={1.45} fill="var(--p-slate)" {...edge} />
      <circle cx={x + 1.6} cy={rim - 0.7} r={1.45} fill="var(--p-slate)" {...edge} />
    </>
  )
}

/**
 * The card: the balance with two against two on it and one side down. Same
 * count on both pans and still not level — which is the whole puzzle, because
 * the only thing that can be different is what the balls weigh.
 *
 * A pair of scales on its own says weighing. This says which question the
 * weighing has to answer.
 */
export function BalanceIcon({ className }: { className?: string }) {
  const left = hang(-1)
  const right = hang(1)
  return (
    <Scene className={className}>
      <path d={`M${PIVOT.x} ${PIVOT.y}V28`} stroke="var(--ink-muted)" strokeWidth={2} strokeLinecap="round" />
      <path d="M10.4 28.4h11.2" stroke="var(--ink)" strokeWidth={2.2} strokeLinecap="round" />
      <path
        d={`M${left.x.toFixed(2)} ${left.y.toFixed(2)}L${right.x.toFixed(2)} ${right.y.toFixed(2)}`}
        stroke="var(--ink)"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx={PIVOT.x} cy={PIVOT.y} r={1.7} fill="var(--ink)" />
      <Pan x={left.x} y={left.y} />
      <Pan x={right.x} y={right.y} />
    </Scene>
  )
}

const strokes = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** How far the little beam tips. Down on the left is a negative turn. */
const angle: Record<Tip, number> = { left: -15, right: 15, even: 0 }

/**
 * One answer, drawn as a small balance tipped the way the big one tipped.
 * A child reads it without a legend: the low end is the heavier side.
 */
export function TipMark({ tip, className }: { tip: Tip; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokes} aria-hidden="true">
      <path d="M12 9v9M7.5 18.5h9" strokeWidth="2" />
      <g transform={`rotate(${angle[tip]} 12 9)`}>
        <path d="M3.5 9h17" strokeWidth="2" />
        <circle cx="3.5" cy="9" r="2.4" fill="currentColor" stroke="none" />
        <circle cx="20.5" cy="9" r="2.4" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}

/** The switch is on. */
export function TickMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokes} aria-hidden="true">
      <path d="M5 12.5 10 17.5 19 6.5" strokeWidth="3" />
    </svg>
  )
}
