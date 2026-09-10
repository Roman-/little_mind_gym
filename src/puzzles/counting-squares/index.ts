import type { PuzzleMeta } from '../../lib/types'
import type { MosaicAction, MosaicConfig, MosaicState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { CountingSquaresIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three sizes, and three other dials.

   `filled` is how many squares the answer fills in, and it is par:
   one tap a square, and nothing else on this board costs a move.
   See the note on par in logic.ts for why the second mark the paper
   game is played with — the dot on a square you have worked out is
   empty — is not here at all. Nine, fourteen and twenty-four is
   the ramp, so the last level sits with the small square's 22 and
   the patchwork quilt's 29 rather than with the 25, 36 and 49 a
   marked-all-over board would report.

   `overlap` is the real ramp. The first two levels are held to
   plain counting round one number at a time: count what a number
   already has, and either the rest of its squares stay empty or
   every one of them gets filled in. The last level will not deal a
   board that plain counting finishes — somewhere on it two numbers
   have to be held against each other, which is the step the
   collection table names this puzzle for.

   Which way a board falls is mostly its size, so this is a dial
   that mostly agrees with the grid rather than fighting it. Of the
   boards `digTo` thins to the level's own number of clues, plain
   counting alone finishes 45% of five-wide boards at 18 numbers,
   11% of six-wide at 24 and 2% of seven-wide at 28 — 106 of 237,
   43 of 400 and 6 of 247, blotted with `paint`, thinned with
   `digTo` and reasoned out with `solveByLogic` on
   `makeRng(31337 + n)`, 500 tries at five wide, 400 at six and 250
   at seven, holding a printed 0 back at five wide the way this
   level really does. So the first two levels look for the plain
   ones and the last one looks for the rest, and neither has to
   look far.

   `minRounds` and `maxRounds` are passes over those steps, counted
   on the dealt board rather than guessed at. A pass is one sweep of
   the whole board writing down everything it can, so the count is
   how deep the chain of "and therefore" goes. Every board is dealt
   fresh, so those two numbers are what holds a level steady from
   one deal to the next — and the three windows are disjoint, 4 to
   6, 7 to 9 and 10 to 12, so the chain on a later level's board is
   always longer than the chain on an earlier one's. A window that
   overlapped the one below it would leave the dial saying nothing
   about which of two boards was the harder.

   `clues` is how many numbers are printed, and it is fixed for a
   level so that a deal is the same weight of board every time. It
   thins as the boards grow — 18 of 25 squares, 24 of 36, 28 of 49 —
   which is the other half of the ramp: more squares to fill in, and
   fewer numbers saying anything about them.

   `zero` is a promise the first level's first hint makes. A printed
   0 settles its whole block before a single square is filled in,
   which is the way in to a board with nothing on it yet, so `digTo`
   holds one back from the rubbing out and the tests check every
   seed for it.

   The other promises the hints make are not dials, because no level
   turns them off: every board dealt carries a number in a corner, a
   number on the outer ring that settles its whole block before the
   first tap, and two numbers side by side. See `fits` in logic.ts,
   which is where a hint's words are held against the board.
   ------------------------------------------------------------------ */

const small: MosaicConfig = {
  n: 5,
  filled: 9,
  clues: 18,
  minRounds: 4,
  maxRounds: 6,
  overlap: 'never',
  zero: true,
}
const middle: MosaicConfig = {
  n: 6,
  filled: 14,
  clues: 24,
  minRounds: 7,
  maxRounds: 9,
  overlap: 'never',
  zero: false,
}
const big: MosaicConfig = {
  n: 7,
  filled: 24,
  clues: 28,
  minRounds: 10,
  maxRounds: 12,
  overlap: 'needed',
  zero: false,
}

export const countingSquares: PuzzleMeta<MosaicState, MosaicAction> = {
  id: 'counting-squares',
  title: 'The counting squares',
  tagline: 'Each number counts the filled squares around it, and the square it sits on.',
  Icon: CountingSquaresIcon,
  instructions: [
    'Make every number on the board right.',
    'A number says how many of the nine squares around it get filled in.',
    'It counts its own square too. At an edge or a corner it counts fewer.',
    'Tap a square to fill it in. Tap it again to empty it.',
  ],
  levels: [
    {
      id: 'five-across',
      label: 'Five across',
      difficulty: 1,
      par: 9,
      config: small,
      hints: [
        'Start with a 0. None of the squares around a 0 get filled in.',
        'Count what a number still needs. If the empty squares left are just enough, fill them all in.',
        'When a number already has all the filled squares it counts, every other square around it stays empty.',
      ],
    },
    {
      id: 'six-across',
      label: 'Six across',
      difficulty: 2,
      par: 14,
      config: middle,
      hints: [
        'A number on an edge counts six squares, and one in a corner counts four. Those settle soonest.',
        'Fill in what you are sure of, then go round again. A number you passed over will be settled by now.',
        'Work one number at a time. Every square you settle helps the number next door as well.',
      ],
    },
    {
      id: 'seven-across',
      label: 'Seven across',
      difficulty: 3,
      par: 24,
      config: big,
      hints: [
        'Start at the edge. A number there counts six squares, and a number in a corner counts four.',
        'One number at a time will not finish this board. Take two numbers side by side and compare them.',
        'Take one number away from its neighbour. The difference has to sit in the squares only one of them counts.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
