import { pick } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The tall and the short.

   Every row and every column holds one post of each height,
   and between some pairs of squares stands a sign that points
   at the shorter of the two. It is Futoshiki — Tamaki Seto's
   puzzle, in British newspapers from 2006, and in Simon
   Tatham's collection as Unequal. There are no boxes: the
   signs do the work a sudoku's boxes do.

   Everything here is pure and framework-free. Three things are
   worth reading twice.

   `solveByLogic` reasons a board out the way a child does, and
   the whole of the ordering argument lives in one clause of it:
   a square at the pointed end of a sign cannot be as tall as
   the tallest post the other end can still hold. Run that over
   a row of two signs and it says, on its own, that the post at
   the open end of *a is taller than b, and b is taller than c*
   has to be three high at least. Chaining is not a special
   case here; it is the same clause, read twice.

   `clashOf` never looks at an empty square. A sign whose other
   end is still empty says nothing, ever — and that is
   deliberate rather than incidental. The eliminations this
   puzzle is really about all involve an empty neighbour, so a
   board that answered them would be doing the puzzle for the
   child. Red only ever means "these two posts, both of them
   already on the board, cannot both stand there".

   And the bank at the bottom of index.ts was searched for
   offline against a fourth rule that has nothing to do with
   solving: a board must *not* come out with the signs covered
   up. That gate is why the levels print so little. Fill eight
   of a four-wide board's sixteen squares and 84% of the boards
   that clear everything else can be finished from the printed
   posts alone, which is a Latin square in a costume; four
   printed posts, and none at all on the three-wide board, is
   where the signs start doing the work. `latinSolutions` is
   that gate, and logic.test.ts holds every board in the bank to
   it, along with every one of the sixteen ways `init` may turn
   one.
   ============================================================ */

export interface TallConfig {
  /** Rows, columns and heights all come in this many. 3, 4 or 5. */
  n: number
  /**
   * Hand-searched boards, each drawn as a picture. Every entry has exactly one
   * answer, is reachable by the reasoning in `solveByLogic`, and cannot be
   * finished with its signs covered up — the test file proves all three, for
   * every entry and for every way `init` may turn it.
   */
  bank: string[][]
  /** Every board carries this many printed posts, so `par` cannot wobble by seed. */
  printed: number
}

/**
 * One sign: the square that has to hold the taller post, and the square that
 * has to hold the shorter one. The two are always orthogonally adjacent, so
 * the board works out where to draw the sign from the pair alone.
 */
export interface Sign {
  hi: number
  lo: number
}

/** A board as its picture describes it, before anybody has put a post down. */
export interface TallBoard {
  n: number
  /** Row-major. Non-zero where a post is printed. Never changes. */
  givens: number[]
  signs: Sign[]
}

export interface TallState extends TallBoard {
  /** Row-major. What the player has stood up; 0 = empty. Always 0 under a printed post. */
  entries: number[]
}

/** One post going down. `value` 0 takes the square's post away again. */
export type TallAction = { type: 'set'; index: number; value: number }

/**
 * Enamel by height, and the same ramp the Hanoi discs run down: the taller the
 * post, the deeper the colour. Height carries the ordering, which is the
 * puzzle; colour carries the identity, which is what a child needs when they
 * scan a row asking "is the 3 already here?". Ten pixels of height between one
 * post and the next is not something an eight-year-old should have to judge
 * across a whole board, so the colour is the channel that always works, and a
 * post is a colour, a height and a count of blocks all at once.
 *
 * A height keeps its colour whatever the board's size, so a post 3 high is
 * moss on all three levels.
 */
export const POST_COLOURS = [
  'var(--p-ochre)',
  'var(--p-clay)',
  'var(--p-moss)',
  'var(--p-plum)',
  'var(--p-indigo)',
]

/* --- reading the grid ---------------------------------------- */

export const rowOf = (n: number, index: number): number => Math.floor(index / n)
export const colOf = (n: number, index: number): number => index % n

const unitCache = new Map<number, number[][]>()
const peerCache = new Map<number, number[][]>()

/**
 * Every row and then every column, as lists of square indices. That order is
 * load-bearing: `clashOf` reads a line's kind off its position here.
 */
export function unitsOf(n: number): number[][] {
  const hit = unitCache.get(n)
  if (hit) return hit
  const units: number[][] = []
  for (let r = 0; r < n; r++) units.push(Array.from({ length: n }, (_, c) => r * n + c))
  for (let c = 0; c < n; c++) units.push(Array.from({ length: n }, (_, r) => r * n + c))
  unitCache.set(n, units)
  return units
}

/** Every square that shares a row or a column with this one. */
export function peersOf(n: number): number[][] {
  const hit = peerCache.get(n)
  if (hit) return hit
  const sets = Array.from({ length: n * n }, () => new Set<number>())
  for (const unit of unitsOf(n)) {
    for (const a of unit) for (const b of unit) if (a !== b) sets[a].add(b)
  }
  const peers = sets.map((s) => [...s])
  peerCache.set(n, peers)
  return peers
}

/** One end of a sign, seen from a square: who the other end is, and which of them is taller. */
export interface SignEnd {
  other: number
  /** True when this square is the one that has to hold the taller post. */
  taller: boolean
}

/** Every sign each square stands at an end of, indexed by square. */
export function signEndsOf(board: TallBoard): SignEnd[][] {
  const out: SignEnd[][] = Array.from({ length: board.n * board.n }, () => [])
  for (const { hi, lo } of board.signs) {
    out[hi].push({ other: lo, taller: true })
    out[lo].push({ other: hi, taller: false })
  }
  return out
}

/** Where one square lies from another, in the words a sentence uses. */
export function whereFrom(n: number, from: number, to: number): string {
  if (rowOf(n, to) < rowOf(n, from)) return 'above it'
  if (rowOf(n, to) > rowOf(n, from)) return 'below it'
  return colOf(n, to) < colOf(n, from) ? 'to its left' : 'to its right'
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<TallConfig>, rng: Rng): TallState {
  const board = applyShape(parseBoard(pick(rng, level.config.bank)), randomShape(rng))
  return { ...board, entries: new Array<number>(board.n * board.n).fill(0) }
}

export function reduce(state: TallState, action: TallAction): TallState {
  if (action.type !== 'set') return state
  const { index, value } = action
  if (!Number.isInteger(index) || index < 0 || index >= state.givens.length) return state
  if (!Number.isInteger(value) || value < 0 || value > state.n) return state
  // A printed post is not yours to move, and standing up the post that is
  // already there is not a move.
  if (state.givens[index] !== 0) return state
  if (state.entries[index] === value) return state
  const entries = state.entries.slice()
  entries[index] = value
  return { ...state, entries }
}

/** What is standing in each square: the printed post, or the player's own. */
export function valuesOf(state: TallState): number[] {
  return state.givens.map((g, i) => (g !== 0 ? g : state.entries[i]))
}

export function isSolved(state: TallState): boolean {
  const values = valuesOf(state)
  if (values.some((v) => v === 0)) return false
  for (const unit of unitsOf(state.n)) {
    if (new Set(unit.map((i) => values[i])).size !== state.n) return false
  }
  return state.signs.every(({ hi, lo }) => values[hi] > values[lo])
}

/**
 * Which of the player's own posts break a rule. Printed posts are never
 * flagged — they are always right, it is the post beside them that is wrong.
 *
 * A sign with an empty square at its other end accuses nobody. Working out
 * what a post at the pointed end of a sign *cannot* be, while the far end is
 * still empty, is the whole of this puzzle; a board that marked that in red
 * would be doing the puzzle rather than drawing it.
 */
export function conflicts(state: TallState): boolean[] {
  const peers = peersOf(state.n)
  const ends = signEndsOf(state)
  const values = valuesOf(state)
  return values.map((v, i) => {
    if (state.givens[i] !== 0 || v === 0) return false
    if (peers[i].some((p) => values[p] === v)) return true
    return ends[i].some(({ other, taller }) => {
      const w = values[other]
      if (w === 0) return false
      return taller ? v < w : v > w
    })
  })
}

/** Which rule a post has broken. */
export type ClashKind = 'row' | 'column' | 'sign'

/** One post going down, and the rule it leaves broken. */
export type Clash =
  | {
      kind: 'row' | 'column'
      /** Which row or column, counting from 1. */
      ordinal: number
      /** Every square in that line, so a board can light the whole of it. */
      cells: number[]
      /** The squares in it that hold the height: the post just put down, and the one it repeats. */
      blamed: number[]
      /** The height that has landed twice. */
      value: number
    }
  | {
      kind: 'sign'
      /** The square just filled, and then the square at the other end of the sign. */
      cells: number[]
      blamed: number[]
      value: number
      /** True when the square just filled is the one that has to hold the taller post. */
      taller: boolean
    }

/**
 * The rule that standing a post `value` high in `index` breaks, or null where
 * the square takes it.
 *
 * One post can break a row, a column and a sign at once, and only the first is
 * reported: three groups lit together say nothing about any of them, and the
 * row is the line a child scans fastest. The sign comes last because it is the
 * only one of the three a child cannot check by looking along a line.
 */
export function clashOf(state: TallState, index: number, value: number): Clash | null {
  if (value === 0 || state.givens[index] !== 0) return null
  const { n } = state
  const values = valuesOf(state)
  values[index] = value

  const units = unitsOf(n)
  for (let u = 0; u < units.length; u++) {
    const cells = units[u]
    if (!cells.includes(index)) continue
    const blamed = cells.filter((i) => values[i] === value)
    if (blamed.length > 1) {
      const kind = u < n ? 'row' : 'column'
      const ordinal = (u < n ? u : u - n) + 1
      return { kind, ordinal, cells, blamed, value }
    }
  }

  for (const { other, taller } of signEndsOf(state)[index]) {
    const w = values[other]
    if (w === 0) continue
    if (taller ? value < w : value > w) {
      return { kind: 'sign', cells: [index, other], blamed: [index, other], value, taller }
    }
  }
  return null
}

/** The broken rule in one sentence. The lit squares say where; this says what. */
export function describeClash(state: TallState, clash: Clash): string {
  if (clash.kind === 'sign') {
    const side = clash.taller ? 'taller' : 'shorter'
    return `The sign says this post is ${side} than the one ${whereFrom(
      state.n,
      clash.cells[0],
      clash.cells[1],
    )}.`
  }
  return `A post ${clash.value} high is already in ${clash.kind} ${clash.ordinal}.`
}

/**
 * The first rule the board is standing on as it is. It is only ever used to
 * put a sentence under a position the player has already made — after a
 * rewind, say, where there is a red square but no tap to have named it — so it
 * reports nothing that is not already drawn.
 */
export function standingClash(state: TallState): Clash | null {
  const values = valuesOf(state)
  const wrong = conflicts(state)
  for (let i = 0; i < wrong.length; i++) {
    if (wrong[i]) return clashOf(state, i, values[i])
  }
  return null
}

/** Squares still to fill. Each one costs exactly one move, so this is par. */
export function blankCount(state: TallState): number {
  return state.givens.reduce((sum, g, i) => sum + (g === 0 && state.entries[i] === 0 ? 1 : 0), 0)
}

export function filledCount(state: TallState): number {
  return valuesOf(state).reduce((sum, v) => sum + (v === 0 ? 0 : 1), 0)
}

/** What is standing in a square, in the words every label and sentence uses. */
export function postName(value: number): string {
  return value === 0 ? 'empty' : `a post ${value} high`
}

export function describeMove(prev: TallState, _next: TallState, action: TallAction): string {
  const where = `row ${rowOf(prev.n, action.index) + 1}, column ${colOf(prev.n, action.index) + 1}`
  if (action.value === 0) return `Took the post out of ${where}`
  return `Put ${postName(action.value)} in ${where}`
}

/** Every action that would change something. Used by the tests to check `par`. */
export function legalMoves(state: TallState): TallAction[] {
  const out: TallAction[] = []
  for (let index = 0; index < state.givens.length; index++) {
    if (state.givens[index] !== 0) continue
    for (let value = 0; value <= state.n; value++) {
      if (value !== state.entries[index]) out.push({ type: 'set', index, value })
    }
  }
  return out
}

/* ============================================================
   Reading a board off its picture

   A board is drawn the way it is played, in 2n-1 lines of
   2n-1 characters. The lines with the squares on them come
   first, third, fifth; the lines between them carry the signs
   that stand between one row and the next.

     '.>. .'      a square, a sign, a square, a sign, a square
     '. . ^'      three sign slots, one under each column
     '. .<2'

   On a square line, an even column is a square — a digit for a
   printed post, '.' for an empty one — and an odd column is
   the sign between the two squares either side of it: '>', '<'
   or a space. On a line between rows, an even column is the
   sign between the square above it and the square below it:
   '^', 'v' or '.', and the odd columns are blank.

   Every sign points at the shorter post, whichever of the four
   ways round it is: '>' says the square on its left is taller,
   'v' says the square above it is.

   Pure, and it throws on anything it cannot read rather than
   quietly building half a board: a line of the wrong length, a
   height nobody could stand, a printed post that already
   breaks a rule, a board with no signs on it at all. `init`
   calls it on every level and `logic.test.ts` parses every
   picture in the bank, so the only boards a player ever meets
   are ones that have already been read.
   ============================================================ */

export function parseBoard(picture: string[]): TallBoard {
  if (picture.length < 5 || picture.length % 2 === 0) {
    throw new Error('a board is an odd number of lines, and at least three squares to a side')
  }
  const n = (picture.length + 1) / 2
  const width = 2 * n - 1
  const givens = new Array<number>(n * n).fill(0)
  const signs: Sign[] = []

  picture.forEach((line, k) => {
    if (line.length !== width) throw new Error(`every line of a ${n} board is ${width} characters`)
    const between = k % 2 === 1
    const r = k >> 1
    for (let x = 0; x < width; x++) {
      const mark = line[x]
      const c = x >> 1
      if (between) {
        // A line between two rows: a sign under each column, and nothing else.
        if (x % 2 === 1) {
          if (mark !== ' ') throw new Error('a line between two rows carries only signs')
          continue
        }
        const above = r * n + c
        const below = above + n
        if (mark === '.') continue
        if (mark === 'v') signs.push({ hi: above, lo: below })
        else if (mark === '^') signs.push({ hi: below, lo: above })
        else throw new Error(`${mark} is not a sign between two rows`)
        continue
      }
      if (x % 2 === 0) {
        if (mark === '.') continue
        const value = Number(mark)
        if (!/^[1-9]$/.test(mark) || value > n) throw new Error(`${mark} is not a height on this board`)
        givens[r * n + c] = value
        continue
      }
      const left = r * n + c
      const right = left + 1
      if (mark === ' ') continue
      if (mark === '>') signs.push({ hi: left, lo: right })
      else if (mark === '<') signs.push({ hi: right, lo: left })
      else throw new Error(`${mark} is not a sign between two squares`)
    }
  })

  if (signs.length === 0) throw new Error('a board with no signs on it is not this puzzle')
  const board = { n, givens, signs }
  const printed = { ...board, entries: new Array<number>(n * n).fill(0) }
  for (const unit of unitsOf(n)) {
    const heights = unit.map((i) => givens[i]).filter((v) => v !== 0)
    if (new Set(heights).size !== heights.length) throw new Error('a printed post repeats a height')
  }
  for (const { hi, lo } of signs) {
    const values = valuesOf(printed)
    if (values[hi] !== 0 && values[lo] !== 0 && values[hi] <= values[lo]) {
      throw new Error('a sign points the wrong way at two printed posts')
    }
  }
  return board
}

/* ============================================================
   The symmetry group

   A Futoshiki keeps its answer under sixteen re-arrangements,
   and no more. Rows and columns cannot be shuffled the way a
   sudoku's can: a sign stands between two squares that touch,
   so anything that pulls two neighbours apart pulls the sign
   apart with them. What is left is the eight ways of turning
   and flipping the square — every one of which carries a
   sign round with the pair it belongs to — and swapping tall
   for short, which turns every sign the other way up.

   All sixteen leave the number of answers alone, leave the
   reasoning that finds it alone, and leave the signs-covered
   gate alone, because each one is a re-labelling of the same
   board. `init` deals a bank board through one of them, and
   the test file proves all three claims over the whole group.
   ============================================================ */

/** A re-arrangement of a board onto itself. */
export interface Shape {
  /** Quarter turns clockwise, after the flip. */
  turn: 0 | 1 | 2 | 3
  /** Mirror left to right first. */
  flip: boolean
  /** Swap tall for short: a post v high becomes one n + 1 - v high. */
  invert: boolean
}

/** The whole group: eight ways round the square, each with and without the swap. */
export function allShapes(): Shape[] {
  const out: Shape[] = []
  for (const turn of [0, 1, 2, 3] as const) {
    for (const flip of [false, true]) {
      for (const invert of [false, true]) out.push({ turn, flip, invert })
    }
  }
  return out
}

export function randomShape(rng: Rng): Shape {
  return {
    turn: Math.floor(rng() * 4) as Shape['turn'],
    flip: rng() < 0.5,
    invert: rng() < 0.5,
  }
}

/** Where a square ends up. Flip first, then the quarter turns. */
function moveCell(n: number, index: number, shape: Shape): number {
  let r = rowOf(n, index)
  let c = shape.flip ? n - 1 - colOf(n, index) : colOf(n, index)
  for (let k = 0; k < shape.turn; k++) {
    const wasRow = r
    r = c
    c = n - 1 - wasRow
  }
  return r * n + c
}

export function applyShape(board: TallBoard, shape: Shape): TallBoard {
  const { n } = board
  const givens = new Array<number>(n * n).fill(0)
  for (let i = 0; i < n * n; i++) {
    const v = board.givens[i]
    givens[moveCell(n, i, shape)] = v === 0 ? 0 : shape.invert ? n + 1 - v : v
  }
  const signs = board.signs.map(({ hi, lo }) => {
    const a = moveCell(n, hi, shape)
    const b = moveCell(n, lo, shape)
    return shape.invert ? { hi: b, lo: a } : { hi: a, lo: b }
  })
  return { n, givens, signs: sortSigns(signs) }
}

/** One order for the signs, so two boards can be compared as strings. */
export function sortSigns(signs: Sign[]): Sign[] {
  return signs.slice().sort((a, b) => a.hi - b.hi || a.lo - b.lo)
}

/** A board written out, once its signs are in order. */
export function keyOf(board: TallBoard): string {
  const signs = sortSigns(board.signs).map((s) => `${s.hi}>${s.lo}`)
  return `${board.givens.join(',')}|${signs.join(' ')}`
}

/**
 * A fingerprint that is equal for two boards exactly when one can be turned
 * into the other by the sixteen above — the smallest string over the whole
 * group. Used by the tests to show the bank holds distinct puzzles.
 */
export function canonicalKey(board: TallBoard): string {
  let best: string | null = null
  for (const shape of allShapes()) {
    const key = keyOf(applyShape(board, shape))
    if (best === null || key < best) best = key
  }
  return best as string
}

/* ============================================================
   Reasoning a board out

   Three steps, and between them they are everything a child
   says out loud at this board.

   One: a square with one height left takes it, and that height
   is then out of every other square in its row and its column.

   Two: a height with one square left in a row or a column has
   to go there, which turns that square into a settled one.

   Three, and the one that is this puzzle's own: at the pointed
   end of a sign, a post has to be shorter than the tallest the
   other end can still be; at the open end, taller than the
   shortest. Nothing here knows what a chain is — but run the
   clause over *a is taller than b, and b is taller than c* and
   the second pass carries what the first pass learned about b
   through to a and to c. That is the transitivity, and it
   falls out of reading one sign at a time.

   Every clause is *sound* — it never crosses off a height a
   real answer uses — so a board this reasons all the way
   through has exactly one answer. `countSolutions` below is an
   independent walk of the same board, and the tests hold the
   two against each other.
   ============================================================ */

/** What a board asked to be reasoned through gives back. */
export interface Deduction {
  /** Row-major, the finished board. */
  grid: number[]
  /** Passes over the three steps it took. This is the level's difficulty. */
  rounds: number
}

export function solveByLogic(board: TallBoard): Deduction | null {
  const { n, givens, signs } = board
  const size = n * n
  const units = unitsOf(n)
  const peers = peersOf(n)
  /** `can[i][v]`: a post v high could still stand in that square. */
  const can = Array.from({ length: size }, () => new Array<boolean>(n + 1).fill(true))
  for (let i = 0; i < size; i++) {
    can[i][0] = false
    const v = givens[i]
    if (v === 0) continue
    for (let w = 1; w <= n; w++) can[i][w] = w === v
  }

  /** The one height left in a square, or 0 while there is a choice. */
  const only = (i: number): number => {
    let found = 0
    let seen = 0
    for (let v = 1; v <= n; v++) {
      if (!can[i][v]) continue
      found = v
      seen++
    }
    return seen === 1 ? found : 0
  }
  const shortest = (i: number): number => {
    for (let v = 1; v <= n; v++) if (can[i][v]) return v
    return 0
  }
  const tallest = (i: number): number => {
    for (let v = n; v >= 1; v--) if (can[i][v]) return v
    return 0
  }

  let rounds = 0
  for (;;) {
    let moved = false

    // Step one: a settled square keeps its height out of its row and column.
    for (let i = 0; i < size; i++) {
      const v = only(i)
      if (v === 0) continue
      for (const p of peers[i]) {
        if (!can[p][v]) continue
        can[p][v] = false
        moved = true
      }
    }

    // Step two: a height with one square left in a line takes that square.
    for (const unit of units) {
      for (let v = 1; v <= n; v++) {
        const spots = unit.filter((i) => can[i][v])
        if (spots.length === 0) return null
        if (spots.length > 1) continue
        const i = spots[0]
        for (let w = 1; w <= n; w++) {
          if (w === v || !can[i][w]) continue
          can[i][w] = false
          moved = true
        }
      }
    }

    // Step three: the signs, read from both ends.
    for (const { hi, lo } of signs) {
      const floor = shortest(lo)
      const ceiling = tallest(hi)
      if (floor === 0 || ceiling === 0) return null
      for (let v = 1; v <= floor; v++) {
        if (!can[hi][v]) continue
        can[hi][v] = false
        moved = true
      }
      for (let v = ceiling; v <= n; v++) {
        if (!can[lo][v]) continue
        can[lo][v] = false
        moved = true
      }
    }

    for (let i = 0; i < size; i++) if (!can[i].some(Boolean)) return null
    if (!moved) break
    rounds++
  }

  const grid = new Array<number>(size).fill(0)
  for (let i = 0; i < size; i++) {
    const v = only(i)
    if (v === 0) return null
    grid[i] = v
  }
  // Sound reasoning about a board with no answer says nothing at all, so the
  // finished board is read back against the rules before it is handed over.
  const done: TallState = { n, givens, signs, entries: grid.map((v, i) => (givens[i] === 0 ? v : 0)) }
  return isSolved(done) ? { grid, rounds } : null
}

/**
 * Every way the posts can stand, up to `cap` of them, each row-major. A plain
 * depth-first walk over the squares in order: it never asks whether a height is
 * *forced*, only whether it fits, so it knows nothing about `solveByLogic` —
 * which is what makes it worth holding the solver against in the tests.
 */
export function solutions(board: TallBoard, cap = 2): number[][] {
  const { n, givens } = board
  const size = n * n
  const grid = givens.slice()
  const ends = signEndsOf(board)
  const found: number[][] = []

  const fits = (i: number, v: number): boolean => {
    const r = rowOf(n, i)
    const c = colOf(n, i)
    for (let k = 0; k < n; k++) {
      if (k !== c && grid[r * n + k] === v) return false
      if (k !== r && grid[k * n + c] === v) return false
    }
    return ends[i].every(({ other, taller }) => {
      const w = grid[other]
      if (w === 0) return true
      return taller ? v > w : v < w
    })
  }

  // A printed board that already breaks a rule has no answers at all.
  for (let i = 0; i < size; i++) {
    const v = grid[i]
    if (v === 0) continue
    grid[i] = 0
    const legal = fits(i, v)
    grid[i] = v
    if (!legal) return []
  }

  const walk = (i: number): void => {
    if (found.length >= cap) return
    if (i === size) {
      found.push(grid.slice())
      return
    }
    if (grid[i] !== 0) {
      walk(i + 1)
      return
    }
    for (let v = 1; v <= n; v++) {
      if (!fits(i, v)) continue
      grid[i] = v
      walk(i + 1)
      grid[i] = 0
      if (found.length >= cap) return
    }
  }

  walk(0)
  return found
}

/** How many ways the posts can stand, counted no further than `cap`. */
export function countSolutions(board: TallBoard, cap = 2): number {
  return solutions(board, cap).length
}

/**
 * How many ways the printed posts alone can be finished, with every sign
 * covered up. This is the gate the bank was searched against: a board that
 * comes out at 1 here is a board a child could finish without ever reading a
 * sign, which is not this puzzle.
 */
export function latinSolutions(board: TallBoard, cap = 2): number {
  return countSolutions({ ...board, signs: [] }, cap)
}

/**
 * True when some three squares stand in a line of signs: this one is taller
 * than that one, and that one is taller than a third. Chaining those two facts
 * into "so the first is taller than the third" is the move this puzzle exists
 * for, and every board in the bank has one.
 */
export function hasChainOfThree(board: TallBoard): boolean {
  const ends = signEndsOf(board)
  return board.signs.some(({ lo }) => ends[lo].some((end) => end.taller))
}
