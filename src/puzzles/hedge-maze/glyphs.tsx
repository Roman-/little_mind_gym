import { Piece, Scene, edge } from '../../components/scene'

/**
 * The rabbit and the dog are OpenMoji artwork, drawn straight by `Board.tsx`
 * and by the card below, and a hedge is flat enamel. What is drawn here in our
 * own hand are the two marks the controls wear: the arrow that means "step
 * this way", and the ring that means "this one is you, and you may stand
 * still".
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
 * One step into the next square. Drawn pointing up; the board turns it with a
 * transform, so the four directions are one mark rather than four.
 *
 * It sits on all four neighbours, the ones behind a hedge included — the
 * tower's drop-marker rule. A mark that only the legal steps got would be the
 * dead button in another coat, and would hand over the one thing the child is
 * here to work out.
 */
export function StepMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokes}>
      <path d="M12 17.5V8.6" />
      <path d="M7.8 12.4 12 8.2l4.2 4.2" />
    </svg>
  )
}

/**
 * Standing still, drawn round the rabbit's own square. The ring is on the
 * board at every size and in every position, whether or not standing still
 * would change anything this turn: it is also what tells a rabbit from a dog
 * when both are forty pixels of round-faced animal on a phone.
 */
export function HoldMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokes}>
      <circle cx={12} cy={12} r={9.4} />
    </svg>
  )
}

/**
 * The card: a walled square with a notch cut out of one side, two hedges
 * across it, the dog behind one of them and the rabbit standing in the gap.
 * That is the whole puzzle in four shapes — where you have to get to, what is
 * in the way, and what is coming after you — and the notch is what tells this
 * card apart from a bordered grid of coloured squares at 28px.
 */
export function HedgeMazeIcon({ className }: { className?: string }) {
  const wall = { fill: 'none', stroke: 'var(--ink-muted)', strokeWidth: 2, strokeLinecap: 'round' } as const
  return (
    <Scene className={className}>
      <rect x={3} y={5} width={26} height={22} fill="var(--surface-sunk)" />
      {/* Three sides whole, and the fourth with six units missing from it. */}
      <path d="M29 5H3v22h26" {...wall} />
      <path d="M29 5v8" {...wall} />
      <path d="M29 19v8" {...wall} />
      {/* Flat enamel, exactly as the board draws a hedge. */}
      <rect x={15.9} y={8} width={2.2} height={11} rx={1.1} fill="var(--p-moss)" {...edge} />
      <rect x={7} y={19.9} width={11} height={2.2} rx={1.1} fill="var(--p-moss)" {...edge} />
      <Piece name="dog" x={9.5} y={12} size={8.6} />
      <Piece name="rabbit" x={25} y={16} size={8.6} />
    </Scene>
  )
}
