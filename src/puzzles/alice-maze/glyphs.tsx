import type { CSSProperties } from 'react'
import { Piece, Scene } from '../../components/scene'
import { CARD } from './logic'

/**
 * The kangaroo is the one thing on this board a child could point at and name,
 * so it is the one pictogram. Everything else is our own hand: the arrows that
 * say which ways a square lets the kangaroo set off, the plus and the minus
 * that change the number, and the ring it has to finish a hop on.
 *
 * All three marks are drawn in a box the size of a whole square, the way the
 * signposts draw theirs, rather than in a box of their own. That is what lets
 * the board place them by turning: one arrow turned four ways is four arrows,
 * and a mark's weight then reads against the square it is on rather than
 * against itself.
 */

const strokes = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/**
 * One way the kangaroo may set off from the square it is standing on.
 *
 * It keeps its shaft. A bare arrowhead says "that way is over there"; a shaft
 * with a head on it says "you may go along here", which is what a square's
 * arrows mean — and the signposts learned the same thing about the same mark.
 *
 * It is drawn a third of the way along the top rim rather than in the middle of
 * it, and the board turns the whole box to place the other three. That offset
 * is the whole reason four arrows on four touching squares stay four arrows: a
 * square's "up" sits at a third along its top rim and the square above it wears
 * its "down" at two thirds along the bottom one, so the two never meet nose to
 * nose across the seam and read as one arrow with two heads.
 */
export function WayMark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" {...strokes} strokeWidth={1.35}>
      <path d="M8.16 6.6V1.9M5.66 4.4 8.16 1.9l2.5 2.5" />
    </svg>
  )
}

/**
 * What landing on this square does to the number: one longer, or one shorter.
 *
 * The two are told apart by their shape and by nothing else. Amber, moss and
 * clay all mean something here already, and a green square against a red one
 * would read as the right square and the wrong square rather than as the long
 * hop and the short one — so both are drawn in plain ink, and a plus is not
 * something a minus can be mistaken for.
 *
 * The ring round the sign is what makes the minus a mark rather than a
 * hairline: on its own, a short flat stroke in the middle of a square is a
 * scratch on the paper.
 */
export function ChangeMark({
  longer,
  className,
}: {
  longer: boolean
  className?: string
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokes} strokeWidth={1.2}>
      <circle cx={12} cy={12} r={4.7} />
      <path d={longer ? 'M9.55 12h4.9M12 9.55v4.9' : 'M9.55 12h4.9'} strokeWidth={1.8} />
    </svg>
  )
}

/** Where the kangaroo has to finish a hop. A target, painted on the square. */
export function RingMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokes} strokeWidth={1.45}>
      <circle cx={12} cy={12} r={6.2} />
      <circle cx={12} cy={12} r={2.9} fill="currentColor" stroke="none" />
    </svg>
  )
}

/* ------------------------------------------------------------------
   The card

   The maze itself cannot go on a card. Six squares across at the
   28px the row above a puzzle gives a scene is a five-pixel square,
   and this board asks a square to carry up to three arrows and a
   mark; thirty-six of those is a smudge.

   So the card takes one row of a board instead, and the four big
   shapes on it are the four things this puzzle is: a strip of
   squares, a small hop, a bigger hop, and the kangaroo in the air
   over them with the ring still ahead of it. The two arcs are the
   whole idea — the same hop twice would be any maze; one square and
   then two is this one.

   Both are the board's own amber trail, and the story they tell is a
   real one: a hop of one, a landing on a square with a plus on it, a
   hop of two, and the ring exactly two squares further on. `CARD`
   in logic.ts holds those numbers — a position is the rules'
   business, not the drawing's — and `logic.test.ts` plays them out
   on a real maze, so the picture cannot come to mean something the rules
   do not allow. What is drawn larger than the board draws it is the
   height of the arcs: at a quarter of an inch wide, the difference
   between a hop of one and a hop of two has to survive.

   The plus is on the strip because it is why the second arc is longer
   than the first. Two arcs of different lengths over a bare strip is
   the picture with its own reason left off, and the reason is the one
   thing this puzzle has that no other maze does. It is painted on the
   square the first arc lands on, under the point where the two arcs
   meet: the strip is the ground here and the trail springs off it, so
   the mark keeps its square and the amber keeps the air. It goes
   without the ring the board draws round it — that ring is what stops
   a minus reading as a scratch on the paper, there is no minus in
   this story, and a second small circle on this strip would be the
   goal's own mark said twice.

   Neither it nor the ring is a fifth shape: both are marks on the
   strip, exactly as they are marks on a square. What is not here is
   the arrows, for the same reason the maze itself is not: three
   chevrons on a five-pixel square is the smudge above.

   Nothing else marks a landing but the arcs' own round caps, which is
   what marks one on the board. An amber disc at each landing was
   drawn here for a while, and the board had already turned that mark
   down for reading as a third kind of ring — see .leg in
   board.module.css. A card carries what the stage behind it carries,
   so a mark the board refused cannot be on it, and the two dots were
   two small shapes in a picture that wants three or four big ones.
   ------------------------------------------------------------------ */

const X0 = 1.4
const CELL = 4.87
const BAND_Y = 23.4
const BAND_H = 7.2
/** The middle of the strip, which is where a square's own middle is. */
const MID = BAND_Y + BAND_H / 2
/**
 * Where the plus is painted, and how big it is. The strip has one clear lane
 * between the round cap the thick arc lands with — 0.85 below the middle — and
 * the inside of its own 1.3 rim at 29.95, which is 2.1 units of room. The mark
 * is drawn 0.2 clear of both, so nothing on this card is drawn over anything.
 */
const MARK_Y = MID + 1.9
const MARK_ARM = 0.55
const MARK_STROKE = 0.6
/** The middle of square `i`. */
const at = (i: number) => X0 + CELL * i + CELL / 2
/** How high a hop reaches, as a share of how far it goes. The board uses a tenth. */
const LIFT = 0.6

/** One hop, as the board draws it: an arc that passes over the squares between. */
function arc(from: number, to: number) {
  const rise = LIFT * Math.abs(at(to) - at(from))
  return `M${at(from)} ${MID}Q${(at(from) + at(to)) / 2} ${MID - 2 * rise} ${at(to)} ${MID}`
}

/** The top of the hop the kangaroo is in the middle of. */
const APEX = MID - LIFT * (at(CARD.at) - at(CARD.over))
const KANGAROO = 15

export function AliceMazeIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect
        x={X0}
        y={BAND_Y}
        width={CELL * CARD.squares}
        height={BAND_H}
        rx={1.4}
        fill="var(--surface)"
      />
      {[1, 2, 3, 4, 5].map((i) => (
        <path
          key={i}
          d={`M${X0 + CELL * i} ${BAND_Y}v${BAND_H}`}
          stroke="var(--rule)"
          strokeWidth={0.7}
        />
      ))}
      <rect
        x={X0}
        y={BAND_Y}
        width={CELL * CARD.squares}
        height={BAND_H}
        rx={1.4}
        fill="none"
        stroke="var(--ink-muted)"
        strokeWidth={1.3}
      />

      {/* The ring, drawn as the board draws it: a target painted on a square. */}
      <circle cx={at(CARD.ring)} cy={MID} r={1.7} fill="none" stroke="var(--ink)" strokeWidth={0.95} />
      <circle cx={at(CARD.ring)} cy={MID} r={0.72} fill="var(--ink)" />

      {/* The plus the hop before last landed on, which is why the hop the
          kangaroo is in the middle of is the longer one. It is painted on the
          strip under the point where the two arcs meet rather than across it:
          the strip is the ground here and the trail springs off it, so the mark
          and the amber never sit on top of one another — which is the same
          thing the board's own legs do by stopping short of a landing. */}
      <path
        d={`M${at(CARD.over) - MARK_ARM} ${MARK_Y}h${2 * MARK_ARM}M${at(CARD.over)} ${MARK_Y - MARK_ARM}v${2 * MARK_ARM}`}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={MARK_STROKE}
        strokeLinecap="round"
      />

      {/* The hop before last, and the hop the kangaroo is in the middle of. */}
      <path
        d={arc(CARD.from, CARD.over)}
        fill="none"
        stroke="var(--amber)"
        strokeOpacity={0.55}
        strokeWidth={1.1}
        strokeLinecap="round"
      />
      <path
        d={arc(CARD.over, CARD.at)}
        fill="none"
        stroke="var(--amber)"
        strokeWidth={1.7}
        strokeLinecap="round"
      />

      <Piece
        name="kangaroo"
        x={(at(CARD.over) + at(CARD.at)) / 2}
        y={APEX - KANGAROO / 2 + 0.5}
        size={KANGAROO}
      />
    </Scene>
  )
}
