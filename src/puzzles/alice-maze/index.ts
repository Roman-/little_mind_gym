import type { PuzzleMeta } from '../../lib/types'
import type { AliceAction, AliceConfig, AliceState } from './logic'
import { describeMove, failure, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { AliceMazeIcon } from './glyphs'

/* ------------------------------------------------------------------
   The three mazes, dealt rather than drawn.

   Every deal is searched before it is handed over, so the numbers
   below are promises that the generator has to keep: `par` is the
   shortest route to the ring and there is exactly one route that
   long, on every seed. `needs` is the rest of the character: a floor
   every deal has to clear, so that no seed comes out too thin for
   the level it was dealt for.

     deadEnds  reachable positions a child has to step back from —
               every position `failure` names, whether the kangaroo
               has no hop left at all or can go on hopping and can no
               longer get home. The first board has none of either,
               so a child learning to count a hop can never wreck it;
               the second and the third have them, which is what
               "step back" is for.
     forks     steps of the answer where more than one hop is legal.
               At most three on the first board, at least three on
               the second and at least six on the third.
     squares   squares the kangaroo can stand on at all, so the maze
               is a maze rather than one corridor in a big empty
               frame.
     changes   landings on a plus or a minus along the answer, so the
               number really does change on the way through.
     numbers   different hop numbers the answer passes through.

   What tells the three levels apart is the pair of numbers every
   level is built on: the board gets wider and the route gets longer
   — four across in five hops, five in eight, six in twelve — and
   neither of those overlaps at all. Over them sits one sharp break
   in `needs`: no dead end anywhere on the first board, against at
   least one on the second and two on the third, so the first board
   is the only one a child cannot lose on. `logic.test.ts` proves
   both again on every seed it deals.

   Past that break, the dials ramp at the floor and overlap in the
   deals, which is worth saying plainly, because a rising floor reads
   like a ramp and is not one. Deal 200 mazes a level with
   `makeRng(7 + i * 999331)` and read `gradeOf` on each, and they
   come out:

                  deadEnds   forks   changes   numbers
     four-across         0     1–3         3         3
     five-across      1–36     3–8       4–7         4
     six-across       5–55    6–11      5–10       4–5

   So a second board can carry far more dead ends than a third (36
   against 5), the first two boards meet at three forks and the last
   two overlap from six to eight, changes overlaps from five to
   seven, and `numbers` is four on the second board against four or
   five on the third. A deal that only scrapes its floor is still a
   proper board for its level, which is what a floor is for — but
   none of these four is what a child feels getting harder. That is
   the longer route on the wider board, and the two boards where a
   wrong hop can strand the kangaroo. `squares` has no ramp in it at
   all: it asks for at least half the board at every size, because a
   maze that is one corridor in an empty frame is as poor a maze
   small as large.

   `logic.test.ts` deals hundreds of seeds for each of these and
   proves every promise again from the deal, `par` included.
   ------------------------------------------------------------------ */

const fourAcross: AliceConfig = {
  n: 4,
  par: 5,
  hop: 1,
  arrows: 3,
  plus: 2,
  minus: 1,
  needs: {
    deadEnds: { least: 0, most: 0 },
    forks: { least: 1, most: 3 },
    squares: 8,
    changes: 2,
    numbers: 3,
  },
}

const fiveAcross: AliceConfig = {
  n: 5,
  par: 8,
  hop: 1,
  arrows: 3,
  plus: 3,
  minus: 2,
  needs: {
    deadEnds: { least: 1, most: Number.POSITIVE_INFINITY },
    forks: { least: 3, most: Number.POSITIVE_INFINITY },
    squares: 15,
    changes: 3,
    numbers: 4,
  },
}

const sixAcross: AliceConfig = {
  n: 6,
  par: 12,
  hop: 2,
  arrows: 3,
  plus: 4,
  minus: 3,
  needs: {
    deadEnds: { least: 2, most: Number.POSITIVE_INFINITY },
    forks: { least: 6, most: Number.POSITIVE_INFINITY },
    squares: 24,
    changes: 5,
    numbers: 4,
  },
}

export const aliceMaze: PuzzleMeta<AliceState, AliceAction> = {
  id: 'alice-maze',
  title: 'The kangaroo’s hops',
  tagline:
    'Every hop covers the same number of squares. Landing on some squares changes that number.',
  Icon: AliceMazeIcon,
  /* Three lines, because the fourth rule is already on the board. The board
     keeps a line of its own above the maze — "Land the kangaroo on the ring.
     It can only set off the way an arrow on its own square points." — which is
     where the arrows are said, in bigger type than this drawer and without a
     drawer to be opened first; `logic.test.ts` holds it there. So the drawer
     says the three things that line cannot: that a hop over the ring is not a
     landing on it, that a tap names the square to land on and the tile says
     how far that is, and what a plus and a minus do. Sum the instruction
     lengths in every other puzzle's `index.ts` and these three come to 249
     characters against a collection that runs from 184 to 296, so this is a
     middling block rather than the longest one — which matters, because a
     block nobody reads to the end teaches none of its lines. `logic.test.ts`
     caps it at what the collection actually writes.

     A hop only counts where it lands. That one rule is what makes this an
     Alice maze rather than a maze with a number on it — it is why the ring has
     to be arrived at rather than flown over, and why a plus does nothing to a
     hop that passes across it — so it is said in words a child can read, in
     the two instructions it is about, rather than only in the code that
     enforces it. */
  instructions: [
    'Land the kangaroo on the ring. Hopping over the ring does not count.',
    'Tap a square to hop there. The tile above the board says how many squares a hop covers.',
    'Landing on a plus square adds one to the hop number. Landing on a minus square takes one away.',
  ],
  levels: [
    {
      id: 'four-across',
      label: 'Four squares across',
      difficulty: 1,
      par: 5,
      config: fourAcross,
      hints: [
        'Count the squares. The kangaroo lands on the square that the hop number reaches, not always the one next door.',
        'An arrow shows a way the kangaroo may set off. Only the arrows on the square it stands on count.',
        'Nothing on this board can strand the kangaroo. Try a hop, and step back if it went the wrong way.',
      ],
    },
    {
      id: 'five-across',
      label: 'Five squares across',
      difficulty: 2,
      par: 8,
      config: fiveAcross,
      hints: [
        'The hop number changes as you go. Look at it again before every hop.',
        'Try working back from the ring. Only some squares reach it, and only at the right number.',
        'The kangaroo can get stuck on this board. When it does, step back and try a different square.',
      ],
    },
    {
      id: 'six-across',
      label: 'Six squares across',
      difficulty: 3,
      par: 12,
      config: sixAcross,
      hints: [
        'The kangaroo lands on a plus or a minus more than once here, so the number keeps changing.',
        'A square can be no use at one number and the only way on at another. The number matters as much as the square.',
        'The kangaroo gets stuck as soon as the ring is out of reach. Step back one hop and land somewhere else.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, failure, describe: describeMove, Board },
}
