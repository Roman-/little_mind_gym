import { Piece, Scene, edge } from '../../components/scene'

/**
 * The guests are OpenMoji pictograms — a wolf that looks like a wolf — so the
 * only things drawn in our own hand here are the two marks: the swap that sits
 * in each gap along the table, and the "not these two" on a quarrel card.
 * Neither is a thing a child could point at and name.
 */

/**
 * The swap: two neighbours changing places. One arrow each way, because a swap
 * moves both of them and an arrow pointing one way would say the left one goes
 * right and the right one stays.
 */
export function SwapMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 9h15M15.5 5 19.5 9l-4 4" />
      <path d="M19.5 15h-15M8.5 11 4.5 15l4 4" />
    </svg>
  )
}

/**
 * Two who cannot sit next to each other, on a card in the roster: the mark
 * that stands between them. A ring with a bar through it, which is what
 * "not this" looks like everywhere a child has already met it.
 *
 * Ink rather than clay. Clay says a rule has been broken, and a quarrel card
 * is a rule that is simply true — it says the same thing on the first tap and
 * on the last.
 */
export function NoMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.4" />
      <path d="M6.1 17.9 17.9 6.1" />
    </svg>
  )
}

/* The card: the table, drawn from the front, with two of the guests behind it
   and one swap in the gap between their places. */
const TOP = 16.5
const THICK = 6
/* The board's table is ochre let down into the stage — color-mix at 38% — so
   the card's is ochre at about the same strength rather than the raw enamel. */
const WOOD = 0.55
/* The swap key, a shade under the thickness of the slab it lies on. */
const KEY = 5.3

/** A leg, under the near edge of the table. */
function Leg({ x }: { x: number }) {
  return (
    <rect
      x={x}
      y={TOP + THICK}
      width={3}
      height={7.5}
      fill="var(--p-ochre)"
      fillOpacity={WOOD}
      {...edge}
    />
  )
}

/**
 * The picture on the card: one long table with the wolf and the goat sitting
 * at it next to each other, and the swap that would part them.
 *
 * The table is why this reads as itself at 28 pixels. Every other row of
 * animals in the collection stands on something — stones in a stream, squares
 * of a grid — and this one sits *behind* a heavy horizontal slab with legs
 * under it, which no other card here draws. Two big animals over one big bar:
 * that is the silhouette, and the key laid on the table is the move.
 *
 * The move used to be two ink arrows drawn straight onto the slab, and they
 * failed the size this card is really looked at. They were taller than the
 * six units the slab is thick, so the lower arrowhead hung past its front edge
 * into the gap between the legs, and at 28px the two shafts and their heads
 * merged into a dark smudge — a fifth small shape muddying the one big shape
 * under it. What
 * the board actually puts in a gap is a *control*: a bone key with a hairline
 * round it, sitting on the table between two guests. Drawn as that, it is one
 * more big shape rather than a scribble, and it reads by contrast — light on
 * ochre — which is what survives a shrink. The arrow inside it is a single
 * double-headed one where the board's is two; at eleven pixels two arrows are
 * one blob, and one arrow with a head at each end says the same thing, which
 * is that both of them change places.
 *
 * It is a real position and it is the position the puzzle opens on: the wolf
 * next to the goat is one of the first level's three quarrels, and
 * logic.test.ts holds the deal pool to still containing a seating that puts
 * those two next to each other.
 */
export function LongTableIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <Piece name="wolf" x={8} y={10} size={12} />
      <Piece name="goat" x={24} y={10.2} size={12.5} />
      <Leg x={4} />
      <Leg x={25} />
      <rect
        x={1}
        y={TOP}
        width={30}
        height={THICK}
        rx={1.2}
        fill="var(--p-ochre)"
        fillOpacity={WOOD}
        {...edge}
      />
      {/* Centred in the gap between the two of them, and centred in the slab
          it is lying on — worked out from the slab rather than typed in, so it
          cannot drift outside the thing it is drawn on. */}
      <rect
        x={16 - KEY / 2}
        y={TOP + (THICK - KEY) / 2}
        width={KEY}
        height={KEY}
        rx={1}
        fill="var(--surface)"
        {...edge}
      />
      <g
        stroke="var(--ink)"
        strokeWidth={0.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M14.2 19.5h3.6M15.1 18.6 14.2 19.5l0.9 0.9M16.9 18.6l0.9 0.9-0.9 0.9" />
      </g>
    </Scene>
  )
}
