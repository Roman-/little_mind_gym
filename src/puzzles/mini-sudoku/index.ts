import type { PuzzleMeta } from '../../lib/types'
import type { SudokuAction, SudokuConfig, SudokuState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { SudokuIcon } from './glyphs'

/* ------------------------------------------------------------------
   The bank. Every grid below is row-major with 0 for a blank, and each
   one is checked in logic.test.ts for three things: exactly one
   solution, reachable without ever guessing, and not a reshuffle of
   any of its neighbours. `init` picks one with the seeded rng and then
   relabels the symbols and shuffles bands, stacks and lines — all of
   which leave the solution count alone.
   ------------------------------------------------------------------ */

/** 4x4, eight clues. Every row, column and box starts with something in it. */
const fourFruitEight: number[][] = [
  [
    0, 4, 3, 2,
    3, 0, 4, 0,
    4, 0, 0, 3,
    0, 3, 0, 0,
  ],
  [
    4, 0, 0, 0,
    2, 0, 1, 0,
    1, 4, 0, 2,
    3, 0, 4, 0,
  ],
  [
    2, 3, 4, 1,
    0, 4, 0, 0,
    0, 0, 0, 3,
    3, 1, 0, 0,
  ],
  [
    3, 0, 0, 2,
    0, 2, 0, 0,
    0, 4, 3, 0,
    0, 3, 2, 4,
  ],
]

/**
 * 4x4, five clues. Still solvable by crossing fruit off one square at a time
 * — a 4x4 never needs more than that — but the square to start on has to be
 * found rather than handed over.
 */
const fourFruitFive: number[][] = [
  [
    0, 4, 0, 0,
    0, 0, 2, 0,
    1, 0, 0, 3,
    4, 0, 0, 0,
  ],
  [
    4, 0, 0, 0,
    0, 1, 0, 4,
    0, 0, 1, 0,
    0, 2, 0, 0,
  ],
  [
    0, 0, 0, 4,
    4, 0, 0, 0,
    2, 0, 1, 0,
    0, 3, 0, 0,
  ],
  [
    0, 2, 0, 0,
    0, 0, 0, 3,
    2, 4, 0, 0,
    0, 0, 4, 0,
  ],
]

/** 6x6 with boxes two rows tall and three columns wide, fourteen clues. */
const sixNumbersFourteen: number[][] = [
  [
    5, 0, 0, 2, 0, 0,
    0, 0, 0, 5, 1, 0,
    6, 1, 3, 0, 2, 5,
    0, 0, 0, 0, 0, 6,
    0, 0, 6, 0, 0, 0,
    0, 4, 2, 0, 5, 0,
  ],
  [
    0, 2, 0, 0, 0, 0,
    3, 0, 0, 2, 6, 0,
    0, 3, 0, 6, 0, 0,
    6, 5, 0, 1, 0, 3,
    0, 0, 3, 0, 0, 0,
    2, 0, 4, 5, 0, 0,
  ],
  [
    0, 0, 4, 0, 3, 0,
    3, 0, 2, 0, 1, 0,
    0, 5, 0, 6, 2, 1,
    0, 0, 0, 0, 0, 5,
    1, 0, 0, 0, 5, 0,
    2, 0, 0, 1, 0, 0,
  ],
  [
    0, 6, 0, 0, 0, 1,
    1, 0, 0, 3, 0, 0,
    0, 1, 0, 0, 0, 4,
    0, 4, 5, 6, 0, 0,
    2, 0, 0, 0, 0, 3,
    0, 0, 1, 2, 5, 0,
  ],
]

const small = (bank: number[][], clues: number): SudokuConfig => ({
  n: 4,
  boxH: 2,
  boxW: 2,
  symbols: 'fruit',
  bank,
  clues,
})

const wide: SudokuConfig = {
  n: 6,
  boxH: 2,
  boxW: 3,
  symbols: 'digits',
  bank: sixNumbersFourteen,
  clues: 14,
}

export const miniSudoku: PuzzleMeta<SudokuState, SudokuAction> = {
  id: 'mini-sudoku',
  title: 'The small square',
  tagline: 'Fill every square. Nothing appears twice in a row, a column or a box.',
  Icon: SudokuIcon,
  instructions: [
    'Fill every empty square.',
    'No row, column or box may hold the same fruit or number twice.',
    'Tap a square. Then tap the fruit or number that goes in it.',
    'A red square repeats something. Rub it out with the rubber key.',
  ],
  levels: [
    {
      id: 'four-shapes',
      label: 'Four fruits',
      difficulty: 1,
      par: 8,
      config: small(fourFruitEight, 8),
      hints: [
        'Start where the board is busiest. The emptiest part can wait.',
        'Find a row, a column or a box with one empty square left. You can fill that one.',
        'If a square’s row tells you nothing, look down its column. Then look at its box.',
      ],
    },
    {
      id: 'four-shapes-lean',
      label: 'Four fruits, fewer clues',
      difficulty: 2,
      par: 11,
      config: small(fourFruitFive, 5),
      hints: [
        'No row, column or box is nearly full here. The square that gives itself away is well hidden.',
        'Pick one empty square. Cross off the fruits in its row, then its column, then its box.',
        'Cross off three fruits and the fourth one has to go there. One square is like that already.',
      ],
    },
    {
      id: 'six-numbers',
      label: 'Six numbers',
      difficulty: 3,
      par: 22,
      config: wide,
      hints: [
        'Each box is two rows tall and three columns wide. Find the thick lines first.',
        'Work on one number at a time. Put it everywhere it goes before you start the next one.',
        'A box holds all six numbers. Cross off five in a square and the sixth has to go there.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
