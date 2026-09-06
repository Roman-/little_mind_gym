import { Scene, edge } from '../../components/scene'

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** Three discs, in the first three of the five enamels the board deals by size. */
const DISCS = [
  { w: 6.4, y: 15.1, colour: 'var(--p-ochre)' },
  { w: 9.4, y: 18.6, colour: 'var(--p-clay)' },
  { w: 12.4, y: 22.1, colour: 'var(--p-moss)' },
]

/**
 * The card: the board at the start. The whole stack on peg A and two bare pegs
 * standing beside it, which is the puzzle in one look — everything is here,
 * and it all has to be over there.
 *
 * No picture can stand in for this one. An abacus was the closest thing in the
 * set and it still had to be explained, because beads on a rod are not discs
 * that may never sit on a smaller disc.
 */
export function HanoiIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <g fill="var(--p-slate)">
        <rect x="7.1" y="8.2" width="1.8" height="17.6" rx=".9" />
        <rect x="15.1" y="8.2" width="1.8" height="17.6" rx=".9" />
        <rect x="23.1" y="8.2" width="1.8" height="17.6" rx=".9" />
        <rect x="2.5" y="25.6" width="27" height="3.2" rx="1.2" />
      </g>
      {DISCS.map((d) => (
        <rect
          key={d.w}
          x={8 - d.w / 2}
          y={d.y}
          width={d.w}
          height={3.5}
          rx={1}
          fill={d.colour}
          {...edge}
        />
      ))}
    </Scene>
  )
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
