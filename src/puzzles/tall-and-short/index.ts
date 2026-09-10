import type { PuzzleMeta } from '../../lib/types'
import type { TallAction, TallConfig, TallState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { TallAndShortIcon } from './glyphs'

/* ------------------------------------------------------------------
   The bank. Every board below is drawn the way it is played — a
   square line, then a line of the signs standing between that row
   and the next — and `parseBoard` in logic.ts is the whole of the
   format.

   They were searched for offline, the way the signposts' three
   boards were, and each one had to clear four things rather than
   three. One answer. Reachable by the reasoning in `solveByLogic`,
   so a child never has to guess. Every sign load-bearing: the
   search took each one away in turn and put it back only where the
   board stopped coming out without it. And — the one that is this
   puzzle's own — **not** finishable with the signs covered up.

   That last gate is what set the printed-post counts. Print eight
   posts on a four-wide board and 84% of the boards that clear the
   other three can be finished with the signs covered up, and a
   Futoshiki a child can finish without reading a sign is a Latin
   square in a costume. It pulls the same way as the third rule, as
   it turns out: a board that comes out without its signs has no
   sign the search cannot take away, so it loses all of them and is
   thrown out before the gate is ever asked. Both are checked
   anyway. `logic.test.ts` re-derives all four numbers from the
   pictures below, for every board and every one of the sixteen ways
   `init` may turn it.

   `par` needs no search at all. Every square has to end up with a
   post in it, one dispatched move stands one post up, and no board
   here starts with anything the player has put down. So par is the
   number of empty squares — n*n less the printed posts — every
   time.
   ------------------------------------------------------------------ */

/** Three by three, nothing printed. Three signs, and one chain of three among them. */
const threeHigh: string[][] = [
  [
    '. . .',
    '. v .',
    '. . .',
    '. . .',
    '.>.>.',
  ],
  [
    '. . .',
    '. ^ .',
    '. . .',
    'v ^ .',
    '. . .',
  ],
  [
    '.<. .',
    '. . .',
    '.<.<.',
    '. . .',
    '. . .',
  ],
  [
    '. . .',
    '. . ^',
    '. . .',
    '. . .',
    '.<.<.',
  ],
  [
    '. . .',
    'v . v',
    '. . .',
    'v . .',
    '. . .',
  ],
  [
    '.>.>.',
    '. . .',
    '. . .',
    '. . .',
    '.<. .',
  ],
]

/** Four by four, four printed posts and four signs. */
const fourHigh: string[][] = [
  [
    '1 .<.>.',
    '. v . .',
    '. . 2 .',
    'v . . .',
    '. . 1 .',
    '. . . .',
    '2 . . .',
  ],
  [
    '. . . 1',
    '. v . .',
    '. . .<.',
    '. . . .',
    '3 . . 2',
    '. . . .',
    '. 2<.<.',
  ],
  [
    '. .>. .',
    '. . . .',
    '3 . . .',
    '. ^ . v',
    '. . .<3',
    '. . . .',
    '2 . . 1',
  ],
  [
    '2 . . 1',
    '. . . .',
    '3 . 1 .',
    '. . . .',
    '. .<. .',
    '. . ^ v',
    '. .<. .',
  ],
  [
    '.<.>. .',
    '. . v .',
    '. . . 2',
    '. . . .',
    '. 2 . .',
    '. . . v',
    '. 1 . 3',
  ],
]

/** Five by five, four printed posts and six signs. Five heights to tell apart. */
const fiveHigh: string[][] = [
  [
    '.<. 1 . 4',
    '. . . . .',
    '. . . . 1',
    '. . . . .',
    '.>. . . .',
    '. . . . v',
    '. 1 .<. .',
    '. . v . .',
    '. . . .>.',
  ],
  [
    '. .>. . .',
    '. ^ . . .',
    '. . .<.<.',
    '. . . . .',
    '. . . 5 2',
    '. . v . .',
    '. . . . .',
    '. . . . v',
    '. 1 . . 3',
  ],
  [
    '. .<.>. .',
    '. . . . .',
    '.>. . 1 .',
    '. . . . ^',
    '. . . . .',
    '. . . . .',
    '3>. . 2 .',
    '^ . . . .',
    '. . . . 2',
  ],
  [
    '.>. 1 . .',
    '. . . . ^',
    '. . . . .',
    '. . v . .',
    '.>. .>. .',
    '. . . . .',
    '. . . 1 .',
    '. . . . .',
    '. 1 . 4>.',
  ],
  [
    '.>. . . .',
    '. ^ . . .',
    '.>. . . .',
    '. . ^ . .',
    '. . . . 3',
    'v v . . .',
    '3 . . 5 .',
    '. . . . .',
    '. . . 3 .',
  ],
]

const heights = (n: number, bank: string[][], printed: number): TallConfig => ({ n, bank, printed })

export const tallAndShort: PuzzleMeta<TallState, TallAction> = {
  id: 'tall-and-short',
  title: 'The tall and the short',
  tagline: 'Every row and column holds each height once. A sign points at the shorter post.',
  Icon: TallAndShortIcon,
  instructions: [
    'Stand a post in every empty square.',
    'No row and no column may hold two posts the same height.',
    'A sign between two squares points at the shorter of the two posts.',
    'Tap a square, then tap a post. A red square breaks one of the rules.',
  ],
  levels: [
    {
      id: 'three-posts',
      label: 'Three heights',
      difficulty: 1,
      par: 9,
      config: heights(3, threeHigh, 0),
      hints: [
        'Nothing is printed on this board, so the signs are where you start.',
        'A sign points at the shorter post. The square it points at is never the tallest.',
        'Find two signs one after the other. Those three squares go tall, middle, short.',
      ],
    },
    {
      id: 'four-posts',
      label: 'Four heights',
      difficulty: 2,
      par: 12,
      config: heights(4, fourHigh, 4),
      hints: [
        'Take one square at a time. Cross off every height its row and its column already hold.',
        'A sign still helps when the square at its other end is empty. A pointed end is never the tallest.',
        'Two signs one after the other say more than two on their own. Read the pair from end to end.',
      ],
    },
    {
      id: 'five-posts',
      label: 'Five heights',
      difficulty: 3,
      par: 21,
      config: heights(5, fiveHigh, 4),
      hints: [
        'Five heights and four printed posts. Nearly all of this board comes off the signs.',
        'Start where the signs crowd together. A square with two signs on it has the least room.',
        'Follow a run of signs from end to end. Every step along it takes one more height away.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
