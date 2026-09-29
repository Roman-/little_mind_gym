import type { PuzzleMeta } from '../../lib/types'
import type { TileAction, TileConfig, TileState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { PaintedTilesIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three sizes, and one real dial: which step a board needs.

   Grid size and the number of passes both collapse on this
   puzzle. 594 of 600 five-across boards finish in exactly two
   passes, and the counts at six and seven across overlap — the
   medians are 3 and 4, and 77 seven-across boards of 600 take
   three passes, as 346 six-across ones do — so the pass count
   cannot separate the levels, and the level is graded on the
   step instead. `step` names the hardest
   step of `solveByLogic` a level asks for, and `fits` turns down
   a board that the level below could finish as well as one this
   level cannot. Over 600 seeds a level: counting alone finishes
   600 five-across boards and 0 six- and seven-across ones, and
   counting with sizes finishes 600 six-across boards and 0
   seven-across ones. The counting squares grade their levels the
   same way.

   The rest of the dials are there to keep the hints true. A hint
   may only name something that is on every board it is shown on,
   so every one of these is a gate on the deal rather than a
   number aimed at: `zero` for level one's 0, `bothHalves` for
   level two's second and third hints, and `noWayIn` with
   `neededAtStart` for level three's first. `minTiles` and
   `maxTiles` keep every deal of a level the same weight.

   `par` needs no search. Every board starts unpainted, one tap
   flips one tile, and each board has exactly one answer — so par
   is the number of tiles that answer paints, every time. The
   tests walk the whole graph at five and six across anyway, and
   the graph with over-full lines pruned at seven.
   ------------------------------------------------------------------ */

/** Counting only. Every board has a 0, and none is finished in one look. */
const small: TileConfig = {
  n: 5,
  painted: 5,
  minTiles: 9,
  maxTiles: 10,
  step: 'count',
  minPasses: 2,
  zero: true,
  noWayIn: false,
  bothHalves: false,
  neededAtStart: false,
}

/** Counting stalls; the size of a tile finishes it, and both halves of that are needed. */
const middle: TileConfig = {
  n: 6,
  painted: 7,
  minTiles: 13,
  maxTiles: 14,
  step: 'size',
  minPasses: 2,
  zero: false,
  noWayIn: false,
  bothHalves: true,
  neededAtStart: false,
}

/** Counting and sizes stall; a line's sums finish it. No 0 and no full line to start from. */
const large: TileConfig = {
  n: 7,
  painted: 9,
  minTiles: 17,
  maxTiles: 19,
  step: 'sums',
  minPasses: 1,
  zero: false,
  noWayIn: true,
  bothHalves: false,
  neededAtStart: true,
}

export const paintedTiles: PuzzleMeta<TileState, TileAction> = {
  id: 'painted-tiles',
  title: 'The painted tiles',
  tagline:
    'A tap paints a whole tile, every square of it. Each number counts the painted squares in its line.',
  Icon: PaintedTilesIcon,
  // The second line says which line a number counts. Every hint below speaks
  // of "a line", and a child may meet this puzzle before the thermometers or
  // the tents, the others that stand numbers round a grid — so it says so
  // itself rather than leave it to them.
  instructions: [
    'Paint tiles so that each number counts the painted squares in its line.',
    'A number at the side counts its row. A number along the top counts its column.',
    'Paint a tile all over, or leave it plain.',
    'Tap a tile to paint it. Tap it again to wipe the paint off.',
  ],
  levels: [
    {
      id: 'five-across',
      label: 'Five across',
      difficulty: 1,
      par: 5,
      config: small,
      // Counting finishes every board this level deals, and counting has two
      // halves: a line that already has its number, and a line with just enough
      // room. The first hint is the easiest case of the first half, and `zero`
      // puts a 0 on every board for it. Hints one and two also teach the rule
      // that makes this puzzle its own: a tile that stays plain stays plain all
      // over, in every line it crosses. Read with only the squares in the
      // proving line plain, these three hints finish 0 of 60 boards; read as
      // written, they finish 60 of 60. Hint two is needed on every board, and
      // hint three is the only one that paints anything.
      hints: [
        'Start with a 0 at the side or along the top. A tile with a square in that line stays plain, every square of it.',
        'When a line has as many painted squares as its number, its other tiles stay plain. They are plain in every line.',
        'Add up the squares in a line that are painted or could still be painted. If that comes to its number, paint them all.',
      ],
    },
    {
      id: 'six-across',
      label: 'Six across',
      difficulty: 2,
      par: 7,
      config: middle,
      // The first hint is true of every tile on every board: a domino puts two
      // squares into one line, a bent three two into a row and two into a
      // column, and a straight three three into one line. The second and third
      // are the two halves of the size step, and `bothHalves` deals only boards
      // that stall without either of them — without that gate, only 119 of 200
      // boards needed both.
      hints: [
        'A tile can put more than one square into a line. Painting the tile adds them all at once.',
        'A tile that would give a line more squares than the line still wants stays plain.',
        'If a line cannot reach its number without one tile, paint that tile.',
      ],
    },
    {
      id: 'seven-across',
      label: 'Seven across',
      difficulty: 3,
      par: 9,
      config: large,
      // The first hint rests on two gates: `noWayIn`, so there is no 0 and no
      // full line to start from instead, and `neededAtStart`, so on the empty
      // board some line has a tile with more squares in it than the line can
      // leave plain. With seven squares a line and tiles of at most three, that
      // line's number is 5 or 6. The hint carries that test rather than "a tile
      // the line cannot do without", because most lines numbered 5 or 6 have no
      // such tile: over the 60 test boards, 75 of 177 have one, and 53 boards
      // hold a 5 that has none. A child who reads the test off a line knows at
      // once whether that line has anything to give. The second and third are
      // the sums step, which every board needs. They speak of what the line
      // still *wants*, its number less its painted squares, because a fifth of
      // the lines that need the step already hold paint — and read as "make its
      // number" instead, they paint a wrong tile or break a line on 51 of 60
      // boards.
      hints: [
        'Start with a line that wants nearly every square. Paint any tile with more squares in that line than the line can leave plain.',
        'In one line, count what each tile that could still be painted adds. Find every way those tiles make up what the line still wants.',
        'Paint any tile that every one of those ways uses.',
      ],
    },
  ],
  reseedable: true,
  // A tile is wiped with one more tap, so there is deliberately no failure()
  // and no canStillWin(): no position this board can hold is a dead end, and
  // none of them breaks a rule either. A number in the margin says what the
  // finished board looks like rather than what a child may do on the way
  // there, so every square takes every tap and nothing is ever refused. Step
  // back and Start over sit in the toolbar throughout.
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
