import { Scene, edge } from '../../components/scene'
import { BACK } from './logic'

/**
 * Nothing on this board is a picture. A fence rail and a post are lattice
 * pieces, abstract by nature the way a Hanoi disc or a wall of the candles is,
 * so they are flat enamel: a teal rail over a hairline of ink, and a slate
 * disc at every corner it can touch. That is the whole material list, and the
 * keys under the board and the card are built out of the same two things.
 */

/**
 * A rubber resting on the paper. It stays a drawn mark: rubbing a square out
 * is something you do inside this app, not a thing a child could point at and
 * name — and it is the same rubber every board that writes into squares keeps
 * on its keypad.
 */
export function RubberGlyph({ className }: { className?: string }) {
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
      <path d="M3.2 15.6 11.2 7.6 17.4 13.8 9.4 21.8Z" />
      <path d="M6.8 12 13 18.2" />
      <path d="M2.4 21.8h19.2" />
    </svg>
  )
}

/**
 * The face of a fence key: one square of the board with the fence the key
 * puts down, in the board's own materials — the rail corner to corner, and a
 * slate post under each end of it. No word and no key cap. The two keys differ
 * only in which way the rail leans, and the rail is the thing a child is
 * choosing, so the rail is the whole face.
 *
 * The square is drawn in `currentColor`, so a key that cannot be pressed takes
 * its outline down to the faint ink with the rest of the key; the stylesheet
 * dims the enamel with it.
 */
export function FenceGlyph({ value, className }: { value: number; className?: string }) {
  const [y1, y2] = value === BACK ? [3.5, 20.5] : [20.5, 3.5]
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x={3.5} y={3.5} width={17} height={17} rx={2} fill="none" stroke="currentColor" strokeWidth={1} />
      <line
        x1={3.5}
        y1={y1}
        x2={20.5}
        y2={y2}
        stroke="var(--ink)"
        strokeOpacity={0.4}
        strokeWidth={4.4}
        strokeLinecap="round"
      />
      <line x1={3.5} y1={y1} x2={20.5} y2={y2} stroke="var(--p-teal)" strokeWidth={3.2} strokeLinecap="round" />
      <circle cx={3.5} cy={y1} r={2.3} fill="var(--p-slate)" />
      <circle cx={20.5} cy={y2} r={2.3} fill="var(--p-slate)" />
    </svg>
  )
}

/* --- the card ------------------------------------------------- */

/**
 * The card's two-by-two corner of a board. The frame is drawn at 1 and the
 * squares run from 4.5 to 27.5, so the field has a margin round the squares
 * as the board's does. A rail's round end reaches 2.1 past the corner it runs
 * to, and the margin keeps it 0.65 inside the frame's inner edge: on the board
 * every rail ends inside the border, and so it does here.
 */
const LO = 4.5
const MID = 16
const HI = 27.5

/**
 * The four rails, as [x1, y1, x2, y2]. Three go round the middle post — the
 * top right square's '\', the bottom right square's '/', the bottom left
 * square's '\' — and the top left square's '\' runs into the post instead.
 */
const RAILS: [number, number, number, number][] = [
  [MID, LO, HI, MID],
  [HI, MID, MID, HI],
  [MID, HI, LO, MID],
  [LO, LO, MID, MID],
]

/**
 * The card: a two-by-two corner of a board, in the board's own materials and
 * nothing else. Three fences go round the middle post and leave one side open;
 * the fourth square's fence runs into the post instead, and the post says 1.
 *
 * It is a real answer, and a child can check it before opening the puzzle:
 * exactly one fence touches the post, and no ring closes. So it shows both
 * rules at once — the count, and the ring the fourth fence did not close.
 *
 * At 68px it is an open teal diamond with a spoke into a slate disc, and at
 * 28px it is "the diamond with the dot". No other card has a diamond, and its
 * silhouette is three sides of a square turned on its corner rather than an X,
 * a chevron or the signposts' V. It stands next to the candles in the
 * collection, and reads apart from them: a round post on a grid corner rather
 * than a square block in a cell, a 1 rather than a 2, and teal rather than
 * ochre. The mirror image was drawn and read as a tick, and two whole
 * three-by-three answers read as hatching at 28px, so neither is this card.
 *
 * There are no dots on the rim posts, so every shape here is big: the field,
 * the open ring, the spoke and the post. Every shape declares its own paint,
 * and nothing is set on the frame.
 *
 * Every rail's ink edge goes down before any teal does. On the board the edge
 * is the lower line of every rail and the rails share one layer, so no edge is
 * ever seen crossing a rail. Drawn a rail at a time, the second rail's edge
 * would cut a dark seam across the first where two of them meet.
 *
 * The 1 is drawn rather than typed. A card sits inside the puzzle's `<h1>`,
 * and a real `<text>` would make the heading read "1The fence posts" to
 * anything taking it as plain text — the trap the candles' card walked into
 * first.
 */
export function FencePostsIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect x={1} y={1} width={30} height={30} rx={1.8} fill="var(--surface-sunk)" />
      <path d={`M${MID} ${LO}V${HI}M${LO} ${MID}H${HI}`} stroke="var(--rule)" strokeWidth={1} fill="none" />
      <rect x={1} y={1} width={30} height={30} rx={1.8} fill="none" stroke="var(--ink-muted)" strokeWidth={1.5} />
      {RAILS.map(([x1, y1, x2, y2]) => (
        <line
          key={`edge ${x1} ${y1}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="var(--ink)"
          strokeOpacity={0.4}
          strokeWidth={4.2}
          strokeLinecap="round"
        />
      ))}
      {RAILS.map(([x1, y1, x2, y2]) => (
        <line
          key={`rail ${x1} ${y1}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="var(--p-teal)"
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}
      <circle cx={MID} cy={MID} r={5.6} fill="var(--p-slate)" {...edge} />
      <path
        d="M14.7 14.8L16.4 13.4V18.6"
        fill="none"
        stroke="var(--p-on-dark)"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Scene>
  )
}
