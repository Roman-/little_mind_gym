import type { PuzzleMeta } from '../../lib/types'
import type { PathAction, PathConfig, PathState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { CountingPathIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three sizes, and three other dials.

   `givens` is how many numbers are printed, so `par` is the size of
   the grid minus it: nine, sixteen and twenty-five squares to fill,
   one tap each.

   `reach` is how far apart two numbers may be before the solver
   stops measuring the distance between them. It is what keeps the
   solver's arithmetic inside a child's: at two, a child counts to
   the next number but one; at four, four numbers ahead.

   `minRounds` and `maxRounds` are passes over the two steps in
   `solveByLogic`, counted on the board itself rather than guessed
   at. Every board is dealt fresh, so those are what hold a level
   steady from one deal to the next.
   ------------------------------------------------------------------ */

const four: PathConfig = { n: 4, givens: 7, reach: 2, minRounds: 2, maxRounds: 4 }
const five: PathConfig = { n: 5, givens: 9, reach: 3, minRounds: 3, maxRounds: 6 }
/** No ceiling on the last level: whatever the six-wide board asks for. */
const six: PathConfig = { n: 6, givens: 11, reach: 4, minRounds: 5, maxRounds: 99 }

export const countingPath: PuzzleMeta<PathState, PathAction> = {
  id: 'counting-path',
  title: 'The counting path',
  tagline: 'A number in every square, counting up from 1. Each number sits next to the one before it.',
  Icon: CountingPathIcon,
  instructions: [
    'Write a number in every empty square, counting up from 1.',
    'Each number sits next to the one before it, up, down, left or right.',
    'Tap a number to pick up the pen. Then tap an empty square beside it.',
    'The pen shows the number it will write. Tap the pen to count down.',
  ],
  levels: [
    {
      id: 'sixteen-squares',
      label: 'Sixteen squares',
      difficulty: 1,
      par: 9,
      config: four,
      hints: [
        'Start at a number that is already printed. The number after it has to go in one of the squares beside it.',
        'Look for two printed numbers with one square between them. The number in between has only one place to go.',
        'When a square could take a number, check what comes next. If the next number would have nowhere to go, the square is wrong.',
      ],
    },
    {
      id: 'twenty-five-squares',
      label: 'Twenty-five squares',
      difficulty: 2,
      par: 16,
      config: five,
      hints: [
        'Every printed number is a place to start. Begin with the ones that have the fewest empty squares around them.',
        'You can count down as well as up. Tap the pen under the board to turn it round, then work back from a high number.',
        'If two printed numbers are four apart, the chain takes exactly four steps between them. Sometimes only one way is that short.',
      ],
    },
    {
      id: 'thirty-six-squares',
      label: 'Thirty-six squares',
      difficulty: 3,
      par: 25,
      config: six,
      hints: [
        'Thirty-six numbers is a long chain. Fill the short gaps between printed numbers first, and leave the long stretches for later.',
        'A square in a corner has only two squares beside it. That makes a corner one of the easiest places on the board to pin down.',
        'Count the steps between two printed numbers. The gap in the numbers has to match the number of steps exactly.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
