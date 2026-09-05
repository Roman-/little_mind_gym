import { Pictogram } from '../../components/Pictogram'

/**
 * The passengers are OpenMoji pictograms now — a goat that looks like a goat —
 * so the only thing left in here is the mark on the index row and the arrow
 * the boat carries. An arrow is an affordance, not a thing, so it stays a
 * stroke glyph in the app's own hand.
 */
export function RiverIcon({ className }: { className?: string }) {
  return <Pictogram name="boat" className={className} />
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
