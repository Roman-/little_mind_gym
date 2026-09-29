import type { PuzzleMeta } from '../../lib/types'
import type { BoatsAction, BoatsConfig, BoatsState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { HiddenBoatsIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three fleets, and the dials that hold them apart.

   `minRounds` and `maxRounds` are passes over the three steps in
   `solveByLogic`, counted on the board rather than guessed at.
   `fitAsks` names the boats the fit step has to place, in order,
   and a board is dealt only if its reasoning asks exactly that:
   the boat of three at four and six boats, then the boat of four
   followed by the boat of three at seven. Every one is a prefix of
   its own fleet, because the fit step always asks about the longest
   outline still empty (see `fleetOnBoard`) — so "the first fit step
   asks about the first boat" is a thing the hints can promise. A
   reader who ignores the fleet solves none of 300 boards at any
   level.

   The ladder rule of the tents and trees holds on both dials: no
   level's ceiling stands above the floor of the level above. Rounds
   run 2–3, 3–4 and 4 up; fit steps run one, one and two.

   Four boats is gated to hand a child a printed end that points at
   a square with nothing printed on it, and a 0, which its first two
   hints send them to, and three fleets or more that keep its
   printed pieces, so the numbers always matter. Six and
   seven boats are gated at 1,600 such fleets, which is what keeps a
   player who climbs the strip without reading a number out of them
   (see `inBand` in logic.ts). Four boats is left open to that
   climber — 45 boards in 100 within fifty times par — because on a
   five-by-five board with two printed pieces no gate can close it,
   and a first level that the mindless can stumble through is the
   long table's and the counting squares' precedent too.

   `par` needs no search: it is the fleet's squares less the printed
   ones, the same for every seed. See the note under `legalMoves`.
   ------------------------------------------------------------------ */

/** A boat of three, once asked for: two or three passes. */
const small: BoatsConfig = {
  n: 5,
  fleet: [3, 2, 1, 1],
  shown: 2,
  minRounds: 2,
  maxRounds: 3,
  fitAsks: [3],
  minZeros: 1,
  minEnds: 1,
  minLayouts: 3,
}

/** The same question on a bigger sea with more boats: three or four passes. */
const middle: BoatsConfig = {
  n: 6,
  fleet: [3, 2, 2, 1, 1, 1],
  shown: 3,
  minRounds: 3,
  maxRounds: 4,
  fitAsks: [3],
  minZeros: 0,
  minEnds: 0,
  minLayouts: 1600,
}

/** Asked twice, the boat of four and then the boat of three. No ceiling on the passes. */
const large: BoatsConfig = {
  n: 7,
  fleet: [4, 3, 2, 2, 1, 1, 1],
  shown: 3,
  minRounds: 4,
  maxRounds: 99,
  fitAsks: [4, 3],
  minZeros: 0,
  minEnds: 0,
  minLayouts: 1600,
}

export const hiddenBoats: PuzzleMeta<BoatsState, BoatsAction> = {
  id: 'hidden-boats',
  title: 'The hidden boats',
  tagline: 'Boats hide in the sea. The numbers count the boat squares in each row and column.',
  Icon: HiddenBoatsIcon,
  // The tagline opens "How to play", just above these, and it already says
  // what the numbers count. So the third line goes to the printed pieces, and
  // names all three: a boat of one is a disc and an end is flat on one side,
  // but a printed middle is a small square block, which a child who reads only
  // "a boat's shape" could take for a boat one square long. Seven boats prints
  // a middle on 106 boards in 300, and only its label ever said what one was.
  instructions: [
    'Find each boat that is drawn under the board. Every boat is a straight line.',
    'Boats never touch, not even at a corner.',
    "Printed squares show a boat's shape: an end, a middle, or a whole boat.",
    'Tap a square to put a boat square there. Tap it again to take it away.',
  ],
  levels: [
    {
      id: 'four-boats',
      label: 'Four boats',
      difficulty: 1,
      par: 5,
      config: small,
      // Every hint rests on something that holds on every board this level
      // deals. The first rests on `minEnds: 1`, which counts only an end that
      // points at a square with nothing printed on it (see `openEnds`), so the
      // square it sends a child to is always one for them to fill. The second
      // rests on `minZeros: 1` and on the line step, which all 300 of 300
      // boards use; the third on `fitAsks: [3]`. One to three lines have room
      // for the boat of three at the start, and the fit step finds one place
      // for it on every one of 200 boards.
      hints: [
        'A printed end is flat on the side where the rest of its boat is. The next square that way is a boat square.',
        'A 0 means no boat square is in that line. When a line has room for just as many boat squares as its number, fill them all.',
        'The boat of three needs a row or a column whose number is 3 or more. Find where it still fits.',
      ],
    },
    {
      id: 'six-boats',
      label: 'Six boats',
      difficulty: 2,
      par: 7,
      config: middle,
      // The first uses the board's own words for a dot, "no room for a boat",
      // and rests on the three or four passes every board takes. The second is
      // the fit step on the boat of three, which `fitAsks: [3]` asks every
      // board for; the third holds because at least one pass follows the last
      // fit step on every board at every level (300 seeds a level).
      hints: [
        'Every boat square that you put down leaves no room for a boat at its corners. Each time you put one down, look at every line again.',
        'Find every place where the boat of three could still lie. A square that all of those places use is a boat square.',
        'Once the boat of three is on the board, no other boat can touch it. Count each line again.',
      ],
    },
    {
      id: 'seven-boats',
      label: 'Seven boats',
      difficulty: 3,
      par: 11,
      config: large,
      // The first rests on `minRounds: 4`. The second is true of every board,
      // because the answer's boat of four lies in such a line. The third rests
      // on `fitAsks: [4, 3]`: the fit step asks about the boat of four and
      // then the boat of three on every board this level deals.
      hints: [
        'One look at each line is not enough here. Go round every line, then go round them all again.',
        'The boat of four needs a row or a column whose number is 4 or more. Start there.',
        'Once the boat of four is on the board, find where the boat of three can still lie.',
      ],
    },
  ],
  reseedable: true,
  // Every move undoes, so there is deliberately no failure() and no
  // canStillWin(): taking a boat square away is never refused, so any position
  // walks back to the opening one, and the answer goes down from there in any
  // order. logic.test.ts proves it on every reachable position of three
  // four-boat boards, and on every position of twenty random walks at six and
  // at seven boats. A boat square that breaks a boat's shape is refused
  // rather than stepped back from, and the numbers never refuse anything.
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
