import type { PuzzleMeta } from '../../lib/types'
import type { GardenAction, GardenConfig, GardenState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { GardenCatsIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three sizes, and one other dial. `minRounds` and `maxRounds` are
   passes over the two steps in `solveByLogic`, counted on the board
   itself rather than guessed at: a board that falls out in two
   passes is a five-minute board, and one that takes six is a
   sit-down. Every board is dealt fresh, so the numbers are what
   holds a level steady from one deal to the next.
   ------------------------------------------------------------------ */

const five: GardenConfig = { n: 5, minRounds: 2, maxRounds: 3 }
const six: GardenConfig = { n: 6, minRounds: 3, maxRounds: 5 }
/** No ceiling on the last level: whatever the seven-wide board asks for. */
const seven: GardenConfig = { n: 7, minRounds: 5, maxRounds: 99 }

export const gardenCats: PuzzleMeta<GardenState, GardenAction> = {
  id: 'garden-cats',
  title: 'The garden cats',
  tagline: 'One cat in every garden. No two cats share a row or a column, and none sit next to each other.',
  Icon: GardenCatsIcon,
  instructions: [
    'Sit one cat in every garden.',
    'No two cats may share a row or a column.',
    'No cat may sit next to another, not even corner to corner.',
    'Tap a square to sit a cat down. Tap the cat to pick it up.',
  ],
  levels: [
    {
      id: 'five-gardens',
      label: 'Five gardens',
      difficulty: 1,
      par: 5,
      config: five,
      hints: [
        'Start with the smallest garden. It has the fewest squares to choose from.',
        'A cat keeps its whole row, its whole column and every square it touches.',
        'If all the free squares of one garden lie in one row, that row belongs to its cat. Every other garden has to keep out of it.',
      ],
    },
    {
      id: 'six-gardens',
      label: 'Six gardens',
      difficulty: 2,
      par: 6,
      config: six,
      hints: [
        'Look for a long thin garden. It can settle a whole row or a whole column at once.',
        'Work along one row. Which gardens could its cat belong to?',
        'When a garden is down to two free squares, look at what both of them rule out. Those squares are out whichever one the cat takes.',
      ],
    },
    {
      id: 'seven-gardens',
      label: 'Seven gardens',
      difficulty: 3,
      par: 7,
      config: seven,
      hints: [
        'Nothing is given here, so the first cat has to be argued for. Start with the smallest garden again.',
        'Sitting a cat down is the last step of an argument, not the first. Rule squares out until one square is left.',
        'Two free squares beside each other rule out every square that touches both of them.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
