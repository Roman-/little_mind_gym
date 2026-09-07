import { randInt, shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The chocolate bar.

   A square bar of chocolate with numbers printed on some of its
   squares. Snap it into rectangular pieces so that every piece
   holds exactly one number, and that number is how many squares
   the piece has. It is the puzzle Nikoli sells as Shikaku and
   Simon Tatham ships as Rectangles.

   Everything here is pure and framework-free. Three things are
   worth reading twice.

   `reduce` is deliberately permissive, and that is the whole
   design of this puzzle rather than an oversight. See the long
   note above it before adding a check to it.

   `solveByLogic` finishes a board using only the two steps an
   eight-year-old can actually make, and `deal` throws away every
   board it cannot finish. A solver that only ever places a piece
   the rules leave one shape for also proves the board has exactly
   one answer, so uniqueness and "no guessing" are one check here
   rather than two — the same theorem the garden cats rest on.

   `randomPartition` draws the answer first and is *given* the
   number of pieces, so `par` is pinned by construction. The shell
   prints par to a child as a fact ("nobody can do it in fewer"),
   so a piece count that came out where it may would be a lie on
   some seeds.
   ============================================================ */

export interface ShikakuConfig {
  /** Rows and columns. 5, 6 or 7. */
  n: number
  /** How many numbers are printed on the bar, and so how many pieces the answer has. */
  pieces: number
  /** No piece may be bigger than this. */
  maxArea: number
  /**
   * Passes over the two steps in `solveByLogic`, at least and at most. The only
   * difficulty dial apart from the size, measured on the board rather than guessed.
   */
  minRounds: number
  maxRounds: number
}

/** One piece of the bar. Top row, left column, bottom row, right column — all inclusive. */
export interface Piece {
  r0: number
  c0: number
  r1: number
  c1: number
}

export interface ShikakuState {
  n: number
  /** Row-major. The number printed on a square, or 0 where there is none. Never changes. */
  clues: number[]
  /** The pieces broken off so far, in the order they were broken off. They never overlap. */
  pieces: Piece[]
}

/**
 * `place` carries the two opposite corners a child tapped, as cell indices; the
 * piece is their bounding box. `clear` carries any square of a piece already
 * broken off, and puts the whole of it back.
 */
export type ShikakuAction =
  | { type: 'place'; a: number; b: number }
  | { type: 'clear'; cell: number }

/* --- reading the bar ----------------------------------------- */

export const rowOf = (n: number, cell: number): number => Math.floor(cell / n)
export const colOf = (n: number, cell: number): number => cell % n
export const areaOf = (p: Piece): number => (p.r1 - p.r0 + 1) * (p.c1 - p.c0 + 1)
/** A piece's name, everywhere one is needed: its top-left square. */
export const keyOf = (n: number, p: Piece): string => String(p.r0 * n + p.c0)

export function cellsOf(n: number, p: Piece): number[] {
  const out: number[] = []
  for (let r = p.r0; r <= p.r1; r++) for (let c = p.c0; c <= p.c1; c++) out.push(r * n + c)
  return out
}

/** The rectangle two corners bound, or null when either is not a square of this bar. */
export function rectBetween(n: number, a: number, b: number): Piece | null {
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < n * n
  if (!ok(a) || !ok(b)) return null
  const ra = rowOf(n, a)
  const rb = rowOf(n, b)
  const ca = colOf(n, a)
  const cb = colOf(n, b)
  return { r0: Math.min(ra, rb), c0: Math.min(ca, cb), r1: Math.max(ra, rb), c1: Math.max(ca, cb) }
}

/** Row-major: which piece owns each square, -1 where the bar is still whole. */
export function ownerOf(state: ShikakuState): number[] {
  const owner = new Array<number>(state.n * state.n).fill(-1)
  state.pieces.forEach((piece, at) => {
    for (const cell of cellsOf(state.n, piece)) owner[cell] = at
  })
  return owner
}

/** Which piece is on this square, or -1 for a square still on the bar. */
export function pieceAt(state: ShikakuState, cell: number): number {
  return ownerOf(state)[cell] ?? -1
}

/**
 * Two boards with the same key are the same position.
 *
 * A square is named by the *top-left square of the piece that owns it*, never
 * by that piece's place in the list: the same set of pieces broken off in two
 * different orders is one position, and the breadth-first search in the tests
 * would otherwise walk every ordering of every answer.
 */
export function stateKey(state: ShikakuState): string {
  const owner = new Array<string>(state.n * state.n).fill('-')
  for (const piece of state.pieces) {
    const name = keyOf(state.n, piece)
    for (const cell of cellsOf(state.n, piece)) owner[cell] = name
  }
  return owner.join(',')
}

/** The numbers printed inside a piece, in reading order. */
export function numbersIn(state: ShikakuState, piece: Piece): number[] {
  return cellsOf(state.n, piece)
    .filter((cell) => state.clues[cell] !== 0)
    .map((cell) => state.clues[cell])
}

/** Numbers whose square is still on the unbroken bar. The count the board reads out. */
export function unclaimed(state: ShikakuState): number {
  const owner = ownerOf(state)
  return state.clues.reduce((sum, v, i) => sum + (v !== 0 && owner[i] === -1 ? 1 : 0), 0)
}

/* --- what is wrong with a piece ------------------------------- */

export type FaultKind = 'empty' | 'crowded' | 'size'

/** A piece that breaks one of the three rules, and everything the board needs to say so. */
export interface Fault {
  kind: FaultKind
  /** Every square of the piece, so the board can light the whole of it. */
  cells: number[]
  /** The squares the sentence is about: both of them when a piece holds two numbers. */
  blamed: number[]
  /** How many squares the piece has. */
  area: number
  /** The number printed on it, or 0 when there is none. */
  says: number
}

/**
 * The rule this piece breaks, or null when it is a good piece.
 *
 * The three of them are the three things a child was told, in the order they
 * can be checked by eye: is there a number on it, is there only one, and does
 * that number match the squares.
 */
export function faultOf(state: ShikakuState, piece: Piece): Fault | null {
  const cells = cellsOf(state.n, piece)
  const numbers = cells.filter((cell) => state.clues[cell] !== 0)
  const area = cells.length
  if (numbers.length === 0) return { kind: 'empty', cells, blamed: [], area, says: 0 }
  if (numbers.length > 1) return { kind: 'crowded', cells, blamed: numbers, area, says: 0 }
  const says = state.clues[numbers[0]]
  if (says !== area) return { kind: 'size', cells, blamed: numbers, area, says }
  return null
}

/** Which of the pieces on the bar break a rule. Drawn in clay, never hidden. */
export function faults(state: ShikakuState): (Fault | null)[] {
  return state.pieces.map((piece) => faultOf(state, piece))
}

/** The broken rule in one sentence. The lit piece says where; this says what. */
export function describeFault(fault: Fault): string {
  if (fault.kind === 'empty') return 'This piece has no number on it.'
  if (fault.kind === 'crowded') return 'This piece has more than one number on it.'
  return `This piece has ${fault.area} squares, not ${fault.says}.`
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<ShikakuConfig>, rng: Rng): ShikakuState {
  return { n: level.config.n, clues: deal(rng, level.config), pieces: [] }
}

/**
 * One snap of the bar, or one piece put back.
 *
 * **The only rule this enforces is that pieces may not overlap.** A rectangle
 * with no number on it, a rectangle with two numbers on it, and a rectangle
 * whose size disagrees with its number all *land*: they come back as a new
 * object, the shell records the move, the board draws them where the child put
 * them, rings them in clay and names the rule in one sentence, and one tap puts
 * them back. That is the garden cats' bargain transposed — a cat that shares a
 * row really does sit down, `conflicts()` paints it red, and `reduce` never
 * refuses it.
 *
 * Do not add a size check here "for tidiness". Three things unwind at once if
 * you do. With **Allow moves that break a rule** turned off, every dead square
 * would be a square the answer's rectangles cannot reach, which hands over the
 * candidate list. `refusalOf` would need a pretend position holding a piece
 * with no owner, which is a state this machine cannot produce. And a
 * fat-fingered second tap on a phone, where there is no preview between the two
 * corners, would be answered as a verdict on the child's reasoning rather than
 * as a piece they can tap off again.
 */
export function reduce(state: ShikakuState, action: ShikakuAction): ShikakuState {
  // An action that is not one of ours.
  if (action.type !== 'place' && action.type !== 'clear') return state

  if (action.type === 'clear') {
    const at = pieceAt(state, action.cell)
    // Nothing there to put back — including a cell index that is not on the bar.
    if (at === -1) return state
    return { ...state, pieces: state.pieces.filter((_, i) => i !== at) }
  }

  const rect = rectBetween(state.n, action.a, action.b)
  // A corner that is not a square of this bar: not a whole number, negative,
  // or past the end.
  if (rect === null) return state
  // Both corners on one square. One tap is a change of mind, not a piece — and
  // no level ever prints a 1, so nothing is lost by never making a piece of one.
  if (action.a === action.b) return state
  const owner = ownerOf(state)
  // It runs over a piece already broken off. The one rule `reduce` enforces.
  if (cellsOf(state.n, rect).some((cell) => owner[cell] !== -1)) return state

  return { ...state, pieces: [...state.pieces, rect] }
}

export function isSolved(state: ShikakuState): boolean {
  // Every square of the bar has ended up in a piece …
  if (ownerOf(state).some((o) => o === -1)) return false
  // … and no piece breaks a rule: one number each, and that number's worth of
  // squares. Pieces never overlap, so those two together force the piece count
  // to equal the number of numbers, which is the level's par.
  return state.pieces.every((piece) => faultOf(state, piece) === null)
}

/**
 * The one move this puzzle refuses: a rectangle that runs over a piece already
 * broken off. Nothing can pretend to move — a piece cannot be snapped out of
 * chocolate that has already left the bar — so `pretend` is the state itself
 * and `useRefusal` fires a shake on the piece that is in the way.
 */
export function refusalOf(
  state: ShikakuState,
  a: number,
  b: number,
): { pretend: ShikakuState; message: string; where: string } | null {
  const rect = rectBetween(state.n, a, b)
  if (rect === null || a === b) return null
  const owner = ownerOf(state)
  const hit = cellsOf(state.n, rect)
    .map((cell) => owner[cell])
    .find((o) => o !== -1)
  if (hit === undefined) return null
  return {
    pretend: state,
    message: 'A piece is already broken off there.',
    where: keyOf(state.n, state.pieces[hit]),
  }
}

/** Where a piece sits, in words: its top-left square. */
const seatOf = (piece: Piece): string => `row ${piece.r0 + 1}, column ${piece.c0 + 1}`

/** Only ever called after `reduce` took the action, so the piece is really there. */
export function describeMove(
  prev: ShikakuState,
  next: ShikakuState,
  action: ShikakuAction,
): string {
  if (action.type === 'clear') {
    const piece = prev.pieces[pieceAt(prev, action.cell)]
    return `Put a piece of ${areaOf(piece)} squares back at ${seatOf(piece)}`
  }
  const piece = next.pieces[next.pieces.length - 1]
  return `Broke off a piece of ${areaOf(piece)} squares at ${seatOf(piece)}`
}

/* ============================================================
   Reasoning a board out

   Two steps do all of it, and both of them are steps a child can
   say out loud.

   One: a number with one shape left takes that shape.

   Two, and only once the first has run out: a square that only
   one number can still reach belongs to that number, so every
   shape of that number which misses the square is out.

   Both steps are sound — a placed rectangle is forced, and a
   struck shape is impossible in every answer — so a board this
   finishes has exactly one answer and is reachable without a
   guess. `countSolutions` below is held against that claim in
   the tests.
   ============================================================ */

/** Every rectangle of the right size that covers this number and no other. */
export function candidatesFor(n: number, clues: number[], p: number): Piece[] {
  const v = clues[p]
  const pr = rowOf(n, p)
  const pc = colOf(n, p)
  const out: Piece[] = []
  for (let h = 1; h <= n; h++) {
    if (v % h !== 0) continue
    const w = v / h
    if (w > n) continue
    for (let r0 = Math.max(0, pr - h + 1); r0 <= pr; r0++) {
      const r1 = r0 + h - 1
      if (r1 >= n) continue
      for (let c0 = Math.max(0, pc - w + 1); c0 <= pc; c0++) {
        const c1 = c0 + w - 1
        if (c1 >= n) continue
        const rect = { r0, c0, r1, c1 }
        if (cellsOf(n, rect).some((cell) => cell !== p && clues[cell] !== 0)) continue
        out.push(rect)
      }
    }
  }
  return out
}

/** What a board asked to be reasoned through gives back. */
export interface Deduction {
  /** One piece a number, in the order the numbers are printed. */
  pieces: Piece[]
  /** Passes over the two steps it took. This is the level's difficulty. */
  rounds: number
}

interface Candidate {
  rect: Piece
  cells: number[]
}

export function solveByLogic(n: number, clues: number[]): Deduction | null {
  const size = n * n
  const spots: number[] = []
  for (let i = 0; i < size; i++) if (clues[i] !== 0) spots.push(i)
  const k = spots.length
  const shapes: Candidate[][] = spots.map((p) =>
    candidatesFor(n, clues, p).map((rect) => ({ rect, cells: cellsOf(n, rect) })),
  )
  const owner = new Array<number>(size).fill(-1)
  const placed = new Array<Piece | null>(k).fill(null)
  let rounds = 0

  /** The one shape left is the piece. Every shape it now covers is struck. */
  const place = (j: number) => {
    const only = shapes[j][0]
    for (const cell of only.cells) owner[cell] = j
    placed[j] = only.rect
    for (let m = 0; m < k; m++) {
      if (m === j || placed[m] !== null) continue
      shapes[m] = shapes[m].filter((cand) => cand.cells.every((cell) => owner[cell] === -1))
    }
  }

  for (;;) {
    let moved = false
    let broken = false

    // Step one — a number with one shape left takes it.
    for (let j = 0; j < k; j++) {
      if (placed[j] !== null) continue
      if (shapes[j].length === 0) {
        broken = true
        break
      }
      if (shapes[j].length === 1) {
        place(j)
        moved = true
      }
    }
    if (broken) return null

    // Step two, and only once step one has run out — so `rounds` counts passes a
    // child would really have had to make. Nothing is placed here.
    if (!moved) {
      for (let cell = 0; cell < size && !broken; cell++) {
        if (owner[cell] !== -1) continue
        let only = -1
        let seen = 0
        for (let j = 0; j < k && seen < 2; j++) {
          if (placed[j] !== null) continue
          if (shapes[j].some((cand) => cand.cells.includes(cell))) {
            only = j
            seen++
          }
        }
        if (seen === 0) {
          broken = true
          break
        }
        if (seen === 1) {
          const before = shapes[only].length
          shapes[only] = shapes[only].filter((cand) => cand.cells.includes(cell))
          if (shapes[only].length !== before) moved = true
          if (shapes[only].length === 0) broken = true
        }
      }
    }
    if (broken) return null

    if (!moved) break
    rounds++
  }

  return placed.some((piece) => piece === null) ? null : { pieces: placed as Piece[], rounds }
}

/**
 * How many ways the whole bar can be cut, counted no further than `cap`.
 *
 * The stupidest possible counter — take the first square nothing owns yet and
 * try every number's every shape that covers it — so that the clever solver
 * above agreeing with it means the clever one is not lying.
 */
export function countSolutions(n: number, clues: number[], cap = 2): number {
  const size = n * n
  const spots: number[] = []
  for (let i = 0; i < size; i++) if (clues[i] !== 0) spots.push(i)
  const shapes = spots.map((p) => candidatesFor(n, clues, p).map((rect) => cellsOf(n, rect)))
  const used = new Array<boolean>(spots.length).fill(false)
  const owner = new Array<number>(size).fill(-1)
  let found = 0

  const walk = (): void => {
    if (found >= cap) return
    let open = -1
    for (let i = 0; i < size; i++) {
      if (owner[i] === -1) {
        open = i
        break
      }
    }
    if (open === -1) {
      found++
      return
    }
    for (let j = 0; j < spots.length; j++) {
      if (used[j]) continue
      for (const cells of shapes[j]) {
        if (!cells.includes(open)) continue
        if (cells.some((cell) => owner[cell] !== -1)) continue
        used[j] = true
        for (const cell of cells) owner[cell] = j
        walk()
        for (const cell of cells) owner[cell] = -1
        used[j] = false
        if (found >= cap) return
      }
    }
  }

  walk()
  return found
}

/* ============================================================
   Making a board

   Backwards, from a finished one: cut the whole bar into
   rectangles first, then print one number inside each. Nothing
   here can produce a bar that cannot be broken up, because the
   answer was drawn first — and because the cut is *given* the
   number of pieces and backtracks until it hits it, par is a
   fact about the board rather than a hope about it.
   ============================================================ */

/** How far the cut will search one bar before it gives up and another is drawn. */
const BUDGET = 600

/**
 * Cut the whole bar into `pieces` rectangles, none smaller than two squares and
 * none bigger than `maxArea`, or give up.
 *
 * Row-major: the first free square is always the top-left corner of the next
 * piece, so no arrangement is unreachable and none is counted twice. Three
 * prunes keep it quick and make it hit the piece count exactly — what is left
 * has to divide into what is left to cut; a free square with no free neighbour
 * could only ever be a piece of one; and a node budget gives up on a bad start
 * rather than backtracking forever.
 */
export function randomPartition(
  rng: Rng,
  n: number,
  pieces: number,
  maxArea: number,
): Piece[] | null {
  const size = n * n
  const owner = new Array<number>(size).fill(-1)
  const rects: Piece[] = []
  let left = size
  let nodes = 0

  const stranded = (): boolean => {
    for (let i = 0; i < size; i++) {
      if (owner[i] !== -1) continue
      const r = rowOf(n, i)
      const c = colOf(n, i)
      if (r > 0 && owner[i - n] === -1) continue
      if (r < n - 1 && owner[i + n] === -1) continue
      if (c > 0 && owner[i - 1] === -1) continue
      if (c < n - 1 && owner[i + 1] === -1) continue
      return true
    }
    return false
  }

  const walk = (): boolean => {
    if (++nodes > BUDGET) return false
    if (left === 0) return rects.length === pieces
    const todo = pieces - rects.length
    if (todo === 0) return false

    let first = -1
    for (let i = 0; i < size; i++) {
      if (owner[i] === -1) {
        first = i
        break
      }
    }
    const r0 = rowOf(n, first)
    const c0 = colOf(n, first)
    const options: Piece[] = []
    for (let r1 = r0; r1 < n; r1++) {
      for (let c1 = c0; c1 < n; c1++) {
        const area = (r1 - r0 + 1) * (c1 - c0 + 1)
        if (area > maxArea) break
        if (area < 2) continue
        let free = true
        for (let r = r0; r <= r1 && free; r++) {
          for (let c = c0; c <= c1; c++) {
            if (owner[r * n + c] !== -1) {
              free = false
              break
            }
          }
        }
        if (!free) break
        const rest = left - area
        const restPieces = todo - 1
        if (rest < restPieces * 2 || rest > restPieces * maxArea) continue
        options.push({ r0, c0, r1, c1 })
      }
    }

    for (const rect of shuffled(rng, options)) {
      const cells = cellsOf(n, rect)
      const id = rects.length
      rects.push(rect)
      for (const cell of cells) owner[cell] = id
      left -= cells.length
      if (!stranded() && walk()) return true
      rects.pop()
      for (const cell of cells) owner[cell] = -1
      left += cells.length
    }
    return false
  }

  return walk() ? rects : null
}

/**
 * One square inside each piece carries that piece's size as a printed number.
 *
 * This is the free knob that does the work `carve` does for the garden cats:
 * where inside a rectangle its number sits decides whether the bar has one
 * answer or several, at no cost at all.
 */
export function placeClues(rng: Rng, n: number, rects: Piece[]): number[] {
  const clues = new Array<number>(n * n).fill(0)
  for (const rect of rects) {
    const cells = cellsOf(n, rect)
    clues[cells[randInt(rng, cells.length)]] = areaOf(rect)
  }
  return clues
}

/** True when this bar is the bar the level asked for. */
export function fits(config: ShikakuConfig, clues: number[]): boolean {
  const { n, pieces, maxArea, minRounds, maxRounds } = config
  let count = 0
  for (const v of clues) {
    if (v === 0) continue
    count++
    // A 1 would hand its square over before the puzzle started.
    if (v < 2 || v > maxArea) return false
  }
  if (count !== pieces) return false
  const reasoned = solveByLogic(n, clues)
  if (reasoned === null) return false
  return reasoned.rounds >= minRounds && reasoned.rounds <= maxRounds
}

/** How many bars `deal` looks at before it settles for the best it has seen. */
const ATTEMPTS = 400

/**
 * A bar for this level.
 *
 * Every bar here can be broken up by construction, so the loop is only ever
 * choosing between bars that work: the first one that suits the level wins,
 * and one turns up in between two and seven draws at about 20 microseconds a
 * draw. The two fallbacks are for a run of luck bad enough that the tests have
 * never seen it, and both of them still carry the right number of pieces, so
 * par survives even then.
 */
export function deal(rng: Rng, config: ShikakuConfig): number[] {
  const { n, pieces, maxArea } = config
  let reasoned: number[] | null = null
  let anyBar: number[] | null = null

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const rects = randomPartition(rng, n, pieces, maxArea)
    if (rects === null) continue
    const clues = placeClues(rng, n, rects)
    anyBar ??= clues
    if (fits(config, clues)) return clues
    if (reasoned === null && solveByLogic(n, clues) !== null) reasoned = clues
  }

  return reasoned ?? (anyBar as number[])
}
