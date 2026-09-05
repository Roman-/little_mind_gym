import type { PuzzleMeta } from '../../lib/types'
import type { FrogAction, FrogConfig, FrogState } from './logic'
import { describeMove, failure, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { FrogLeapIcon } from './glyphs'

const row = (perSide: number): FrogConfig => ({ perSide })

export const frogLeap: PuzzleMeta<FrogState, FrogAction> = {
  id: 'frog-leap',
  title: 'Leapfrog',
  tagline: 'Two lines of frogs and one free stone. No frog can turn round.',
  Icon: FrogLeapIcon,
  instructions: [
    'Swap the two lines. The green frogs end up on the right, the blue frogs on the left.',
    'Tap a frog to move it. It steps onto the free stone, or jumps over one frog of the other colour.',
    'Green frogs only go right. Blue frogs only go left.',
    'Getting stuck is part of it. Step back and try a different order.',
  ],
  levels: [
    {
      id: 'two-each',
      label: 'Two each',
      difficulty: 1,
      par: 8,
      config: row(2),
      hints: [
        'Two frogs can go first, one of each colour. Both are safe. The trouble starts on the next move.',
        'To get past a frog of the other colour, jump over it. Look for a jump before you take a step.',
        'Never take two steps in a row. Two steps together are what jam the line.',
      ],
    },
    {
      id: 'three-each',
      label: 'Three each',
      difficulty: 2,
      par: 15,
      config: row(3),
      hints: [
        'Same rules, longer line. Start it the way you started the short one.',
        'Only six of these fifteen moves are steps. If you are stepping a lot, something has gone wrong.',
        'The jumps come in runs: one, then two, then three, then two, then one. One step sits between each run.',
      ],
    },
    {
      id: 'four-each',
      label: 'Four each',
      difficulty: 3,
      par: 24,
      config: row(4),
      hints: [
        'Nothing new to learn. The line is just longer, so go slowly through the middle.',
        'Only eight of these twenty-four moves are steps. Count them as you go.',
        'Halfway through, the free stone is back in the middle and the colours take turns on each side of it. Aim for that picture.',
      ],
    },
  ],
  reseedable: false,
  engine: { init, reduce, isSolved, failure, describe: describeMove, Board },
}
