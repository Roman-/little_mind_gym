import type { PuzzleMeta } from '../../lib/types'
import type { TentsAction, TentsConfig, TentsState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { TentsAndTreesIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three sizes, and two other dials.

   `minRounds` and `maxRounds` are passes over the four steps in
   `solveByLogic`, counted on the board itself rather than guessed
   at: a board that falls out in one pass is a two-minute board and
   one that takes four is a sit-down. `minPacked` and `maxPacked`
   are how many squares the fourth of those steps has to settle —
   the one where a child counts the room a line has left and finds
   only one way the tents fit. The floor is what stops the harder
   levels from being the easy ones with more squares. The ceiling is
   what stops an easier level from being a harder one, and every
   ceiling here is the floor of the level above, so no level can
   deal a board that asks for more than the level above it asks for
   at its easiest. Five tents is dealt without the counting step and
   its hints never teach it, so its ceiling on that dial is nought:
   without it one board in two hundred and fifty arrived here
   needing the step — up to seven squares of it, where the sit-down
   level is asked for two. Seven tents teaches the step and asks for
   a square or two of it. Ten tents takes whatever the seven-wide
   board asks, because nothing stands above it.

   Every board is also held against `solveByTrees`, which covers
   the numbers up and tries again. A board that comes out with the
   margin covered is thrown away, so the counting is never
   decoration over a board of trees.

   `par` needs no search. Every tree wants one tent, one dispatched
   move puts one tent up or takes one down, and no board starts
   with a tent on it — so par is the number of trees, every time.
   ------------------------------------------------------------------ */

/** The one level whose hints never teach the counting step, so the one that never asks for it. */
const small: TentsConfig = { n: 5, tents: 5, minRounds: 1, maxRounds: 2, minPacked: 0, maxPacked: 0 }
/** Both its ceilings are the floors of the level above, so it never overtakes the sit-down board. */
const middle: TentsConfig = { n: 6, tents: 7, minRounds: 2, maxRounds: 4, minPacked: 1, maxPacked: 2 }
/** No ceiling on the last level: whatever the seven-wide board asks for. */
const large: TentsConfig = { n: 7, tents: 10, minRounds: 4, maxRounds: 99, minPacked: 2, maxPacked: 99 }

export const tentsAndTrees: PuzzleMeta<TentsState, TentsAction> = {
  id: 'tents-and-trees',
  title: 'The tents and trees',
  tagline: 'One tent beside every tree. The numbers count the tents in each row and column.',
  Icon: TentsAndTreesIcon,
  instructions: [
    'Pitch one tent next to every tree — up, down, left or right of it.',
    'No two tents may touch, not even at a corner.',
    'The numbers say how many tents stand in that row and that column.',
    'Tap a square to pitch a tent. Tap the tent to take it down.',
  ],
  levels: [
    {
      id: 'five-tents',
      label: 'Five tents',
      difficulty: 1,
      par: 5,
      config: small,
      hints: [
        'Start at a tree on an edge or in a corner. It has fewer squares beside it than a tree in the middle.',
        'Look at the four squares beside a tree. When only one of them still has room for a tent, that is where its tent goes.',
        'Count the squares in a row where a tent could still stand. When there are only as many as its number wants, every one is a tent.',
      ],
    },
    {
      id: 'seven-tents',
      label: 'Seven tents',
      difficulty: 2,
      par: 7,
      config: middle,
      hints: [
        'Start with the biggest number in the margin. That line has the least room to spare.',
        'Every tent you pitch takes the eight squares round it away. Look again at each tree that was reaching for one of them.',
        'Two squares side by side hold one tent between them. Count what a line can really fit.',
      ],
    },
    {
      id: 'ten-tents',
      label: 'Ten tents',
      difficulty: 3,
      par: 10,
      config: large,
      hints: [
        'Nothing here falls out at once. Take the numbers and the trees together, one line at a time.',
        'A line that wants two tents, with three squares left and two of them touching, has one way to fit them.',
        'Two trees cannot share one tent. Where two trees reach the same square, one of them needs another.',
      ],
    },
  ],
  reseedable: true,
  // A tent in the wrong place is taken down, not stepped back from, so there
  // is deliberately no failure(). A wrong turn the board can see — a line with
  // no room left for the tent it still wants, a tree with no room left for the
  // tent it is owed — is said in clay on that number or that tree and in one
  // sentence under the board, and Step back and Start over are in the toolbar
  // throughout.
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
