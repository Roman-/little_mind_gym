import { shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The tents and trees.

   Trees stand on a grid and a number sits at the end of every
   row and every column. Pitch one tent beside every tree — up,
   down, left or right of it, never on the diagonal — so that no
   two tents touch, not even at a corner, and every number counts
   the tents in its own line. It is the newspaper puzzle sold as
   Tents, and Simon Tatham's collection calls it the same thing.

   Everything here is pure and framework-free. Four things are
   worth reading twice.

   `reduce` will not pitch a tent that breaks a rule. Every other
   grid in this collection lets a wrong piece land and rings it in
   clay; here a forbidden tent is handed back by `refusalOf`
   instead, so the board a child is looking at always obeys the
   three rules a glance can check. That buys something the counting
   needs: because no line can ever hold more tents than its number,
   a board with every tent pitched is a board with every number
   already right, and the only thing left to check is the pairing.

   `maxPairs` is that check, and it is a real matching rather than a
   count. Two tents either side of one tree, with a second tree left
   with nothing beside it, satisfies every count on the board and is
   not an answer. Augmenting paths over a graph this small are four
   lines, and `isSolved` runs them every time.

   `solveByLogic` fills a board using only the steps an eight-year-old
   can actually make, and `deal` throws away every board it cannot
   finish. A solver that only ever pitches a tent the rules leave one
   place for also proves the board has exactly one answer, so
   uniqueness and "no guessing" are one check here rather than two.
   `countSolutions` is held against it in the tests to keep that
   claim honest.

   And what this board deliberately does not have: the paper game's
   patch of grass on a square that cannot take a tent. Each one
   would be a dispatched move — the shell counts one action as one
   move — so a seven-tent board would report closer to thirty. The scanning
   those marks are for is given back two other ways, and both cost
   nothing: `blockedCells` shades every square the tents already
   pitched rule out, and `lineMark` says which rows and columns are
   finished. Both are cut from `hasRoom`, and `hasRoom` never looks
   at a tree. Which squares the trees leave is the puzzle, and it
   stays in the child's head — so a number boxed in clay says
   exactly what the dots under it say, and a child can check the one
   against the other.
   ============================================================ */

/**
 * One level's board, and the two dials that say how hard it is allowed to be.
 *
 * Each dial is a floor and a ceiling, and every ceiling stands no higher than
 * the floor of the level above it. That is what makes three levels a ladder
 * rather than three sizes: a floor on its own only stops a level from being
 * the level below with more squares, and it is the ceiling that stops it from
 * being the level above. The six-wide level is the one that showed why —
 * with `maxPacked: 99` on it, it settled up to eleven squares by counting,
 * where the seven-wide level settles nine at its worst (put the 99 back, deal
 * seeds 0 to 499 a level, and read `packed` off `solveByLogic`).
 *
 * Only the last level is left open, because no level stands above it.
 * `logic.test.ts` holds all three to the ladder.
 */
export interface TentsConfig {
  /** Rows and columns both come in this many. */
  n: number
  /** Tents in the answer. It is also the number of trees, and the level's par. */
  tents: number
  /**
   * How many passes over the four steps the board must take, at least and at
   * most. Measured on `solveByLogic` rather than guessed at, and with the pair
   * below it the only difficulty knob apart from the size.
   */
  minRounds: number
  maxRounds: number
  /**
   * Squares settled by counting the room left in a line — the hard step, and
   * the one a level has to teach before it may ask for it.
   */
  minPacked: number
  maxPacked: number
}

export interface TentsState {
  n: number
  /** Row-major. True where a tree stands. Never changes. */
  trees: boolean[]
  /** Tents wanted in each row, and in each column. Never changes. */
  rowClues: number[]
  colClues: number[]
  /** Row-major. True where the player has pitched a tent. */
  tents: boolean[]
}

/** One tap: a tent goes up on an empty square, or comes down off its own. */
export type TentsAction = { type: 'toggle'; index: number }

/* --- reading the grid ---------------------------------------- */

export const rowOf = (n: number, index: number): number => Math.floor(index / n)
export const colOf = (n: number, index: number): number => index % n

export function rowCells(n: number, r: number): number[] {
  return Array.from({ length: n }, (_, c) => r * n + c)
}

export function colCells(n: number, c: number): number[] {
  return Array.from({ length: n }, (_, r) => r * n + c)
}

/** The squares that share an edge with this one. A tent stands on one of its tree's. */
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

/** The eight squares round this one. No second tent stands on any of them. */
export function touching(n: number, index: number): number[] {
  const r = rowOf(n, index)
  const c = colOf(n, index)
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc)
    }
  }
  return out
}

/** A tent's own square and the eight round it: the space it keeps to itself. */
export function space(n: number, index: number): number[] {
  return [index, ...touching(n, index)]
}

export function tentCells(state: TentsState): number[] {
  const out: number[] = []
  for (let i = 0; i < state.tents.length; i++) if (state.tents[i]) out.push(i)
  return out
}

export function treeCells(state: TentsState): number[] {
  const out: number[] = []
  for (let i = 0; i < state.trees.length; i++) if (state.trees[i]) out.push(i)
  return out
}

/** Tents standing in these squares. */
export function tentsIn(state: TentsState, cells: number[]): number {
  return cells.filter((i) => state.tents[i]).length
}

/* --- the pairing --------------------------------------------- */

/**
 * How many trees can be given a tent of their own, at most.
 *
 * Every tree owns one tent and every tent belongs to one tree, so the two are
 * matched one to one — and a board can satisfy every count on it without any
 * such matching existing. Two tents either side of one tree is the smallest
 * example: the counts are met, both tents stand beside a tree, and the tree at
 * the other end of the board never gets one.
 *
 * Augmenting paths, which is the whole of Kuhn's algorithm and quite enough
 * for a dozen trees: offer each tree the squares beside it in turn, and where
 * one is taken, ask the tree holding it to move along.
 */
export function maxPairs(state: TentsState): number {
  const trees = treeCells(state)
  /** Which tree, by its place in `trees`, has claimed each tent. */
  const held = new Map<number, number>()
  let paired = 0

  const claim = (tree: number, seen: Set<number>): boolean => {
    for (const cell of orthogonal(state.n, trees[tree])) {
      if (!state.tents[cell] || seen.has(cell)) continue
      seen.add(cell)
      const owner = held.get(cell)
      if (owner === undefined || claim(owner, seen)) {
        held.set(cell, tree)
        return true
      }
    }
    return false
  }

  for (let tree = 0; tree < trees.length; tree++) {
    if (claim(tree, new Set<number>())) paired++
  }
  return paired
}

/** Trees no pairing can find a tent for. The number the board reads out last. */
export function lonelyTrees(state: TentsState): number {
  return treeCells(state).length - maxPairs(state)
}

/* --- the rules ------------------------------------------------ */

/** Which rule pitching a tent on a square breaks. */
export type ClashKind = 'touching' | 'row' | 'column' | 'tree'

/** One tent, and the group of squares that will not have it. */
export interface Clash {
  kind: ClashKind
  /** Which row or column, counting from 1. Zero for the other two rules. */
  ordinal: number
  /** How many tents that row or column wants. Zero for the other two rules. */
  wanted: number
  /** Every square in the group, so the board can light the whole of it. */
  cells: number[]
  /** The squares to point at: the one just tapped, and whatever it fell foul of. */
  blamed: number[]
}

/**
 * The rule that pitching a tent on `index` breaks, or null when the square
 * takes it.
 *
 * One square can break three rules at once and only the first is reported —
 * three groups lit together say nothing about any of them. The order is the
 * three a child's own tents settle first, and then the one about the trees:
 * the tent already beside this square, the number at the end of the row, the
 * number at the top of the column, and last the tree that is not there. That
 * order is also what `blockedCells` is cut along, so the squares the board
 * shades and the rules it shades them for cannot drift apart.
 */
export function clashOf(state: TentsState, index: number): Clash | null {
  const { n, trees, tents, rowClues, colClues } = state
  if (!Number.isInteger(index) || index < 0 || index >= trees.length) return null
  if (trees[index] || tents[index]) return null

  const near = touching(n, index).filter((i) => tents[i])
  if (near.length > 0) {
    return { kind: 'touching', ordinal: 0, wanted: 0, cells: space(n, index), blamed: [index, ...near] }
  }

  const r = rowOf(n, index)
  const row = rowCells(n, r)
  if (tentsIn(state, row) >= rowClues[r]) {
    return {
      kind: 'row',
      ordinal: r + 1,
      wanted: rowClues[r],
      cells: row,
      blamed: [index, ...row.filter((i) => tents[i])],
    }
  }

  const c = colOf(n, index)
  const col = colCells(n, c)
  if (tentsIn(state, col) >= colClues[c]) {
    return {
      kind: 'column',
      ordinal: c + 1,
      wanted: colClues[c],
      cells: col,
      blamed: [index, ...col.filter((i) => tents[i])],
    }
  }

  const beside = orthogonal(n, index)
  if (!beside.some((i) => trees[i])) {
    return { kind: 'tree', ordinal: 0, wanted: 0, cells: [index, ...beside], blamed: [index] }
  }

  return null
}

/** The broken rule in one sentence. The lit group says where; this says what. */
export function describeClash(clash: Clash): string {
  if (clash.kind === 'touching') return 'These two tents would be touching.'
  if (clash.kind === 'tree') return 'A tent has to stand next to a tree.'
  const line = clash.kind === 'row' ? 'Row' : 'Column'
  if (clash.wanted === 0) return `${line} ${clash.ordinal} wants no tents at all.`
  const tents = clash.wanted === 1 ? '1 tent' : `${clash.wanted} tents`
  return `${line} ${clash.ordinal} already has its ${tents}.`
}

/** True when a tent may be pitched here. */
export function canPitch(state: TentsState, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= state.trees.length) return false
  if (state.trees[index] || state.tents[index]) return false
  return clashOf(state, index) === null
}

/**
 * A forbidden tent, pitched anyway: it goes up on the square the child put it
 * on, and one sentence says why it cannot stay. Null where the square takes
 * the tent, and null for taking a tent down, which breaks no rule at all.
 */
export function refusalOf(
  state: TentsState,
  index: number,
): { pretend: TentsState; message: string; clash: Clash } | null {
  const clash = clashOf(state, index)
  if (clash === null) return null
  const tents = state.tents.slice()
  tents[index] = true
  return { pretend: { ...state, tents }, message: describeClash(clash), clash }
}

/**
 * True while a square still has room for a tent, counting only what the tents
 * already pitched have taken from it.
 *
 * It is exactly the first three rules in `clashOf` and never the fourth: a
 * square with no tree beside it has room as far as this is concerned, because
 * whether a tree stands beside it is the part the child came here to work out.
 * Everything the board marks for free is cut from this one predicate — the dot
 * on a square, the clay round a number, the clay round a tree — so those three
 * marks cannot say different things about the same square.
 */
export function hasRoom(state: TentsState, index: number): boolean {
  if (state.trees[index] || state.tents[index]) return false
  const clash = clashOf(state, index)
  return clash === null || clash.kind === 'tree'
}

/**
 * The squares the tents already pitched leave no room for: the ones a tent is
 * standing beside, and the ones in a row or a column that has all the tents
 * its number asks for.
 *
 * This is the paper game's patch of grass, drawn for free, and it says nothing
 * about where the trees are.
 */
export function blockedCells(state: TentsState): boolean[] {
  return state.trees.map((tree, i) => !tree && !state.tents[i] && !hasRoom(state, i))
}

/**
 * The trees no tent can reach any more: none is standing beside one, and no
 * square beside one has room left for one.
 *
 * Each is a wrong turn a child can see — every square round that tree is a
 * tree, a tent, or wears the dot — and the tent that tree is owed can never
 * arrive now.
 *
 * This one does look at the trees, and it is allowed to: it says a position
 * cannot be finished rather than where a tent goes, and the dots that say so
 * are already on the board.
 */
export function strandedTrees(state: TentsState): number[] {
  return treeCells(state).filter((tree) => {
    const near = orthogonal(state.n, tree)
    return !near.some((i) => state.tents[i]) && !near.some((i) => hasRoom(state, i))
  })
}

/** How a row or a column stands: still open, all its tents in, or out of room. */
export type LineMark = 'open' | 'done' | 'stuck'

/**
 * A line is finished when no further tent can go in it, and it is finished two
 * ways. `done` is the count met — the number has what it asked for, so by its
 * own rule nothing more may join it. `stuck` is a line that still wants a tent
 * and whose every square the tents already pitched have taken, which is a
 * wrong turn rather than a broken rule: nothing on the board breaks a rule,
 * and this line can no longer be finished from here.
 *
 * `hasRoom` and not `canPitch`, so a line is never boxed in clay on the
 * strength of where the trees are: a number is stuck exactly when every square
 * under it is a tree, a tent, or carries the dot, which is a thing a child can
 * check by looking. A line whose last squares have no tree beside them reads
 * `open`, and finding that out is the puzzle.
 *
 * A count can never run over, because `reduce` will not pitch the tent that
 * would do it. So a line that is not `done` still wants tents, and these three
 * words are the whole of what a number has to say.
 */
export function lineMark(state: TentsState, cells: number[], clue: number): LineMark {
  if (tentsIn(state, cells) === clue) return 'done'
  return cells.some((i) => hasRoom(state, i)) ? 'open' : 'stuck'
}

export function rowMarks(state: TentsState): LineMark[] {
  return state.rowClues.map((clue, r) => lineMark(state, rowCells(state.n, r), clue))
}

export function colMarks(state: TentsState): LineMark[] {
  return state.colClues.map((clue, c) => lineMark(state, colCells(state.n, c), clue))
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<TentsConfig>, rng: Rng): TentsState {
  const { n } = level.config
  const { trees, rowClues, colClues } = deal(rng, level.config)
  return { n, trees, rowClues, colClues, tents: new Array<boolean>(n * n).fill(false) }
}

/**
 * A tent that breaks a rule never lands. Every other grid in the collection
 * takes the wrong piece and rings it in clay; this one hands it back through
 * `refusalOf`, so nothing on the board ever breaks a rule and a line can never
 * hold more tents than its number. Taking a tent down is always allowed.
 */
export function reduce(state: TentsState, action: TentsAction): TentsState {
  if (action?.type !== 'toggle') return state
  const { index } = action
  if (!Number.isInteger(index) || index < 0 || index >= state.tents.length) return state
  if (state.trees[index]) return state
  if (!state.tents[index] && !canPitch(state, index)) return state
  const tents = state.tents.slice()
  tents[index] = !tents[index]
  return { ...state, tents }
}

/**
 * Four rules, and the fourth is the one a count cannot see. Every number is
 * met, no two tents touch, no tent stands on a tree — and then every tree is
 * given a tent of its own, which is a matching and not a tally.
 *
 * Nothing here reads the generator, so a board rewound through the move tape
 * is judged exactly as a board played forward is.
 */
export function isSolved(state: TentsState): boolean {
  const { n } = state
  const tents = tentCells(state)
  const trees = treeCells(state)
  if (tents.length !== trees.length) return false
  for (const i of tents) {
    if (state.trees[i]) return false
    if (touching(n, i).some((j) => state.tents[j])) return false
  }
  for (let r = 0; r < n; r++) if (tentsIn(state, rowCells(n, r)) !== state.rowClues[r]) return false
  for (let c = 0; c < n; c++) if (tentsIn(state, colCells(n, c)) !== state.colClues[c]) return false
  return maxPairs(state) === trees.length
}

export function describeMove(prev: TentsState, _next: TentsState, action: TentsAction): string {
  const where = `row ${rowOf(prev.n, action.index) + 1}, column ${colOf(prev.n, action.index) + 1}`
  return prev.tents[action.index] ? `Took the tent down in ${where}` : `Pitched a tent in ${where}`
}

/** Every action worth trying. Used by the tests to check `par`. */
export function legalMoves(state: TentsState): TentsAction[] {
  const out: TentsAction[] = []
  for (let index = 0; index < state.trees.length; index++) {
    if (!state.trees[index]) out.push({ type: 'toggle', index })
  }
  return out
}

/* ============================================================
   par

   A level's par is the number of trees it deals, and both halves
   of the claim are proved in logic.test.ts rather than asserted.

   The floor. `isSolved` wants one tent for every tree, and
   `reduce` changes exactly one square: it pitches one tent or
   takes one down, so the tents on the board go up or down by
   exactly one a move. A board that starts empty cannot reach
   `trees` tents in fewer than `trees` moves.

   The ceiling. Every board dealt has exactly one answer, and the
   tents of that answer can be pitched in any order at all: none
   of them touch, none of them takes a line past its number, and
   each one stands beside a tree — so every rule `reduce` holds to
   is already kept at every step along the way. That is `trees`
   moves, and it ends on a solved board.
   ============================================================ */

/* ============================================================
   Reasoning a board out

   Four steps, and they are the four a child says out loud.

   One: a square with no tree beside it is never a tent.

   Two: a tree with one square left beside it has to use it.

   Three: a line with all its tents in has no room for another,
   and a line whose free squares are exactly as many as it still
   wants must use all of them.

   Four, and only once the first three have run dry: count what a
   line can still hold. Two free squares side by side hold one
   tent between them, so a row that wants two tents out of three
   free squares, with two of them touching, has to use the odd
   one. Every way of fitting the tents a line still wants into the
   squares it has left is written out, and a square in all of them
   is a tent while a square in none of them is grass.
   ============================================================ */

/** What a board reasoned through gives back. */
export interface Deduction {
  /** Every square the one answer pitches a tent on, ascending. */
  tents: number[]
  /** Passes over the four steps it took. */
  rounds: number
  /** Squares settled by step four, which is the one that takes real counting. */
  packed: number
}

/**
 * Every way of choosing `need` of these positions with no two of them side by
 * side. The positions are places along one line, so "side by side" is a
 * difference of one, and the answer is a list of picks into `pos`.
 */
function lineChoices(pos: number[], need: number): number[][] {
  const out: number[][] = []
  const chosen: number[] = []
  const walk = (k: number, last: number) => {
    if (chosen.length === need) {
      out.push(chosen.slice())
      return
    }
    if (k >= pos.length || pos.length - k < need - chosen.length) return
    if (last < 0 || pos[k] - last > 1) {
      chosen.push(k)
      walk(k + 1, pos[k])
      chosen.pop()
    }
    walk(k + 1, last)
  }
  walk(0, -1)
  return out
}

export function solveByLogic(
  n: number,
  trees: boolean[],
  rowClues: number[],
  colClues: number[],
): Deduction | null {
  const size = n * n
  /** -1 not known yet, 0 no tent here, 1 a tent. A tree holds nothing. */
  const mark: number[] = trees.map((tree) => (tree ? 0 : -1))
  const wanted = trees.filter(Boolean).length
  const woods: number[] = []
  for (let i = 0; i < size; i++) if (trees[i]) woods.push(i)
  let placed = 0
  let broken = false
  let rounds = 0
  let packed = 0

  const grass = (i: number): boolean => {
    if (mark[i] !== -1) return false
    mark[i] = 0
    return true
  }

  /** Pitch a tent here: nothing round it can hold one, and nothing did. */
  const pitch = (i: number): boolean => {
    if (mark[i] === 1) return false
    if (mark[i] === 0) {
      broken = true
      return false
    }
    mark[i] = 1
    placed++
    for (const j of touching(n, i)) {
      if (mark[j] === 1) broken = true
      else grass(j)
    }
    return true
  }

  const lines: number[][] = []
  const clues: number[] = []
  for (let r = 0; r < n; r++) {
    lines.push(rowCells(n, r))
    clues.push(rowClues[r])
  }
  for (let c = 0; c < n; c++) {
    lines.push(colCells(n, c))
    clues.push(colClues[c])
  }

  for (;;) {
    let moved = false

    // One. Nothing stands where no tree could own it.
    for (let i = 0; i < size && !broken; i++) {
      if (mark[i] === -1 && !orthogonal(n, i).some((j) => trees[j])) moved = grass(i) || moved
    }

    // Two. A tree with one square left beside it.
    for (const tree of woods) {
      if (broken) break
      const free = orthogonal(n, tree).filter((j) => mark[j] !== 0)
      if (free.length === 0) broken = true
      else if (free.length === 1) moved = pitch(free[0]) || moved
    }

    // Three. A line with its tents in, and a line with no room to spare.
    for (let k = 0; k < lines.length && !broken; k++) {
      const cells = lines[k]
      const free = cells.filter((i) => mark[i] === -1)
      const need = clues[k] - cells.filter((i) => mark[i] === 1).length
      if (need < 0 || need > free.length) broken = true
      else if (need === 0) for (const i of free) moved = grass(i) || moved
      else if (need === free.length) for (const i of free) moved = pitch(i) || moved
    }

    // Four, and only once the first three have run dry — so `rounds` counts
    // what a child would really have had to do. Every line is weighed against
    // the marks as they stand when it is reached.
    if (!moved && !broken) {
      for (let k = 0; k < lines.length && !broken; k++) {
        const cells = lines[k]
        const free: number[] = []
        const pos: number[] = []
        for (let p = 0; p < cells.length; p++) {
          if (mark[cells[p]] === -1) {
            free.push(cells[p])
            pos.push(p)
          }
        }
        const need = clues[k] - cells.filter((i) => mark[i] === 1).length
        if (free.length === 0) continue
        const ways = lineChoices(pos, need)
        if (ways.length === 0) {
          broken = true
          break
        }
        for (let f = 0; f < free.length; f++) {
          const inEvery = ways.every((way) => way.includes(f))
          const inNone = ways.every((way) => !way.includes(f))
          if (inEvery && pitch(free[f])) {
            packed++
            moved = true
          } else if (inNone && grass(free[f])) {
            packed++
            moved = true
          }
        }
      }
    }

    // And the board as a whole: all the tents are up, or every square left has
    // to hold one.
    if (!broken) {
      const free: number[] = []
      for (let i = 0; i < size; i++) if (mark[i] === -1) free.push(i)
      if (placed === wanted) for (const i of free) moved = grass(i) || moved
      else if (placed + free.length === wanted) for (const i of free) moved = pitch(i) || moved
    }

    if (broken) return null
    if (!moved) break
    rounds++
  }

  const out: number[] = []
  for (let i = 0; i < size; i++) {
    if (mark[i] === -1) return null
    if (mark[i] === 1) out.push(i)
  }
  return out.length === wanted ? { tents: out, rounds, packed } : null
}

/**
 * The same board with every number covered up: steps one and two, and nothing
 * a clue says.
 *
 * It is the gate `deal` cares most about, and it is cheap because it hardly
 * ever fires: over twenty thousand camps a size, trees on their own settled
 * about one five-wide camp in two thousand, two six-wide ones, and no
 * seven-wide one at all. Hardly ever is not never, and a board that comes out
 * without its numbers is the garden cats in a new coat — so any board this
 * finishes is thrown away, and every board a child is handed has to be
 * counted.
 */
export function solveByTrees(n: number, trees: boolean[]): number[] | null {
  const size = n * n
  const mark: number[] = trees.map((tree) => (tree ? 0 : -1))
  const wanted = trees.filter(Boolean).length
  let placed = 0
  let broken = false

  const grass = (i: number): boolean => {
    if (mark[i] !== -1) return false
    mark[i] = 0
    return true
  }

  const pitch = (i: number): boolean => {
    if (mark[i] === 1) return false
    if (mark[i] === 0) {
      broken = true
      return false
    }
    mark[i] = 1
    placed++
    for (const j of touching(n, i)) {
      if (mark[j] === 1) broken = true
      else grass(j)
    }
    return true
  }

  for (;;) {
    let moved = false
    for (let i = 0; i < size && !broken; i++) {
      if (mark[i] === -1 && !orthogonal(n, i).some((j) => trees[j])) moved = grass(i) || moved
    }
    for (let tree = 0; tree < size && !broken; tree++) {
      if (!trees[tree]) continue
      const free = orthogonal(n, tree).filter((j) => mark[j] !== 0)
      if (free.length === 0) broken = true
      else if (free.length === 1) moved = pitch(free[0]) || moved
    }
    if (!broken && placed === wanted) {
      for (let i = 0; i < size; i++) moved = grass(i) || moved
    }
    if (broken) return null
    if (!moved) break
  }

  const out: number[] = []
  for (let i = 0; i < size; i++) {
    if (mark[i] === -1) return null
    if (mark[i] === 1) out.push(i)
  }
  return out.length === wanted ? out : null
}

/* ============================================================
   Counting the answers

   The independent check on the solver's claim. It walks the board
   a row at a time, choosing which of that row's squares hold its
   tents, and only asks about the pairing once the last row is
   down — a board can pass every count and still leave a tree
   without a tent.
   ============================================================ */

/** Every square a tent could possibly stand on: not a tree, and beside one. */
export function candidateCells(n: number, trees: boolean[]): boolean[] {
  return trees.map((tree, i) => !tree && orthogonal(n, i).some((j) => trees[j]))
}

export function solutions(
  n: number,
  trees: boolean[],
  rowClues: number[],
  colClues: number[],
  cap: number,
): number[][] {
  const canHold = candidateCells(n, trees)
  /** How many rows below this one could still give a column a tent. */
  const laterInCol: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(n).fill(0))
  for (let r = n - 1; r >= 0; r--) {
    for (let c = 0; c < n; c++) {
      laterInCol[r][c] = laterInCol[r + 1][c] + (canHold[r * n + c] ? 1 : 0)
    }
  }

  const found: number[][] = []
  const colCount = new Array<number>(n).fill(0)
  const chosen: number[] = []
  const board = new Array<boolean>(n * n).fill(false)

  const walk = (r: number): void => {
    if (found.length >= cap) return
    if (r === n) {
      const state: TentsState = { n, trees, rowClues, colClues, tents: board.slice() }
      if (maxPairs(state) === chosen.length) found.push(chosen.slice())
      return
    }
    const pos: number[] = []
    const cells: number[] = []
    for (let c = 0; c < n; c++) {
      const i = r * n + c
      // Not beside a tent in the row above, on either diagonal or straight up.
      const clear =
        r === 0 || ![i - n - 1, i - n, i - n + 1].some((j) => j >= (r - 1) * n && j < r * n && board[j])
      if (canHold[i] && clear) {
        cells.push(i)
        pos.push(c)
      }
    }
    for (const way of lineChoices(pos, rowClues[r])) {
      let fits = true
      for (const p of way) {
        const c = colOf(n, cells[p])
        if (colCount[c] + 1 > colClues[c]) {
          fits = false
          break
        }
        colCount[c]++
        board[cells[p]] = true
        chosen.push(cells[p])
      }
      if (fits) {
        let reachable = true
        for (let c = 0; c < n; c++) {
          if (colClues[c] - colCount[c] > laterInCol[r + 1][c]) {
            reachable = false
            break
          }
        }
        if (reachable) walk(r + 1)
      }
      // Unwind whatever went down, including a part-laid row that would not fit.
      for (let k = way.length - 1; k >= 0; k--) {
        const cell = cells[way[k]]
        if (!board[cell]) continue
        board[cell] = false
        colCount[colOf(n, cell)]--
        chosen.pop()
      }
      if (found.length >= cap) return
    }
  }

  walk(0)
  return found
}

/** How many ways the tents can be pitched, counted no further than `cap`. */
export function countSolutions(
  n: number,
  trees: boolean[],
  rowClues: number[],
  colClues: number[],
  cap = 2,
): number {
  return solutions(n, trees, rowClues, colClues, cap).length
}

/* ============================================================
   Making a board

   Backwards, from a finished one: pitch the tents and plant a
   tree beside each, then read the numbers off the answer and take
   the tents away. Nothing here can produce a board with no
   answer, because the answer was drawn first — and every board is
   then held against `solveByLogic`, so it has exactly one.
   ============================================================ */

/** The tents of a finished board, each with a tree of its own beside it. */
export function pitchCamp(
  rng: Rng,
  n: number,
  count: number,
): { trees: boolean[]; tents: boolean[] } | null {
  const trees = new Array<boolean>(n * n).fill(false)
  const tents = new Array<boolean>(n * n).fill(false)
  let up = 0

  for (const cell of shuffled(
    rng,
    Array.from({ length: n * n }, (_, i) => i),
  )) {
    if (up === count) break
    if (trees[cell] || tents[cell]) continue
    if (touching(n, cell).some((i) => tents[i])) continue
    const room = shuffled(rng, orthogonal(n, cell)).find((i) => !trees[i] && !tents[i])
    if (room === undefined) continue
    tents[cell] = true
    trees[room] = true
    up++
  }

  return up === count ? { trees, tents } : null
}

/** What the numbers down the side and along the top say. */
export function cluesOf(n: number, tents: boolean[]): { rowClues: number[]; colClues: number[] } {
  const rowClues = new Array<number>(n).fill(0)
  const colClues = new Array<number>(n).fill(0)
  for (let i = 0; i < tents.length; i++) {
    if (!tents[i]) continue
    rowClues[rowOf(n, i)]++
    colClues[colOf(n, i)]++
  }
  return { rowClues, colClues }
}

export interface Deal {
  trees: boolean[]
  rowClues: number[]
  colClues: number[]
}

/**
 * The board as reasoning finishes it, or null when the board will not do at
 * all.
 *
 * The two promises that every board here makes, whatever level dealt it. It has to
 * come out by the steps an eight-year-old can make, which is also what says it
 * has exactly one answer. And it has to *need* its numbers, or the counting is
 * decoration over a board of trees. What comes back is the deduction itself,
 * so whoever wants to know how hard the board turned out to be does not have
 * to reason it out a second time.
 */
export function reasonedOut(n: number, board: Deal): Deduction | null {
  const { trees, rowClues, colClues } = board
  const reasoned = solveByLogic(n, trees, rowClues, colClues)
  if (reasoned === null) return null
  if (solveByTrees(n, trees) !== null) return null
  // The reasoning is sound, so what it settles is the answer — checked here
  // rather than trusted, because everything downstream rests on it.
  const tents = trees.map((_, i) => reasoned.tents.includes(i))
  return isSolved({ n, trees, rowClues, colClues, tents }) ? reasoned : null
}

/** Inside the level's own band: the passes that it takes, and the squares that it counts. */
function inBand(config: TentsConfig, reasoned: Deduction): boolean {
  const { minRounds, maxRounds, minPacked, maxPacked } = config
  if (reasoned.packed < minPacked || reasoned.packed > maxPacked) return false
  return reasoned.rounds >= minRounds && reasoned.rounds <= maxRounds
}

/**
 * True when this board is the board the level asked for.
 *
 * Two gates: the promises every board makes, and then the level's own band —
 * the number of passes that the reasoning takes, and the number of squares
 * that it settles by counting the room in a line. Each of those is a floor and a
 * ceiling, and each ceiling is no higher than the floor of the level above
 * (see `TentsConfig`), so a level cannot quietly deal a board that asks for
 * more than the level above it asks for at its easiest.
 */
export function fits(config: TentsConfig, board: Deal): boolean {
  const reasoned = reasonedOut(config.n, board)
  return reasoned !== null && inBand(config, reasoned)
}

/** How many camps `deal` looks at before it settles for less. */
const ATTEMPTS = 2000

/**
 * A board for this level.
 *
 * Every camp is drawn finished, so the loop is only ever choosing between
 * boards that have an answer, and the first one inside the level's band wins.
 * That band is the only thing that a bad run can cost: what comes back when no
 * camp suits the level is still a board that a child can reason out, and still
 * a board whose numbers are needed, because `reasonedOut` is the only thing
 * that this ever keeps. A board that cannot promise those two is not handed out
 * at all — there is no honest board left to hand out, so this says so instead
 * of quietly shipping a camp that nobody has checked.
 *
 * Neither of those is anywhere near the road a player travels. Two camps in
 * three come out of `reasonedOut` at the worst of the three sizes — 2000 camps
 * a size from `makeRng(12345)` gives 1517 five-wide, 1578 six-wide and 1304
 * seven-wide, and `logic.test.ts` reruns that count — so ATTEMPTS of them all
 * missing is not a thing that happens. The band itself is met by every one of
 * seeds 0 to 1999 on all three levels, at a mean of 63 camps and a worst of
 * 506 on the six-wide level, which is the tightest of the three.
 */
export function deal(rng: Rng, config: TentsConfig): Deal {
  const { n, tents: count } = config
  let sound: Deal | null = null

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const camp = pitchCamp(rng, n, count)
    if (camp === null) continue
    const board: Deal = { trees: camp.trees, ...cluesOf(n, camp.tents) }
    const reasoned = reasonedOut(n, board)
    if (reasoned === null) continue
    if (inBand(config, reasoned)) return board
    sound ??= board
  }

  if (sound !== null) return sound
  throw new Error(`No ${n} by ${n} camp of ${count} tents came out by reasoning in ${ATTEMPTS} tries.`)
}
