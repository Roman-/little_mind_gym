import type { PuzzleMeta } from '../../lib/types'
import type { MatsAction, MatsConfig, MatsState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { FloorMatsIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three sizes, and the dials that hold each one steady.

   `mats` is the number of marks printed on the floor, and it is the
   level's par. The cut is given it and a mark never leaves its mat,
   so it is exact on every seed rather than on average.

   `minStuck` and `maxStuck` count the mats that need a fact before
   they can be laid, read off the floor by `solveByLogic` exactly as
   it stands, with nothing carried from one mat to the next. Measured
   over six hundred deals a level (`makeRng(50_000 + 17s)`, and a
   second range at `makeRng(90_000 + 29s)` that agrees):

     Five mats    exactly 2 facts on every floor
     Eight mats   3 to 6 (110, 327, 137 and 26 floors)
     Eleven mats  5 to 9 (228, 214, 117, 38 and 3 floors)

   Two is the least a four-wide floor asks for. A shape does not fix
   a size, so the last mat along a strip always needs "the far square
   is only this mark's"; none of the seven four-wide configurations
   surveyed at two thousand draws each went lower. The chocolate bar,
   one card earlier, asks 0.1, 1.1 and 3.0 of these a bar on the same
   yardstick, which is why the pars here start lower than its 7.

   `maxPairs` is how many mats may need two facts held together, and
   it is the real sit-down: none on the first two levels, and at most
   one on the last, where 371 of the 600 floors have one. No floor on
   any level needs three.

   `always` is the second kind of fact: every mat a mark can still
   have covers one square, so no other mark can use it. It is kept off
   the first two levels, whose hints never name it, and the last level
   needs it on every floor, where its second hint names it. Allowed on
   the eight mats, it turned out to be needed on 19, 35 and 35 of 160
   floors dealt over three seed ranges — too many for a level that
   never says it exists.

   `opensOnAMat` makes the first step a mat laid, never a fact, so the
   first level's second hint is true of every floor it deals.

   `maxArea` is a shape of the cut, not a rule a child is told. Nine
   on the last level lets a plus take three by three, which keeps one
   floor in 20 to 24 cut; at eight it was one in 36.
   ------------------------------------------------------------------ */

const four: MatsConfig = {
  n: 4,
  mats: 5,
  maxArea: 6,
  maxSingles: 0,
  minStuck: 2,
  maxStuck: 2,
  maxPairs: 0,
  always: 'never',
  opensOnAMat: true,
  bank: [
    ['.-.-', '.-|.', '+...', '....'],
    ['|.+.', '.|..', '.-..', '...|'],
  ],
}

const five: MatsConfig = {
  n: 5,
  mats: 8,
  maxArea: 6,
  maxSingles: 0,
  minStuck: 3,
  maxStuck: 6,
  maxPairs: 0,
  always: 'never',
  opensOnAMat: true,
  bank: [
    ['.+...', '.....', '-..|.', '.-.|.', '|-..|'],
    ['.....', '.+.|.', '+..||', '.....', '.-|.|'],
  ],
}

/** No ceiling on the last level: whatever the six-wide floor asks for, one pair at most. */
const six: MatsConfig = {
  n: 6,
  mats: 11,
  maxArea: 9,
  maxSingles: 0,
  minStuck: 5,
  maxStuck: 99,
  maxPairs: 1,
  always: 'needed',
  opensOnAMat: true,
  bank: [
    ['...-.-', '|..|-.', '..|..+', '|.....', '.+-..|', '......'],
    ['....||', '......', '..+..|', '..-||.', '..+.||', '.+....'],
  ],
}

export const floorMats: PuzzleMeta<MatsState, MatsAction> = {
  id: 'floor-mats',
  title: 'The floor mats',
  tagline: 'Cover the floor with mats. Each mark says whether its mat is square, wide or tall.',
  Icon: FloorMatsIcon,
  instructions: [
    'Cover the whole floor with mats. Each mat has exactly one mark on it.',
    'A mat with a plus is a square. A mat with a flat line is wider than it is tall.',
    'A mat with a standing line is taller than it is wide.',
    'Tap one corner, then the opposite corner. Tap a mat to lift it.',
  ],
  levels: [
    {
      id: 'five-mats',
      label: 'Five mats',
      difficulty: 1,
      par: 5,
      config: four,
      hints: [
        'A mark tells you the shape of its mat, not its size. A mat can grow until another mark or the edge stops it.',
        'One of the marks can have only one mat. Find that mark and lay its mat first.',
        'Look at a bare square. If only one mark can stretch its mat over it, that mat has to cover the square.',
      ],
    },
    {
      id: 'eight-mats',
      label: 'Eight mats',
      difficulty: 2,
      par: 8,
      config: five,
      hints: [
        'Lay the mats that you are sure of first. Each one takes squares away from the marks around it.',
        'A standing line needs a mat that is taller than it is wide. Count the room above it and below it first.',
        'Pick a bare square and try each mark near it. If only one mark can stretch a mat of its shape over it, that mark’s mat covers the square.',
      ],
    },
    {
      id: 'eleven-mats',
      label: 'Eleven mats',
      difficulty: 3,
      par: 11,
      config: six,
      hints: [
        'A mat with a plus is always as wide as it is tall. If the plus has little room one way, its mat is small both ways.',
        'Sometimes every mat that a mark could have covers the same square. Then no other mark can use that square.',
        'When you are stuck, find a square that only one mark can reach. That mark’s mat must cover it. Then look at the marks around it again.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
