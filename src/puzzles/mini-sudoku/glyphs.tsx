import { Pictogram } from '../../components/Pictogram'
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

/** The index-row mark: a square split in four, holding 1, 2, 3 and 4. */
export function SudokuIcon({ className }: { className?: string }) {
  return <Pictogram name="numbers" className={className} />
}
