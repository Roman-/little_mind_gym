import { randInt, shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The counting squares.

   Some squares carry a number. The number says how many of the
   nine squares round it — its own square included — get filled
   in, and a number at an edge or in a corner counts fewer,
   because there are fewer squares to count. It is the puzzle
   sold as Fill-a-Pix, Mosaic and Nurie-Puzzle.

   Everything here is pure and framework-free. Four things are
   worth reading twice.

   `block(n, index)` is the whole board in one list: a number's
   own square and the eight round it, clipped at the edges. It is
   `space(n, index)` from the garden cats with the cells in
   reading order, and every rule below is a count over one of
   these blocks. Because a block is symmetric — `index` is in
   `block(c)` exactly when `c` is in `block(index)` — the numbers
   a square could break are the numbers printed inside its own
   block, which is what `clashOf` walks.

   `solveByLogic` fills a board using only the two steps an
   eight-year-old can make — counting round one number, and
   holding two numbers side by side against each other — counts
   the passes it takes, and says whether the second step was
   needed at all. That it reaches no further than a neighbour is
   a deliberate weakness. Two numbers a column apart share
   squares as well, and the same argument runs over them, but the
   hints under the board send a child to a pair side by side: a
   solver stronger than those words would sign off boards those
   words cannot open. The pass count is the difficulty dial,
   measured on the board rather than guessed at, and the three
   levels' windows do not overlap, so a board from a later level
   always takes more passes than one from an earlier. Because the
   solver only ever writes a square the numbers leave one answer
   for, a board it finishes has exactly one answer — so
   uniqueness and "no guessing" are one check here rather than
   two. `countSolutions` is held against it in the tests to keep
   that claim honest.

   `paint` and `digTo` make a board backwards. Paint a blotchy
   answer first, print the number every square would carry, then
   rub numbers out for as long as the two steps can still finish
   the board. Nothing here can produce a board with no answer,
   because the answer was drawn first.

   And what this board deliberately does not have: the paper
   game's second mark, the dot or cross on a square you have
   worked out is empty. See the note on `par` below — it is the
   one real decision in this file.
   ============================================================ */

export interface MosaicConfig {
  /** Rows and columns. */
  n: number
  /**
   * How many squares the answer fills in. Fixed for the level, so `par` cannot
   * wobble from one deal to the next — the same bargain `lights-out` makes with
   * `needsExactly` and the small square makes with `clues`.
   */
  filled: number
  /**
   * How many numbers are printed on the board. Fixed for the level, so a deal
   * is the same weight of board every time — and the dial that decides how much
   * of the two steps a child has to do, since a number printed back can only
   * make a board easier.
   */
  clues: number
  /**
   * Passes over the two steps in `solveByLogic`, at least and at most. Counted
   * on the dealt board, never guessed, and doing two jobs: the window holds a
   * level steady from one deal to the next, and the three windows are disjoint
   * — 4 to 6, 7 to 9, 10 to 12 — so a board from a later level always takes
   * more passes than a board from an earlier one, whichever way either deal
   * falls. It is the one difficulty dial here apart from the size of the grid.
   */
  minRounds: number
  maxRounds: number
  /**
   * How much of the second step — comparing two numbers side by side — the
   * level wants. `never` keeps a level to plain counting round one number at a
   * time; `needed` will not deal a board that plain counting finishes.
   */
  overlap: 'never' | 'allowed' | 'needed'
  /**
   * True where the board must keep a printed 0.
   *
   * A 0 settles its whole block before a single square is filled in, which is
   * the way in to a board where nothing is on the grid yet, and the first hint
   * of the first level sends a child to one. `digTo` holds a 0 back from the
   * rubbing out so that every deal of such a level has one, and the tests hold
   * each level's hints to the same promise.
   */
  zero: boolean
}

export interface MosaicState {
  n: number
  /** Row-major. The number printed on a square, or -1 where nothing is. Never changes. */
  clues: number[]
  /** Row-major. True where the player has filled the square in. */
  filled: boolean[]
}

/** One tap: a square is filled in, or a filled square is emptied again. */
export type MosaicAction = { type: 'toggle'; index: number }

/* --- reading the grid ---------------------------------------- */

export const rowOf = (n: number, index: number): number => Math.floor(index / n)
export const colOf = (n: number, index: number): number => index % n

/**
 * The squares a number counts: its own, and the eight round it, clipped at the
 * edges — so nine in the middle, six along an edge and four in a corner. In
 * reading order, which is the order `clashOf` reports a broken number in.
 */
export function block(n: number, index: number): number[] {
  const r = rowOf(n, index)
  const c = colOf(n, index)
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc)
    }
  }
  return out
}

/**
 * Every square's block, worked out once a grid size. The blocks depend on
 * nothing but `n`, and this app deals three sizes, so the table is three
 * entries long and lives as long as the module.
 */
const blockCache = new Map<number, number[][]>()

export function blocks(n: number): number[][] {
  const hit = blockCache.get(n)
  if (hit) return hit
  const out = Array.from({ length: n * n }, (_, i) => block(n, i))
  blockCache.set(n, out)
  return out
}

/**
 * The squares that carry a number. Kept against the array itself: a board is
 * dealt once and its numbers never change, so this is a cache with the same
 * life as the board it describes.
 */
const clueCache = new WeakMap<number[], number[]>()

export function clueCells(clues: number[]): number[] {
  const hit = clueCache.get(clues)
  if (hit) return hit
  const out: number[] = []
  for (let i = 0; i < clues.length; i++) if (clues[i] >= 0) out.push(i)
  clueCache.set(clues, out)
  return out
}

/** How many of these squares are filled in. */
export function countIn(filled: readonly boolean[], cells: readonly number[]): number {
  let sum = 0
  for (const i of cells) if (filled[i]) sum++
  return sum
}

/** How many squares are filled in altogether. */
export function filledCount(state: MosaicState): number {
  let sum = 0
  for (const on of state.filled) if (on) sum++
  return sum
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<MosaicConfig>, rng: Rng): MosaicState {
  const { n } = level.config
  return { n, clues: deal(rng, level.config), filled: new Array<boolean>(n * n).fill(false) }
}

export function reduce(state: MosaicState, action: MosaicAction): MosaicState {
  if (action?.type !== 'toggle') return state
  const { index } = action
  if (!Number.isInteger(index) || index < 0 || index >= state.filled.length) return state
  const filled = state.filled.slice()
  filled[index] = !filled[index]
  return { ...state, filled }
}

/**
 * Every number on the board counts exactly what it says.
 *
 * That is the whole test, and it is enough. Every square on a board this
 * puzzle deals is inside some number's block — a square inside none of them
 * could never be worked out, so `solveByLogic` would not have finished the
 * board and `deal` would not have handed it over — and every board dealt has
 * exactly one answer. So a corner nobody has started on leaves a number short,
 * and a board where no number is short is the answer rather than a board that
 * merely looks tidy.
 */
export function isSolved(state: MosaicState): boolean {
  const bs = blocks(state.n)
  const cells = clueCells(state.clues)
  if (cells.length === 0) return false
  return cells.every((c) => countIn(state.filled, bs[c]) === state.clues[c])
}

/**
 * The numbers that have more squares filled in round them than they count.
 * Drawn in clay on the number itself, and never on the squares: which of them
 * is the wrong one is the child's to work out, and the number is the thing
 * that is telling them something is wrong.
 *
 * A number short of its count is not flagged. It is a board that is not
 * finished yet, which is every board before the last tap.
 */
export function conflicts(state: MosaicState): boolean[] {
  const bs = blocks(state.n)
  return state.clues.map((v, i) => v >= 0 && countIn(state.filled, bs[i]) > v)
}

/** One number, and the squares it counts. */
export interface Clash {
  /** The square the number is printed on. It is the one the cue points at. */
  clue: number
  /** The number printed there. */
  value: number
  /**
   * Every square it counts, so the board can light the whole block.
   *
   * The square just filled in is one of these and is deliberately not singled
   * out. The garden cats can name the two cats at fault because a cat clashes
   * with one other cat; a number over its count clashes with nothing — it has
   * one filled square too many among however many it counts, and any of them
   * could be the one to take back off. Which one is the child's to work out,
   * so the cue lights the block and shakes the number, and says nothing about
   * the squares.
   */
  cells: number[]
}

/**
 * The number that filling `index` in would push over its count, or null when
 * the square takes it.
 *
 * A square can push two numbers over at once and only the first is reported:
 * two blocks lit together say nothing about either. The order is reading
 * order, so the number reported is the topmost and leftmost of them.
 *
 * Emptying a square never breaks anything, so this only ever answers about a
 * square that is empty now.
 */
export function clashOf(state: MosaicState, index: number): Clash | null {
  if (!Number.isInteger(index) || index < 0 || index >= state.filled.length) return null
  if (state.filled[index]) return null
  const bs = blocks(state.n)
  for (const c of bs[index]) {
    const value = state.clues[c]
    if (value < 0) continue
    if (countIn(state.filled, bs[c]) + 1 > value) {
      return { clue: c, value, cells: bs[c] }
    }
  }
  return null
}

/** How many squares, in words: "two", not "2". */
export function countWord(many: number): string {
  return ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][many] ?? String(many)
}

/** The broken number in one sentence. The lit block says where; this says what. */
export function describeClash(clash: Clash): string {
  if (clash.value === 0) return 'A 0 means none of the squares round it get filled in.'
  if (clash.value === 1) return 'This 1 already has one square filled in.'
  return `This ${clash.value} already has ${countWord(clash.value)} squares filled in.`
}

export function describeMove(prev: MosaicState, _next: MosaicState, action: MosaicAction): string {
  const where = `row ${rowOf(prev.n, action.index) + 1}, column ${colOf(prev.n, action.index) + 1}`
  return prev.filled[action.index] ? `Emptied ${where}` : `Filled in ${where}`
}

/** Every action that would change something. Used by the tests to check `par`. */
export function legalMoves(state: MosaicState): MosaicAction[] {
  return state.filled.map((_, index) => ({ type: 'toggle', index }) as MosaicAction)
}

/* ============================================================
   par

   A level's par is the number of squares its answer fills in.
   Nothing else on this board costs a move.

   ---- The decision behind that number

   The paper game is played with two marks and not one. A square
   you have worked out is filled gets shaded; a square you have
   worked out is empty gets a dot or a cross. Both are taps, and
   the shell counts one dispatched action as one move, so a board
   marked all over would report 25, 36 or 49 moves — the whole
   grid, whoever played it and however well they played it. That
   is the annotation-counted-as-par that keeps nonograms out of
   this collection, and it would be worse here, because the light
   mark would be compulsory purely so that a number existed to
   report.

   This board answers it the way the garden cats answer the same
   question about pencil crosses: the light mark is not here at
   all. A square is filled in or it is empty, one tap turns it
   over either way, and par is the number of squares the answer
   fills in — 9, 14 and 24 on the three levels, so the last of
   them sits with the small square's 22 and the patchwork quilt's
   29 rather than above them.

   ---- What that gives up

   The crossing-off has to be held in a head. On paper you cross
   a square off and it stays crossed off; here you either fill
   the square in or you remember. So the levels are sized for a
   head: five, six and seven squares across, and a round count
   `deal` measures rather than guesses, so that no board asks for
   more scanning than that.

   Two things soften it, and neither costs a move. A number whose
   squares are all filled in is a number the child can see is
   done, because the squares under it are the mark. And a number
   with more filled squares than it counts is rung in clay the
   moment it goes over, so the one kind of crossing-off that
   really is arithmetic — this number is full, stop — is answered
   by the board rather than by the player's memory.

   And what it does not give up is the honesty of `isSolved`. See
   the note there: every square is inside some number's block and
   every board has exactly one answer, so a corner nobody has
   started on leaves a number short. "Finished" and "not started
   over there" are never the same board.

   ---- Why the number is exactly right

   The floor. `reduce` turns over exactly one square, so a board
   whose filled squares differ from the answer's in `d` places
   cannot be finished in fewer than `d` moves. A level starts
   empty and its answer fills `filled` squares, so `d` is
   `filled`. `logic.test.ts` checks that by construction: it
   walks real positions and watches that no move changes more
   than one square, rather than asserting a number and hoping.

   The ceiling. The answer is reachable by filling those squares
   in any order: `filled` moves, every one of them legal, and the
   board is solved at the end of them.

   And the search agrees, where it can reach. A level's state
   graph is every subset of its grid — 2^25 at the smallest size,
   which is over a hundred and sixty times the 200,000 states
   `shortestSolution` allows. But a position with a number
   already over its count is never on a shortest path: the extra
   square has to come off again, which costs two moves more than
   never filling it in. Pruned that way the five-wide board is
   small enough to walk outright — 1,472 to 9,300 positions on
   the ten seeds measured, in 50ms to 330ms — and the search
   comes back with a path exactly par long every time. Six and
   seven wide run past the cap even pruned, in about a second, so
   those two rest on the floor and the ceiling above. The recipe
   for all of those numbers is in logic.test.ts, under "par".
   ============================================================ */

/* ============================================================
   Reasoning a board out

   Two steps, and they are the two a child really makes.

   One, round a single number. Count the squares it already has
   filled in. If it has all it counts, every other square in its
   block stays empty. If the squares still empty are exactly the
   ones it is short by, every one of them gets filled in.

   Two, across two numbers side by side. Say the shared squares
   hold `x` filled squares between them. Each number puts `x`
   between a floor and a ceiling — it cannot need more from its
   own squares than it has, and it cannot need fewer than
   nothing — and where the two agree on a single value, the
   shared squares and both sets of unshared squares can each be
   settled. On the board this is the sentence "take one number
   away from its neighbour, and the difference has to sit in the
   squares only one of them counts".

   Side by side, and no further. Two numbers a column apart share
   a strip of three squares, and the same argument runs over them
   word for word — but the hints do not say that, and a board
   whose only way on is a pair the hints cannot name is a board
   this puzzle must not deal. So the step is held to the pair the
   words name, and `deal` looks for a board this weaker solver
   can finish rather than reaching for a stronger one. The test
   under "the solver" holds a board that shows the difference:
   one answer, and the solver still says no.

   Everything forced in a pass is written at the end of that
   pass, so `rounds` counts waves of scanning rather than the
   order the squares happen to be visited in. The second step
   only runs in a pass where the first found nothing, so a round
   count is what a child would really have had to do.

   Every square written was the only thing that square could be,
   so any answer to the board agrees with all of them; and the
   grid handed back is checked against every number before it is
   returned. So a board this finishes has exactly one answer.
   ============================================================ */

/** A square nothing has settled yet. */
const UNKNOWN = -1

/**
 * True when two squares are side by side: one step across, or one step down.
 * It is the only pair the second step compares, and the pair the last level's
 * hints name. See "Side by side, and no further" above.
 */
function sideBySide(n: number, a: number, b: number): boolean {
  const dr = Math.abs(rowOf(n, a) - rowOf(n, b))
  const dc = Math.abs(colOf(n, a) - colOf(n, b))
  return dr + dc === 1
}

export interface Reasoned {
  /** The finished board: true where a square gets filled in. */
  grid: boolean[]
  /** Passes over the two steps. This is the level's difficulty. */
  rounds: number
  /** True when the second step — comparing two numbers — was ever needed. */
  overlapped: boolean
}

/** What one number still wants, and which of its squares are still open. */
interface Want {
  need: number
  open: number[]
}

export function solveByLogic(n: number, clues: number[]): Reasoned | null {
  const bs = blocks(n)
  const cells = clueCells(clues)
  if (cells.length === 0) return null
  const g = new Array<number>(n * n).fill(UNKNOWN)
  let rounds = 0
  let overlapped = false

  const wantOf = (c: number): Want => {
    let have = 0
    const open: number[] = []
    for (const i of bs[c]) {
      if (g[i] === 1) have++
      else if (g[i] === UNKNOWN) open.push(i)
    }
    return { need: clues[c] - have, open }
  }

  for (;;) {
    const writes = new Map<number, number>()
    let broken = false
    /**
     * One forced square. Two deductions in the same pass forcing one square
     * two ways is a board that contradicts itself: both were the only thing
     * that square could be, and they disagree.
     */
    const write = (i: number, v: number) => {
      const had = writes.get(i)
      if (had !== undefined && had !== v) broken = true
      else writes.set(i, v)
    }
    const settle = (open: number[], v: 0 | 1) => {
      for (const i of open) write(i, v)
    }

    const wants = cells.map(wantOf)

    // Step one, round a single number.
    for (let k = 0; k < cells.length; k++) {
      const { need, open } = wants[k]
      if (need < 0 || need > open.length) return null
      if (open.length === 0) continue
      if (need === 0) settle(open, 0)
      else if (need === open.length) settle(open, 1)
    }
    if (broken) return null

    // Step two, and only once step one has run out — so `rounds` counts what a
    // child would really have had to do.
    if (writes.size === 0) {
      const mark = new Array<boolean>(n * n).fill(false)
      for (let ka = 0; ka < cells.length && !broken; ka++) {
        const a = wants[ka]
        if (a.open.length === 0) continue
        for (const i of a.open) mark[i] = true
        for (let kb = ka + 1; kb < cells.length && !broken; kb++) {
          // The one place the solver is deliberately held short of what it
          // could do. See "Side by side, and no further" above.
          if (!sideBySide(n, cells[ka], cells[kb])) continue
          const b = wants[kb]
          if (b.open.length === 0) continue
          const shared: number[] = []
          const bOnly: number[] = []
          for (const i of b.open) (mark[i] ? shared : bOnly).push(i)
          if (shared.length === 0) continue
          const aOnly = a.open.filter((i) => !b.open.includes(i))
          const lo = Math.max(0, a.need - aOnly.length, b.need - bOnly.length)
          const hi = Math.min(shared.length, a.need, b.need)
          if (lo > hi) return null
          if (lo !== hi) continue
          const x = lo
          const before = writes.size
          if (x === 0) settle(shared, 0)
          else if (x === shared.length) settle(shared, 1)
          if (a.need - x === 0) settle(aOnly, 0)
          else if (a.need - x === aOnly.length) settle(aOnly, 1)
          if (b.need - x === 0) settle(bOnly, 0)
          else if (b.need - x === bOnly.length) settle(bOnly, 1)
          if (writes.size > before) overlapped = true
        }
        for (const i of a.open) mark[i] = false
      }
      if (broken) return null
    }

    if (writes.size === 0) break
    for (const [i, v] of writes) g[i] = v
    rounds++
  }

  if (g.some((v) => v === UNKNOWN)) return null
  const grid = g.map((v) => v === 1)
  // Every write above was forced, so this can only fail on a board that
  // contradicts itself — but a grid handed back has to be an answer, and that
  // is what makes the uniqueness claim true of the function rather than of the
  // boards `deal` happens to ask about.
  for (const c of cells) if (countIn(grid, bs[c]) !== clues[c]) return null
  return { grid, rounds, overlapped }
}

/**
 * How many ways this board can be filled in, counted no further than `cap`.
 *
 * Squares are settled in reading order, so a number's block closes two rows
 * after it starts and the two counts kept for it — what it has, and how many
 * of its squares are still undecided — cut the branch the moment it can no
 * longer come out right.
 */
export function countSolutions(n: number, clues: number[], cap = 2): number {
  const size = n * n
  const bs = blocks(n)
  const cells = clueCells(clues)
  const owners: number[][] = Array.from({ length: size }, () => [])
  for (const c of cells) for (const i of bs[c]) owners[i].push(c)
  /** What each number has so far, and how many of its squares are undecided. */
  const have = new Array<number>(size).fill(0)
  const left = clues.map((v, i) => (v >= 0 ? bs[i].length : 0))
  let count = 0

  const walk = (i: number): void => {
    // Nothing is left undecided down here and no branch was cut on the way, so
    // every number has exactly what it counts: this is an answer.
    if (i === size) {
      count++
      return
    }
    for (const on of [false, true]) {
      let ok = true
      for (const c of owners[i]) {
        if (on) have[c]++
        left[c]--
        if (have[c] > clues[c] || have[c] + left[c] < clues[c]) ok = false
      }
      if (ok) walk(i + 1)
      for (const c of owners[i]) {
        if (on) have[c]--
        left[c]++
      }
      if (count >= cap) return
    }
  }

  walk(0)
  return count
}

/* ============================================================
   Making a board

   Backwards, from a finished one: blot an answer onto the grid,
   print the number every square would carry, and rub numbers out
   for as long as the two steps above can still finish the board.
   Nothing here can produce a board with no answer, because the
   answer was drawn first.
   ============================================================ */

/**
 * How often the blot starts somewhere new instead of growing where it already
 * is. Low, so the answer comes out in a few clumps rather than as pepper.
 *
 * Clumps are what make a board readable: a number counts nine squares, so a
 * clump big enough to fill a block prints a 9, and the ground round it prints
 * 0s. Measured on 400 five-wide answers of nine squares each: at 0.15 the
 * answer carries a printed 0 on 373 of them and a number as big as its own
 * block on 85, against 248 and 16 for the same nine squares scattered at
 * random. The recipe is in logic.test.ts, under "the blot".
 */
const NEW_BLOT = 0.15

/** An answer with exactly `want` squares filled in, in a few clumps. */
export function paint(rng: Rng, n: number, want: number): boolean[] {
  const size = n * n
  const on = new Array<boolean>(size).fill(false)
  if (want <= 0) return on
  /** Empty squares that touch a filled one, in the order they were reached. */
  const edge: number[] = []
  let count = 0

  const take = (cell: number) => {
    on[cell] = true
    count++
    for (const nb of block(n, cell)) {
      if (!on[nb] && !edge.includes(nb)) edge.push(nb)
    }
  }

  while (count < want) {
    const grown = edge.filter((i) => !on[i])
    if (grown.length === 0 || rng() < NEW_BLOT) {
      const free: number[] = []
      for (let i = 0; i < size; i++) if (!on[i]) free.push(i)
      if (free.length === 0) break
      take(free[randInt(rng, free.length)])
    } else {
      take(grown[randInt(rng, grown.length)])
    }
  }
  return on
}

/** The number every square would carry if the whole board were printed. */
export function cluesFor(n: number, answer: readonly boolean[]): number[] {
  const bs = blocks(n)
  return answer.map((_, i) => countIn(answer, bs[i]))
}

/**
 * Rub numbers out, one at a time and in a random order, for as long as the two
 * steps in `solveByLogic` can still finish the board — and then print numbers
 * back until exactly `want` of them are left. `keep` is never rubbed out: it is
 * the printed 0 a level's first hint sends a child to.
 *
 * Printing a number back can only make a board easier, never harder: every
 * deduction the thinner board allowed is still there, with one more number
 * beside it. So the board handed over is always one the two steps can finish,
 * and how many numbers are on it is the level's own dial rather than whatever
 * the rubbing out happened to leave.
 *
 * Null when the fully printed board cannot be reasoned out at all, and null
 * when it cannot be thinned as far as `want`.
 */
export function digTo(
  rng: Rng,
  n: number,
  answer: readonly boolean[],
  want: number,
  keep: number | null,
): number[] | null {
  let clues = cluesFor(n, answer)
  if (solveByLogic(n, clues) === null) return null
  // A fresh array a step, never a rub-out in place: `clueCells` is cached
  // against the array it is handed, so a board changed under its own cache
  // would answer for the board before it.
  for (const i of shuffled(rng, clues.map((_, k) => k))) {
    if (i === keep) continue
    const thinner = clues.slice()
    thinner[i] = -1
    if (solveByLogic(n, thinner) !== null) clues = thinner
  }

  const left = clueCells(clues).length
  if (left > want) return null
  const blanks = shuffled(rng, clues.map((v, i) => (v < 0 ? i : -1)).filter((i) => i >= 0))
  const printed = clues.slice()
  const full = cluesFor(n, answer)
  for (let k = 0; k < want - left; k++) printed[blanks[k]] = full[blanks[k]]
  return printed
}

/** The squares that carry a number settling their whole block before a tap. */
export function wayInCells(n: number, clues: number[]): number[] {
  const bs = blocks(n)
  return clueCells(clues).filter((c) => clues[c] === 0 || clues[c] === bs[c].length)
}

/** The squares that carry a printed 0. */
export function zeroCells(clues: number[]): number[] {
  return clueCells(clues).filter((c) => clues[c] === 0)
}

/** True when a square is on the outside ring of the grid. */
function onEdge(n: number, index: number): boolean {
  const r = rowOf(n, index)
  const k = colOf(n, index)
  return r === 0 || k === 0 || r === n - 1 || k === n - 1
}

/**
 * True when the outside ring carries a number that settles its whole block
 * before a single square has been filled in.
 *
 * This is the promise behind "start at the edge". A number on the ring counts
 * six squares, or four in a corner, and this one counts either none of them or
 * every one of them — so a child who starts where the gentlest hint says to
 * start has a first square to fill in, or a first patch of ground to leave
 * alone, on every board this deals.
 */
export function hasEdgeWayIn(n: number, clues: number[]): boolean {
  return wayInCells(n, clues).some((c) => onEdge(n, c))
}

/** True when a number is printed in one of the four corners. */
export function hasCornerClue(n: number, clues: number[]): boolean {
  return [0, n - 1, n * (n - 1), n * n - 1].some((c) => clues[c] >= 0)
}

/** True when two numbers are printed side by side, sharing most of their squares. */
export function hasNeighbourClues(n: number, clues: number[]): boolean {
  return clueCells(clues).some(
    (c) =>
      (colOf(n, c) + 1 < n && clues[c + 1] >= 0) ||
      (rowOf(n, c) + 1 < n && clues[c + n] >= 0),
  )
}

/**
 * True when this board is the board the level asked for.
 *
 * The shape checks are promises the hints make, and every level is held to all
 * of them whether its own hints name them or not.
 *
 * - A level whose first hint says "start with a 0" is dealt a 0.
 * - Both harder levels open at the edge, so the ring carries a number that
 *   settles its whole block before the first tap — "those settle soonest" is
 *   about a number that really is on the board, and "start at the edge" is a
 *   first move rather than a place to stand.
 * - Both of those hints also say what a number in a corner counts, so one is
 *   printed in a corner.
 * - Two numbers side by side are what the last level's second and third hints
 *   send a child to, and what the second level's third hint calls the number
 *   next door.
 *
 * The last of those is the one the solver would otherwise undercut, and it is
 * why `solveByLogic` compares side-by-side numbers and nothing further apart:
 * a board certified by a stronger method than the hints describe is a board a
 * child can be told to do something that will not open it. `logic.test.ts`
 * holds every seed to all four.
 */
export function fits(config: MosaicConfig, clues: number[]): boolean {
  const reasoned = shape(config, clues)
  if (reasoned === null) return false
  return reasoned.rounds >= config.minRounds && reasoned.rounds <= config.maxRounds
}

/**
 * The board reasoned out, where it is the right shape and asks for the right
 * kind of thinking — whatever number of passes it takes. It is `fits` with the
 * round window taken off, and a board of this shape is the only thing `deal`
 * will settle for.
 */
function shape(config: MosaicConfig, clues: number[]): Reasoned | null {
  const { n } = config
  if (config.zero && zeroCells(clues).length === 0) return null
  if (!hasEdgeWayIn(n, clues)) return null
  if (!hasCornerClue(n, clues)) return null
  if (!hasNeighbourClues(n, clues)) return null
  const reasoned = solveByLogic(n, clues)
  if (reasoned === null) return null
  if (config.overlap === 'never' && reasoned.overlapped) return null
  if (config.overlap === 'needed' && !reasoned.overlapped) return null
  return reasoned
}

/** How many answers `deal` blots before it settles for the closest thing. */
const ATTEMPTS = 400

/**
 * A board for this level.
 *
 * Every board comes out of `digTo`, which never hands back a board the two steps
 * cannot finish — so the loop is only ever choosing between boards that are
 * already the right *kind* of board: one answer, no square on it that has to be
 * guessed at, and exactly `config.filled` squares to fill in, which is par.
 * What it is looking for on top of that is a board of the right shape and a
 * round count inside the level's window.
 *
 * The one fallback gives up the round window and nothing else. It cannot give
 * up uniqueness, "no guessing" or par, because a board that lost any of those
 * never reaches this function's hands; and it cannot give up the shape, because
 * a hint would then name something that is not on the board. Where even that is
 * not to be had after `ATTEMPTS` answers, this throws rather than shipping a
 * board a level's own words are wrong about.
 *
 * No seed anybody has run has reached either. `fits` is true of every board
 * the tests deal — thirty seeds a level, and the fallback's board is exactly
 * the one `fits` would turn down — and putting a counter on the loop below and
 * running it over `makeRng(50_000 + s * 17)` for s in 0..599 gives a median of
 * 6 answers blotted at the first level, 15 at the second and 3 at the third,
 * a ninth decile of 18, 48 and 8, and a worst of 50, 130 and 21. The second
 * level is the dear one: its window is the narrowest slice of what a six-wide
 * board that plain counting can finish usually takes, so it turns more answers
 * down. 400 is that worst case three times over.
 */
export function deal(rng: Rng, config: MosaicConfig): number[] {
  const { n, filled, zero } = config
  let offWindow: number[] | null = null

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const answer = paint(rng, n, filled)
    const printed = cluesFor(n, answer)
    const zeros = zeroCells(printed)
    if (zero && zeros.length === 0) continue
    const keep = zero ? zeros[randInt(rng, zeros.length)] : null
    const clues = digTo(rng, n, answer, config.clues, keep)
    if (clues === null) continue
    const reasoned = shape(config, clues)
    if (reasoned === null) continue
    if (reasoned.rounds >= config.minRounds && reasoned.rounds <= config.maxRounds) return clues
    offWindow ??= clues
  }

  if (offWindow !== null) return offWindow
  throw new Error(`no ${n} by ${n} board of ${filled} squares came out right`)
}
