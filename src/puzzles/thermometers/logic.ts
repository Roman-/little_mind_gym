import { randInt, shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The thermometers.

   Thermometers lie across a grid, each one covering a straight
   run of squares from its bulb to its tip, and between them they
   cover every square. Mercury fills a thermometer from the bulb
   along to the tip, so a square is only full if the square before
   it is full — and the numbers down the side and along the top
   say how many full squares stand in that row and that column.
   It is the contest puzzle sold as Thermometers, and as Mercury.

   Everything here is pure and framework-free. Four things are
   worth reading twice.

   The state is a *level* a thermometer stands at, not a square a
   player has coloured in. `fill[t]` is how far the mercury has
   run, so the monotone rule is not a rule the board has to check:
   there is no way to write down a position that breaks it. A
   thermometer set back to empty and one nobody has touched are
   the same number, which is what makes par the count of the
   thermometers that hold mercury.

   `reduce` takes a tap on a square and sets that thermometer's
   level outright. Every tap changes exactly one thermometer, and
   every tap changes something: tapping the square the mercury
   already reaches empties the thermometer, and tapping any other
   square runs the mercury to it. So no square is ever a dead
   control, and no rule of this puzzle forbids a tap — a number in
   the margin says what the finished board has to look like, not
   what a child may do on the way there.

   `solveByLogic` narrows every thermometer's level from both ends
   using only the two steps a child can say out loud, and `deal`
   throws away every board it cannot finish. Narrowing only ever
   drops a level that no answer could use, so a board it pins has
   exactly one answer: uniqueness and "no guessing" are one check
   rather than two. `countSolutions` is held against it in the
   tests to keep that claim honest.

   And what this board deliberately does not do: say a word about
   how a line is getting on. No tick on a line whose count is
   right, no clay on a line holding too many, no running tally.
   That is not restraint for its own sake — it is the one thing
   that keeps the puzzle a puzzle, and it was measured. See the
   note on the greedy climber under `isSolved`.
   ============================================================ */

export interface ThermoConfig {
  /** Rows and columns both come in this many. */
  n: number
  /**
   * Thermometers holding mercury in the answer. It is the level's par, and
   * `deal` pins it exactly rather than dealing whatever turns up.
   */
  filled: number
  /**
   * Thermometers the answer leaves part full — neither empty nor full to the
   * tip. They are the ones where how far the mercury runs is the question, so
   * a board without them is a board of switches.
   */
  minPartial: number
  /**
   * Numbers in the margin that say 0. Level one's first hint sends a child to
   * one, so level one has to have one.
   */
  minZeros: number
  /**
   * Passes over the two steps in `solveByLogic`, at least and at most.
   * Measured on the board rather than guessed at.
   */
  minRounds: number
  maxRounds: number
  /**
   * Times the second step narrows a thermometer, at least and at most. That is
   * the step where a child counts what the other thermometers in a line can
   * give it and takes what is left, and one thermometer can be narrowed more
   * than once — from either end, and by either of the two lines that it stands
   * in. So the number counts the narrowing rather than the thermometers that it
   * was done to. A floor, so a harder level is not the easy one on a bigger
   * grid; and a ceiling, so a level never asks for a step that its own three
   * hints have not taught.
   */
  minNarrowings: number
  maxNarrowings: number
}

export interface ThermoState {
  n: number
  /** Each thermometer, bulb first, as row-major square numbers. Never changes. */
  tubes: number[][]
  /** Which thermometer each square belongs to. Never changes. */
  owner: number[]
  /** How far along its own thermometer each square lies, 0 at the bulb. Never changes. */
  step: number[]
  /** Full squares wanted in each row, and in each column. Never changes. */
  rowClues: number[]
  colClues: number[]
  /** How far the mercury stands in each thermometer. 0 is empty. */
  fill: number[]
}

/** One tap on one square. What it does to the mercury is `levelFor`. */
export type ThermoAction = { type: 'set'; cell: number }

/* --- reading the grid ---------------------------------------- */

export const rowOf = (n: number, index: number): number => Math.floor(index / n)
export const colOf = (n: number, index: number): number => index % n

export function rowCells(n: number, r: number): number[] {
  return Array.from({ length: n }, (_, c) => r * n + c)
}

export function colCells(n: number, c: number): number[] {
  return Array.from({ length: n }, (_, r) => r * n + c)
}

/** Which thermometer owns each square, and how far along it that square lies. */
export function indexTubes(n: number, tubes: number[][]): { owner: number[]; step: number[] } {
  const owner = new Array<number>(n * n).fill(-1)
  const step = new Array<number>(n * n).fill(-1)
  tubes.forEach((cells, t) =>
    cells.forEach((cell, at) => {
      owner[cell] = t
      step[cell] = at
    }),
  )
  return { owner, step }
}

/** True where the mercury has reached this square. */
export function isFilled(state: ThermoState, cell: number): boolean {
  return state.step[cell] < state.fill[state.owner[cell]]
}

/** Full squares among these. The number a line's own number is set against. */
export function filledIn(state: ThermoState, cells: number[]): number {
  return cells.filter((cell) => isFilled(state, cell)).length
}

/**
 * What a tap on this square sets its thermometer to: the mercury runs up to
 * the square, and a tap on the square the mercury already reaches empties the
 * thermometer instead. So every level is one tap from every other level, a
 * wrong guess costs one tap to put right, and no tap is ever a control that
 * would change nothing.
 */
export function levelFor(state: ThermoState, cell: number): number {
  const want = state.step[cell] + 1
  return state.fill[state.owner[cell]] === want ? 0 : want
}

/** Where a square sits along its thermometer. The board draws the three differently. */
export type Part = 'bulb' | 'stem' | 'tip'

export function partOf(state: ThermoState, cell: number): Part {
  if (state.step[cell] === 0) return 'bulb'
  return state.step[cell] === state.tubes[state.owner[cell]].length - 1 ? 'tip' : 'stem'
}

/** Which way a thermometer runs, from its bulb towards its tip. */
export type Toward = 'east' | 'west' | 'south' | 'north'

export function towardOf(n: number, tube: number[]): Toward {
  const [bulb, next] = tube
  if (rowOf(n, bulb) === rowOf(n, next)) return next > bulb ? 'east' : 'west'
  return next > bulb ? 'south' : 'north'
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<ThermoConfig>, rng: Rng): ThermoState {
  const { n } = level.config
  const { tubes, rowClues, colClues } = deal(rng, level.config)
  return {
    n,
    tubes,
    ...indexTubes(n, tubes),
    rowClues,
    colClues,
    fill: tubes.map(() => 0),
  }
}

/**
 * One tap, one thermometer, one new level. Nothing here can be refused: a
 * number in the margin describes the finished board rather than forbidding a
 * move, so every square takes every tap. The guards are for actions that are
 * not taps at all, and they hand back the very same state.
 */
export function reduce(state: ThermoState, action: ThermoAction): ThermoState {
  if (action?.type !== 'set') return state
  const { cell } = action
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.owner.length) return state
  const tube = state.owner[cell]
  const want = levelFor(state, cell)
  if (want === state.fill[tube]) return state
  const fill = state.fill.slice()
  fill[tube] = want
  return { ...state, fill }
}

/**
 * Every number counts the full squares in its own line, and that is the whole
 * of it: the monotone rule cannot be broken by a position this puzzle can hold.
 *
 * Nothing here reads the board it was dealt, so a position rewound through the
 * move tape is judged exactly as one played forward is.
 *
 * ---
 *
 * And here is why the board says nothing while a child plays. This is
 * Aquarium's family, and a board with an over-full cue loses to a player who
 * never thinks: keep every line under its number, fill as much as you can, and
 * you are done — a position with no over-full line holds at most the sum of the
 * numbers, and it holds exactly that sum only when it is an answer. So "raise a
 * thermometer, look, back off if the board complains" is a hill climb straight
 * to the answer.
 *
 * `logic.test.ts` runs that climber against the boards this file deals. Given
 * an over-full cue it wins every board, and the easiest of them in par exactly,
 * having thought about nothing; given a tick on each line whose count is right
 * it wins them as well; against the board as it ships — which answers a tap
 * with the mercury moving and nothing else — it wins none, inside a budget of
 * fifty taps for every move of par.
 */
export function isSolved(state: ThermoState): boolean {
  const { n } = state
  for (let r = 0; r < n; r++) if (filledIn(state, rowCells(n, r)) !== state.rowClues[r]) return false
  for (let c = 0; c < n; c++) if (filledIn(state, colCells(n, c)) !== state.colClues[c]) return false
  return true
}

/**
 * A tap does one of three things, and the move tape says which of them. A tap
 * on the square that the mercury already reaches empties the thermometer, a tap
 * above the mercury runs it up, and a tap below the mercury takes it back down.
 * That third sentence is the one that the square itself carries in `Board.tsx`.
 */
export function describeMove(prev: ThermoState, _next: ThermoState, action: ThermoAction): string {
  const where = `row ${rowOf(prev.n, action.cell) + 1}, column ${colOf(prev.n, action.cell) + 1}`
  const want = levelFor(prev, action.cell)
  if (want === 0) return `Emptied the thermometer at ${where}`
  return want > prev.fill[prev.owner[action.cell]]
    ? `Ran the mercury up to ${where}`
    : `Took the mercury back to ${where}`
}

/** Every tap there is. Used by the tests to check `par`. */
export function legalMoves(state: ThermoState): ThermoAction[] {
  return state.owner.map((_, cell) => ({ type: 'set', cell }) as ThermoAction)
}

/* ============================================================
   par

   A level's par is the number of thermometers the answer leaves
   with mercury in them, and both halves of the claim are proved
   in logic.test.ts rather than asserted.

   The floor. Every board starts with every thermometer empty, and
   `reduce` changes exactly one thermometer's level: so the count
   of thermometers holding mercury goes up or down by at most one
   a move. Every board dealt has exactly one answer, so the only
   solved position is that answer, and it holds mercury in
   `filled` thermometers. There is no way to get there in fewer
   than `filled` moves.

   The ceiling. A tap on a square sets its thermometer's level
   outright, whatever it stood at before, and no rule forbids any
   level. So tapping, once for each thermometer the answer fills,
   the square its mercury has to reach, ends on the answer in
   exactly `filled` moves — in any order, since one thermometer's
   level never depends on another's.

   Five across is small enough to be walked as well as argued:
   `reachableCount` over a whole five-across board comes in under
   the breadth-first search's own 200,000-state cap, so
   `shortestSolution` proves its par outright. Six and seven
   across are far past that cap — the test that measures it says
   so in the same breath — and rest on the argument above, which
   the tests check by construction rather than by asserting a
   number.
   ============================================================ */

/* ============================================================
   Reasoning a board out

   A thermometer's level is a number between 0 and its length, so
   reasoning a board out is narrowing that number from both ends
   until the two ends meet. Two steps do all of it, and both are
   sentences a child says out loud.

   One: a line that is finished, and a line with no room to spare.
   If the squares that must be full in a line already come to its
   number, every thermometer crossing it has to stop before any
   square of it that is still open. If every square that could be
   full is needed to reach the number, every one of them is full.

   Two, and only once step one has run dry: what one thermometer
   has to give a line. Count the most every *other* thermometer in
   the line could give it; whatever is left over the one remaining
   has to supply, and the same the other way round for the most it
   is allowed. This is the step that takes real counting, and it
   is the one the levels are graded on.
   ============================================================ */

/** One row or one column, with the thermometers that cross it. */
export interface Line {
  kind: 'row' | 'column'
  /** Counting from 1. */
  ordinal: number
  cells: number[]
  /** Each thermometer in the line, and how far along it the line's squares lie. */
  parts: { tube: number; at: number[] }[]
}

export function linesOf(n: number, tubes: number[][]): Line[] {
  const { owner, step } = indexTubes(n, tubes)
  const partsOf = (cells: number[]) => {
    const found = new Map<number, number[]>()
    for (const cell of cells) {
      const at = found.get(owner[cell])
      if (at === undefined) found.set(owner[cell], [step[cell]])
      else at.push(step[cell])
    }
    return [...found.entries()].map(([tube, at]) => ({ tube, at: at.sort((a, b) => a - b) }))
  }
  const lines: Line[] = []
  for (let r = 0; r < n; r++) {
    lines.push({ kind: 'row', ordinal: r + 1, cells: rowCells(n, r), parts: partsOf(rowCells(n, r)) })
  }
  for (let c = 0; c < n; c++) {
    lines.push({
      kind: 'column',
      ordinal: c + 1,
      cells: colCells(n, c),
      parts: partsOf(colCells(n, c)),
    })
  }
  return lines
}

/** What a board reasoned through gives back. */
export interface Deduction {
  /** The one level each thermometer can stand at. */
  fill: number[]
  /** Passes over the two steps it took. */
  rounds: number
  /**
   * Times step two narrowed a thermometer's level. Step two is the one that
   * takes real counting, and a thermometer that it narrows twice counts twice:
   * the number counts the narrowing, not the thermometers that it was done to.
   */
  narrowings: number
}

/**
 * Fill a board the way a child would, and stop the moment it would have to
 * guess.
 *
 * Both steps only ever rule out a level that no answer could use, so a board
 * this pins has exactly one answer — uniqueness and "no guessing" are one check
 * rather than two.
 */
export function solveByLogic(
  n: number,
  tubes: number[][],
  rowClues: number[],
  colClues: number[],
): Deduction | null {
  const lines = linesOf(n, tubes)
  const clueOf = (line: Line) =>
    line.kind === 'row' ? rowClues[line.ordinal - 1] : colClues[line.ordinal - 1]
  /** The mercury is at least this high, and at most this high. */
  const low = tubes.map(() => 0)
  const high = tubes.map((cells) => cells.length)
  let rounds = 0
  let narrowings = 0
  let broken = false

  /** How many of a line's squares in this thermometer the mercury reaches at `level`. */
  const reached = (at: number[], level: number) => at.filter((p) => p < level).length

  /**
   * Hold one thermometer to giving this line between `least` and `most`
   * squares. What it gives only ever grows as the mercury rises, so both ends
   * are one lookup into the line's squares along the thermometer.
   */
  const hold = (tube: number, at: number[], least: number, most: number) => {
    if (least > at.length || most < 0) {
      broken = true
      return false
    }
    let moved = false
    if (least >= 1 && at[least - 1] + 1 > low[tube]) {
      low[tube] = at[least - 1] + 1
      moved = true
    }
    if (most < at.length && at[most] < high[tube]) {
      high[tube] = at[most]
      moved = true
    }
    if (low[tube] > high[tube]) broken = true
    return moved
  }

  /** What each thermometer in a line must give it, and could give it. */
  const weigh = (line: Line) =>
    line.parts.map((part) => ({
      ...part,
      least: reached(part.at, low[part.tube]),
      most: reached(part.at, high[part.tube]),
    }))

  const total = (parts: { least: number; most: number }[], key: 'least' | 'most') =>
    parts.reduce((sum, part) => sum + part[key], 0)

  for (;;) {
    let moved = false

    // One. A line that is finished, and a line with no room to spare.
    for (const line of lines) {
      if (broken) break
      const clue = clueOf(line)
      const parts = weigh(line)
      const least = total(parts, 'least')
      const most = total(parts, 'most')
      if (clue < least || clue > most) {
        broken = true
        break
      }
      if (clue === least) {
        for (const p of parts) moved = hold(p.tube, p.at, p.least, p.least) || moved
      }
      if (clue === most) {
        for (const p of parts) moved = hold(p.tube, p.at, p.most, p.most) || moved
      }
    }

    // Two, and only once step one has run dry — so `rounds` counts what a child
    // would really have had to do, and `narrowings` counts only what step one
    // could not have reached.
    if (!moved && !broken) {
      for (const line of lines) {
        if (broken) break
        const clue = clueOf(line)
        const parts = weigh(line)
        const least = total(parts, 'least')
        const most = total(parts, 'most')
        for (const p of parts) {
          const owes = Math.max(p.least, clue - (most - p.most))
          const allowed = Math.min(p.most, clue - (least - p.least))
          if (hold(p.tube, p.at, owes, allowed)) {
            narrowings++
            moved = true
          }
        }
      }
    }

    if (broken) return null
    if (!moved) break
    rounds++
  }

  if (low.some((level, tube) => level !== high[tube])) return null
  // The reasoning is sound, so what it settles is the answer — checked here
  // rather than trusted, because everything downstream rests on it.
  const found = cluesOf(n, tubes, low)
  if (found.rowClues.join() !== rowClues.join()) return null
  if (found.colClues.join() !== colClues.join()) return null
  return { fill: low.slice(), rounds, narrowings }
}

/* ============================================================
   Counting the answers

   The independent check on the solver's claim. It sets one
   thermometer at a time and drops a branch the moment a line
   holds more than its number, or can no longer reach it.
   ============================================================ */

export function countSolutions(
  n: number,
  tubes: number[][],
  rowClues: number[],
  colClues: number[],
  cap = 2,
): number {
  const rowHas = new Array<number>(n).fill(0)
  const colHas = new Array<number>(n).fill(0)
  /** The most the thermometers from `t` on could still add to each line. */
  const restRow: number[][] = [new Array<number>(n).fill(0)]
  const restCol: number[][] = [new Array<number>(n).fill(0)]
  for (let t = tubes.length - 1; t >= 0; t--) {
    const row = restRow[0].slice()
    const col = restCol[0].slice()
    for (const cell of tubes[t]) {
      row[rowOf(n, cell)]++
      col[colOf(n, cell)]++
    }
    restRow.unshift(row)
    restCol.unshift(col)
  }

  let found = 0
  const walk = (t: number): void => {
    if (found >= cap) return
    if (t === tubes.length) {
      for (let k = 0; k < n; k++) {
        if (rowHas[k] !== rowClues[k] || colHas[k] !== colClues[k]) return
      }
      found++
      return
    }
    for (let level = 0; level <= tubes[t].length; level++) {
      for (let p = 0; p < level; p++) {
        rowHas[rowOf(n, tubes[t][p])]++
        colHas[colOf(n, tubes[t][p])]++
      }
      let fits = true
      for (let k = 0; k < n && fits; k++) {
        if (rowHas[k] > rowClues[k] || colHas[k] > colClues[k]) fits = false
        else if (rowHas[k] + restRow[t + 1][k] < rowClues[k]) fits = false
        else if (colHas[k] + restCol[t + 1][k] < colClues[k]) fits = false
      }
      if (fits) walk(t + 1)
      for (let p = 0; p < level; p++) {
        rowHas[rowOf(n, tubes[t][p])]--
        colHas[colOf(n, tubes[t][p])]--
      }
      if (found >= cap) return
    }
  }
  walk(0)
  return found
}

/* ============================================================
   Making a board

   Backwards, from a finished one: lay the thermometers out, run
   the mercury up some of them, and read the numbers off. Nothing
   here can produce a board with no answer, because the answer was
   drawn first — and every board is then held against
   `solveByLogic`, so it has exactly one.
   ============================================================ */

/** The shortest thermometer this deals. Two squares is a switch, not a scale. */
export const MIN_RUN = 3

/**
 * Thermometers covering every square exactly once, bulb first.
 *
 * Row-major backtracking: the first square nothing covers has nothing above it
 * and nothing to its left, so whatever thermometer covers it runs right or down
 * from there. Which end holds the bulb is then a coin toss, so a run is as
 * likely to fill towards the top of the board as towards the bottom.
 */
export function tile(rng: Rng, n: number): number[][] | null {
  const owner = new Array<number>(n * n).fill(-1)
  const tubes: number[][] = []

  const place = (): boolean => {
    const anchor = owner.indexOf(-1)
    if (anchor === -1) return true
    const options: number[][] = []
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ]) {
      const run = [anchor]
      let r = rowOf(n, anchor) + dr
      let c = colOf(n, anchor) + dc
      while (r < n && c < n && owner[r * n + c] === -1 && run.length < n) {
        run.push(r * n + c)
        r += dr
        c += dc
      }
      for (let len = MIN_RUN; len <= run.length; len++) options.push(run.slice(0, len))
    }
    for (const cells of shuffled(rng, options)) {
      const t = tubes.length
      for (const cell of cells) owner[cell] = t
      tubes.push(rng() < 0.5 ? cells : cells.slice().reverse())
      if (place()) return true
      tubes.pop()
      for (const cell of cells) owner[cell] = -1
    }
    return false
  }

  return place() ? tubes : null
}

/** What the numbers down the side and along the top say about this filling. */
export function cluesOf(
  n: number,
  tubes: number[][],
  fill: number[],
): { rowClues: number[]; colClues: number[] } {
  const rowClues = new Array<number>(n).fill(0)
  const colClues = new Array<number>(n).fill(0)
  tubes.forEach((cells, t) => {
    for (let p = 0; p < fill[t]; p++) {
      rowClues[rowOf(n, cells[p])]++
      colClues[colOf(n, cells[p])]++
    }
  })
  return { rowClues, colClues }
}

export interface Deal {
  tubes: number[][]
  rowClues: number[]
  colClues: number[]
  /** The one answer, kept for the tests. Nothing the player sees reads it. */
  fill: number[]
}

/** One candidate board: a layout, and mercury in exactly `filled` of the tubes. */
export function draw(rng: Rng, config: ThermoConfig): Deal | null {
  const { n, filled } = config
  const tubes = tile(rng, n)
  if (tubes === null || filled > tubes.length) return null
  const wet = shuffled(
    rng,
    Array.from({ length: tubes.length }, (_, t) => t),
  ).slice(0, filled)
  const fill = tubes.map(() => 0)
  for (const t of wet) fill[t] = 1 + randInt(rng, tubes[t].length)
  return { tubes, fill, ...cluesOf(n, tubes, fill) }
}

/**
 * The two gates every board has to pass, whatever level it is for: it has to
 * come out by reasoning, which is also what says it has one answer, and that
 * answer has to be the one that was drawn with the par it was drawn for.
 */
export function reasoned(config: ThermoConfig, board: Deal): Deduction | null {
  const found = solveByLogic(config.n, board.tubes, board.rowClues, board.colClues)
  if (found === null) return null
  if (found.fill.join() !== board.fill.join()) return null
  return found.fill.filter((level) => level > 0).length === config.filled ? found : null
}

/** True when this board is the board the level asked for. */
export function fits(config: ThermoConfig, board: Deal): boolean {
  const found = reasoned(config, board)
  if (found === null) return false
  const partial = board.fill.filter(
    (level, t) => level > 0 && level < board.tubes[t].length,
  ).length
  if (partial < config.minPartial) return false
  const zeros = [...board.rowClues, ...board.colClues].filter((clue) => clue === 0).length
  if (zeros < config.minZeros) return false
  if (found.rounds < config.minRounds || found.rounds > config.maxRounds) return false
  return found.narrowings >= config.minNarrowings && found.narrowings <= config.maxNarrowings
}

/** How many boards `deal` looks at before it settles for less. */
const ATTEMPTS = 600

/**
 * A board for this level.
 *
 * Every board here has an answer by construction, so the loop is only ever
 * choosing between boards that work: the first one that suits the level wins.
 *
 * The fallback gives up the level's difficulty band and nothing else. It is
 * still a board with exactly one answer, still reasoned out without a guess,
 * and still par to the move — because a board short of any of those three is
 * not a board this puzzle can hand a child. A run of luck bad enough to reach
 * even that has never been seen: sixty seeds a level all land on the first
 * line, and `deal` throws rather than ship a board that cannot be trusted.
 */
export function deal(rng: Rng, config: ThermoConfig): Deal {
  let fallback: Deal | null = null

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const board = draw(rng, config)
    if (board === null) continue
    if (reasoned(config, board) === null) continue
    if (fits(config, board)) return board
    fallback ??= board
  }

  if (fallback === null) {
    throw new Error(`no ${config.n} by ${config.n} board came out with one answer and par ${config.filled}`)
  }
  return fallback
}

/* ============================================================
   The board on the card

   The picture in the collection is a real three-across board of
   this puzzle's own, so it lives here in the puzzle's own terms
   rather than as a drawing that happens to look like one:
   `glyphs.tsx` draws exactly this, and `logic.test.ts` holds the
   four parts of it together. The numerals round the edge really
   are the numbers this mercury makes, and this mercury is the one
   answer those numbers have.

   Three thermometers, one to a column, every bulb in the bottom
   row — so every one of them fills upwards, which is the one
   thing the picture has to say.
   ============================================================ */
export const CARD = {
  n: 3,
  tubes: [
    [6, 3, 0],
    [7, 4, 1],
    [8, 5, 2],
  ],
  /** How far the mercury stands in each, counting up from the bulb. */
  fill: [2, 0, 1],
  /** Read off that answer: rows down the side, columns along the top. */
  rowClues: [0, 1, 2],
  colClues: [2, 0, 1],
}
