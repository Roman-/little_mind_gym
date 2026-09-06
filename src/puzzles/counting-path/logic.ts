import { randInt, shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The counting path.

   A square grid holds the numbers 1 to n*n, one to a square,
   and each number sits next to the one before it. Some of them
   are printed; the rest are yours to write. It is the newspaper
   puzzle sold as Numbrix — Hidato's orthogonal cousin.

   Orthogonal on purpose. Hidato lets the chain step corner to
   corner, and three things say no to that here: a right-angled
   chain reads as a path at the size of a collection card and a
   diagonal scribble does not, "up, down, left or right" is a
   check an eight-year-old makes reliably, and the garden cats
   already teach corner-to-corner as the thing a cat may *not*
   do. One collection, one meaning for touching.

   Everything here is pure and framework-free. Three things are
   worth reading twice.

   `solveByLogic` fills a board using only the two steps an
   eight-year-old can actually make, and `deal` throws away every
   board it cannot finish. A solver that only ever writes a
   number where the rules leave one square also proves the board
   has exactly one answer, so uniqueness and "no guessing" are
   one check here rather than two. The two steps are gated on
   `reach`, which is how far apart two numbers may be before the
   solver stops measuring the distance between them: it is the
   dial that keeps the solver's arithmetic inside a child's.

   `randomPath` draws the answer before anything else exists, by
   backbite — a move that turns one Hamiltonian path into
   another and cannot fail — so no board is ever dealt without
   an answer, and there is no retry loop to get one.

   And the thing this board deliberately does not do: it says
   nothing when a legal number strands a corner of the grid. A
   number that touches the one before it and has not been used
   breaks no rule, and it can still leave a square that nothing
   can ever reach. Saying so would mean running the solver, and
   running the solver would hand the child the reasoning they
   came for. So the board stays quiet, and the rubber and the
   shell's Step back are the way out — one move each. A child
   who only ever writes a number they can argue for never gets
   there at all, because every such number is on the one answer,
   and that is exactly what `deal` buys by throwing away every
   board its two-step solver cannot finish.
   ============================================================ */

export interface PathConfig {
  /** Rows and columns. The numbers run 1..n*n. */
  n: number
  /** How many numbers are printed. `n * n - givens` is the level's par. */
  givens: number
  /**
   * The widest gap between two numbers already on the board that the solver
   * may measure a distance across. A gap of 1 — "next to" — is always used, whatever this
   * says. It is the dial that keeps the solver's reach inside a child's.
   */
  reach: number
  /** Passes over the two steps in `solveByLogic`, at least and at most. */
  minRounds: number
  maxRounds: number
}

export interface PathState {
  /** Rows and columns. The numbers run 1..n*n. */
  n: number
  /** Row-major. Non-zero where the number was printed. Never changes. */
  givens: number[]
  /** Row-major. Every number on the board, printed or written. 0 is empty. */
  cells: number[]
}

/**
 * One tap, and one move a player would count. Choosing which number to grow
 * from, and turning the pen round, are selection: they live in Board.tsx and
 * are never dispatched.
 */
export type PathAction =
  | { type: 'write'; index: number; value: number }
  | { type: 'rub'; index: number }

/** Which way the pen counts. A literal union, so no enum. */
export type Way = 1 | -1

/** The board's choice of pen, before the state has had its say about it. */
export interface PenChoice {
  anchor: number
  way: Way
}

/** What the pen chip shows. Worked out from the state and one `PenChoice`. */
export interface Pen {
  /**
   * The square the pen grows from — a square with a number on it, in every
   * state this puzzle can reach, because 1 is always printed.
   */
  anchor: number
  /** The number on the anchor. */
  from: number
  way: Way
  /** The number the next tap on an empty square writes, or null if there is none. */
  value: number | null
  /** True when the other side of the anchor is open too, so turning means something. */
  canTurn: boolean
}

/** A move the rules will not keep, and the sentence that says why. */
export interface PathRefusal {
  /** The board with the number written where the child put it. Drawn, never played. */
  pretend: PathState
  message: string
  /** The square the cue points at, as its index. */
  where: string
}

/* --- reading the grid ---------------------------------------- */

export const rowOf = (n: number, index: number): number => Math.floor(index / n)
export const colOf = (n: number, index: number): number => index % n

/** The squares that share an edge with this one. The chain steps along these. */
export function orthogonal(n: number, index: number): number[] {
  const r = rowOf(n, index)
  const c = colOf(n, index)
  const out: number[] = []
  if (r > 0) out.push(index - n)
  if (c > 0) out.push(index - 1)
  if (c < n - 1) out.push(index + 1)
  if (r < n - 1) out.push(index + n)
  return out
}

/** True when these two squares share an edge. Corner to corner is not touching. */
export function touches(n: number, a: number, b: number): boolean {
  if (a < 0 || b < 0 || a === b) return false
  const dr = Math.abs(rowOf(n, a) - rowOf(n, b))
  const dc = Math.abs(colOf(n, a) - colOf(n, b))
  return dr + dc === 1
}

/**
 * Where each number is, indexed by the number itself: `at[v]` is its square,
 * or -1 if it is not on the board. Two slots longer than the grid, so `at[0]`
 * and `at[n * n + 1]` answer -1 and the ends of the chain need no special case.
 */
export function cellOf(n: number, placed: number[]): number[] {
  const at = new Array<number>(n * n + 2).fill(-1)
  for (let i = 0; i < placed.length; i++) {
    const v = placed[i]
    if (v > 0 && v <= n * n) at[v] = i
  }
  return at
}

/** Squares still to fill. Each one costs exactly one move, so this is par. */
export function blankCount(state: PathState): number {
  return state.cells.reduce((sum, v) => sum + (v === 0 ? 1 : 0), 0)
}

/** Squares with a number on them, printed or written. */
export function filledCount(state: PathState): number {
  return state.cells.reduce((sum, v) => sum + (v === 0 ? 0 : 1), 0)
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<PathConfig>, rng: Rng): PathState {
  const { n } = level.config
  const givens = deal(rng, level.config)
  return { n, givens, cells: givens.slice() }
}

/**
 * Every branch below hands back the identical object, which is the only signal
 * the shell has that nothing happened. Two of them are rules a child can
 * break — the number is already on the board, and it does not touch the number
 * before or after it — and `refusalOf` mirrors those so the board can offer the
 * move and answer it afterwards. The rest are nothing happening, and the
 * control that would send them stays honestly dead.
 */
export function reduce(state: PathState, action: PathAction): PathState {
  if (action.type === 'write') {
    const { index, value } = action
    const size = state.n * state.n
    if (!Number.isInteger(index) || index < 0 || index >= size) return state
    if (!Number.isInteger(value) || value < 1 || value > size) return state
    // A printed number is not yours to change, and a square with a number on
    // it is armed rather than written into.
    if (state.givens[index] !== 0) return state
    if (state.cells[index] !== 0) return state
    if (state.cells.includes(value)) return state
    const at = cellOf(state.n, state.cells)
    const before = at[value - 1]
    const after = at[value + 1]
    // A write always grows the chain out of a number that is already down.
    // That is stricter than the printed rule, and it is what lets one tap
    // write one number rather than needing a keypad of thirty-six keys.
    if (before < 0 && after < 0) return state
    if (before >= 0 && !touches(state.n, index, before)) return state
    if (after >= 0 && !touches(state.n, index, after)) return state
    const cells = state.cells.slice()
    cells[index] = value
    return { ...state, cells }
  }

  if (action.type === 'rub') {
    const { index } = action
    if (!Number.isInteger(index) || index < 0 || index >= state.n * state.n) return state
    if (state.givens[index] !== 0) return state
    if (state.cells[index] === 0) return state
    const cells = state.cells.slice()
    cells[index] = 0
    return { ...state, cells }
  }

  return state
}

/**
 * Every square has a number, the numbers are 1 to n*n with none missing, and
 * every number touches the one before it.
 *
 * The last of those three is already guaranteed by `reduce`, so a full board
 * is always a solved board — but it is written out anyway, because the win
 * condition should be the printed rule rather than a claim about the reducer.
 */
export function isSolved(state: PathState): boolean {
  const { n, cells } = state
  const size = n * n
  if (cells.some((v) => v === 0)) return false
  const at = cellOf(n, cells)
  for (let v = 1; v <= size; v++) if (at[v] < 0) return false
  for (let v = 2; v <= size; v++) if (!touches(n, at[v - 1], at[v])) return false
  return true
}

/**
 * The rule that writing `value` into `index` breaks, or null if the square
 * takes it. `from` is the number the pen was growing out of, so that when both
 * of a number's neighbours are down and neither of them touches, the sentence
 * names the one the child was counting from.
 *
 * Total on purpose: the board can only ever produce the adjacency refusal,
 * because the pen offers `anchor ± 1` and skips a side whose number is already
 * written. The duplicate sentence is here so the function answers for every
 * move, and the test holds the board to never firing it.
 */
export function refusalOf(
  state: PathState,
  index: number,
  value: number,
  from = 0,
): PathRefusal | null {
  const { n } = state
  const size = n * n
  if (!Number.isInteger(index) || index < 0 || index >= size) return null
  if (!Number.isInteger(value) || value < 1 || value > size) return null
  if (state.givens[index] !== 0 || state.cells[index] !== 0) return null

  const cells = state.cells.slice()
  cells[index] = value
  const pretend: PathState = { ...state, cells }
  const where = String(index)

  if (state.cells.includes(value)) {
    return { pretend, message: `There is already a ${value} on the board.`, where }
  }

  const at = cellOf(n, state.cells)
  const missed: number[] = []
  if (at[value - 1] >= 0 && !touches(n, index, at[value - 1])) missed.push(value - 1)
  if (at[value + 1] >= 0 && !touches(n, index, at[value + 1])) missed.push(value + 1)
  if (missed.length === 0) return null
  const named = missed.includes(from) ? from : missed[0]
  return { pretend, message: `${value} has to touch ${named}.`, where }
}

export function describeMove(prev: PathState, _next: PathState, action: PathAction): string {
  const where = `row ${rowOf(prev.n, action.index) + 1}, column ${colOf(prev.n, action.index) + 1}`
  if (action.type === 'rub') return `Rubbed out ${where}`
  return `Wrote ${action.value} in ${where}`
}

/** Every action that would change something. Used by the tests to check `par`. */
export function legalMoves(state: PathState): PathAction[] {
  const size = state.n * state.n
  const out: PathAction[] = []
  for (let index = 0; index < size; index++) {
    if (state.givens[index] !== 0) continue
    if (state.cells[index] !== 0) {
      out.push({ type: 'rub', index })
      continue
    }
    for (let value = 1; value <= size; value++) {
      if (reduce(state, { type: 'write', index, value }) !== state) {
        out.push({ type: 'write', index, value })
      }
    }
  }
  return out
}

/* --- the pen -------------------------------------------------- */

/**
 * Where the pen goes when the board has not been told, or has been told
 * something that is no longer true: the lowest number whose successor is
 * missing, else the highest number whose predecessor is missing, else the
 * square holding 1. Pure, so a rewind through the move tape can never leave
 * the pen pointing at a square that is now empty.
 */
export function defaultChoice(state: PathState): PenChoice {
  const { n } = state
  const size = n * n
  const at = cellOf(n, state.cells)
  for (let v = 1; v <= size; v++) {
    if (at[v] >= 0 && v < size && at[v + 1] < 0) return { anchor: at[v], way: 1 }
  }
  for (let v = size; v >= 1; v--) {
    if (at[v] >= 0 && v > 1 && at[v - 1] < 0) return { anchor: at[v], way: -1 }
  }
  // The board is full, so every number has both its neighbours: the pen goes
  // back to the start of the chain. (`at[1]` is only ever -1 on a board with
  // nothing printed at all, which is not a board this puzzle deals.)
  return { anchor: Math.max(0, at[1]), way: 1 }
}

/**
 * What the pen chip shows: the square it grows from, the number the next tap
 * writes, and whether turning it round would mean anything.
 *
 * It picks the only open way by itself, so most children never have to turn
 * it. When both sides of the anchor are already on the board there is nothing
 * to write, and `value` is null.
 */
export function penOf(state: PathState, choice: PenChoice | null): Pen {
  const { n } = state
  const size = n * n
  const usable =
    choice !== null &&
    Number.isInteger(choice.anchor) &&
    choice.anchor >= 0 &&
    choice.anchor < size &&
    state.cells[choice.anchor] !== 0
  const settled = usable ? (choice as PenChoice) : defaultChoice(state)
  const anchor = settled.anchor
  const from = state.cells[anchor]
  const at = cellOf(n, state.cells)
  const openUp = from < size && at[from + 1] < 0
  const openDown = from > 1 && at[from - 1] < 0
  // It turns itself round only when the way it was asked for is shut and the
  // other one is open. With both shut it keeps the way it was given, so the
  // chip does not appear to have flipped on its own.
  const shut = settled.way === 1 ? !openUp && openDown : !openDown && openUp
  const way: Way = shut ? ((settled.way === 1 ? -1 : 1) as Way) : settled.way
  const open = way === 1 ? openUp : openDown
  return { anchor, from, way, value: open ? from + way : null, canTurn: openUp && openDown }
}

/* ============================================================
   Reasoning a board out

   Two steps, and between them they are everything a child says
   out loud at this board.

   One: a number with only one square left to go in goes there.
   That is the squeeze — 7 and 9 both down with one free square
   between them — and it is also the corridor: 6 here, 10 four
   steps away with three numbers to fit between them, so the run
   walks straight along and every square of it is settled at
   once.

   Two, and only when the first has run out: a square with only
   one number left that could go in it takes that number.

   Both lean on the same question, `can`, and every clause of it
   is *sound* — it never rules out a square that some real answer
   uses. So "one candidate left" is a real deduction, and a board
   this solver finishes has exactly one answer. `countSolutions`
   below is held against it in the tests to keep that honest.

   What is deliberately not in here: any argument about a region
   of the grid being cut off. It would certify boards a child
   cannot finish, which is the one thing this solver exists to
   prevent.
   ============================================================ */

/** What a board asked to be reasoned through gives back. */
export interface Deduction {
  /** `path[v - 1]` is the square holding the number v. */
  path: number[]
  /** Passes over the two steps it took. This is the level's difficulty. */
  rounds: number
}

export function solveByLogic(n: number, givens: number[], reach: number): Deduction | null {
  const size = n * n
  if (givens.length !== size) return null
  const owner = givens.slice()
  const at = cellOf(n, owner)
  let placed = 0
  for (const v of owner) if (v !== 0) placed++
  // A clue grid that names the same number twice, or one that starts with two
  // consecutive numbers apart, has no answer to reason towards.
  {
    const seen = new Set<number>()
    for (const v of owner) {
      if (v === 0) continue
      if (v < 1 || v > size || seen.has(v)) return null
      seen.add(v)
    }
    for (let v = 2; v <= size; v++) {
      if (at[v - 1] >= 0 && at[v] >= 0 && !touches(n, at[v - 1], at[v])) return null
    }
  }

  /**
   * How many steps from a square with a number on it to each empty square,
   * counted through empty squares only. Every square a run passes through is
   * empty now, so this is a sound lower bound on how long that run can be.
   *
   * One walk per source, thrown away whenever a number goes down, because the
   * empty squares are what it was counted over.
   */
  let walks = new Map<number, number[]>()
  const stepsFrom = (source: number): number[] => {
    const hit = walks.get(source)
    if (hit !== undefined) return hit
    const steps = new Array<number>(size).fill(-1)
    steps[source] = 0
    let frontier = [source]
    while (frontier.length > 0) {
      const next: number[] = []
      for (const c of frontier) {
        for (const nb of orthogonal(n, c)) {
          if (steps[nb] !== -1 || owner[nb] !== 0) continue
          steps[nb] = steps[c] + 1
          next.push(nb)
        }
      }
      frontier = next
    }
    walks.set(source, steps)
    return steps
  }

  const write = (v: number, cell: number) => {
    owner[cell] = v
    at[v] = cell
    placed++
    walks = new Map()
  }

  /** The nearest number below `v` that is on the board, or 0. */
  const under = (v: number): number => {
    for (let u = v - 1; u >= 1; u--) if (at[u] >= 0) return u
    return 0
  }
  /** The nearest number above `v` that is on the board, or 0. */
  const over = (v: number): number => {
    for (let w = v + 1; w <= size; w++) if (at[w] >= 0) return w
    return 0
  }

  /** Could `v` go in the empty square `cell`? Never wrong about "no". */
  const can = (v: number, cell: number, u: number, w: number): boolean => {
    if (at[v - 1] >= 0 && !touches(n, cell, at[v - 1])) return false
    if (at[v + 1] >= 0 && !touches(n, cell, at[v + 1])) return false
    if (u !== 0 && v - u <= reach) {
      const steps = stepsFrom(at[u])[cell]
      if (steps < 0 || steps > v - u) return false
    }
    if (w !== 0 && w - v <= reach) {
      const steps = stepsFrom(at[w])[cell]
      if (steps < 0 || steps > w - v) return false
    }
    return true
  }

  let rounds = 0
  for (;;) {
    let moved = false
    let broken = false

    // Step one: one home for a number. Asked afresh for every number as the
    // pass reaches it, because a number written two numbers ago may have
    // settled this one.
    for (let v = 1; v <= size; v++) {
      if (at[v] >= 0) continue
      const u = under(v)
      const w = over(v)
      let only = -1
      let seen = 0
      for (let cell = 0; cell < size; cell++) {
        if (owner[cell] !== 0 || !can(v, cell, u, w)) continue
        only = cell
        seen++
        if (seen > 1) break
      }
      if (seen === 0) {
        broken = true
        break
      }
      if (seen === 1) {
        write(v, only)
        moved = true
      }
    }
    if (broken) return null

    // Step two, and only once step one has run out — so `rounds` counts what a
    // child would really have had to do.
    if (!moved) {
      for (let cell = 0; cell < size; cell++) {
        if (owner[cell] !== 0) continue
        let only = -1
        let seen = 0
        for (let v = 1; v <= size; v++) {
          if (at[v] >= 0 || !can(v, cell, under(v), over(v))) continue
          only = v
          seen++
          if (seen > 1) break
        }
        if (seen === 0) {
          broken = true
          break
        }
        if (seen === 1) {
          write(only, cell)
          moved = true
        }
      }
      if (broken) return null
    }

    if (!moved) break
    rounds++
  }

  if (placed !== size) return null
  // Sound reasoning about a board with no answer says nothing at all, so the
  // finished grid is read back against the rule before it is handed over.
  for (let v = 2; v <= size; v++) if (!touches(n, at[v - 1], at[v])) return null
  return { path: Array.from({ length: size }, (_, i) => at[i + 1]), rounds }
}

/**
 * Every way the chain can be finished, up to `cap` of them, each as one square
 * a number: `path[v - 1]` is the square holding v.
 *
 * A depth-first walk from 1 up to n*n, one step at a time. It never asks
 * whether a step is *forced*, only whether it is possible, so it is entirely
 * independent of `solveByLogic` — which is what makes it worth holding the
 * solver against in the tests.
 */
export function solutions(n: number, placed: number[], cap = 2): number[][] {
  const size = n * n
  const at = cellOf(n, placed)
  const used = placed.map((v) => v !== 0)
  const path = new Array<number>(size + 1).fill(-1)
  const found: number[][] = []

  /** The lowest number above `v` that is already on the board, or 0. */
  const nextFixed = new Array<number>(size + 2).fill(0)
  for (let v = size, w = 0; v >= 1; v--) {
    nextFixed[v] = w
    if (at[v] >= 0) w = v
  }

  /**
   * A run of `steps` between two squares cannot be shorter than the walk
   * between them, and every step changes the parity of row plus column — so a
   * gap of the wrong parity is unreachable however the chain wanders.
   */
  const reachable = (a: number, b: number, steps: number): boolean => {
    const far = Math.abs(rowOf(n, a) - rowOf(n, b)) + Math.abs(colOf(n, a) - colOf(n, b))
    return far <= steps && (steps - far) % 2 === 0
  }

  const walk = (v: number): void => {
    if (found.length >= cap) return
    if (v > size) {
      found.push(path.slice(1))
      return
    }
    const prev = path[v - 1]
    if (at[v] >= 0) {
      if (!touches(n, prev, at[v])) return
      path[v] = at[v]
      walk(v + 1)
      path[v] = -1
      return
    }
    for (const cell of orthogonal(n, prev)) {
      if (used[cell]) continue
      const w = nextFixed[v]
      if (w !== 0 && !reachable(cell, at[w], w - v)) continue
      used[cell] = true
      path[v] = cell
      walk(v + 1)
      used[cell] = false
      path[v] = -1
      if (found.length >= cap) return
    }
  }

  if (at[1] >= 0) {
    path[1] = at[1]
    walk(2)
  } else {
    for (let cell = 0; cell < size; cell++) {
      if (used[cell]) continue
      used[cell] = true
      path[1] = cell
      walk(2)
      used[cell] = false
      path[1] = -1
      if (found.length >= cap) break
    }
  }
  return found
}

/** How many ways the chain can be finished, counted no further than `cap`. */
export function countSolutions(n: number, placed: number[], cap = 2): number {
  return solutions(n, placed, cap).length
}

/* ============================================================
   Making a board

   Backwards, from a finished one: draw the whole chain first,
   print every number, then rub numbers out for as long as the
   two steps above can still put them back. Nothing here can
   produce a board with no answer, because the answer was drawn
   before anything was taken away.
   ============================================================ */

/**
 * A chain that visits every square, drawn by backbite.
 *
 * Start from the row-by-row zigzag, which is always a path. Then, over and
 * over: take one end, step to any square it touches other than its own
 * neighbour on the path, and turn the tail after that square round. The square
 * stepped to is already on the path, so what comes back is another path over
 * every square — the move cannot fail, which is why there is no retry loop
 * here and why `init` can never throw.
 */
export function randomPath(rng: Rng, n: number): number[] {
  const size = n * n
  let path: number[] = []
  for (let r = 0; r < n; r++) {
    const row = Array.from({ length: n }, (_, c) => r * n + c)
    path = path.concat(r % 2 === 0 ? row : row.reverse())
  }
  const bites = 8 * size * n
  for (let k = 0; k < bites; k++) {
    if (rng() < 0.5) path.reverse()
    const tail = path[size - 1]
    const options = orthogonal(n, tail).filter((c) => c !== path[size - 2])
    if (options.length === 0) continue
    const c = options[randInt(rng, options.length)]
    const j = path.indexOf(c)
    path = path.slice(0, j + 1).concat(path.slice(j + 1).reverse())
  }
  return path
}

/** Every number printed: the answer, before anything is taken out of it. */
function printed(n: number, path: number[]): number[] {
  const givens = new Array<number>(n * n).fill(0)
  path.forEach((cell, k) => {
    givens[cell] = k + 1
  })
  return givens
}

/**
 * Rub numbers out until `target` are left, and put back any whose absence the
 * solver cannot reason around. 1 and n*n are never rubbed out, so a child
 * always has both ends of the chain to work from.
 *
 * Taking a number away only ever makes a board harder, so every board this
 * hands back is one the solver finishes — and therefore one with exactly one
 * answer. Null when the pass ends with too many numbers still printed.
 */
export function dig(
  rng: Rng,
  n: number,
  path: number[],
  target: number,
  reach: number,
): number[] | null {
  const size = n * n
  const givens = printed(n, path)
  const ends = new Set([path[0], path[size - 1]])
  let left = size
  for (const cell of shuffled(rng, path)) {
    if (left <= target) break
    if (ends.has(cell)) continue
    const v = givens[cell]
    givens[cell] = 0
    if (solveByLogic(n, givens, reach) === null) givens[cell] = v
    else left--
  }
  return left === target ? givens : null
}

/** True when this board is the board the level asked for. */
export function fits(config: PathConfig, givens: number[]): boolean {
  const { n, reach, minRounds, maxRounds } = config
  if (givens.filter((v) => v !== 0).length !== config.givens) return false
  const reasoned = solveByLogic(n, givens, reach)
  if (reasoned === null) return false
  return reasoned.rounds >= minRounds && reasoned.rounds <= maxRounds
}

/** How many chains `deal` looks at before it settles for what it has. */
const ATTEMPTS = 200

/**
 * A board for this level.
 *
 * Every board here has an answer by construction, so the loop is only ever
 * choosing between boards that work. The two fallbacks are for a run of luck
 * bad enough that the tests have never seen it — sixty seeds a level all land
 * on the first line — and both of them print exactly `config.givens` numbers,
 * because `par` is `n * n` minus that count and a board with the wrong number
 * of blanks would make the level's par a lie.
 */
export function deal(rng: Rng, config: PathConfig): number[] {
  const { n, reach, givens: target } = config
  let dug: number[] | null = null
  let plain: number[] | null = null

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const path = randomPath(rng, n)
    if (plain === null) {
      // The last resort: the same chain with its numbers taken out in
      // ascending order. It has the right count and an answer; it may simply
      // be an easier board than the level asked for.
      const givens = printed(n, path)
      for (let v = 2, left = n * n; v < n * n && left > target; v++, left--) {
        givens[path[v - 1]] = 0
      }
      plain = givens
    }
    const board = dig(rng, n, path, target, reach)
    if (board === null) continue
    if (fits(config, board)) return board
    dug ??= board
  }

  return dug ?? (plain as number[])
}
