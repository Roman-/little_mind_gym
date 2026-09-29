import type { PuzzleMeta } from '../../lib/types'
import type { SnakeAction, SnakeConfig, SnakeState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { LongSnakeIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three sizes, and one other dial.

   `minSteps` and `maxSteps` are the waves `solveByLooking` takes,
   counted on the board itself rather than guessed at: a wave is one
   look round the whole board for every line with no room to spare
   and every end of the snake with one way on. Each ceiling is no
   higher than the floor of the level above, so no level can deal a
   board that asks for more looks than the level above asks for at
   its easiest. The seven-wide board takes whatever it asks, because
   nothing stands above it; 99 is past anything a seven-wide board
   can reach.

   Every board, at every level, keeps three promises: it comes out
   by looking; the numbers alone do not finish it, so the snake has
   to be followed; and following alone does not finish it, so the
   numbers have to be counted. So every board asks for both steps,
   and every hint that teaches a step teaches one the board asks
   for.

   Eleven long, not nine. Every snake of both lengths on five across
   was walked out in full. At nine long, 48 boards keep the three
   promises inside two or three waves, and they are only 3 shapes
   turned and flipped — none at all with the single 0 in the margin
   that the first design of this level asked for. At eleven long
   "Mix it up" draws from 544 boards, which are 35 shapes. A
   child sees a turned board as a new one, and two seeds deal the
   same exact board 0.36% of the time. It also keeps par at 9, the
   collection's usual first-level par.

   `par` needs no search. A board starts with the head and the tail
   and nothing else, one dispatched move adds one square or takes
   one off, and the answer's squares land in any order — so par is
   the snake's length less its two ends, every time.
   ------------------------------------------------------------------ */

/** Both steps asked for, in two or three looks. */
const small: SnakeConfig = { n: 5, length: 11, minSteps: 2, maxSteps: 3 }
/** Its ceiling is no higher than the floor of the level above, so it never overtakes the sit-down board. */
const middle: SnakeConfig = { n: 6, length: 14, minSteps: 3, maxSteps: 5 }
/** No ceiling on the last level: whatever the seven-wide board asks for. */
const large: SnakeConfig = { n: 7, length: 20, minSteps: 6, maxSteps: 99 }

export const longSnake: PuzzleMeta<SnakeState, SnakeAction> = {
  id: 'long-snake',
  title: 'The long snake',
  tagline: 'One snake from its head to its tail. The numbers count its squares in each row and column.',
  Icon: LongSnakeIcon,
  instructions: [
    'Fill in squares to make one snake from its head to its tail.',
    // Side by side, and nothing said about corners, on purpose. The published
    // rule forbids a corner touch too, except at a bend, and `isSolved` keeps
    // it — but it never decides a dealt board, since every one has exactly
    // one answer with it switched off. And "touch" in this collection
    // includes a corner, so told "not even at a corner", a child rules out the
    // far square of every bend: that reading solves none of 1000 boards at any
    // level, and leads to a wrong square on 38, 323 and 228 of them. If
    // children ask about corners, the fallback is a fifth line, "Going round a
    // bend is not touching.", and not the published clause.
    'The snake never touches itself side by side.',
    // The head and the tail are drawn as given squares, and the tents' given
    // square, the tree, does not count. A child who leaves the two ends out of
    // the count solves none of 1000 boards at any level, so it is said here
    // rather than left to be guessed.
    'The numbers count the snake squares in each row and column. The head and the tail count too.',
    'Tap a square to add it to the snake. Tap it again to take it off.',
  ],
  levels: [
    {
      id: 'eleven-long',
      label: 'Eleven squares long',
      difficulty: 1,
      par: 9,
      config: small,
      hints: [
        'Start with a row or a column that has no room to spare.',
        'Count the squares in that line with room for the snake. If its number still wants that many, all of them are snake squares.',
        'Then look at each end of the snake that still has to go on. If only one square beside it has room, the snake goes there.',
      ],
    },
    {
      id: 'fourteen-long',
      label: 'Fourteen squares long',
      difficulty: 2,
      par: 12,
      config: middle,
      hints: [
        'Start at the head or the tail, or at a line with no room to spare.',
        'When a line gets all its snake squares, dots fill the rest of it. Look again at every line that those dots cross.',
        'A piece of snake that you add in the middle has two ends. Follow both of them, not only the head and the tail.',
      ],
    },
    {
      id: 'twenty-long',
      label: 'Twenty squares long',
      difficulty: 3,
      par: 18,
      config: large,
      hints: [
        'One look is not enough here. After each square that you add, look again at its row, its column and the ends of the snake.',
        'Follow every piece of snake that you have added, not only the head and the tail. Each piece has two ends of its own.',
        'Dots from a full line can leave another line with no room to spare. They can also leave an end of the snake with room on one side only.',
      ],
    },
  ],
  reseedable: true,
  // A square in the wrong place is taken off, not stepped back from, so there
  // is deliberately no failure(). Every position a child can reach can still
  // be won — taking a square off is never refused, and what is left of the
  // answer lands in any order — so there is no canStillWin() either, and
  // logic.test.ts proves both rather than assuming them. A wrong turn the
  // board can see — the snake reaching its tail too soon, a line without room
  // for all its snake squares, a snake square with nowhere left to go — is
  // said in clay on that number or that square and in one sentence under the
  // board, and Step back and Start over are in the toolbar throughout.
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
