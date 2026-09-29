import { shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The painted tiles.

   A grid cut into tiles of two and three squares, and a number
   at the end of every row and every column. Paint some of the
   tiles so that each number counts the painted squares in its
   line. A tile is painted all over or not at all — one tap takes
   the whole of it — so one tile can put two or three squares
   into a line in a single move, and that is the thing no other
   margin-number board in the collection asks a child to hold. It
   is Nikoli's Tilepaint, also sold as Tairupeinto.

   Everything here is pure and framework-free. Four things are
   worth reading twice.

   The state is one flag a *tile*, not one a square. `painted[t]`
   says whether tile t is painted, so "paint a tile all over, or
   leave it plain" is not a rule the board has to check: there is
   no way to write down a position that breaks it. Every tap flips
   exactly one tile and every tap changes something, so no square
   is ever a dead control, and no rule of this puzzle forbids a
   tap — a number in the margin says what the finished board has
   to look like, not what a child may do on the way there.

   `solveByLogic` paints a board the way a child would, with three
   steps — counting, the size of a tile, and the sums the tiles in
   a line can make — and it carries nothing from one pass to the
   next but the paint. Which of the three steps a board needs is
   the difficulty dial, and it separates the three levels on every
   seed. The solver only ever paints a tile that every answer
   paints, so a board it finishes has exactly one answer:
   uniqueness and "no guessing" are one check rather than two, and
   `countSolutions` is held against it in the tests.

   `cutTiles` cuts the grid into tiles of two and three squares and
   nothing else. A tile of one square is a square rather than a
   tile, and it makes every sum it is in trivial; tiles of four
   take away the sums step that the last level is built on.

   And what this board deliberately does not do: say a word about
   how a line is getting on. No clay on a line holding too many, no
   tick on a line that has come right, no tally. That was measured
   rather than assumed — see the note under `isSolved`.
   ============================================================ */

export interface TileConfig {
  /** Rows and columns both come in this many. */
  n: number
  /** Tiles the answer paints. It is the level's par, and `deal` pins it exactly. */
  painted: number
  /**
   * Tiles on the board, at least and at most, so every deal of a level weighs
   * the same. The cut lands inside these on its own most of the time; the
   * window only trims the tails.
   */
  minTiles: number
  maxTiles: number
  /**
   * The hardest step the level asks for. A board that an easier step finishes
   * is not dealt, and a board that this one cannot finish is not dealt either,
   * so the three levels are three different questions and not one question on
   * three sizes of grid.
   */
  step: Step
  /** Passes of `solveByLogic` that need that step, at least. */
  minPasses: number
  /** A 0 in the margin, which level one's first hint sends a child to. */
  zero: boolean
  /** No number is 0 and none equals n, so level three opens on neither. */
  noWayIn: boolean
  /** Level two: the board stalls without either half of the size step. */
  bothHalves: boolean
  /**
   * Level three: on the empty board, some line cannot reach its number without
   * one of its tiles. Level three's first hint sends a child to that line.
   */
  neededAtStart: boolean
}

export interface TileState {
  n: number
  /**
   * Row-major. Which tile each square belongs to. Never changes. Tiles are
   * numbered in reading order of their first square, so tile 0 holds the top
   * left square. That number is also the tile's letter (A, B, C...) and the
   * order the tiles are coloured in.
   */
  tiles: number[]
  /** Painted squares wanted in each row, and in each column. Never change. */
  rowClues: number[]
  colClues: number[]
  /** One flag a tile: true where the tile is painted. */
  painted: boolean[]
}

/** One tap on one square. It paints that square's whole tile, or wipes it. */
export type TileAction = { type: 'toggle'; cell: number }

/* --- reading the grid ---------------------------------------- */

export const rowOf = (n: number, index: number): number => Math.floor(index / n)
export const colOf = (n: number, index: number): number => index % n

export function rowCells(n: number, r: number): number[] {
  return Array.from({ length: n }, (_, c) => r * n + c)
}

export function colCells(n: number, c: number): number[] {
  return Array.from({ length: n }, (_, r) => r * n + c)
}

/** The squares that share an edge with this one. A tile grows along these. */
export function orthogonal(n: number, index: number): number[] {
  const r = rowOf(n, index)
  const c = colOf(n, index)
  const out: number[] = []
  if (r > 0) out.push(index - n)
  if (r < n - 1) out.push(index + n)
  if (c > 0) out.push(index - 1)
  if (c < n - 1) out.push(index + 1)
  return out
}

/**
 * The squares of each tile and each line's share of every tile, worked out
 * once for a board and kept against the array itself. A board is dealt once and
 * then never changes, so this is a cache with the same life as the board it
 * describes — and an array is only ever asked about with the `n` it was cut
 * for, which is why the size is not part of the key. The patchwork quilt keeps
 * its patches the same way.
 */
const cellCache = new WeakMap<number[], number[][]>()
const lineCache = new WeakMap<number[], Lines>()

/** The squares of each tile, in reading order, indexed by tile number. */
export function tileCells(tiles: number[]): number[][] {
  const hit = cellCache.get(tiles)
  if (hit) return hit
  const out: number[][] = []
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    while (out.length <= t) out.push([])
    out[t].push(i)
  }
  cellCache.set(tiles, out)
  return out
}

/** How many squares each tile has: two or three, on every board this deals. */
export function tileSizes(tiles: number[]): number[] {
  return tileCells(tiles).map((cells) => cells.length)
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * A letter for each tile. Tiles are numbered in reading order already, so the
 * tile holding the top left square is A, the next tile to start is B, and so
 * on.
 *
 * A looker sees the seams, and the seams say where a tile stops. A listener has
 * no seams, so without a name two squares on either side of one read out alike
 * — and which squares one tap takes is exactly what the seam says. `Board.tsx`
 * puts the letter in every square's label. A seven-across board holds at most
 * 19 tiles, so the letters never run past S.
 */
export function tileNames(tiles: number[]): string[] {
  return tileCells(tiles).map((_, t) => LETTERS[t % LETTERS.length])
}

/** How many squares a tile has, in words: "two", not "2". */
export function countWord(size: number): string {
  return ['no', 'one', 'two', 'three', 'four', 'five'][size] ?? String(size)
}

/** True where this square's tile is painted. */
export function isPainted(state: TileState, cell: number): boolean {
  return state.painted[state.tiles[cell]]
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<TileConfig>, rng: Rng): TileState {
  const { n } = level.config
  const { tiles, rowClues, colClues } = deal(rng, level.config)
  return { n, tiles, rowClues, colClues, painted: tileCells(tiles).map(() => false) }
}

/**
 * One tap, one tile, painted or wiped. Nothing here can be refused: a number in
 * the margin describes the finished board rather than forbidding a move, so
 * every square takes every tap, and every tap changes exactly one tile. The
 * guards are for actions that are not taps at all, and they hand back the very
 * same state.
 */
export function reduce(state: TileState, action: TileAction): TileState {
  if (action?.type !== 'toggle') return state
  const { cell } = action
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.tiles.length) return state
  const painted = state.painted.slice()
  painted[state.tiles[cell]] = !painted[state.tiles[cell]]
  return { ...state, painted }
}

/**
 * Every number counts the painted squares in its own line, and that is the
 * whole of it: the other rule — a tile is painted all over or not at all —
 * cannot be broken by a position this puzzle can hold.
 *
 * Nothing here reads the board it was dealt, so a position rewound through the
 * move tape is judged exactly as one played forward is. Every board dealt has
 * exactly one answer, so the only position this says yes to is that answer.
 *
 * ---
 *
 * And here is why the board says nothing while a child plays: the numbers
 * describe the finished board, and are never checked on the way there. The
 * thermometers made the same choice for the same reason, and it was measured
 * again here, because a tile is not a square and the answer could have come out
 * the other way. `logic.test.ts` holds these numbers.
 *
 * An over-count cue — a line drawn in clay the moment it holds more than its
 * number — does level one for the child. Tap each tile once on an empty
 * five-across board and read the cue, and over sixty boards it names 206 of
 * the 274 plain tiles. A player who never counts, who paints every tile the cue
 * lets stand in a random order and never goes back, lands the answer in par on
 * 41 of those 60. A tick on a line that has come right is no better: the
 * thermometers' climber wins 57 of the 60 off the one and 58 off the other.
 * Against the board as it ships, which answers a tap with the paint and nothing
 * else, a blind tapper wins 14 of the 60 inside fifty taps a move of par, and
 * never in par — its fastest took 13 taps against a par of 5. That is what 512
 * to 1,024 positions come to, and it is fewer than the 22 in 60 the same tapper
 * wins against the nine lamps of lights out.
 */
export function isSolved(state: TileState): boolean {
  // Every line counted in one pass over the squares rather than line by line:
  // the breadth-first searches in the tests ask this of every position they
  // reach, thousands of them a board.
  const { rowClues, colClues } = cluesOf(state.n, state.tiles, state.painted)
  for (let k = 0; k < state.n; k++) {
    if (rowClues[k] !== state.rowClues[k] || colClues[k] !== state.colClues[k]) return false
  }
  return true
}

/**
 * A tap does one of two things, and the move tape says which. It names the
 * square that was tapped rather than the tile, because the square is what a
 * child pressed; the square's own label in `Board.tsx` names the tile.
 */
export function describeMove(prev: TileState, _next: TileState, action: TileAction): string {
  const where = `row ${rowOf(prev.n, action.cell) + 1}, column ${colOf(prev.n, action.cell) + 1}`
  return isPainted(prev, action.cell)
    ? `Wiped the paint off the tile at ${where}`
    : `Painted the tile at ${where}`
}

/** One tap a tile, on its first square. Used by the tests to check `par`. */
export function legalMoves(state: TileState): TileAction[] {
  return tileCells(state.tiles).map((cells) => ({ type: 'toggle', cell: cells[0] }) as TileAction)
}

/* ============================================================
   par

   A level's par is the number of tiles the answer paints, and
   both halves of the claim are proved in logic.test.ts rather
   than asserted.

   The floor. A board starts with no tile painted, and `reduce`
   changes exactly one tile a move. Every board dealt has exactly
   one answer, so the only solved position is that answer, and it
   differs from the start in exactly `painted` tiles. No solution
   is shorter than `painted` moves.

   The ceiling. Tapping any square of each tile the answer paints,
   once and in any order, lands on the answer in exactly `painted`
   moves: a tap flips its own tile and nothing else, so no tile
   ever has to be tapped twice.

   And the search. At five and six across the whole graph is
   walked: every set of tiles is a position a child can reach, so
   there are 2^tiles of them — 512 to 1,024 at five across and
   8,192 to 16,384 at six. Seven across has 17 to 19 tiles, which
   is past the breadth-first search's 200,000-position cap from 18
   tiles up, so there the positions holding a line over its number
   are pruned. That hides no shortest path. A path of `painted`
   moves flips each answer tile once and nothing else, so every
   position along it is part of the answer, and no line along it
   is ever over its number. And a path in the pruned graph is a
   path in the whole one, so it cannot come in under the floor.
   The counting squares prove their par the same way.
   ============================================================ */

/* ============================================================
   Reasoning a board out

   Three steps, each one a sentence a child can say out loud. A
   pass tries them in order and takes the first one that finds a
   tile to paint, so a pass counts against the easiest step that
   would do and never against a harder one.

   Count. A line that already has its number keeps every other
   tile in it plain — and a plain tile is plain all over, in
   every line it crosses. A 0 is the first case of this. A line
   whose painted squares and still-paintable squares come to
   exactly its number gets all of them painted.

   Size, only once counting has run dry. A tile that would put
   more squares into a line than the line still wants stays plain
   (too big). A line that cannot reach its number without one
   tile gets that tile painted (needed).

   Sums, only once both of those have run dry. Count what each
   tile that could still be painted adds to a line, find every
   way those tiles make up what the line still wants, and paint a
   tile that every way uses.

   The only thing carried from one pass to the next is the paint.
   Every "stays plain" is read fresh off the paint and the numbers,
   because nothing on this board marks a plain tile: a child reads
   it again off the line that proves it, and a solver that
   remembered it would finish boards a child could not. That
   re-reading is real work, and it is not hidden. On many passes
   the only way forward is a tile made plain by a *different* line
   from the one being counted — 317 of 402 passes over 200
   five-across boards, and about half of them at six and seven
   across (283 of 607, and 432 of 871) — and on paper a solver
   would put a dot in that tile.
   Here a child counts the crossing line against its number again,
   and level one exists to teach exactly that: its first two hints
   say that a tile stays plain all over.

   The sums step never works out which tiles no way uses, for the
   same reason: that fact would have to be carried to another
   line, and there is nowhere on the board to carry it. A board
   that needs it is exactly a board this solver cannot finish, and
   `deal` turns it down — 65 of the 360 seven-across draws that
   needed the sums step at all.

   A plain mark is not added to make any of this lighter. It would
   be a second kind of tap, and a counted move that par would have
   to price. The thermometers carry the same load: their empty
   squares are never drawn either.
   ============================================================ */

export type Step = 'count' | 'size' | 'sums'
/** The size step's two halves, which level two is dealt to need both of. */
export type Half = 'tooBig' | 'needed'

const RUNGS: readonly Step[] = ['count', 'size', 'sums']

/** The steps a level is reasoned out with. */
export const STEPS: Record<Step, readonly Step[]> = {
  count: ['count'],
  size: ['count', 'size'],
  sums: ['count', 'size', 'sums'],
}

/** The steps of the level below. A board that these finish is that level's board. */
export const EASIER: Record<Step, readonly Step[] | null> = {
  count: null,
  size: ['count'],
  sums: ['count', 'size'],
}

export interface Reasoned {
  /** The one answer: true where a tile is painted. */
  painted: boolean[]
  /** Passes that painted something. */
  passes: number
  /** Passes that needed each step: the step that found the pass's paint. */
  count: number
  size: number
  sums: number
}

/**
 * Every row and every column as one line: the rows are lines 0 to n - 1 and the
 * columns lines n to 2n - 1.
 */
interface Lines {
  /** `weight[t][line]`: how many of tile t's squares lie in the line. */
  weight: number[][]
  /** The tiles with a square in each line, in tile order. */
  crossing: number[][]
}

function linesOf(n: number, tiles: number[]): Lines {
  const hit = lineCache.get(tiles)
  if (hit) return hit
  const cells = tileCells(tiles)
  const weight = cells.map(() => new Array<number>(2 * n).fill(0))
  cells.forEach((squares, t) => {
    for (const cell of squares) {
      weight[t][rowOf(n, cell)]++
      weight[t][n + colOf(n, cell)]++
    }
  })
  const crossing = Array.from({ length: 2 * n }, (_, line) =>
    cells.map((_, t) => t).filter((t) => weight[t][line] > 0),
  )
  const lines = { weight, crossing }
  lineCache.set(tiles, lines)
  return lines
}

/**
 * Paint a board the way a child would, with the steps it is handed, and stop
 * the moment it would have to guess. Null when it stops short, or when the
 * numbers contradict each other.
 *
 * Every tile it paints is in every answer, and every "plain" it uses is true in
 * every answer that agrees with the paint so far. So when it finishes, any other
 * answer would hold every tile it painted and at least one more, which would
 * push some line over its number: a board this finishes has exactly one answer.
 *
 * `halves` switches off one half of the size step, which is how `fits` checks
 * that level two needs both.
 */
export function solveByLogic(
  n: number,
  tiles: number[],
  rowClues: number[],
  colClues: number[],
  steps: readonly Step[],
  halves: readonly Half[] = ['tooBig', 'needed'],
): Reasoned | null {
  const { weight, crossing } = linesOf(n, tiles)
  const clues = [...rowClues, ...colClues]
  const count = weight.length
  const lines = 2 * n
  const painted = new Array<boolean>(count).fill(false)
  const result: Reasoned = { painted, passes: 0, count: 0, size: 0, sums: 0 }
  const rungs = RUNGS.filter((rung) => steps.includes(rung))
  const tooBig = halves.includes('tooBig')
  const needed = halves.includes('needed')

  for (;;) {
    // What each line still wants, read off the paint and nothing else.
    const want = new Array<number>(lines)
    for (let line = 0; line < lines; line++) {
      let has = 0
      for (const t of crossing[line]) if (painted[t]) has += weight[t][line]
      want[line] = clues[line] - has
      if (want[line] < 0) return null
    }

    let paint: Set<number> | null = null
    let used: Step | null = null
    for (const rung of rungs) {
      const sized = rung !== 'count'

      // Plain, read fresh: a tile in a finished line, and from the size step up,
      // a tile too big for what one of its lines still wants. Plain is plain all
      // over, so one line that says so is enough.
      const plain = new Array<boolean>(count).fill(false)
      for (let t = 0; t < count; t++) {
        if (painted[t]) continue
        for (let line = 0; line < lines && !plain[t]; line++) {
          const k = weight[t][line]
          if (k > 0 && (want[line] === 0 || (sized && tooBig && k > want[line]))) plain[t] = true
        }
      }

      const found = new Set<number>()
      for (let line = 0; line < lines; line++) {
        const open = crossing[line].filter((t) => !painted[t] && !plain[t])
        const adds = open.map((t) => weight[t][line])
        const room = adds.reduce((sum, k) => sum + k, 0)
        if (want[line] > room) return null
        if (open.length === 0 || want[line] === 0) continue
        // Just enough room: every tile that could still be painted is.
        if (want[line] === room) for (const t of open) found.add(t)
        // A tile the line cannot reach its number without.
        if (sized && needed) {
          open.forEach((t, j) => {
            if (room - adds[j] < want[line]) found.add(t)
          })
        }
        // Every way the open tiles make up what the line still wants. A line holds
        // at most seven open tiles, so that is at most 127 ways to try.
        if (rung === 'sums') {
          let everyWay = (1 << open.length) - 1
          let ways = 0
          for (let mask = 1; mask < 1 << open.length; mask++) {
            let sum = 0
            for (let j = 0; j < open.length; j++) if (mask & (1 << j)) sum += adds[j]
            if (sum !== want[line]) continue
            ways++
            everyWay &= mask
          }
          if (ways === 0) return null
          open.forEach((t, j) => {
            if (everyWay & (1 << j)) found.add(t)
          })
        }
      }
      if (found.size > 0) {
        paint = found
        used = rung
        break
      }
    }

    if (paint === null || used === null) break
    for (const t of paint) painted[t] = true
    result.passes++
    result[used]++
  }

  // The reasoning is sound, so what it lands on is the answer — checked here
  // rather than trusted, because everything downstream rests on it.
  const found = cluesOf(n, tiles, painted)
  if (found.rowClues.join() !== rowClues.join()) return null
  if (found.colClues.join() !== colClues.join()) return null
  return result
}

/**
 * On the empty board, with nothing yet known to be plain: a line that cannot
 * reach its number without one of its tiles. The line's room is all n of its
 * squares, so the tile is one whose squares in the line are more than the line
 * can spare. With seven across and tiles of at most three squares, that line's
 * number is 5 or 6: "a line that wants nearly every square".
 */
export function neededAtStart(
  n: number,
  tiles: number[],
  rowClues: number[],
  colClues: number[],
): boolean {
  const { weight, crossing } = linesOf(n, tiles)
  const clues = [...rowClues, ...colClues]
  return crossing.some((ts, line) => ts.some((t) => n - weight[t][line] < clues[line]))
}

/* ============================================================
   Counting the answers

   The independent check on the solver's claim. It decides one
   tile at a time, in number order, and drops a branch the moment
   a line holds more than its number or can no longer reach it.
   ============================================================ */

export function countSolutions(
  n: number,
  tiles: number[],
  rowClues: number[],
  colClues: number[],
  cap = 2,
): number {
  const { weight } = linesOf(n, tiles)
  const clues = [...rowClues, ...colClues]
  const count = weight.length
  const lines = 2 * n
  const has = new Array<number>(lines).fill(0)
  /** The most the tiles from `t` on could still add to each line. */
  const rest = Array.from({ length: count + 1 }, () => new Array<number>(lines).fill(0))
  for (let t = count - 1; t >= 0; t--) {
    for (let line = 0; line < lines; line++) rest[t][line] = rest[t + 1][line] + weight[t][line]
  }

  let found = 0
  const walk = (t: number): void => {
    if (found >= cap) return
    if (t === count) {
      found++
      return
    }
    for (const on of [false, true]) {
      if (on) for (let line = 0; line < lines; line++) has[line] += weight[t][line]
      let fits = true
      for (let line = 0; line < lines && fits; line++) {
        if (has[line] > clues[line] || has[line] + rest[t + 1][line] < clues[line]) fits = false
      }
      if (fits) walk(t + 1)
      if (on) for (let line = 0; line < lines; line++) has[line] -= weight[t][line]
      if (found >= cap) return
    }
  }
  walk(0)
  return found
}

/* ============================================================
   Cutting the tiles

   The patchwork quilt's cutter, with the numbers taken out: take
   the first free square in reading order, offer every tile of two
   or three squares that could hold it, and back out of any cut
   that leaves a free square on its own. Starting from the first
   free square every time is what makes every tiling reachable
   exactly once, and it is also what numbers the tiles in reading
   order.

   Two and three squares, and nothing else. Measured over 300
   draws at each size with half the tiles painted: tiles of one
   square are what the garden cats' grower leaves on 92% of
   seven-across boards, and they hand out 1s that make every sum
   trivial. Tiles of four all but remove the sums step — the
   2-3-4, 3-4 and 2-3-4-5 mixes needed it on 0 of 300 seven-across
   draws each, against 3.7% for twos and threes — so level three
   could not be dealt at all.
   ============================================================ */

export const SMALLEST_TILE = 2
export const BIGGEST_TILE = 3

/** Every connected set of free squares that contains `index`, sized min..max. */
export function shapesAt(
  n: number,
  free: boolean[],
  index: number,
  minSize: number,
  maxSize: number,
): number[][] {
  const out: number[][] = []
  const cells = [index]
  const inside = new Set([index])

  /**
   * Each square added is barred from the branches beside it, so a set of
   * squares is built exactly once however many orders would reach it.
   */
  const grow = (candidates: number[], from: number) => {
    if (cells.length >= minSize) out.push(cells.slice())
    if (cells.length === maxSize) return
    const barred = new Set<number>()
    for (let k = from; k < candidates.length; k++) {
      const c = candidates[k]
      if (inside.has(c) || barred.has(c)) continue
      cells.push(c)
      inside.add(c)
      const extra = candidates.slice()
      for (const nb of orthogonal(n, c)) {
        if (free[nb] && !inside.has(nb) && !extra.includes(nb) && !barred.has(nb)) extra.push(nb)
      }
      grow(extra, k + 1)
      cells.pop()
      inside.delete(c)
      barred.add(c)
    }
  }

  grow(orthogonal(n, index).filter((c) => free[c]), 0)
  return out
}

/** True when some island of free squares is too small to be a tile. */
function stranded(n: number, free: boolean[], minSize: number): boolean {
  const seen = new Array<boolean>(free.length).fill(false)
  for (let i = 0; i < free.length; i++) {
    if (!free[i] || seen[i]) continue
    let size = 0
    const stack = [i]
    seen[i] = true
    while (stack.length > 0) {
      const c = stack.pop() as number
      size++
      for (const nb of orthogonal(n, c)) {
        if (free[nb] && !seen[nb]) {
          seen[nb] = true
          stack.push(nb)
        }
      }
    }
    if (size < minSize) return true
  }
  return false
}

/** True when every square of a shape lies in one row, or in one column. */
const inOneLine = (n: number, cells: number[]) =>
  new Set(cells.map((c) => rowOf(n, c))).size === 1 ||
  new Set(cells.map((c) => colOf(n, c))).size === 1

/**
 * The weight of a shape that lies in one line — every domino, and a straight
 * three — against a bent three at 1. A shape's key is `rng()` over its weight,
 * one draw a shape in `shapesAt` order, and the shapes are tried in key order.
 * Two uniform draws, one of them doubled, put the halved shape behind the other
 * three times in four, so shape against shape it goes to the back three times
 * as often as a bent three does.
 *
 * Both flat shapes are halved, and for one reason: so that the bent three is
 * tried first. It puts two squares into a row and two into a column, which is
 * the tile that makes a line's sum worth doing. A domino fits everywhere a three
 * does, and into gaps a three cannot, so it stays common even halved; a straight
 * three is the only shape that puts three squares into one line, so it stays,
 * but rarer. Measured on 600 dealt boards a level, the tiles come out as
 * dominoes 40%, 31% and 27%, bent threes 42%, 56% and 57%, and straight threes
 * 18%, 13% and 16% at five, six and seven across.
 */
const IN_ONE_LINE = 0.5

/** How many cuts one attempt may make before it is abandoned. */
const CUT_BUDGET = 400

/**
 * One attempt at a tiling, or null when it spends its budget. Every tile is two
 * or three squares, numbered in reading order of its first square.
 */
export function cutOnce(rng: Rng, n: number, budget = CUT_BUDGET): number[] | null {
  const tiles = new Array<number>(n * n).fill(-1)
  const free = new Array<boolean>(n * n).fill(true)
  let next = 0
  let cuts = 0

  const cut = (): boolean => {
    if (cuts++ > budget) return false
    const first = free.indexOf(true)
    if (first === -1) return true
    const options = shapesAt(n, free, first, SMALLEST_TILE, BIGGEST_TILE)
      .map((cells) => ({ cells, key: rng() / (inOneLine(n, cells) ? IN_ONE_LINE : 1) }))
      .sort((a, b) => a.key - b.key)
    for (const { cells } of options) {
      for (const c of cells) free[c] = false
      if (!stranded(n, free, SMALLEST_TILE)) {
        for (const c of cells) tiles[c] = next
        next++
        if (cut()) return true
        next--
        for (const c of cells) tiles[c] = -1
      }
      for (const c of cells) free[c] = true
    }
    return false
  }

  return cut() ? tiles : null
}

/**
 * A tiling, however many attempts it takes.
 *
 * An attempt gives up after `CUT_BUDGET` cuts so that a bad start is thrown away
 * rather than backtracked out of. None does in practice: 9,000 cuts, 3,000 at
 * each size, never reached the budget, and the slowest took 1.8ms. So this
 * wrapper never changes how the random numbers are drawn. The last attempt is
 * made without a budget, which makes it an exhaustive search — every grid from
 * two across up can be cut into twos and threes, so it cannot come back empty.
 */
export function cutTiles(rng: Rng, n: number): number[] {
  for (let tries = 0; tries < 20; tries++) {
    const tiles = cutOnce(rng, n)
    if (tiles !== null) return tiles
  }
  const last = cutOnce(rng, n, Number.POSITIVE_INFINITY)
  // The line above searched the whole tree, so an empty answer here would mean
  // this grid has no tiling at all. Say so rather than casting the null away.
  if (last === null) throw new Error(`No tiling fits a ${n} by ${n} grid.`)
  return last
}

/* ============================================================
   Making a board

   Backwards, from a finished one: cut the tiles, paint some of
   them, and read the numbers off. Nothing here can produce a
   board with no answer, because the answer was drawn first — and
   every board is then held against `solveByLogic`, so it has
   exactly one.
   ============================================================ */

/** What the numbers down the side and along the top say about this painting. */
export function cluesOf(
  n: number,
  tiles: number[],
  painted: boolean[],
): { rowClues: number[]; colClues: number[] } {
  const rowClues = new Array<number>(n).fill(0)
  const colClues = new Array<number>(n).fill(0)
  tiles.forEach((t, cell) => {
    if (!painted[t]) return
    rowClues[rowOf(n, cell)]++
    colClues[colOf(n, cell)]++
  })
  return { rowClues, colClues }
}

export interface Deal {
  tiles: number[]
  rowClues: number[]
  colClues: number[]
  /** The one answer, kept for the tests. Nothing the player sees reads it. */
  answer: boolean[]
}

/** One candidate board: a tiling, and paint on exactly `painted` of its tiles. */
export function draw(rng: Rng, config: TileConfig): Deal | null {
  const { n, painted } = config
  const tiles = cutTiles(rng, n)
  const count = tileCells(tiles).length
  if (count < painted) return null
  const answer = new Array<boolean>(count).fill(false)
  const chosen = shuffled(
    rng,
    Array.from({ length: count }, (_, t) => t),
  ).slice(0, painted)
  for (const t of chosen) answer[t] = true
  return { tiles, answer, ...cluesOf(n, tiles, answer) }
}

/**
 * Reasoned out by the level's own steps, painting exactly `painted` tiles, and
 * landing on the drawn answer. The last check is made rather than trusted, as
 * the thermometers make it, because everything downstream — the answer in the
 * tests, par, the one-answer promise — rests on it.
 */
export function reasoned(config: TileConfig, d: Deal): Reasoned | null {
  const found = solveByLogic(config.n, d.tiles, d.rowClues, d.colClues, STEPS[config.step])
  if (found === null) return null
  if (found.painted.filter(Boolean).length !== config.painted) return null
  return found.painted.join() === d.answer.join() ? found : null
}

/**
 * True when this is the board the level asked for. The cheap gates go first,
 * and the solver runs only on a board that has passed them.
 *
 * The step gate is the dial, and it separates the levels on every seed: over
 * 600 seeds a level, counting alone finishes every five-across board and no
 * six- or seven-across board, and counting with sizes finishes every six-across
 * board and no seven-across board. The other gates hold the promises the hints
 * make — see `index.ts`, level by level.
 */
export function fits(config: TileConfig, d: Deal): boolean {
  const { n } = config
  const count = tileCells(d.tiles).length
  if (count < config.minTiles || count > config.maxTiles) return false
  const clues = [...d.rowClues, ...d.colClues]
  if (config.zero && !clues.includes(0)) return false
  if (config.noWayIn && clues.some((clue) => clue === 0 || clue === n)) return false
  if (config.neededAtStart && !neededAtStart(n, d.tiles, d.rowClues, d.colClues)) return false
  const found = reasoned(config, d)
  if (found === null) return false
  const easier = EASIER[config.step]
  if (easier !== null && solveByLogic(n, d.tiles, d.rowClues, d.colClues, easier) !== null) {
    return false
  }
  if (found[config.step] < config.minPasses) return false
  if (config.bothHalves) {
    const steps = STEPS[config.step]
    if (solveByLogic(n, d.tiles, d.rowClues, d.colClues, steps, ['needed']) !== null) return false
    if (solveByLogic(n, d.tiles, d.rowClues, d.colClues, steps, ['tooBig']) !== null) return false
  }
  return true
}

/**
 * How many boards `deal` looks at before it settles for less.
 *
 * Measured over 4,000 independent draws a level, a draw fits five across 7.80%
 * of the time, six across 2.93% and seven across 2.15%. So the chance that a
 * thousand draws all miss is at most 10^-35.3, 10^-12.9 and 10^-9.4 a deal, and
 * the most draws any of 600 seeds a level needed was 355. At the thermometers'
 * 600 the seven-across chance would be 10^-5.7, which is why this puzzle takes
 * a thousand. Running all thousand, which is the longest a child could ever
 * wait, took at most 273ms.
 */
export const ATTEMPTS = 1000

/**
 * A board for this level.
 *
 * Every board here has an answer by construction, so the loop is only ever
 * choosing between boards that work: the first one that suits the level wins.
 *
 * The fallback gives up the level's difficulty band and the hints' promises,
 * and nothing else. It has to pass `reasoned`, so the level's own steps finish
 * it and land on the drawn answer: it still has exactly one answer, it is still
 * reached without a guess, and that answer still paints exactly `painted`
 * tiles, so par holds — because a board short of any of those three is not a
 * board this puzzle can hand a child. No real seed has ever reached it: 0 of
 * 1,800 deals fell back. `attempts` is there so that a test can force it in
 * thirty draws, and `deal` throws rather than ship a board that cannot be
 * trusted.
 */
export function deal(rng: Rng, config: TileConfig, attempts = ATTEMPTS): Deal {
  let fallback: Deal | null = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    const board = draw(rng, config)
    if (board === null) continue
    const count = tileCells(board.tiles).length
    if (count < config.minTiles || count > config.maxTiles) continue
    if (fits(config, board)) return board
    if (fallback === null && reasoned(config, board) !== null) fallback = board
  }

  if (fallback === null) {
    throw new Error(
      `no ${config.n} by ${config.n} board came out with one answer and par ${config.painted}`,
    )
  }
  return fallback
}

/* ============================================================
   The board on the card

   The picture in the collection is a real three-across board of
   this puzzle's own, so it lives here in the puzzle's own terms
   rather than as a drawing that happens to look like one:
   `glyphs.tsx` draws exactly this, and `logic.test.ts` holds the
   parts of it together. The numerals round the edge really are
   the numbers this paint makes, and this paint is the one answer
   those numbers have.

       a B B    2
       a c c    0
       D D c    2
       1 2 1

   The middle row is 0, so tile a and the bent tile c stay plain —
   all of c, its square in the bottom row too, which is the rule
   this puzzle teaches first. Then the top row has only B left for
   its 2, and the bottom row only D. Counting finishes it in one
   pass. Every tile is a domino or a bent three, and both painted
   tiles lie flat, across: two bars of paint, where the
   thermometers' card has three upright tubes.
   ============================================================ */
export const CARD = {
  n: 3,
  tiles: [0, 1, 1, 0, 2, 2, 3, 3, 2],
  /** B, flat along the top, and D, flat along the bottom. */
  painted: [false, true, false, true],
  /** Read off that answer: rows down the side, columns along the top. */
  rowClues: [2, 0, 2],
  colClues: [1, 2, 1],
}
