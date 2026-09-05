import type { PuzzleMeta } from '../../lib/types'
import type { LightsAction, LightsConfig, LightsState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { LightsOutIcon } from './glyphs'

const grid = (width: number, height: number, presses: number): LightsConfig => ({
  width,
  height,
  presses,
})

/**
 * Every level's `par` is its config's `presses`, and `init` only hands back a
 * board whose shortest solution is exactly that long — so par is the truth for
 * every seed, not an average. `logic.test.ts` re-derives it two ways.
 */
export const lightsOut: PuzzleMeta<LightsState, LightsAction> = {
  id: 'lights-out',
  title: 'Lights out',
  tagline: 'Press one lamp and the lamps next to it change too. Get them all off.',
  Icon: LightsOutIcon,
  instructions: [
    'Turn every lamp off.',
    'Press a lamp. If it is on, it goes off. If it is off, it comes on.',
    'The lamps above, below and beside that lamp change in the same way.',
    'A corner lamp has only two lamps next to it, so pressing it changes three lamps.',
  ],
  levels: [
    {
      id: 'lights-3x3',
      label: 'Nine lamps',
      difficulty: 1,
      par: 4,
      config: grid(3, 3, 4),
      hints: [
        'Press one lamp and watch what changes. A corner lamp changes the fewest lamps.',
        'Press the same lamp twice and the board goes back to how it was. So never press a lamp twice.',
        'The order does not matter — only which lamps you press. One group of the nine lamps turns them all off.',
      ],
    },
    {
      id: 'lights-4x4',
      label: 'Sixteen lamps',
      difficulty: 2,
      par: 6,
      config: grid(4, 4, 6),
      hints: [
        'Clear one row at a time. Start with the top row.',
        'To turn off a lamp in the row above, press the lamp right below it.',
        'Keep going down the board like that, row by row. On a board four lamps wide, every lamp ends up off.',
      ],
    },
    {
      id: 'lights-5x5',
      label: 'Twenty-five lamps',
      difficulty: 3,
      par: 8,
      config: grid(5, 5, 8),
      hints: [
        'Do the same as before. Row by row, press the lamp right below each lamp that is still on.',
        'This time that does not always work. The lamps that stay on in the bottom row depend only on which top-row lamps you pressed.',
        'So press some top-row lamps first, then go down row by row. Only four of the thirty-two ways to press the top row turn every lamp off.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
