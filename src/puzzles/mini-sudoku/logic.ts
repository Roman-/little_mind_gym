import { pick, shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   A small sudoku.

   Everything here is pure and framework-free. The only thing
   worth reading twice is the symmetry group at the bottom: the
   bank is hand-authored and each entry is verified to have one
   solution, and `init` may only reshuffle a bank entry through
   transformations that provably keep that true.
   ============================================================ */

/** Fruit reads faster than numerals at 4x4; at 6x6 six pictures are too many to tell apart. */
export type SymbolSet = 'fruit' | 'digits'

export interface SudokuConfig {
  /** Rows, columns, boxes and symbols all come in this many. 4 or 6. */
  n: number
  /** Box height, in rows. */
  boxH: number
  /** Box width, in columns. */
  boxW: number
  symbols: SymbolSet
  /**
   * Hand-authored clue grids, row-major, 0 = blank. Every entry has exactly
   * one solution and is reachable by single-cell logic alone — the test file
   * proves both, for every entry.
   */
  bank: number[][]
  /** Every bank entry carries this many clues, so `par` does not wobble by seed. */
  clues: number
}

export interface SudokuState {
  n: number
  boxH: number
  boxW: number
  symbols: SymbolSet
  /** Row-major. Non-zero where the puzzle was printed. Never changes. */
  givens: number[]
  /** Row-major. What the player has written; 0 = blank. Always 0 under a given. */
  entries: number[]
}

/** One pencil stroke. `value` 0 rubs the square out. */
export type SudokuAction = { type: 'set'; index: number; value: number }

/**
 * Value 1..4 is a fruit. A child can name all four on sight, and each one has
 * its own colour and its own outline, so two of them never blur together
 * across a grid. That is why the fourth is a pear rather than a strawberry:
 * OpenMoji draws the strawberry in the apple's red, and two red fruits on one
 * board are two a child has to look at twice.
 */
export const FRUIT_NAMES = ['apple', 'banana', 'grapes', 'pear'] as const

/* --- units and peers ---------------------------------------- */

const unitCache = new Map<string, number[][]>()
const peerCache = new Map<string, number[][]>()

const shapeKey = (n: number, boxH: number, boxW: number) => `${n}:${boxH}:${boxW}`

/**
 * Every row, then every column, then every box, as lists of cell indices. That
 * order is load-bearing: `clashOf` reads a unit's kind off its position here.
 */
export function unitsOf(n: number, boxH: number, boxW: number): number[][] {
  const key = shapeKey(n, boxH, boxW)
  const hit = unitCache.get(key)
  if (hit) return hit
  const units: number[][] = []
  for (let r = 0; r < n; r++) units.push(Array.from({ length: n }, (_, c) => r * n + c))
  for (let c = 0; c < n; c++) units.push(Array.from({ length: n }, (_, r) => r * n + c))
  for (let br = 0; br < n / boxH; br++) {
    for (let bc = 0; bc < n / boxW; bc++) {
      const box: number[] = []
      for (let r = 0; r < boxH; r++) {
        for (let c = 0; c < boxW; c++) box.push((br * boxH + r) * n + bc * boxW + c)
      }
      units.push(box)
    }
  }
  unitCache.set(key, units)
  return units
}

/** Every cell that shares a row, column or box with this one. */
export function peersOf(n: number, boxH: number, boxW: number): number[][] {
  const key = shapeKey(n, boxH, boxW)
  const hit = peerCache.get(key)
  if (hit) return hit
  const sets = Array.from({ length: n * n }, () => new Set<number>())
  for (const unit of unitsOf(n, boxH, boxW)) {
    for (const a of unit) for (const b of unit) if (a !== b) sets[a].add(b)
  }
  const peers = sets.map((s) => [...s])
  peerCache.set(key, peers)
  return peers
}

/* --- the solver ---------------------------------------------- */

interface SolveResult {
  /** Capped at `cap`, so 2 means "two or more". */
  count: number
  first: number[] | null
}

/**
 * Backtracking search, always branching on the square with the fewest
 * candidates, and stopping the moment `cap` solutions have been found.
 */
function searchGrid(
  grid: number[],
  n: number,
  boxH: number,
  boxW: number,
  cap: number,
): SolveResult {
  const peers = peersOf(n, boxH, boxW)
  const g = grid.slice()
  let count = 0
  let first: number[] | null = null
  const fits = (i: number, v: number) => peers[i].every((p) => g[p] !== v)

  // A clue grid that already breaks the rules has no solutions at all.
  for (let i = 0; i < g.length; i++) {
    const v = g[i]
    if (v === 0) continue
    g[i] = 0
    const legal = fits(i, v)
    g[i] = v
    if (!legal) return { count: 0, first: null }
  }

  const step = (): void => {
    let target = -1
    let best: number[] | null = null
    for (let i = 0; i < g.length; i++) {
      if (g[i] !== 0) continue
      const cands: number[] = []
      for (let v = 1; v <= n; v++) if (fits(i, v)) cands.push(v)
      if (cands.length === 0) return
      if (best === null || cands.length < best.length) {
        target = i
        best = cands
      }
      if (cands.length === 1) break
    }
    if (best === null) {
      count++
      if (first === null) first = g.slice()
      return
    }
    for (const v of best) {
      g[target] = v
      step()
      g[target] = 0
      if (count >= cap) return
    }
  }

  step()
  return { count, first }
}

/** How many ways this clue grid can be completed, counted no further than `cap`. */
export function countSolutions(
  grid: number[],
  n: number,
  boxH: number,
  boxW: number,
  cap = 2,
): number {
  return searchGrid(grid, n, boxH, boxW, cap).count
}

/** The completed grid, or null if there is none. */
export function solveGrid(
  grid: number[],
  n: number,
  boxH: number,
  boxW: number,
): number[] | null {
  return searchGrid(grid, n, boxH, boxW, 1).first
}

/**
 * Fill the grid using only the two moves an eight-year-old can actually make:
 * "this square has one candidate left" and "this number has one square left in
 * its row, column or box". Returns null the moment it has to guess.
 */
export function solveBySingles(
  grid: number[],
  n: number,
  boxH: number,
  boxW: number,
): number[] | null {
  const units = unitsOf(n, boxH, boxW)
  const peers = peersOf(n, boxH, boxW)
  const g = grid.slice()
  const fits = (i: number, v: number) => peers[i].every((p) => g[p] !== v)

  let moved = true
  while (moved) {
    moved = false
    for (let i = 0; i < g.length; i++) {
      if (g[i] !== 0) continue
      let only = 0
      let seen = 0
      for (let v = 1; v <= n; v++) if (fits(i, v)) { only = v; seen++ }
      if (seen === 0) return null
      if (seen === 1) { g[i] = only; moved = true }
    }
    for (const unit of units) {
      for (let v = 1; v <= n; v++) {
        if (unit.some((i) => g[i] === v)) continue
        const spots = unit.filter((i) => g[i] === 0 && fits(i, v))
        if (spots.length === 0) return null
        if (spots.length === 1) { g[spots[0]] = v; moved = true }
      }
    }
  }
  return g.every((v) => v !== 0) ? g : null
}

/* --- the symmetry group -------------------------------------- */

/**
 * A re-arrangement of the grid onto itself. Rows only ever move within their
 * band and columns within their stack (or whole bands and stacks swap), so
 * every row, column and box maps onto a row, column or box: the constraints
 * are identical afterwards, and so is the number of solutions.
 */
export interface Geometry {
  /** rows[r] is the source row that ends up as row r. */
  rows: number[]
  /** cols[c] is the source column that ends up as column c. */
  cols: number[]
  /** Only legal when the boxes are square — 2x3 boxes do not survive a flip. */
  transpose: boolean
}

function permutations(m: number): number[][] {
  if (m === 0) return [[]]
  const out: number[][] = []
  const walk = (chosen: number[], rest: number[]) => {
    if (rest.length === 0) { out.push(chosen); return }
    for (let i = 0; i < rest.length; i++) {
      walk([...chosen, rest[i]], rest.filter((_, j) => j !== i))
    }
  }
  walk([], Array.from({ length: m }, (_, i) => i))
  return out
}

/** Every permutation of 0..n-1 that keeps each block of `group` lines together. */
export function allLinePermutations(n: number, group: number): number[][] {
  const blocks = n / group
  const inner = permutations(group)
  const out: number[][] = []
  for (const blockOrder of permutations(blocks)) {
    const build = (k: number, acc: number[]) => {
      if (k === blocks) { out.push(acc); return }
      for (const ip of inner) build(k + 1, [...acc, ...ip.map((i) => blockOrder[k] * group + i)])
    }
    build(0, [])
  }
  return out
}

/** The whole group. 128 members at 4x4, 3456 at 6x6. */
export function allGeometries(n: number, boxH: number, boxW: number): Geometry[] {
  const rowOptions = allLinePermutations(n, boxH)
  const colOptions = allLinePermutations(n, boxW)
  const flips = boxH === boxW ? [false, true] : [false]
  const out: Geometry[] = []
  for (const rows of rowOptions) {
    for (const cols of colOptions) {
      for (const transpose of flips) out.push({ rows, cols, transpose })
    }
  }
  return out
}

function randomLinePermutation(rng: Rng, n: number, group: number): number[] {
  const blocks = shuffled(rng, Array.from({ length: n / group }, (_, i) => i))
  const out: number[] = []
  for (const b of blocks) {
    for (const i of shuffled(rng, Array.from({ length: group }, (_, k) => k))) out.push(b * group + i)
  }
  return out
}

export function randomGeometry(rng: Rng, n: number, boxH: number, boxW: number): Geometry {
  return {
    rows: randomLinePermutation(rng, n, boxH),
    cols: randomLinePermutation(rng, n, boxW),
    transpose: boxH === boxW && rng() < 0.5,
  }
}

export function applyGeometry(grid: number[], n: number, geo: Geometry): number[] {
  const out = new Array<number>(n * n).fill(0)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const value = grid[geo.rows[r] * n + geo.cols[c]]
      out[geo.transpose ? c * n + r : r * n + c] = value
    }
  }
  return out
}

/** labels[v - 1] is the symbol that replaces v. Blanks stay blank. */
export function relabel(grid: number[], labels: number[]): number[] {
  return grid.map((v) => (v === 0 ? 0 : labels[v - 1]))
}

/**
 * A fingerprint that is equal for two clue grids exactly when one can be
 * turned into the other by the transformations above — the smallest string
 * over the whole geometric group, with symbols renamed in the order they are
 * first met. Used by the tests to show the bank holds distinct puzzles.
 */
export function canonicalKey(grid: number[], n: number, boxH: number, boxW: number): string {
  let best: string | null = null
  for (const geo of allGeometries(n, boxH, boxW)) {
    const moved = applyGeometry(grid, n, geo)
    const seen = new Map<number, number>()
    let next = 1
    let key = ''
    for (const v of moved) {
      if (v === 0) { key += '.'; continue }
      let name = seen.get(v)
      if (name === undefined) { name = next++; seen.set(v, name) }
      key += name
    }
    if (best === null || key < best) best = key
  }
  return best as string
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<SudokuConfig>, rng: Rng): SudokuState {
  const { n, boxH, boxW, symbols, bank } = level.config
  const clues = pick(rng, bank)
  const geo = randomGeometry(rng, n, boxH, boxW)
  const labels = shuffled(rng, Array.from({ length: n }, (_, i) => i + 1))
  return {
    n,
    boxH,
    boxW,
    symbols,
    givens: relabel(applyGeometry(clues, n, geo), labels),
    entries: new Array<number>(n * n).fill(0),
  }
}

export function reduce(state: SudokuState, action: SudokuAction): SudokuState {
  if (action.type !== 'set') return state
  const { index, value } = action
  if (!Number.isInteger(index) || index < 0 || index >= state.givens.length) return state
  if (!Number.isInteger(value) || value < 0 || value > state.n) return state
  // A printed clue is not yours to change, and rewriting what is already
  // there is not a move.
  if (state.givens[index] !== 0) return state
  if (state.entries[index] === value) return state
  const entries = state.entries.slice()
  entries[index] = value
  return { ...state, entries }
}

export function valuesOf(state: SudokuState): number[] {
  return state.givens.map((g, i) => (g !== 0 ? g : state.entries[i]))
}

export function isSolved(state: SudokuState): boolean {
  const values = valuesOf(state)
  if (values.some((v) => v === 0)) return false
  for (const unit of unitsOf(state.n, state.boxH, state.boxW)) {
    if (new Set(unit.map((i) => values[i])).size !== state.n) return false
  }
  return true
}

/**
 * Which of the player's own answers repeat inside a row, column or box.
 * Clues are never flagged — they are always right, it is the answer beside
 * them that is wrong.
 */
export function conflicts(state: SudokuState): boolean[] {
  const peers = peersOf(state.n, state.boxH, state.boxW)
  const values = valuesOf(state)
  return values.map(
    (v, i) => state.givens[i] === 0 && v !== 0 && peers[i].some((p) => values[p] === v),
  )
}

/** What kind of unit a symbol has landed in twice. */
export type UnitKind = 'row' | 'column' | 'box'

/** One placement, and the unit it leaves holding the same symbol twice. */
export interface Clash {
  kind: UnitKind
  /** Which row or column, counting from 1. A box is numbered too, and never said out loud. */
  ordinal: number
  /** Every square in that unit, so a board can light the whole of it. */
  cells: number[]
  /** The squares in it that hold the symbol: the one just written, and the one it repeats. */
  blamed: number[]
  /** The symbol that has landed twice. */
  value: number
}

/** `unitsOf` lists rows, then columns, then boxes, so a unit's place in it names it. */
function unitAt(u: number, n: number): { kind: UnitKind; ordinal: number } {
  if (u < n) return { kind: 'row', ordinal: u + 1 }
  if (u < 2 * n) return { kind: 'column', ordinal: u - n + 1 }
  return { kind: 'box', ordinal: u - 2 * n + 1 }
}

/**
 * The unit that writing `value` into `index` leaves holding that symbol twice,
 * or null if the square takes it cleanly. One placement can break a row, a
 * column and a box at once, and only the first is reported: three units lit
 * together would say nothing about any of them, and the row is the line a
 * child scans fastest.
 */
export function clashOf(state: SudokuState, index: number, value: number): Clash | null {
  if (value === 0 || state.givens[index] !== 0) return null
  const values = valuesOf(state)
  values[index] = value
  const units = unitsOf(state.n, state.boxH, state.boxW)
  for (let u = 0; u < units.length; u++) {
    const cells = units[u]
    if (!cells.includes(index)) continue
    const blamed = cells.filter((i) => values[i] === value)
    if (blamed.length > 1) return { ...unitAt(u, state.n), cells, blamed, value }
  }
  return null
}

/** The broken rule in one sentence. The lit unit says where; this says what. */
export function describeClash(state: SudokuState, clash: Clash): string {
  const where = clash.kind === 'box' ? 'this box' : `${clash.kind} ${clash.ordinal}`
  return `The ${symbolName(state.symbols, clash.value)} is already in ${where}.`
}

/** Squares still to fill. Each one costs exactly one move, so this is par. */
export function blankCount(state: SudokuState): number {
  return state.givens.reduce((sum, g, i) => sum + (g === 0 && state.entries[i] === 0 ? 1 : 0), 0)
}

export function filledCount(state: SudokuState): number {
  return valuesOf(state).reduce((sum, v) => sum + (v === 0 ? 0 : 1), 0)
}

export function symbolName(symbols: SymbolSet, value: number): string {
  if (value === 0) return 'empty'
  return symbols === 'fruit' ? FRUIT_NAMES[value - 1] : String(value)
}

export function describeMove(
  prev: SudokuState,
  _next: SudokuState,
  action: SudokuAction,
): string {
  const row = Math.floor(action.index / prev.n) + 1
  const col = (action.index % prev.n) + 1
  const where = `row ${row}, column ${col}`
  if (action.value === 0) return `Rubbed out ${where}`
  return prev.symbols === 'fruit'
    ? `Put the ${FRUIT_NAMES[action.value - 1]} in ${where}`
    : `Put ${action.value} in ${where}`
}

/** Every action that would change something. Used by the tests to check `par`. */
export function legalMoves(state: SudokuState): SudokuAction[] {
  const out: SudokuAction[] = []
  for (let index = 0; index < state.givens.length; index++) {
    if (state.givens[index] !== 0) continue
    for (let value = 0; value <= state.n; value++) {
      if (value !== state.entries[index]) out.push({ type: 'set', index, value })
    }
  }
  return out
}
