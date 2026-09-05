import { Pictogram } from '../../components/Pictogram'

/**
 * Two marks and one picture.
 *
 * The children, the pets, the snacks and the hats are OpenMoji pictograms
 * drawn by `Pictogram`, because a child has to recognise a rabbit without
 * being told it is one. A tick and a cross are not things: they are the marks
 * a solver writes in a box, so they stay our own stroked glyphs.
 */

/** The tick a solver writes when two things go together. */
export function Tick({ className }: { className?: string }) {
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
      <path d="M4.6 12.6 9.4 17.6 19.4 6.8" />
    </svg>
  )
}

/** The cross a solver writes when two things are ruled out. */
export function Cross({ className }: { className?: string }) {
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
      <path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4" />
    </svg>
  )
}

/** The row in the collection: a clipboard, because this one is worked on paper. */
export function LogicGridIcon({ className }: { className?: string }) {
  return <Pictogram name="clipboard" className={className} />
}
