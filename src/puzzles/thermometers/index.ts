import type { PuzzleMeta } from '../../lib/types'
import type { ThermoAction, ThermoConfig, ThermoState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { ThermometersIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three sizes, and three other dials.

   `minRounds` and `maxRounds` are passes over the two steps in
   `solveByLogic`, counted on the board itself rather than guessed
   at. `minNarrowings` and `maxNarrowings` are how many times the
   second of those steps has to narrow a thermometer — the step
   where a child counts what the other thermometers in a line can
   give it and takes what is left. One thermometer can be narrowed
   more than once, from either end and by either of the two lines
   that it stands in, so the number counts the narrowing rather
   than the thermometers that it was done to. The floor is what
   stops a harder level from being the easy one on a bigger grid;
   the ceiling is what stops the easy one from being a hard one,
   because a level may only ask for a step that its own three
   hints teach. Five across is dealt without that step and never
   teaches it.

   `minPartial` is how many thermometers the answer leaves part
   full. Those are the ones where how far the mercury runs is the
   question rather than whether it is there at all, so a board
   without them would be a board of switches. `minZeros` is the
   numbers in the margin that say 0, and it is there for one
   sentence: five across sends a child to a 0 in its first hint,
   so five across has to have one.

   `par` needs no search. Every board starts with every thermometer
   empty, one tap sets one thermometer's level whatever it stood at
   before, and each board has exactly one answer — so par is the
   number of thermometers that answer fills, every time.
   ------------------------------------------------------------------ */

/** The one level whose hints never teach the counting step, so the one that never asks for it. */
const small: ThermoConfig = {
  n: 5,
  filled: 4,
  minPartial: 1,
  minZeros: 1,
  minRounds: 1,
  maxRounds: 3,
  minNarrowings: 0,
  maxNarrowings: 0,
}

const middle: ThermoConfig = {
  n: 6,
  filled: 6,
  minPartial: 2,
  minZeros: 0,
  minRounds: 2,
  maxRounds: 4,
  minNarrowings: 1,
  maxNarrowings: 8,
}

/** No ceiling on the last level: whatever the seven-across board asks for. */
const large: ThermoConfig = {
  n: 7,
  filled: 9,
  minPartial: 3,
  minZeros: 0,
  minRounds: 4,
  maxRounds: 99,
  minNarrowings: 9,
  maxNarrowings: 99,
}

export const thermometers: PuzzleMeta<ThermoState, ThermoAction> = {
  id: 'thermometers',
  title: 'The thermometers',
  tagline: 'Mercury fills from the bulb. The numbers count the full squares in each row and column.',
  Icon: ThermometersIcon,
  instructions: [
    'Fill the thermometers so every number counts the full squares in its line.',
    'Mercury fills from the bulb, so a square is only full if the one before it is.',
    'Tap a square to run the mercury up to it, or back down to it.',
    'Tap the top of the mercury to empty that thermometer.',
  ],
  levels: [
    {
      id: 'five-across',
      label: 'Five across',
      difficulty: 1,
      par: 4,
      config: small,
      // Every board that this level deals comes out on step one of
      // `solveByLogic` alone, and step one has two halves: a line that already
      // holds every full square its number asks for, and a line with only just
      // enough room for them. Hints two and three are those two halves in
      // words, and hint one is the easiest instance of hint two — a line whose
      // number is 0 already holds every full square it asks for. Mercury
      // filling from the bulb is not among them: it is the second line of the
      // instructions above, and no position that this board can hold breaks
      // it.
      hints: [
        'Start with a 0 in the margin. No square in that line is filled.',
        'When a line already has as many full squares as its number wants, every other square in it is empty.',
        'When a line has room for just as many squares as its number wants, every one of them is filled.',
      ],
    },
    {
      id: 'six-across',
      label: 'Six across',
      difficulty: 2,
      par: 6,
      config: middle,
      // The first hint is true of every board, whatever it deals: a line holds
      // n squares and its number counts the full ones, so the line with the
      // biggest number is the line that ends with the fewest empty squares.
      // The third is the counting step, which `minNarrowings: 1` asks every
      // six-across board for.
      hints: [
        'Start on the line with the biggest number in the margin. When the board is done, that line has the fewest empty squares.',
        'Filling one square fills every square between it and the bulb. Those count in their own rows and columns as well.',
        'In one line, count the most that every other thermometer could give it. What is missing has to come from the last one.',
      ],
    },
    {
      id: 'seven-across',
      label: 'Seven across',
      difficulty: 3,
      par: 9,
      config: large,
      // The first hint rests on `minRounds: 4`: one pass over the lines never
      // pins a seven-across board, and logic.test.ts holds all sixty seeds of
      // it to that floor.
      hints: [
        'One look at each line is not enough here. Take them one at a time, and then go round them all again.',
        'A thermometer stands in a row and in a column at once. What one line tells you about it, the other can use.',
        'For one line, add up the fewest squares that the other thermometers must give it. The last one may give no more than what is left.',
      ],
    },
  ],
  reseedable: true,
  // Mercury runs back down on one tap, so there is deliberately no failure():
  // no position this board can hold is a dead end, and none of them breaks a
  // rule either. A number in the margin says what the finished board looks
  // like rather than what a child may do on the way there, so every square
  // takes every tap and nothing is ever refused. Step back and Start over sit
  // in the toolbar throughout.
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
