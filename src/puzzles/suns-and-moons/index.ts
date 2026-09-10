import type { PuzzleMeta } from '../../lib/types'
import type { SunsAction, SunsConfig, SunsState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { SunsAndMoonsIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three sizes, and the dials beside them.

   `blanks` is how many squares start empty, and it is `par`: one tap
   fills one square. It is a cap rather than a maximum — the removal
   would happily take 27 squares out of the six-wide board and 47 out
   of the eight-wide one, and forty-seven marks under a board is a
   chore, not a level.

   `minRounds` and `maxRounds` are passes over the two rules, counted
   on the board itself rather than guessed at. They are what stops a
   capped board from being a giveaway: a board every square of which
   falls straight out of the printed marks is dealt again. The floor
   climbs 2, 3, 4 down the three levels, so every level asks for at
   least one pass more than the level before it, and the dial ramps
   rather than sitting still.

   `minGaps` and `minPairs` are the other half of that — how many
   squares must need the three-in-a-line rule, where counting alone
   would not have settled it, in each of the two shapes that rule
   comes in. A gap is `sun . sun`, and a pair is `sun sun .`. Each
   level asks for the shape that its own last hint names: the pair
   at six wide, the gap at eight. Both are 0 at four wide because
   there the rule provably never fires: three of one mark in a
   four-long line has already broken the count.
   ------------------------------------------------------------------ */

const four: SunsConfig = { n: 4, blanks: 8, minRounds: 2, maxRounds: 3, minGaps: 0, minPairs: 0 }
const six: SunsConfig = { n: 6, blanks: 16, minRounds: 3, maxRounds: 5, minGaps: 0, minPairs: 1 }
const eight: SunsConfig = { n: 8, blanks: 22, minRounds: 4, maxRounds: 6, minGaps: 1, minPairs: 0 }

export const sunsAndMoons: PuzzleMeta<SunsState, SunsAction> = {
  id: 'suns-and-moons',
  title: 'Suns and moons',
  tagline:
    'Every row and column takes as many suns as moons. Three suns or three moons never stand in a line.',
  Icon: SunsAndMoonsIcon,
  instructions: [
    'Fill every square with a sun or a moon.',
    'Give every row and every column as many suns as moons.',
    'Never put three suns or three moons in a line, across or down.',
    'Tap the sun or the moon below. Tap a square to put it in, again to take it out.',
  ],
  levels: [
    {
      id: 'four-wide',
      label: 'Four wide',
      difficulty: 1,
      par: four.blanks,
      config: four,
      hints: [
        'Every row takes two suns and two moons. Every column does too.',
        'Once a row holds both of its suns, every other square in it is a moon.',
        'Fill one square, then look again. Its row and its column may both be finished now.',
      ],
    },
    {
      id: 'six-wide',
      label: 'Six wide',
      difficulty: 2,
      par: six.blanks,
      config: six,
      hints: [
        'Every row takes three suns and three moons. Every column does too.',
        'Once a row holds all three of its suns, every other square in it is a moon.',
        'Two suns side by side need a moon at each end. Two moons need a sun at each end.',
      ],
    },
    {
      id: 'eight-wide',
      label: 'Eight wide',
      difficulty: 3,
      par: eight.blanks,
      config: eight,
      hints: [
        'Every row takes four suns and four moons. Every column does too.',
        'Once a row holds all four of its suns, every other square in it is a moon.',
        'A gap between two suns takes a moon, because three suns in a line are never allowed. Two moons work the same way.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
