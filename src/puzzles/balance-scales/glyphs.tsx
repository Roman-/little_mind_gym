import { Pictogram } from '../../components/Pictogram'
import type { Tip } from './logic'

/** Index row: a pan balance, in the same hand as every other picture. */
export function BalanceIcon({ className }: { className?: string }) {
  return <Pictogram name="scales" className={className} />
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
