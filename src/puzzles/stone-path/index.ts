import type { PuzzleMeta } from '../../lib/types'
import type { StoneAction, StoneConfig, StoneState } from './logic'
import { canStillWin, describeMove, failure, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { StonePathIcon } from './glyphs'

/* ------------------------------------------------------------------
   The three boards, drawn rather than dealt.

   A board thrown down at random is nearly always one of two
   things: a walk with no answer at all, or a walk whose first
   wrong turn wanders on for six or nine more moves before the
   board jams — and every one of those moves is a Step back on the
   way out again. So these three were searched for offline and
   graded on the numbers `logic.test.ts` derives again from the
   pictures below.

   The one that matters is **how far a wrong turn runs before it
   jams**. On a five-wide board of eight stones a random unique
   puzzle's worst wrong turn runs five or six moves; the board
   below runs three. On a six-wide board of eleven stones a random
   one runs seven or eight; the board below runs three. That is the
   whole of what is being paid for here, and it is paid for with
   choices that sit late enough in the walk to have nowhere to
   wander.

   The ramp is the walk rather than the trap. The first board is
   forced from end to end: every position on it has exactly one
   move, so it cannot be got wrong and cannot jam, and all a child
   has to learn is how to look along four lines. The second adds
   two real choices and the first jam. The third is the same two
   choices at twice the length.

   `par` needs no search either. Every move takes exactly one
   stone, and the stone you start on is picked up as the level
   opens, so par is the stone count less one — every time, for
   every route. The test proves it by search as well.
   ------------------------------------------------------------------ */

const sevenStones: StoneConfig = {
  picture: [
    '..S.',
    '.o.o',
    'o..o',
    'o.o.',
  ],
}

const eightStones: StoneConfig = {
  picture: [
    '..S..',
    '...oo',
    'o.ooo',
    '.....',
    'o....',
  ],
}

const elevenStones: StoneConfig = {
  picture: [
    '....o.',
    '..oo..',
    '......',
    '...o.S',
    'ooo.o.',
    'oo....',
  ],
}

export const stonePath: PuzzleMeta<StoneState, StoneAction> = {
  id: 'stone-path',
  title: 'The stone path',
  tagline: 'Walk from stone to stone and pick up every one. You can turn a corner, but never turn back.',
  Icon: StonePathIcon,
  instructions: [
    'Pick up every stone on the board.',
    'Tap a stone to walk to it. It has to be the first stone up, down, left or right of you.',
    'You can go straight on or turn a corner. You can never go back the way you came.',
    'Getting stuck is part of it. Step back and try a different way.',
  ],
  levels: [
    {
      id: 'seven-stones',
      label: 'Seven stones',
      difficulty: 1,
      par: 6,
      config: sevenStones,
      hints: [
        'Look along all four lines from the square you are standing on. Empty squares do not stop you.',
        'Only the first stone on a line can be reached. A stone with another one in front of it has to wait.',
        'On this board there is only ever one stone you can reach. Find it and you cannot go wrong.',
      ],
    },
    {
      id: 'eight-stones',
      label: 'Eight stones',
      difficulty: 2,
      par: 7,
      config: eightStones,
      hints: [
        'Most of these moves are the only move there is. Two of them are a real choice.',
        'A stone you cannot reach now can be easy to reach later, once the stones in front of it are gone.',
        'Work out which stone has to be last. Whatever comes before it has to be able to reach it.',
      ],
    },
    {
      id: 'eleven-stones',
      label: 'Eleven stones',
      difficulty: 3,
      par: 10,
      config: elevenStones,
      hints: [
        'A longer walk, and the same job at every step. Look along the four lines and see what they reach.',
        'The choices on this board come in the middle of the walk. Everything before them is forced.',
        'When you get stuck, look at the stones you left behind. Then step back to where you last had a choice.',
      ],
    },
  ],
  reseedable: false,
  engine: { init, reduce, isSolved, failure, canStillWin, describe: describeMove, Board },
}
