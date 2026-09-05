import { Pictogram } from '../../components/Pictogram'

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
 * started this. What is left here are marks: an arrow saying which way a frog
 * travels, and the two end labels' arrows.
 */

/** Points left. Flip it with CSS for the other end of the row. */
export function EndArrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokes} aria-hidden="true">
      <path d="M20 12H4.6M10.4 6.2 4.6 12l5.8 5.8" />
    </svg>
  )
}

/** Index row: the frog itself. */
export function FrogLeapIcon({ className }: { className?: string }) {
  return <Pictogram name="frog" className={className} />
}
