import { Pictogram } from '../../components/Pictogram'

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/**
 * The index-row mark. An abacus: beads threaded on rods, which is the picture a
 * child already owns for "things that slide up and down a stick". The three
 * bare lines we drew before needed a caption to be read at all.
 */
export function HanoiIcon({ className }: { className?: string }) {
  return <Pictogram name="abacus" className={className} />
}

/**
 * Sits over a peg that can take the disc you are holding. A UI mark, not a
 * thing on the board, so it stays a stroke glyph.
 */
export function DropMark({ className }: { className?: string }) {
  return (
    <svg className={className} {...svgProps}>
      <path d="M12 4.5v11" />
      <path d="M7.5 11l4.5 4.5L16.5 11" />
      <path d="M6 19.5h12" />
    </svg>
  )
}

/**
 * The pennant on peg C, the peg the whole tower has to end up on. It carries no
 * pole of its own: the peg is the pole, and the flag's straight edge sits on it.
 */
export function GoalFlag({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 26 16" fill="currentColor" aria-hidden="true">
      <path d="M1.2 1H24l-5.2 7 5.2 7H1.2Z" />
    </svg>
  )
}
