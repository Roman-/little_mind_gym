import { Piece, Scene, edge } from '../../components/scene'
import { SIDES } from './logic'

/**
 * The drop and the flowers on the board are the OpenMoji drop and tulip, drawn
 * straight by `Board.tsx`. The pipe itself is abstract by nature — a child
 * names it "a pipe", but no one pipe is a picture of anything — so it stays
 * flat enamel, drawn here.
 */

/** One arm a pipe end, from the hub out to the middle of that side of the plate. */
const ARM: Record<number, string> = { 1: 'M50 50V0', 2: 'M50 50H100', 4: 'M50 50V100', 8: 'M50 50H0' }

/**
 * Four layers, bottom up, each an arm per pipe end (stroked, with butt caps
 * so every end sits flush with the plate's edge) and a hub (filled), and each
 * a `<g data-part>` drawn in `currentColor`. The stylesheet colours them
 * through that attribute, so this file never reaches into the CSS module:
 *
 * - `edge`, 33 wide: the hairline every enamel piece wears — `edge` in
 *   `scene.tsx`, `--ink` at four tenths — drawn as a band 1.5 units proud of
 *   the body on either side;
 * - `body`, 30 wide: the pipe, always `--p-slate`, wet or dry;
 * - `rim`, 16 wide: a band 2 units wide either side of the water, in
 *   `--p-on-dark`. Teal and slate differ by hue alone, and the rim is what
 *   lets the water be seen without it — see the stylesheet for the contrast.
 *   It is 1px on the smallest plate (50px) and 2.5px on the largest (125px);
 * - `water`, 12 wide: a `--p-teal` core inside the pipe, the colour the water
 *   jugs already use for water.
 *
 * The rim and the water are there from the first render and cannot be seen
 * until the board is solved.
 */
const LAYERS = [
  { part: 'edge', width: 33, hub: 16.5 },
  { part: 'body', width: 30, hub: 15 },
  { part: 'rim', width: 16, hub: 8 },
  { part: 'water', width: 12, hub: 6 },
] as const

/**
 * A pipe with the ends `mask` names, drawn as dealt. The four layers stand in
 * one `<g data-turn>`, which the stylesheet turns to the angle `Board.tsx`
 * sets — inside the svg, so that the turn is never part of the page's layout.
 */
export function PipeMark({ mask, className }: { mask: number; className?: string }) {
  const arms = SIDES.filter((side) => mask & side)
    .map((side) => ARM[side])
    .join(' ')
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g data-turn="">
        {LAYERS.map(({ part, width, hub }) => (
          <g key={part} data-part={part}>
            <path d={arms} fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="butt" />
            <circle cx={50} cy={50} r={hub} fill="currentColor" />
          </g>
        ))}
      </g>
    </svg>
  )
}

/**
 * The card's four pipes, one to a plate, each stopping at its own plate's edge
 * (15.5 or 16.5) the way the board's do, so the seam breaks the line into four
 * pieces. From the drop, top left: a pipe going right, a bend going left and
 * down, a bend going up and left, and the flower's pipe going up.
 */
const ARMS = ['M8.75 8.75H15.5', 'M16.5 8.75H23.25V15.5', 'M23.25 16.5V23.25H16.5', 'M8.75 23.25V16.5']

/**
 * The card: the corner of a board one tap from finished, drawn exactly as the
 * board draws it — four bone plates with a seam between them, a slate pipe on
 * each, the drop and a tulip. The drop's pipe runs right, round two bends, and
 * ends pointing left at the flower's plate, where the flower's own pipe still
 * points up at the drop's flat side. One clockwise tap on the flower turns it
 * to point right, and the board is solved.
 *
 * There is no water on it, because the position is not solved and the board
 * draws none until it is. The seams are what tell it from the counting path's
 * one unbroken line at 28px, and the drop and the tulip carry the rest; it
 * takes no colour of its own.
 */
export function PipesIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      {[2, 16.5].map((y) =>
        [2, 16.5].map((x) => (
          <rect
            key={`${x},${y}`}
            x={x}
            y={y}
            width={13.5}
            height={13.5}
            rx={1.6}
            fill="var(--surface)"
            stroke="var(--rule-strong)"
            strokeWidth={1}
          />
        )),
      )}
      {ARMS.map((d) => (
        <g key={d}>
          <path d={d} fill="none" {...edge} strokeWidth={5.6} strokeLinejoin="round" />
          <path d={d} fill="none" stroke="var(--p-slate)" strokeWidth={4.6} strokeLinejoin="round" />
        </g>
      ))}
      <Piece name="drop" x={8.75} y={8.75} size={9} />
      <Piece name="tulip" x={8.75} y={23.25} size={10} />
    </Scene>
  )
}
