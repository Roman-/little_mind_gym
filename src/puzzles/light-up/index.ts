import type { PuzzleMeta } from '../../lib/types'
import type { LightUpAction, LightUpConfig, LightUpState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { LightUpIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three sizes, and three other dials. `candles` pins the answer's
   size, which is the level's par and is printed to a child as a
   fact, so it is held exactly rather than left to come out where it
   may. `minNumbers` keeps enough clue numbers on the board that the
   counting this puzzle came here to bring is really there.
   `minRounds` and `maxRounds` are passes over the two steps in
   `solveByLogic`, counted on the board itself rather than guessed
   at. Every board is dealt fresh, so these four numbers are what
   holds a level steady from one deal to the next.

   Measured over 200 seeds a level: the first level settles three of
   its five candles off a wall's number and two off a square left in
   the dark; by the third that split is level, at four and a half
   each. The ramp is a different kind of thinking, not only a bigger
   board.
   ------------------------------------------------------------------ */

const five: LightUpConfig = {
  n: 5,
  walls: 7,
  candles: 5,
  minNumbers: 3,
  minRounds: 2,
  maxRounds: 3,
}
const six: LightUpConfig = {
  n: 6,
  walls: 9,
  candles: 7,
  minNumbers: 4,
  minRounds: 3,
  maxRounds: 5,
}
/** No ceiling on the last level: whatever the seven-wide board asks for. */
const seven: LightUpConfig = {
  n: 7,
  walls: 13,
  candles: 9,
  minNumbers: 6,
  minRounds: 5,
  maxRounds: 99,
}

export const lightUp: PuzzleMeta<LightUpState, LightUpAction> = {
  id: 'light-up',
  title: 'The candles',
  tagline: 'Stand candles so that every square is lit. A candle shines until a wall stops it.',
  Icon: LightUpIcon,
  instructions: [
    'Light every square. A candle shines along its row and its column until a wall stops it.',
    'No candle may stand in another candle’s light.',
    'A number on a wall says how many candles touch that wall.',
    'Tap a square to stand a candle on it. Tap the candle to take it away.',
  ],
  levels: [
    {
      id: 'seven-walls',
      label: 'Seven walls',
      difficulty: 1,
      par: 5,
      config: five,
      hints: [
        'Start at a wall with a number on it. That number says how many candles touch the wall, above, below, left and right.',
        'A wall marked 0 wants no candles at all. No candle can stand beside it.',
        'Look for a square nothing lights yet. If only one square could reach it, that is where a candle goes.',
      ],
    },
    {
      id: 'nine-walls',
      label: 'Nine walls',
      difficulty: 2,
      par: 7,
      config: six,
      hints: [
        'Some walls settle a candle on their own. Put those down before you argue about anything else.',
        'A candle shines all the way to a wall. Follow its light before you stand the next one.',
        'A wall with all its candles wants no more. Every other square beside it is out, even a dark one.',
      ],
    },
    {
      id: 'thirteen-walls',
      label: 'Thirteen walls',
      difficulty: 3,
      par: 9,
      config: seven,
      hints: [
        'The numbers will not finish this one on their own. Some candles have to come from a square that nothing else can light.',
        'Pick a square that is still dark. Then ask which squares could light it at all.',
        'A lit square can never hold a candle. The light rules squares out long before you stand anything on them.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
