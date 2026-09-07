import type { PuzzleMeta } from '../../lib/types'
import type { ShikakuAction, ShikakuConfig, ShikakuState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { ShikakuIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three sizes, and two other dials.

   `pieces` is the number of numbers printed on the bar, and it is
   the level's par. The shell prints par to a child as a fact —
   "nobody can do it in fewer" — so it is held exactly by the cut
   itself rather than left to come out where it may: over twenty
   thousand draws a level, the cut missed the count zero times.

   `minRounds` and `maxRounds` are passes over the two steps in
   `solveByLogic`, counted on the board itself rather than guessed
   at. Every bar is dealt fresh, so these are what holds a level
   steady from one deal to the next. Measured over three hundred
   deals a level: five across comes out in one pass or two, six
   across in three to five, and seven across in five to eleven.

   A one-pass bar is a bar where every number has only one shape
   from the start, and about one in twelve of the first level's
   deals is one. That is the shape of a first level rather than a
   fault in it, so the floor stays at one.
   ------------------------------------------------------------------ */

const five: ShikakuConfig = { n: 5, pieces: 7, maxArea: 6, minRounds: 1, maxRounds: 2 }
const six: ShikakuConfig = { n: 6, pieces: 9, maxArea: 8, minRounds: 3, maxRounds: 5 }
/** No ceiling on the last level: whatever the seven-wide bar asks for. */
const seven: ShikakuConfig = { n: 7, pieces: 11, maxArea: 9, minRounds: 5, maxRounds: 99 }

export const shikaku: PuzzleMeta<ShikakuState, ShikakuAction> = {
  id: 'shikaku',
  title: 'The chocolate bar',
  tagline: 'Break the bar into pieces. Each number says how many squares its piece has.',
  Icon: ShikakuIcon,
  instructions: [
    'Break the whole bar into pieces. Every square has to end up in one.',
    'Every piece is a rectangle with exactly one number on it.',
    'The number says how many squares that piece has.',
    'Tap one corner, then tap the opposite corner. Tap a piece to put it back.',
  ],
  levels: [
    {
      id: 'seven-pieces',
      label: 'Seven pieces',
      difficulty: 1,
      par: 7,
      config: five,
      hints: [
        'Start with a number in a corner. There are fewer shapes a piece can take there.',
        'A piece can never hold two numbers. Two numbers close together tell you where a break has to go.',
        'A 4 can be two rows of two, or a strip of four lying either way. Try each shape.',
      ],
    },
    {
      id: 'nine-pieces',
      label: 'Nine pieces',
      difficulty: 2,
      par: 9,
      config: six,
      hints: [
        'Break off the pieces you are sure of first. Each one takes squares away from every other number.',
        'Look at a square with nothing printed on it. Ask which numbers could still reach it.',
        'If only one number can reach a square, that number’s piece has to stretch all the way to it.',
      ],
    },
    {
      id: 'eleven-pieces',
      label: 'Eleven pieces',
      difficulty: 3,
      par: 11,
      config: seven,
      hints: [
        'Work along the edges of the bar. A number near an edge has fewer shapes than one in the middle.',
        'Some numbers have only one shape they can take. Break those off first.',
        'This bar takes several rounds. When you are stuck, go back to a number you passed over and look again.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
