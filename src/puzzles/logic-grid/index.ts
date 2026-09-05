import type { PuzzleMeta } from '../../lib/types'
import type { GridAction, GridConfig, GridState } from './logic'
import {
  describeMove,
  fourWithHats,
  fourWithPets,
  hatsAndSnacks,
  hatsThree,
  init,
  isSolved,
  petsAndHats,
  petsAndSnacks,
  petsThree,
  reduce,
  snacksThree,
} from './logic'
import { Board } from './Board'
import { LogicGridIcon } from './glyphs'

const oneGrid: GridConfig = { bank: [petsThree, hatsThree, snacksThree] }
const twoGrids: GridConfig = { bank: [petsAndSnacks, hatsAndSnacks, petsAndHats] }
const fourChildren: GridConfig = { bank: [fourWithPets, fourWithHats] }

export const logicGrid: PuzzleMeta<GridState, GridAction> = {
  id: 'logic-grid',
  title: 'Who has what',
  tagline: 'Work out which child has which pet, snack or hat. Only one answer fits every clue.',
  Icon: LogicGridIcon,
  instructions: [
    'Read a clue. It names two things. Find them on the edges of the grid.',
    'Tap the box where they meet. Tap once for a cross, again for a tick, again to clear it.',
    'A cross means no. A tick means yes.',
    'Every row and every column ends up with exactly one tick.',
  ],
  levels: [
    {
      id: 'one-grid',
      label: 'Three children',
      difficulty: 1,
      config: oneGrid,
      hints: [
        'Every clue here says “does not”. Each one is a cross. Put all three crosses in first.',
        'Look along one name. If two of its boxes have a cross, the last box gets the tick.',
        'Put a tick in a box. Now cross out the rest of that row and the rest of that column.',
      ],
    },
    {
      id: 'two-grids',
      label: 'Three, two things each',
      difficulty: 2,
      config: twoGrids,
      hints: [
        'Start with the clues that name a child. Those clues go in the two grids with names down the side.',
        'Some clues name no child at all. Those go in the grid with no names down the side.',
        'When a child gets two ticks, those two things go together as well. Tick them in the third grid.',
      ],
    },
    {
      id: 'four-children',
      label: 'Four, two things each',
      difficulty: 3,
      config: fourChildren,
      hints: [
        'There are four names now. A row needs three crosses before the last box gets a tick.',
        'Two clues say what does go together, not what does not. Start with those two ticks.',
        'If you get stuck, look at a tick that you already have. Whatever is true of one of those two things is true of the other.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
