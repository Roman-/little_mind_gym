import type { PuzzleMeta } from '../../lib/types'
import type { HanoiAction, HanoiConfig, HanoiState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { HanoiIcon } from './glyphs'

const stack = (discs: number): HanoiConfig => ({ discs })

export const towerOfHanoi: PuzzleMeta<HanoiState, HanoiAction> = {
  id: 'tower-of-hanoi',
  title: 'Tower of Hanoi',
  tagline: 'Move a stack of discs to another peg. You can move only one disc at a time.',
  Icon: HanoiIcon,
  instructions: [
    'Move the whole stack of discs to peg C, on the right.',
    'Tap a peg to lift its top disc into the air. Tap that same peg again to put the disc back.',
    'Tap a different peg to drop the disc there.',
    'Never put a big disc on top of a smaller disc.',
  ],
  reseedable: false,
  levels: [
    {
      id: 'hanoi-3',
      label: 'Three discs',
      difficulty: 1,
      par: 7,
      config: stack(3),
      hints: [
        'Think about the biggest disc first. The other discs have to get out of its way.',
        'The biggest disc can only move to a peg with nothing on it.',
        'So the other two discs must be waiting together on peg B before the biggest one can move.',
      ],
    },
    {
      id: 'hanoi-4',
      label: 'Four discs',
      difficulty: 2,
      par: 15,
      config: stack(4),
      hints: [
        'Moving four discs is really moving three discs, then the biggest disc, then those three discs again.',
        'Before the biggest disc can move, the other three have to be stacked out of the way. Only one peg can hold all three.',
        'The smallest disc moves on every other turn. If you moved it twice in a row, step back.',
      ],
    },
    {
      id: 'hanoi-5',
      label: 'Five discs',
      difficulty: 3,
      par: 31,
      config: stack(5),
      hints: [
        'Five discs works just like four discs, with one more layer wrapped around the outside.',
        'Never move a disc straight back to the peg that it came from. That wastes two moves.',
        'The smallest disc always travels round the pegs in the same direction. Work out that direction early.',
      ],
    },
  ],
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
