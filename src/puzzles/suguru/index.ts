import type { PuzzleMeta } from '../../lib/types'
import type { QuiltAction, QuiltConfig, QuiltState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { SuguruIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three sizes, and four other dials.

   `minRounds` and `maxRounds` are passes over the two steps in
   `solveByLogic` — "this square has one number left" and "this
   number has one square left in its patch" — counted on the board
   that is dealt rather than guessed at. Every board is dealt
   fresh, so those two numbers are what holds a level steady from
   one deal to the next.

   The cap matters more here than the size of the grid does. A
   square on this board carries up to five numbers rather than the
   one bit a garden square carries, so a board that needs a sixth
   and seventh pass has quietly become a board you cannot hold in
   your head: you would have to write the candidates into the
   squares to get through it.

   Two hundred seven-wide boards were dealt the way the last level
   deals them, with no cap at all: one `makeRng(1)` threaded
   through `cutQuilt(rng, 7)` and `digTo(rng, 7, quilt, 20,
   'reasoned')` over and over, keeping the boards where
   `smallestOpenPatch` came back 3 or less — 200 of the 306 cut —
   and counting the passes `solveByLogic` took on each. They came
   out 2:3 3:51 4:72 5:44 6:24 7:2 8:3 9:1. Five is where the last
   level is held: the top of what falls out naturally, and short
   of the 15% tail that wants a pencil.

   `smallest` is the shape of a board rather than its difficulty:
   the biggest the smallest patch a child can still write in may
   be. A quilt cut entirely into patches of five never asks the
   question this puzzle is about, because every number fits every
   square, and 85 of 300 five-wide cuts came out that way when
   nothing asked them not to — with half of the 300 holding no
   patch of two squares at all. `smallest` is also what makes the
   first hint of the first level true of the board in front of the
   child. That hint sends a child to a patch of two squares, so
   every board the level deals holds one, with a square in it
   still empty.

   `nearlyFull` is a dial of the same kind, for the hint that the
   second level opens with. That hint sends a child to a patch
   with one square left to fill — the one move on this board that
   needs no candidates written down anywhere — so the level that
   says it has to be dealt one. The cut usually leaves some
   without being asked, but not always. Put `nearlyFull` back to 0
   on all three levels and deal two hundred boards a level —
   `init(level, makeRng(9000 + k * 13))` for k under 200, counting
   the boards where `nearlyFullPatches` came back 0 — and 7 of the
   five-wide come out with no such patch, 6 of the six-wide and 47
   of the seven-wide. The first and third levels say nothing about
   it and so ask for nothing, which is what the 0 in each of them
   means: a seven-wide board would pay for that shape a quarter of
   the time, and no hint there is about it.

   `clues` is fixed for a level, so `par` — one tap a blank square —
   is the same whichever board the seed deals. The first level is
   held to eight of them, which is where the rest of the
   collection's first levels sit and what the small square opens
   with: an eight-year-old gets it in two minutes, and eight
   squares of a rule set nobody has met before is already a sit at
   the table. It gets there by printing seventeen of the
   twenty-five squares rather than by cutting a four-wide quilt,
   because a four-wide board with a keypad under it is the small
   square's own board with different lines on it, and the lines
   are what a child came here to read.
   ------------------------------------------------------------------ */

const small: QuiltConfig = {
  n: 5,
  clues: 17,
  minRounds: 2,
  maxRounds: 3,
  smallest: 2,
  nearlyFull: 0,
}
const middle: QuiltConfig = {
  n: 6,
  clues: 20,
  minRounds: 3,
  maxRounds: 4,
  smallest: 3,
  nearlyFull: 1,
}
const big: QuiltConfig = {
  n: 7,
  clues: 20,
  minRounds: 4,
  maxRounds: 5,
  smallest: 3,
  nearlyFull: 0,
}

export const suguru: PuzzleMeta<QuiltState, QuiltAction> = {
  id: 'suguru',
  title: 'The patchwork quilt',
  tagline: 'Number every patch from 1 up. No two squares that touch hold the same number.',
  Icon: SuguruIcon,
  instructions: [
    'Fill every empty square.',
    'A patch of two squares holds 1 and 2. A patch of five holds 1, 2, 3, 4 and 5.',
    'No two squares that touch may hold the same number, not even corner to corner.',
    'Tap a square, then tap a number. Rub a number out with the rubber key.',
  ],
  levels: [
    {
      id: 'five-across',
      label: 'Five squares across',
      difficulty: 1,
      par: 8,
      config: small,
      hints: [
        'Start with the smallest patch. A patch of two squares holds only 1 and 2.',
        'Pick an empty square. Cross off every number in its patch, and every number in the squares round it.',
        'When one number is left for a square, that is the number that goes in it.',
      ],
    },
    {
      id: 'six-across',
      label: 'Six squares across',
      difficulty: 2,
      par: 16,
      config: middle,
      hints: [
        'Start where the quilt is fullest. A patch with one square left to fill tells you more than an empty patch does.',
        'Every patch has exactly one 1. Look for the patches where the 1 has only one square left.',
        'When a patch tells you nothing, look just outside it. A number in the patch next door still blocks every square that it touches.',
      ],
    },
    {
      id: 'seven-across',
      label: 'Seven squares across',
      difficulty: 3,
      par: 29,
      config: big,
      hints: [
        'A number rules out the eight squares round it. Write one in, then look at its neighbours.',
        'The big patches are the hardest to start on. Work outwards from the small ones.',
        'When nothing is forced, go over the board again patch by patch. A number that you wrote since settles a square that you skipped.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
