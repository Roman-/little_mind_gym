import type { PuzzleLevel, Rng } from '../../lib/types'
import { shuffled } from '../../lib/rng'

export interface LightsConfig {
  width: number
  height: number
  /**
   * How many presses the shortest solution takes. `init` keeps drawing until
   * it finds a board that really needs exactly this many, so the level's `par`
   * is true for every seed.
   */
  presses: number
}

export interface LightsState {
  width: number
  height: number
  /** Row-major, one boolean per lamp. */
  lit: boolean[]
}

/** One press. Flips the lamp, and the lamps above, below and beside it. */
export type LightsAction = { type: 'press'; index: number }

/** The GF(2) solver works in 32-bit masks, so it needs n + 1 bits to spare. */
const MAX_CELLS = 30

/** Random draws before `init` gives up and takes the deterministic board. */
const MAX_DRAWS = 256

/* ------------------------------------------------------------------ *
 * The board
 * ------------------------------------------------------------------ */

/** Indices a press at `index` flips: itself plus its orthogonal neighbours. */
export function neighbourhood(width: number, height: number, index: number): number[] {
  const row = Math.floor(index / width)
  const col = index % width
  const out = [index]
  if (col > 0) out.push(index - 1)
  if (col < width - 1) out.push(index + 1)
  if (row > 0) out.push(index - width)
  if (row < height - 1) out.push(index + width)
  return out.sort((a, b) => a - b)
}

/** The same neighbourhood as a bitmask. Symmetric: cell c is flipped by p iff p is flipped by c. */
function toggleMask(width: number, height: number, index: number): number {
  let m = 0
  for (const i of neighbourhood(width, height, index)) m |= 1 << i
  return m
}

/** A new lamp array with the press at `index` applied. Never mutates `lit`. */
export function pressAt(
  lit: readonly boolean[],
  width: number,
  height: number,
  index: number,
): boolean[] {
  const next = lit.slice()
  for (const i of neighbourhood(width, height, index)) next[i] = !next[i]
  return next
}

/** The board you get by pressing `presses` on an all-dark grid. */
export function boardFrom(
  width: number,
  height: number,
  presses: readonly number[],
): boolean[] {
  let lit = new Array<boolean>(width * height).fill(false)
  for (const p of presses) lit = pressAt(lit, width, height, p)
  return lit
}

function toMask(lit: readonly boolean[]): number {
  let m = 0
  for (let i = 0; i < lit.length; i++) if (lit[i]) m |= 1 << i
  return m
}

function maskToIndices(mask: number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) if ((mask >>> i) & 1) out.push(i)
  return out
}

/* ------------------------------------------------------------------ *
 * The solver
 *
 * Presses commute and pressing twice undoes itself, so a solution is a
 * *set* of lamps, not a sequence: exactly the solutions of A x = b over
 * GF(2), where column p of A is the neighbourhood of p and b is the lit
 * pattern. A is symmetric, so row c is also the neighbourhood of c.
 *
 * Gauss-Jordan gives one particular solution plus a basis of the null
 * space; the whole solution coset is 2^nullity vectors (1 for 3x3, 16
 * for 4x4, 4 for 5x5), so the lightest is found by enumeration.
 * ------------------------------------------------------------------ */

interface Reduced {
  n: number
  /** Reduced rows; bits 0..n-1 are coefficients, bit n is the right-hand side. */
  rows: number[]
  /** Column pivoted by row i, ascending. */
  pivotCol: number[]
  /** Columns with no pivot — the free variables. */
  freeCol: number[]
  consistent: boolean
}

function eliminate(lit: readonly boolean[], width: number, height: number): Reduced {
  const n = width * height
  if (lit.length !== n) throw new Error('lamp count does not match the grid')
  if (n > MAX_CELLS) throw new Error('grid too large for the 32-bit GF(2) solver')

  const b = toMask(lit)
  const rows: number[] = []
  for (let c = 0; c < n; c++) {
    rows.push(toggleMask(width, height, c) | (((b >>> c) & 1) << n))
  }

  const pivotCol: number[] = []
  const freeCol: number[] = []
  let rank = 0
  for (let col = 0; col < n; col++) {
    let sel = -1
    for (let r = rank; r < n; r++) {
      if ((rows[r] >>> col) & 1) {
        sel = r
        break
      }
    }
    if (sel === -1) {
      freeCol.push(col)
      continue
    }
    const swap = rows[rank]
    rows[rank] = rows[sel]
    rows[sel] = swap
    for (let r = 0; r < n; r++) {
      if (r !== rank && ((rows[r] >>> col) & 1)) rows[r] ^= rows[rank]
    }
    pivotCol.push(col)
    rank++
  }

  let consistent = true
  for (let r = rank; r < n; r++) if ((rows[r] >>> n) & 1) consistent = false

  return { n, rows, pivotCol, freeCol, consistent }
}

/**
 * Every set of presses that clears the board, each as ascending indices.
 * The whole solution coset: 2^nullity of them. Empty when the pattern is
 * unreachable — which a board built out of presses never is.
 */
export function allSolutions(lit: readonly boolean[], width: number, height: number): number[][] {
  const { n, rows, pivotCol, freeCol, consistent } = eliminate(lit, width, height)
  if (!consistent) return []

  // One particular solution: free variables at 0, pivots read off the right-hand side.
  let particular = 0
  for (let i = 0; i < pivotCol.length; i++) {
    if ((rows[i] >>> n) & 1) particular |= 1 << pivotCol[i]
  }

  // A null-space basis: set one free variable, read the pivots it forces.
  const basis = freeCol.map((f) => {
    let v = 1 << f
    for (let i = 0; i < pivotCol.length; i++) {
      if ((rows[i] >>> f) & 1) v |= 1 << pivotCol[i]
    }
    return v
  })

  const out: number[][] = []
  for (let combo = 0; combo < 1 << basis.length; combo++) {
    let x = particular
    for (let j = 0; j < basis.length; j++) if ((combo >>> j) & 1) x ^= basis[j]
    out.push(maskToIndices(x, n))
  }
  return out
}

/** Lexicographic order on ascending index lists — a stable tie-break, nothing more. */
function lighter(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return a.length < b.length
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]
  return false
}

/**
 * The fewest presses that clear the board, or null if there is no such set.
 * Its length is the level's par, and any one of its entries is a genuinely
 * useful lamp to press first.
 */
export function minimalSolution(
  lit: readonly boolean[],
  width: number,
  height: number,
): number[] | null {
  const all = allSolutions(lit, width, height)
  if (all.length === 0) return null
  let best = all[0]
  for (const candidate of all) if (lighter(candidate, best)) best = candidate
  return best
}

/* ------------------------------------------------------------------ *
 * Generation
 *
 * A scramble of k random presses is *not* a board that takes k presses to
 * clear: two presses can land on the same lamp and cancel, and on the 4x4
 * and 5x5 the solution set has other, lighter members. Both happen often
 * enough to hand a player a one-press "puzzle", so every candidate board
 * is checked against the solver and redrawn until its shortest solution is
 * exactly `presses` long. That is what makes the level's par true.
 * ------------------------------------------------------------------ */

/** True when clearing `lit` takes exactly `presses` presses and no fewer. */
export function needsExactly(
  lit: readonly boolean[],
  width: number,
  height: number,
  presses: number,
): boolean {
  return minimalSolution(lit, width, height)?.length === presses
}

/**
 * The first board, in lexicographic order of press sets, that needs exactly
 * `presses` presses. Deterministic; `scramble` falls back to it, and a test
 * pins that it exists for every level, so the throw below is unreachable.
 */
export function firstBoard(width: number, height: number, presses: number): boolean[] | null {
  const n = width * height
  if (presses > n || presses < 0) return null
  const pick = Array.from({ length: presses }, (_, i) => i)
  for (;;) {
    const lit = boardFrom(width, height, pick)
    if (needsExactly(lit, width, height, presses)) return lit
    let i = presses - 1
    while (i >= 0 && pick[i] === n - presses + i) i--
    if (i < 0) return null
    pick[i]++
    for (let j = i + 1; j < presses; j++) pick[j] = pick[j - 1] + 1
  }
}

/** A random board whose shortest solution is exactly `presses` presses long. */
export function scramble(width: number, height: number, presses: number, rng: Rng): boolean[] {
  const cells = Array.from({ length: width * height }, (_, i) => i)
  for (let draw = 0; draw < MAX_DRAWS; draw++) {
    const lit = boardFrom(width, height, shuffled(rng, cells).slice(0, presses))
    if (needsExactly(lit, width, height, presses)) return lit
  }
  const settled = firstBoard(width, height, presses)
  if (settled === null) {
    throw new Error(`no ${width}x${height} board needs exactly ${presses} presses`)
  }
  return settled
}

/* ------------------------------------------------------------------ *
 * The engine
 * ------------------------------------------------------------------ */

export function init(level: PuzzleLevel<LightsConfig>, rng: Rng): LightsState {
  const { width, height, presses } = level.config
  return { width, height, lit: scramble(width, height, presses, rng) }
}

export function reduce(state: LightsState, action: LightsAction): LightsState {
  if (action?.type !== 'press') return state
  const { index } = action
  if (!Number.isInteger(index) || index < 0 || index >= state.lit.length) return state
  return { ...state, lit: pressAt(state.lit, state.width, state.height, index) }
}

export function isSolved(state: LightsState): boolean {
  return state.lit.length > 0 && state.lit.every((on) => !on)
}

export function litCount(state: LightsState): number {
  return state.lit.reduce((n, on) => (on ? n + 1 : n), 0)
}

export function describeMove(prev: LightsState, _next: LightsState, action: LightsAction): string {
  const row = Math.floor(action.index / prev.width) + 1
  const col = (action.index % prev.width) + 1
  return `Pressed row ${row}, column ${col}`
}
