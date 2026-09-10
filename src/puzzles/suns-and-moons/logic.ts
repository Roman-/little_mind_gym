import { shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   Suns and moons.

   Two rules, and neither of them is the sudoku's. Every row and
   every column ends up with as many suns as moons, and three of
   the same never stand in a line. So the board is the familiar
   one and the question is new: this is counting along a line,
   not crossing a symbol off a square.

   Everything here is pure and framework-free. Three things are
   worth reading twice.

   `solveByRules` fills a board using only the two moves the
   rules give you — "one of the two marks would break something
   here, so the other one goes in" — and `deal` throws away every
   board it cannot finish that way. A solver that only ever
   writes a square the rules leave one answer for also proves the
   board has exactly one answer, so uniqueness and "no guessing"
   are one check here rather than two.

   Par is the count of empty squares, and that is the honest
   floor. `reduce` writes one square, so one move fills at most
   one empty square, and `isSolved` wants every square filled: a
   board that starts with 22 empty squares cannot be finished in
   fewer than 22 moves. The board can reach it — choosing which
   mark you are putting down is board-local and costs no move, so
   one tap fills one square with either mark — and it is a floor
   rather than a forecast, because a child who puts the wrong
   mark down pays a second move to put it right.

   And why the clue removal stops early. Run it to exhaustion and
   it takes about 27 squares out of a six-wide board and about 47
   out of an eight-wide one, against 22 for the hardest small
   square in the collection. A rail of forty-seven marks is not a
   level, so `blanks` caps the removal at 8, 16 and 22. What that
   gives away in length, `minRounds`, `minGaps` and `minPairs`
   take back: a board the two rules settle in too few passes, or
   one that never needs the three-in-a-line rule in the shape that
   its own hint names, is dealt again.
   ============================================================ */

/** An empty square. Also what `reduce` writes to rub a square out. */
export const EMPTY = 0
export const SUN = 1
export const MOON = 2

/** What a mark is called, in a sentence and to a screen reader. */
export function markName(value: number): string {
  if (value === SUN) return 'sun'
  if (value === MOON) return 'moon'
  return 'empty'
}

/** Both marks, in the order the keys under the board stand in. */
export const MARKS = [SUN, MOON] as const

/** The other mark. Only ever asked of a sun or a moon. */
export const otherMark = (value: number): number => (value === SUN ? MOON : SUN)

export interface SunsConfig {
  /** Rows and columns both come in this many. Even, so a line can be halved. */
  n: number
  /**
   * How many squares start empty. One move fills one, so this is `par`, and
   * `deal` keeps drawing until it hits the number exactly.
   */
  blanks: number
  /**
   * How many passes over the two rules the board must take, at least and at
   * most. It is the difficulty dial, measured on the solver rather than
   * guessed: one pass means every square was settled straight off the clues.
   */
  minRounds: number
  maxRounds: number
  /**
   * How many squares must need the three-in-a-line rule — squares where
   * counting alone would not have settled it — and in which of its two
   * shapes. A gap is `sun . sun`: the square between two of the same mark
   * takes the other one. A pair is `sun sun .`: the square at either end of
   * two of the same does. They are counted apart because a hint names one
   * shape or the other, and a board that only ever offers the shape that its
   * hint does not name sends a child looking for something that is not on it.
   * Both are zero at four wide, where the rule is provably never needed:
   * three of one mark in a four-long line already breaks the count.
   */
  minGaps: number
  minPairs: number
}

export interface SunsState {
  n: number
  /** Row-major. Non-zero where the puzzle was printed. Never changes. */
  givens: number[]
  /** Row-major. What the player has put down; 0 = empty. Always 0 under a given. */
  entries: number[]
}

/** One mark going down, or coming off again when `value` is 0. */
export type SunsAction = { type: 'set'; index: number; value: number }

/* --- reading the grid ---------------------------------------- */

export const rowOf = (n: number, index: number): number => Math.floor(index / n)
export const colOf = (n: number, index: number): number => index % n

const lineCache = new Map<number, number[][]>()

/**
 * Every row, then every column. That order is what names a line in a sentence.
 *
 * The arrays are memoised and shared, because `overCount` walks them on every
 * square of every board the generator throws away. Nothing in this file
 * mutates one, and anything handing one outside it copies first — `clashOf`
 * does.
 */
export function linesOf(n: number): number[][] {
  const hit = lineCache.get(n)
  if (hit) return hit
  const lines: number[][] = []
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c))
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c))
  lineCache.set(n, lines)
  return lines
}

/** The two lines a square sits on: its row, then its column. */
export function linesThrough(n: number, index: number): number[][] {
  const lines = linesOf(n)
  return [lines[rowOf(n, index)], lines[n + colOf(n, index)]]
}

/** Every run of three squares in a line that includes this one: rows first. */
export function triplesThrough(n: number, index: number): number[][] {
  const r = rowOf(n, index)
  const c = colOf(n, index)
  const out: number[][] = []
  for (let s = Math.max(0, c - 2); s <= Math.min(n - 3, c); s++) {
    out.push([r * n + s, r * n + s + 1, r * n + s + 2])
  }
  for (let s = Math.max(0, r - 2); s <= Math.min(n - 3, r); s++) {
    out.push([s * n + c, (s + 1) * n + c, (s + 2) * n + c])
  }
  return out
}

/** How many of one mark a line ends up holding. Half of it, both ways. */
export const halfOf = (n: number): number => n / 2

/**
 * The line where putting `value` at `index` would leave more of that mark than
 * a line can hold, or null. Row before column, which is the line a child scans
 * fastest.
 */
export function overCount(
  grid: readonly number[],
  n: number,
  index: number,
  value: number,
): number[] | null {
  for (const line of linesThrough(n, index)) {
    let count = 1
    for (const k of line) if (k !== index && grid[k] === value) count++
    if (count > halfOf(n)) return line
  }
  return null
}

/**
 * The three squares that putting `value` at `index` would leave holding the
 * same mark in a line, or null. Along the row first, then down the column.
 */
export function makesTriple(
  grid: readonly number[],
  n: number,
  index: number,
  value: number,
): number[] | null {
  for (const run of triplesThrough(n, index)) {
    if (run.every((k) => (k === index ? value : grid[k]) === value)) return run
  }
  return null
}

/* --- the solvers --------------------------------------------- */

/** What it took to read a board: passes over the rules, and which rule settled what. */
export interface Reading {
  /** The finished grid. */
  grid: number[]
  /** Passes over the whole board before nothing new was settled. */
  rounds: number
  /** Squares the count rule settled: this line already has all its suns. */
  counted: number
  /**
   * Squares only the three-in-a-line rule settled, with the new mark in the
   * middle of the run it would have made: `sun . sun` takes a moon in the gap.
   */
  gaps: number
  /**
   * Squares only the three-in-a-line rule settled, with the new mark at an end
   * of the run: `sun sun .` takes a moon beside the pair.
   */
  pairs: number
}

/**
 * Fill the board using only what the two rules say about one square at a time:
 * if one mark would break a rule here and now, the other one goes in. Returns
 * null the moment it would have to guess, or the moment a square will take
 * neither mark.
 *
 * The two rules are asked in the order a child meets them — is the line full of
 * suns already, and only then would this make three in a line — so a square
 * counted under `gaps` or `pairs` is one where counting alone would *not* have
 * settled it. Which of the two it lands under is the shape of the run that
 * would have been made: the square in the middle of it, or the square at an
 * end. `makesTriple` hands back the first run a mark would complete, and that
 * run really does force the square, so the shape reported is a shape the board
 * offers. That is what makes `minGaps` and `minPairs` promises the hints can be
 * written against.
 */
export function solveByRules(clues: readonly number[], n: number): Reading | null {
  const grid = clues.slice()
  let rounds = 0
  let counted = 0
  let gaps = 0
  let pairs = 0
  for (;;) {
    let moved = false
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] !== EMPTY) continue
      // Counting is asked first, and a mark already out on the count is never
      // asked about runs, so a run is only ever looked for where counting has
      // nothing to say.
      const sunCount = overCount(grid, n, i, SUN)
      const sunRun = sunCount === null ? makesTriple(grid, n, i, SUN) : null
      const moonCount = overCount(grid, n, i, MOON)
      const moonRun = moonCount === null ? makesTriple(grid, n, i, MOON) : null
      const sunOut = sunCount !== null || sunRun !== null
      const moonOut = moonCount !== null || moonRun !== null
      if (sunOut && moonOut) return null
      if (!sunOut && !moonOut) continue
      // Exactly one of the two marks is out, so why it is out is why this
      // square was settled: the count, or else the run that mark would have
      // completed — with this square in the middle of it, or at an end.
      const count = sunOut ? sunCount : moonCount
      const run = sunOut ? sunRun : moonRun
      if (count !== null) counted++
      else if (run !== null && run[1] === i) gaps++
      else pairs++
      grid[i] = sunOut ? MOON : SUN
      moved = true
    }
    if (!moved) break
    rounds++
  }
  return grid.every((v) => v !== EMPTY) ? { grid, rounds, counted, gaps, pairs } : null
}

/**
 * How many ways this clue grid can be filled in, counted no further than `cap`.
 * Plain backtracking, always branching on a square with the fewest marks left.
 * The generator does not need it — a board `solveByRules` finishes was forced
 * at every step — but the tests do, as the check on that claim.
 */
export function countSolutions(clues: readonly number[], n: number, cap = 2): number {
  const grid = clues.slice()
  let count = 0
  const step = (): void => {
    let target = -1
    let best: number[] | null = null
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] !== EMPTY) continue
      const fits: number[] = MARKS.filter(
        (v) => !overCount(grid, n, i, v) && !makesTriple(grid, n, i, v),
      )
      if (fits.length === 0) return
      if (best === null || fits.length < best.length) {
        target = i
        best = fits
      }
      if (fits.length === 1) break
    }
    if (best === null) {
      count++
      return
    }
    for (const v of best) {
      grid[target] = v
      step()
      grid[target] = EMPTY
      if (count >= cap) return
    }
  }
  // A clue grid that already breaks a rule has no answers at all.
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i]
    if (v === EMPTY) continue
    grid[i] = EMPTY
    const legal = !overCount(grid, n, i, v) && !makesTriple(grid, n, i, v)
    grid[i] = v
    if (!legal) return 0
  }
  step()
  return count
}

/** The one filled-in board, or null if there is none. */
export function solveGrid(clues: readonly number[], n: number): number[] | null {
  const grid = clues.slice()
  const step = (): boolean => {
    const i = grid.indexOf(EMPTY)
    if (i === -1) return true
    for (const v of MARKS) {
      if (overCount(grid, n, i, v) || makesTriple(grid, n, i, v)) continue
      grid[i] = v
      if (step()) return true
      grid[i] = EMPTY
    }
    return false
  }
  return step() ? grid : null
}

/* --- dealing a board ----------------------------------------- */

/** Draws before `deal` settles for the best board it has seen. */
const MAX_DEALS = 400

/** A whole board obeying both rules, filled in a random order of marks. */
export function fullGrid(rng: Rng, n: number): number[] | null {
  const grid = new Array<number>(n * n).fill(EMPTY)
  const step = (i: number): boolean => {
    if (i === grid.length) return true
    const first = rng() < 0.5 ? SUN : MOON
    for (const v of [first, otherMark(first)]) {
      if (overCount(grid, n, i, v) || makesTriple(grid, n, i, v)) continue
      grid[i] = v
      if (step(i + 1)) return true
      grid[i] = EMPTY
    }
    return false
  }
  return step(0) ? grid : null
}

/**
 * Rub squares out of a finished board, one at a time, keeping only the ones
 * the two rules can put back. It stops the moment `blanks` squares are out —
 * that cap is the level, and it is why `par` is a number a child will sit
 * through. Returns the clue grid, however far it got.
 */
export function carve(rng: Rng, answer: readonly number[], n: number, blanks: number): number[] {
  const clues = answer.slice()
  let out = 0
  for (const i of shuffled(rng, Array.from({ length: n * n }, (_, k) => k))) {
    if (out >= blanks) break
    const kept = clues[i]
    clues[i] = EMPTY
    if (solveByRules(clues, n) !== null) out++
    else clues[i] = kept
  }
  return clues
}

export const blanksIn = (grid: readonly number[]): number =>
  grid.reduce((sum, v) => sum + (v === EMPTY ? 1 : 0), 0)

/**
 * A board with exactly `blanks` squares empty, solvable by the two rules alone
 * and — where the draw allows — as hard as the level asks for. The blank count
 * is never traded away, because `par` rests on it; the difficulty window is,
 * after 400 draws, because a level that will not deal is worse than one that
 * deals easy. It has not come to that at any size that this puzzle ships: the
 * 200-seed sweep in `logic.test.ts` deals every level 200 boards and holds
 * each one inside its own window, which a board that had fallen back would
 * fail. The eight-wide level asks the most of the draw — four passes over the
 * rules, with a gap among the squares they settle — and that file still times
 * a deal for every level inside a blink.
 */
export function deal(rng: Rng, config: SunsConfig): number[] {
  const { n, blanks, minRounds, maxRounds, minGaps, minPairs } = config
  let fallback: number[] | null = null
  for (let draw = 0; draw < MAX_DEALS; draw++) {
    const answer = fullGrid(rng, n)
    if (answer === null) continue
    const clues = carve(rng, answer, n, blanks)
    if (blanksIn(clues) !== blanks) continue
    const read = solveByRules(clues, n)
    if (read === null) continue
    if (fallback === null) fallback = clues
    if (read.rounds < minRounds || read.rounds > maxRounds) continue
    if (read.gaps < minGaps || read.pairs < minPairs) continue
    return clues
  }
  if (fallback === null) throw new Error(`no ${n} by ${n} board would give up ${blanks} squares`)
  return fallback
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<SunsConfig>, rng: Rng): SunsState {
  const { n } = level.config
  return { n, givens: deal(rng, level.config), entries: new Array<number>(n * n).fill(EMPTY) }
}

export function reduce(state: SunsState, action: SunsAction): SunsState {
  if (action?.type !== 'set') return state
  const { index, value } = action
  if (!Number.isInteger(index) || index < 0 || index >= state.givens.length) return state
  if (value !== EMPTY && value !== SUN && value !== MOON) return state
  // A printed mark is not yours to change, and putting down what is already
  // there is not a move.
  if (state.givens[index] !== EMPTY) return state
  if (state.entries[index] === value) return state
  const entries = state.entries.slice()
  entries[index] = value
  return { ...state, entries }
}

/** What is on the board: the printed marks and the player's, in one array. */
export function valuesOf(state: SunsState): number[] {
  return state.givens.map((g, i) => (g !== EMPTY ? g : state.entries[i]))
}

export function isSolved(state: SunsState): boolean {
  const values = valuesOf(state)
  if (values.some((v) => v === EMPTY)) return false
  const half = halfOf(state.n)
  for (const line of linesOf(state.n)) {
    if (line.filter((i) => values[i] === SUN).length !== half) return false
  }
  for (let i = 0; i < values.length; i++) {
    if (makesTriple(values, state.n, i, values[i]) !== null) return false
  }
  return true
}

/**
 * Which of the player's own marks are breaking a rule. A printed mark is never
 * flagged — it is right by construction, and it is the mark beside it that is
 * wrong.
 */
export function conflicts(state: SunsState): boolean[] {
  const values = valuesOf(state)
  const { n } = state
  return values.map((v, i) => {
    if (state.givens[i] !== EMPTY || v === EMPTY) return false
    if (makesTriple(values, n, i, v) !== null) return true
    // The square itself is counted by overCount, so this asks whether the line
    // holds more than its share once this square is included.
    const others = values.slice()
    others[i] = EMPTY
    return overCount(others, n, i, v) !== null
  })
}

/** Which of the two rules a mark has broken. */
export type ClashKind = 'triple' | 'count'

/** One mark going down, and the squares it leaves in the wrong. */
export interface Clash {
  kind: ClashKind
  /** Along a row, or down a column. */
  along: 'row' | 'column'
  /** Which row or column, counting from 1. */
  ordinal: number
  /** Every square in the group, so the board can light the whole of it. */
  cells: number[]
  /** The squares in it that hold the mark: what the sentence is about. */
  blamed: number[]
  /** The mark that has just gone down. */
  value: number
}

/**
 * The rule that putting `value` into `index` breaks, or null if the square
 * takes it.
 *
 * Three in a line is asked first. One mark can break both rules at once, and
 * only one group is ever lit — two say nothing about either — so the one lit is
 * the tighter of the two: three squares a child can take in at a glance,
 * against a whole line. It is also the rule this puzzle is new for, and the
 * one worth teaching.
 *
 * Both arrays in the clash are the caller's own. `linesOf` memoises the lines
 * it hands to `overCount`, so passing one straight out would let a board or a
 * test that sorted it in place reorder that cache for every board of that
 * size — and `clashOf` itself reads `line[0]` against `line[1]` to tell a
 * column from a row.
 */
export function clashOf(state: SunsState, index: number, value: number): Clash | null {
  if (value === EMPTY || state.givens[index] !== EMPTY) return null
  const { n } = state
  const values = valuesOf(state)
  values[index] = EMPTY

  const run = makesTriple(values, n, index, value)
  if (run !== null) {
    const down = colOf(n, run[0]) === colOf(n, run[2])
    return {
      kind: 'triple',
      along: down ? 'column' : 'row',
      ordinal: (down ? colOf(n, index) : rowOf(n, index)) + 1,
      cells: run.slice(),
      blamed: run.slice(),
      value,
    }
  }

  const line = overCount(values, n, index, value)
  if (line !== null) {
    const down = colOf(n, line[0]) === colOf(n, line[1])
    return {
      kind: 'count',
      along: down ? 'column' : 'row',
      ordinal: (down ? colOf(n, index) : rowOf(n, index)) + 1,
      cells: line.slice(),
      blamed: [index, ...line.filter((i) => i !== index && values[i] === value)],
      value,
    }
  }
  return null
}

/** The broken rule in one sentence. The lit group says where; this says what. */
export function describeClash(clash: Clash): string {
  const where = `${clash.along === 'row' ? 'Row' : 'Column'} ${clash.ordinal}`
  const marks = `${markName(clash.value)}s`
  if (clash.kind === 'triple') {
    const how = clash.along === 'row' ? 'side by side' : 'one under the other'
    return `${where} has three ${marks} ${how}.`
  }
  return `${where} has more ${marks} than ${markName(otherMark(clash.value))}s.`
}

/** Squares still to fill. Each one costs exactly one move, so this is par. */
export function blankCount(state: SunsState): number {
  return blanksIn(valuesOf(state))
}

export function filledCount(state: SunsState): number {
  return valuesOf(state).reduce((sum, v) => sum + (v === EMPTY ? 0 : 1), 0)
}

export function describeMove(prev: SunsState, _next: SunsState, action: SunsAction): string {
  const where = `row ${rowOf(prev.n, action.index) + 1}, column ${colOf(prev.n, action.index) + 1}`
  if (action.value === EMPTY) return `Took the ${markName(prev.entries[action.index])} out of ${where}`
  return `Put a ${markName(action.value)} in ${where}`
}

/** Every action that would change something. Used by the tests to check `par`. */
export function legalMoves(state: SunsState): SunsAction[] {
  const out: SunsAction[] = []
  for (let index = 0; index < state.givens.length; index++) {
    if (state.givens[index] !== EMPTY) continue
    for (const value of [EMPTY, SUN, MOON]) {
      if (value !== state.entries[index]) out.push({ type: 'set', index, value })
    }
  }
  return out
}
