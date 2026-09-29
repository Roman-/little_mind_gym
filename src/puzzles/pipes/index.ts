import type { PuzzleMeta } from '../../lib/types'
import type { PipesAction, PipesConfig, PipesState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { PipesIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three sizes, and the dials beside them.

   `par` is pinned exactly: `init` scrambles every board to need that
   many taps and no fewer. A uniform scramble of the boards these
   levels deal would need a mean of 13.1, 22.2 and 35.3 taps (over
   1,000 seeds a level), so the pars sit under it at 12, 20 and 30:
   just under on the first two levels, and five taps under on the
   third. The heaviest par in the collection is the tower of Hanoi's
   31.

   So the ramp lives in the passes rather than in the par. A pass is
   one round of working out every pipe that fits just one way, each
   round resting on the last, and both children are held to the
   window: the careful one, and the one who trusts every pipe that
   looks joined. `minFirst` makes sure there is always somewhere to
   start. The flower rule — a flower never points at another flower —
   is kept off the first two levels entirely, and every deal of the
   third needs it, even for the child who trusts the board.

   Measured over 1,000 seeds a level: "Nine pipes" is almost all
   edge, and its first pass always settles a bent pipe in a corner.
   "Sixteen pipes" needs chains of four to six passes. "Twenty-five
   pipes" needs the flower rule on every deal and runs six to twelve
   passes; its ceiling was twenty until thirteen or more turned out to
   be past a sit-down for an eight-year-old.
   ------------------------------------------------------------------ */

const nine: PipesConfig = { n: 3, par: 12, minPasses: 3, maxPasses: 4, minFirst: 1, minFlowerRule: 0, maxFlowerRule: 0 }
const sixteen: PipesConfig = { n: 4, par: 20, minPasses: 4, maxPasses: 6, minFirst: 1, minFlowerRule: 0, maxFlowerRule: 0 }
const twentyFive: PipesConfig = {
  n: 5,
  par: 30,
  minPasses: 6,
  maxPasses: 12,
  minFirst: 1,
  minFlowerRule: 1,
  maxFlowerRule: 99,
}

export const pipes: PuzzleMeta<PipesState, PipesAction> = {
  id: 'pipes',
  title: 'The pipes',
  tagline: 'Turn the pipes until water from the drop reaches them all. Water only goes where two pipe ends meet.',
  Icon: PipesIcon,
  instructions: [
    'Turn the pipes until the water from the drop reaches every pipe and every flower. You see the water only then.',
    'Tap a pipe to turn it a quarter of the way round. It always turns the way a clock’s hands go.',
    'Water only passes where two pipe ends meet. A flower’s pipe has just one end.',
    'When you finish, every pipe end meets another pipe end. None points off the board.',
  ],
  levels: [
    {
      id: 'pipes-3x3',
      label: 'Nine pipes',
      difficulty: 1,
      par: nine.par,
      config: nine,
      hints: [
        'Start in a corner. A pipe end that points off the board meets nothing.',
        'A bent pipe in a corner fits only one way. Both of its ends point into the board.',
        'When you are sure of a pipe, look next door. An end that points at a pipe needs an end that points back.',
      ],
    },
    {
      id: 'pipes-4x4',
      label: 'Sixteen pipes',
      difficulty: 2,
      par: sixteen.par,
      config: sixteen,
      hints: [
        'Start at the edge. Find a pipe that fits only one way without pointing off the board.',
        'On the edge, look for a bent pipe in a corner, a straight pipe, or a pipe with three ends.',
        'Work inwards from a pipe that you are sure of. An end that points at a pipe needs an end that points back.',
      ],
    },
    {
      id: 'pipes-5x5',
      label: 'Twenty-five pipes',
      difficulty: 3,
      par: twentyFive.par,
      config: twentyFive,
      hints: [
        'Leave a pipe alone until it fits just one way. Then turn it. Now look at the pipes next to it.',
        'Look at a pipe next to one that you are sure of. It points that way only if the pipe that you are sure of points back.',
        'A flower never points at another flower. The water can never reach two flowers that point at each other.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
