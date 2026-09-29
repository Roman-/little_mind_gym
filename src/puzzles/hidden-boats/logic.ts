import { randInt, shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The hidden boats.

   A fleet of boats lies hidden in a square of sea, and a number
   stands at the end of every row and every column, counting the
   boat squares in its own line. The boats to find are drawn under
   the board, longest first. Every boat is a straight line, no two
   boats touch, not even at a corner, and a few boat squares are
   printed at the start in the shape their own boat gives them: a
   whole boat one square long, an end, or a middle. It is Solitaire
   Battleships, sold as Bimaru.

   Everything here is pure and framework-free. Four things are
   worth reading twice.

   The numbers never speak. The tents and trees refuses a tent that
   would take a line past its number, and crosses a number off once
   its line is full; this board does neither, and the reason was
   measured rather than guessed. Take a hundred boards a level (seeds
   4242 + 37k) and a player who taps squares in a random order,
   keeps whatever the board takes, and stops at the fleet's total.
   Against a board that refuses a boat square past a line's number
   that player lands 20, 9 and 0 of them; against this one, none at
   all. Let it start over until it has spent fifty times par and it
   lands 100, 100 and 36 against 13, 0 and 0. A moss "this line
   is full" is the same oracle, because a player who never taps in
   a moss line is exactly that sweeper. So a number says what the
   finished board looks like, as it does on the thermometers, and
   nothing on the board ever says how a line is getting on.

   `reduce` refuses only what breaks a boat's shape: a boat turning
   a corner, two boats touching at a corner, a square against a
   printed piece, and a boat longer than the longest. All four read
   the child's own boats and the printed pieces and never the
   answer, so they are no oracle either — the sweeper above uses all
   four and in a single sweep still lands none — and `blockedCells`
   draws them as dots for free, which is the paper game's water.

   `fleetOnBoard` is the strip of boats to find. It fills longest
   first, or for a boat that dots and the edge have shut in, and
   either way never for part of a longer boat on the road to the
   answer. The theorem above it says a position is solved exactly
   when every number is met and every outline is filled in, so the
   strip is the are-you-done meter that silent numbers leave room
   for: the numbers are counted by the child, and the fleet is
   counted by the board.

   `solveByLogic` fills a board using only the three steps the hints
   teach, and `deal` throws away every board it cannot finish. A
   solver that only ever places a boat square that the clues force
   also proves the board has exactly one answer, so uniqueness and "no
   guessing" are one check. `countSolutions` is held against it in
   the tests to keep that claim honest.
   ============================================================ */

/** A way along the board. */
export type Toward = 'up' | 'down' | 'left' | 'right'

/**
 * A printed boat square's shape. An end is named for the way the rest of its
 * boat lies, so a `'right'` end is the left-hand end of a boat that runs on to
 * the right, and is flat on its right-hand side.
 */
export type Piece = 'single' | 'middle' | Toward

/**
 * How one boat square is drawn. An end is flat on the side it names; a middle
 * runs across or down; a block is a piece of boat whose way is not known yet.
 */
export type Hull = 'single' | 'block' | 'across' | 'down' | 'end-up' | 'end-down' | 'end-left' | 'end-right'

/**
 * One level's board, and the dials that say how hard it is allowed to be.
 *
 * The fleet and the printed squares are fixed a level, so par cannot wobble
 * from seed to seed (see the par note below `legalMoves`). The rest is the
 * band a board has to fall inside, measured on `solveByLogic` rather than
 * guessed at, and each ceiling stands no higher than the floor of the level
 * above it — the tents and trees' ladder rule. `logic.test.ts` holds all three
 * levels to it.
 */
export interface BoatsConfig {
  /** Rows and columns both come in this many. */
  n: number
  /** Boat lengths, longest first. */
  fleet: number[]
  /** Boat squares printed at the start. Fixed, so par cannot wobble. */
  shown: number
  /** Passes over the child's steps (see `solveByLogic`), at least and at most. */
  minRounds: number
  maxRounds: number
  /**
   * The boats the fit step has to place, in order. Each entry is one
   * productive fit step and the length of the boat it asks about. A board is
   * in its band only if `solveByLogic`'s `fitAsked` equals this exactly, so
   * the hints can name those boats.
   */
  fitAsks: number[]
  /** Numbers in the margin that say 0, at least (four boats' second hint names one). */
  minZeros: number
  /**
   * Printed ends that point at a square with nothing printed on it, at least
   * (four boats' first hint sends a child to that square; see `openEnds`).
   */
  minEnds: number
  /** Fleet layouts that keep every printed piece, numbers ignored, at least. 0 turns the gate off. */
  minLayouts: number
}

export interface BoatsState {
  n: number
  /** Boat lengths, longest first. Never changes. */
  fleet: number[]
  /** Boat squares wanted in each row, and in each column. Never changes. */
  rowClues: number[]
  colClues: number[]
  /** Row-major. The printed shape on a square, or null. Never changes. */
  printed: (Piece | null)[]
  /** Row-major. True where a boat square stands, printed ones included. */
  boats: boolean[]
}

/** One tap: a boat square goes down on an empty square, or comes away off its own. */
export type BoatsAction = { type: 'toggle'; index: number }

/* --- reading the grid ---------------------------------------- */

export const rowOf = (n: number, index: number): number => Math.floor(index / n)
export const colOf = (n: number, index: number): number => index % n

export function rowCells(n: number, r: number): number[] {
  return Array.from({ length: n }, (_, c) => r * n + c)
}

export function colCells(n: number, c: number): number[] {
  return Array.from({ length: n }, (_, r) => r * n + c)
}

/** The squares that share an edge with this one: up, down, left, right. */
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

/** The eight squares round this one. No other boat stands on any of them. */
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

/** The four ways, in the order every rule here tries them. */
export const DIRS: readonly Toward[] = ['up', 'down', 'left', 'right']

export function opposite(d: Toward): Toward {
  if (d === 'up') return 'down'
  if (d === 'down') return 'up'
  return d === 'left' ? 'right' : 'left'
}

/** The square one step this way, or -1 off the edge of the board. */
export function step(n: number, index: number, d: Toward): number {
  const r = rowOf(n, index)
  const c = colOf(n, index)
  if (d === 'up') return r > 0 ? index - n : -1
  if (d === 'down') return r < n - 1 ? index + n : -1
  if (d === 'left') return c > 0 ? index - 1 : -1
  return c < n - 1 ? index + 1 : -1
}

/** The four squares at this one's corners. */
export function diagonal(n: number, index: number): number[] {
  const r = rowOf(n, index)
  const c = colOf(n, index)
  const out: number[] = []
  for (const [dr, dc] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    const rr = r + dr
    const cc = c + dc
    if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc)
  }
  return out
}

/** Every straight run of `length` squares on the board: across before down at each square, in reading order. */
export function placementsOf(n: number, length: number): number[][] {
  const out: number[][] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (c + length <= n) out.push(Array.from({ length }, (_, k) => r * n + c + k))
      // A boat one square long is listed once, not once each way.
      if (length > 1 && r + length <= n) out.push(Array.from({ length }, (_, k) => (r + k) * n + c))
    }
  }
  return out
}

/**
 * The same neighbours and the same placements as the functions above, worked
 * out once a board size for the paths that ask for them thousands of times a
 * deal. Never handed out of this file, so nobody can sort one in place.
 *
 * They are worth it: a six-boat deal draws 94 fleets on average, lays 85 of
 * them and runs the solver over every one it lays (50 come out reasoned), and
 * every square the solver places asks for the dots again. Built afresh on
 * every call, the placement lists alone were as much of a deal's time as the
 * solver was. Run side by side with the prototype this file was ported from,
 * which built everything afresh, sixty six-boat deals took 0.35 seconds
 * against its 1.14, on identical boards. Over seeds 0 to 299 a deal takes
 * 0.7, 4.5 and 3.6 ms on average and 24 ms at the very worst, on a machine at
 * a load of 19, against the tents and trees' bound of 400.
 */
interface Tables {
  orthogonal: number[][]
  touching: number[][]
  diagonal: number[][]
  placements: Map<number, number[][]>
}

const tables = new Map<number, Tables>()

function tablesFor(n: number): Tables {
  let found = tables.get(n)
  if (found === undefined) {
    const squares = Array.from({ length: n * n }, (_, i) => i)
    found = {
      orthogonal: squares.map((i) => orthogonal(n, i)),
      touching: squares.map((i) => touching(n, i)),
      diagonal: squares.map((i) => diagonal(n, i)),
      placements: new Map(),
    }
    tables.set(n, found)
  }
  return found
}

function placementTable(n: number, length: number): number[][] {
  const { placements } = tablesFor(n)
  let list = placements.get(length)
  if (list === undefined) {
    list = placementsOf(n, length)
    placements.set(length, list)
  }
  return list
}

/* --- the boats ------------------------------------------------ */

/**
 * Every run of boat squares joined edge to edge, each in ascending order. On
 * any position `reduce` can reach, every one of them is a straight line: two
 * boat squares that share an edge are one boat by definition, and the rules
 * below never let a run bend or touch another at a corner.
 */
export function runsOf(n: number, boats: boolean[]): number[][] {
  const beside = tablesFor(n).orthogonal
  const seen = new Uint8Array(boats.length)
  const out: number[][] = []
  for (let i = 0; i < boats.length; i++) {
    if (!boats[i] || seen[i]) continue
    seen[i] = 1
    const cells: number[] = []
    const stack = [i]
    while (stack.length > 0) {
      const j = stack.pop() as number
      cells.push(j)
      for (const k of beside[j]) {
        if (boats[k] && !seen[k]) {
          seen[k] = 1
          stack.push(k)
        }
      }
    }
    out.push(cells.sort((a, b) => a - b))
  }
  return out
}

/** The run that holds this boat square, ascending. Only a refused tap asks, once. */
function runThrough(n: number, boats: boolean[], index: number): number[] {
  const seen = new Set([index])
  const stack = [index]
  while (stack.length > 0) {
    const j = stack.pop() as number
    for (const k of orthogonal(n, j)) {
      if (boats[k] && !seen.has(k)) {
        seen.add(k)
        stack.push(k)
      }
    }
  }
  return [...seen].sort((a, b) => a - b)
}

/** A boat square's shape, read off its neighbours: what a printed square would say here. */
export function shapeAt(n: number, boats: boolean[], index: number): Piece | null {
  if (!boats[index]) return null
  let only: Toward | null = null
  let count = 0
  for (const d of DIRS) {
    const j = step(n, index, d)
    if (j >= 0 && boats[j]) {
      only = d
      count++
    }
  }
  if (count === 0) return 'single'
  return count === 1 ? (only as Toward) : 'middle'
}

/**
 * What the board draws in a boat square, or null on a square with no boat.
 *
 * A printed square says its own shape whatever stands round it, because that
 * shape is a fact the child was handed. A printed middle does not say which
 * way it runs, so it is a block until one neighbour says so. A square the
 * child put down is drawn from its neighbours. Two neighbours at right angles,
 * or three or four, never happen on a position `reduce` can reach — only the
 * refused bend that `useRefusal` draws for one cue gets there, and its corner
 * shows as a block.
 */
export function hullOf(state: BoatsState, index: number): Hull | null {
  const { n, boats, printed } = state
  if (!boats[index]) return null
  const piece = printed[index]
  if (piece === 'single') return 'single'
  if (piece !== null && piece !== 'middle') return `end-${piece}`
  const on = (d: Toward) => {
    const j = step(n, index, d)
    return j >= 0 && boats[j]
  }
  const across = on('left') || on('right')
  const down = on('up') || on('down')
  if (piece === 'middle') return across && !down ? 'across' : down && !across ? 'down' : 'block'
  const sides = DIRS.filter(on)
  if (sides.length === 0) return 'single'
  if (sides.length === 1) return `end-${sides[0]}`
  if (sides.length === 2 && !down) return 'across'
  if (sides.length === 2 && !across) return 'down'
  return 'block'
}

/** Boat squares on the board, printed ones included. */
export const boatCount = (state: BoatsState): number => state.boats.filter(Boolean).length

/** Boat squares the finished board holds: the fleet, added up. */
export const fleetTotal = (state: BoatsState): number => state.fleet.reduce((a, b) => a + b, 0)

/** True when every row and every column holds exactly as many boat squares as its number. */
export function numbersMet(state: BoatsState): boolean {
  const { n, boats, rowClues, colClues } = state
  const rows = new Array<number>(n).fill(0)
  const cols = new Array<number>(n).fill(0)
  for (let i = 0; i < boats.length; i++) {
    if (!boats[i]) continue
    rows[rowOf(n, i)]++
    cols[colOf(n, i)]++
  }
  for (let k = 0; k < n; k++) if (rows[k] !== rowClues[k] || cols[k] !== colClues[k]) return false
  return true
}

/* --- the rules ------------------------------------------------ */

/**
 * Which rule putting a boat square down breaks. There is no `row` and no
 * `column` here, on purpose: a number is never refused against (see the top of
 * this file).
 */
export type ClashKind = 'bend' | 'corner' | 'shape' | 'long'

/** Which side of a printed piece a `shape` clash fell on, so the sentence can say it. */
export type ShapeRule = 'single' | 'tip' | 'across' | 'down'

/** One boat square, and the group of squares that will not have it. */
export interface Clash {
  kind: ClashKind
  /** The printed piece's rule for a `shape` clash; null for the other three. */
  rule: ShapeRule | null
  /** Every square in the group the board lights: the one tapped comes first. */
  cells: number[]
}

/**
 * Whether a printed piece has room for a boat square on this side of it, and
 * the rule it breaks if not. `side` is the way from the printed square to the
 * square being tapped.
 *
 * A whole one-square boat has room on no side. An end has room only on the
 * side it points at: the square beyond its rounded tip is `tip`, and a square
 * beside its long side says which way the boat goes. A middle runs either way
 * until one is taken, but not off the edge of the board, so it refuses the
 * side whose far partner would be off it.
 */
function closedSide(n: number, piece: Piece, p: number, side: Toward): ShapeRule | null {
  if (piece === 'single') return 'single'
  if (piece === 'middle') {
    if (step(n, p, opposite(side)) >= 0) return null
    return side === 'left' || side === 'right' ? 'down' : 'across'
  }
  if (piece === side) return null
  if (side === opposite(piece)) return 'tip'
  return piece === 'left' || piece === 'right' ? 'across' : 'down'
}

/** How many boat squares run on from this square, this way. */
function reach(state: BoatsState, index: number, d: Toward): number {
  let count = 0
  let j = step(state.n, index, d)
  while (j >= 0 && state.boats[j]) {
    count++
    j = step(state.n, j, d)
  }
  return count
}

/**
 * The rule that a boat square on `index` breaks, or null when the square takes
 * it. Null too for a square off the board, a printed square, and a square that
 * already holds a boat: there is nothing to put down on any of those.
 *
 * One square can break several rules at once, and only the first is reported,
 * because two lit groups say nothing about either. The order is the order a
 * child sees them in: a boat that would bend, a boat that would touch another
 * at a corner, a printed piece that will not have it, and last a boat that
 * would grow too long.
 *
 * A bend and a corner are one predicate split in two — some square at this
 * one's corner is a boat — and the split is only for the sentence. A bend is
 * the case where that corner square belongs to the very boat this square would
 * join, so a child growing a boat round a corner is told the boat cannot turn,
 * not that two boats would touch. Measured on random taps over random legal
 * walks, 100 boards a level, 41 to 49% of the corner-kind refusals a child
 * meets are bends, and 76 to 81% of those met while growing a boat.
 *
 * A square that lies between two separate boats in one line, with no boat at
 * its corners, breaks neither: the tap joins them into one run, and only
 * `long` can refuse it.
 */
export function clashOf(state: BoatsState, index: number): Clash | null {
  const { n, boats, printed, fleet } = state
  if (!Number.isInteger(index) || index < 0 || index >= boats.length) return null
  if (printed[index] !== null || boats[index]) return null

  const corners = tablesFor(n).diagonal[index].filter((j) => boats[j])
  if (corners.length > 0) {
    // Up, down, left, right, and the first boat beside this square whose own
    // run holds one of those corner squares wins.
    for (const o of orthogonal(n, index)) {
      if (!boats[o]) continue
      const run = runThrough(n, boats, o)
      if (corners.some((j) => run.includes(j))) return { kind: 'bend', rule: null, cells: [index, ...run] }
    }
    return { kind: 'corner', rule: null, cells: [index, ...corners] }
  }

  for (const d of DIRS) {
    const p = step(n, index, d)
    if (p < 0) continue
    const piece = printed[p]
    if (piece === null) continue
    const rule = closedSide(n, piece, p, opposite(d))
    if (rule !== null) return { kind: 'shape', rule, cells: [index, p] }
  }

  // Read off the two lines through the square by walking outwards. Never
  // `runsOf` per square: `blockedCells` asks this of every square after every
  // move, and the solver asks it after every square it places.
  const across = reach(state, index, 'left') + reach(state, index, 'right')
  const down = reach(state, index, 'up') + reach(state, index, 'down')
  if (1 + Math.max(across, down) > fleet[0]) {
    const cells = [index]
    for (const d of across >= down ? (['left', 'right'] as const) : (['up', 'down'] as const)) {
      let j = step(n, index, d)
      while (j >= 0 && boats[j]) {
        cells.push(j)
        j = step(n, j, d)
      }
    }
    return { kind: 'long', rule: null, cells: cells.sort((a, b) => a - b) }
  }

  return null
}

/** The broken rule in one sentence. The lit group says where; this says what. */
export function describeClash(clash: Clash, fleet: number[]): string {
  if (clash.kind === 'bend') return 'A boat cannot turn a corner.'
  if (clash.kind === 'corner') return 'This boat would touch another boat at a corner.'
  if (clash.kind === 'long') return `The longest boat is ${fleet[0]} squares long.`
  if (clash.rule === 'single') return 'This boat is only one square long.'
  if (clash.rule === 'tip') return 'This boat ends at the printed square.'
  if (clash.rule === 'across') return 'This boat goes across, not up and down.'
  return 'This boat goes up and down, not across.'
}

/** True when a boat square may be put down here. */
export function canPlace(state: BoatsState, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= state.boats.length) return false
  if (state.printed[index] !== null || state.boats[index]) return false
  return clashOf(state, index) === null
}

/**
 * A forbidden boat square, put down anyway: it goes where the child put it,
 * and one sentence says why it cannot stay. Null where the square takes it,
 * and null for taking a boat square away, which breaks no rule at all.
 */
export function refusalOf(
  state: BoatsState,
  index: number,
): { pretend: BoatsState; message: string; clash: Clash } | null {
  const clash = clashOf(state, index)
  if (clash === null) return null
  const boats = state.boats.slice()
  boats[index] = true
  return { pretend: { ...state, boats }, message: describeClash(clash, state.fleet), clash }
}

/**
 * The squares that the boats already down leave no room for: the paper game's
 * water, drawn free. It is exactly the squares `clashOf` would refuse, and
 * nothing else — so it is cut from the child's own boats and the printed
 * pieces, and never from a line's number. A line whose number is met keeps
 * its open squares open, and counting it is the child's to do.
 *
 * This is the fast form of `clashOf(state, i) !== null` over every square, and
 * `logic.test.ts` holds the two to each other. It never flood-fills to tell a
 * bend from a corner, because both mean "a square at this one's corner is a
 * boat"; only the sentence cares which, and only one tap at a time asks for
 * the sentence.
 */
export function blockedCells(state: BoatsState): boolean[] {
  const { n, boats, printed, fleet } = state
  const corners = tablesFor(n).diagonal
  return boats.map((boat, i) => {
    if (boat || printed[i] !== null) return false
    for (const j of corners[i]) if (boats[j]) return true
    for (const d of DIRS) {
      const p = step(n, i, d)
      if (p < 0) continue
      const piece = printed[p]
      if (piece !== null && closedSide(n, piece, p, opposite(d)) !== null) return true
    }
    const across = reach(state, i, 'left') + reach(state, i, 'right')
    const down = reach(state, i, 'up') + reach(state, i, 'down')
    return 1 + Math.max(across, down) > fleet[0]
  })
}

/* --- the strip ------------------------------------------------ */

/**
 * Which of the boats to find are on the board, indexed like `fleet`. The strip
 * under the board fills an outline where this is true.
 *
 * First the boats are matched to the fleet's places by length. A run holding a
 * printed piece that disagrees with it is not counted — a printed end still
 * waiting for the rest of its boat is not a boat yet. Then a place for a boat
 * of some length is filled in, in strip order, in one of two ways:
 *
 * - longest first: every place for a longer boat is filled in already, and a
 *   boat of this length is on the board for it;
 * - shut in: a boat of this length is on the board with nothing but dots and
 *   the edge round it, so no square a child can put down will make it longer.
 *
 * Longest first is what makes the strip honest. Filled by length alone, the
 * outline of a boat of two filled in for the first two squares of the boat of
 * three on 31, 47 and 60% of positions along a flawless solve, and emptied
 * again on the very next right tap on 11, 14 and 14% of taps (the answer
 * placed in a random order, 500 solves a level). Longest first, both are 0% at
 * every level. On its own, though, it kept a finished short boat waiting for
 * its outline until the longer ones were down — and a boat printed whole, a
 * printed boat of one or two printed ends facing each other, waited from the
 * very first frame: on 223, 300 and 213 of the boards dealt from seeds 0 to
 * 299, a boat stood on the board at the start while its outline stayed empty.
 *
 * Shut in is what ends that. The paper game ticks a boat off once water is
 * all round it, and the dots are this board's water. It keeps both of the
 * promises above, because on the way to the answer a boat that is shut in is
 * a whole boat of the answer: an answer square is never dotted there (the
 * par note below `legalMoves`), so a piece of a longer boat always has an open
 * square at its end. And the dots only gather as right taps go down, so a boat
 * that is shut in stays shut in. Measured the same way as above, 500 solves a
 * level again (five orders on each board from seeds 0 to 99): part of a longer
 * boat and an outline emptied are still 0% at every level, and a finished boat
 * waits on 50, 60 and 69% of positions, where longest first alone kept one
 * waiting on 73, 80 and 86%. No board opens with a printed boat waiting.
 *
 * Nor does it move the first outline that is still empty. Every place before
 * that one is filled in either way, so every longer place is, and then both
 * ways fill the places of its length alike. That outline is the one the fit
 * step in `solveByLogic` asks about, so shut in changes no board `deal` hands
 * out: seeds 0 to 299 deal the same boards at every level with it and without.
 *
 * **The theorem this strip rests on.** On every position `reduce` can reach,
 * `isSolved(s)` is exactly `numbersMet(s) && fleetOnBoard(s).every(Boolean)`.
 *
 * (⇒) A solved board meets every number. Its runs are exactly the fleet and
 * every printed piece agrees, so every run is counted, and longest first
 * fills every outline.
 *
 * (⇐) Every number met means the board holds sum(rowClues) boat squares, and
 * the clues were read off an answer of this fleet, so that is sum(fleet).
 * Either way, an outline is filled in only for a boat of its length that no
 * other outline of that length has already taken, so every outline filled in
 * means distinct runs have been matched to all of the outlines, and those
 * runs already hold sum(fleet) squares — so there is no other run, and the
 * runs are exactly the fleet. Every printed square is a boat square, because
 * it cannot be taken away, so it lies in some run; every run is matched, and a
 * matched run agrees with every printed piece inside it. `reduce` never allows
 * a corner touch. So every clause of `isSolved` holds. ∎
 *
 * `logic.test.ts` checks the theorem on every reachable position of three
 * four-boat boards, and at six and seven boats on random walks and on
 * positions with every number met. It is what lets the numbers stay silent:
 * the child counts them, the strip counts the fleet, and the note under the
 * board says which of the two halves is still off without saying where.
 */
export function fleetOnBoard(state: BoatsState): boolean[] {
  const { n, boats, printed, fleet } = state
  const beside = tablesFor(n).orthogonal
  const dotted = blockedCells(state)
  /** Boats on the board of each length, and how many of those are shut in. */
  const whole = new Map<number, number>()
  const shut = new Map<number, number>()
  for (const run of runsOf(n, boats)) {
    // A run is a whole component, so a square's neighbours in it are its
    // neighbours on the board, and its shape can be read off the board.
    if (run.some((i) => printed[i] !== null && shapeAt(n, boats, i) !== printed[i])) continue
    whole.set(run.length, (whole.get(run.length) ?? 0) + 1)
    // Every square beside it is its own, a dot, or off the edge: nothing a
    // child can put down will make this boat any longer.
    if (run.every((i) => beside[i].every((j) => boats[j] || dotted[j]))) {
      shut.set(run.length, (shut.get(run.length) ?? 0) + 1)
    }
  }
  const out: boolean[] = []
  for (let k = 0; k < fleet.length; k++) {
    const length = fleet[k]
    /** Outlines of this length before this one on the strip. */
    const before = fleet.slice(0, k).filter((l) => l === length).length
    const longer = fleet.every((l, j) => l <= length || out[j])
    out.push(before < ((longer ? whole : shut).get(length) ?? 0))
  }
  return out
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<BoatsConfig>, rng: Rng): BoatsState {
  const { n, fleet } = level.config
  const { rowClues, colClues, printed } = deal(rng, level.config)
  return { n, fleet, rowClues, colClues, printed, boats: printed.map((piece) => piece !== null) }
}

/**
 * A boat square that breaks a rule never lands; `refusalOf` hands it back
 * instead. A printed square is not a control, so a tap on one changes
 * nothing. Taking a boat square away is always allowed, and a line past its
 * number, or a second boat of the longest length, is not a rule this refuses:
 * the note and the strip say those.
 */
export function reduce(state: BoatsState, action: BoatsAction): BoatsState {
  if (action?.type !== 'toggle') return state
  const { index } = action
  if (!Number.isInteger(index) || index < 0 || index >= state.boats.length) return state
  if (state.printed[index] !== null) return state
  // `canPlace` decides the move, so the function the tests hold to the rules
  // is the one the engine runs, and not a second copy of it.
  if (!state.boats[index] && !canPlace(state, index)) return state
  const boats = state.boats.slice()
  boats[index] = !boats[index]
  return { ...state, boats }
}

/**
 * Four rules. No two boats touch at a corner, which `reduce` never allows and
 * which is checked anyway; every number counts its own line; every printed
 * square keeps its shape, because a refusal cannot force the square an end
 * points at; and the runs on the board are the fleet, no more and no fewer.
 *
 * Nothing here reads the deal, so a position rewound through the move tape is
 * judged exactly as a position played forward is.
 */
export function isSolved(state: BoatsState): boolean {
  const { n, boats, printed, fleet } = state
  const corners = tablesFor(n).diagonal
  for (let i = 0; i < boats.length; i++) {
    if (boats[i] && corners[i].some((j) => boats[j])) return false
  }
  if (!numbersMet(state)) return false
  for (let i = 0; i < boats.length; i++) {
    if (printed[i] !== null && shapeAt(n, boats, i) !== printed[i]) return false
  }
  const lengths = runsOf(n, boats)
    .map((run) => run.length)
    .sort((a, b) => b - a)
  return lengths.join() === fleet.join()
}

export function describeMove(prev: BoatsState, _next: BoatsState, action: BoatsAction): string {
  const where = `row ${rowOf(prev.n, action.index) + 1}, column ${colOf(prev.n, action.index) + 1}`
  return prev.boats[action.index] ? `Took the boat square away from ${where}` : `Put a boat square in ${where}`
}

/** Every action worth trying: a toggle on every square that is not printed. Used by the tests. */
export function legalMoves(state: BoatsState): BoatsAction[] {
  const out: BoatsAction[] = []
  for (let index = 0; index < state.printed.length; index++) {
    if (state.printed[index] === null) out.push({ type: 'toggle', index })
  }
  return out
}

/* ============================================================
   par

   A level's par is sum(fleet) − shown, the same for every seed,
   and both halves are proved in logic.test.ts rather than
   asserted. Neither half needs the answer to be unique, so it
   holds for the fallback board too.

   The floor. A board starts with only its printed squares, which
   cannot be taken away; the solved board holds sum(fleet) boat
   squares; and a move changes exactly one square. So it takes at
   least sum(fleet) − shown moves.

   The ceiling. Take any of the answer's squares on top of the
   printed ones. No two of them touch at a corner, because the
   answer has none, so neither `bend` nor `corner` fires. Every
   run is a piece of one answer boat, so none is longer than the
   longest and `long` never fires. None stands against a printed
   piece's closed side, because the answer keeps every printed
   shape, and a printed middle on the edge runs along it in the
   answer. So no answer square is ever refused, in any order, and
   placing them all, one tap each, ends on the answer.

   And there is no dead end, so there is no `failure` and no
   `canStillWin`. Taking a boat square away is never refused, so
   from any position a player can reach, taking every square they
   put down away walks back to the opening position — and from
   there the answer goes down in any order, by the ceiling above.
   ============================================================ */

/* ============================================================
   Reasoning a board out

   Three steps, and they are the three the hints teach.

   One, a line: a row or a column with room for just as many boat
   squares as its number still wants has a boat square on every
   one of them.

   Two, a printed piece: an end points at the rest of its boat, so
   the square it points at is a boat square; and a middle whose one
   pair of neighbours is closed runs through the other pair.

   Three, and only once the first two have run dry, the fit: where
   can the longest boat that is still an outline on the strip lie?
   Every place it could still go is written out, and a square that
   all of them use is a boat square. This is the one step that the
   puzzle adds to the margin-number family, and every level is
   dealt so that it is needed for the boats its hints name.
   ============================================================ */

/** What a board reasoned through gives back. */
export interface Deduction {
  /** The one answer, row-major. */
  boats: boolean[]
  /** Passes over the steps it took. */
  rounds: number
  /** The length of the boat that each productive fit step asked about, in order. */
  fitAsked: number[]
  /** Squares settled by each step. */
  fitSquares: number
  shapeSquares: number
  lineSquares: number
}

/** True when every printed square inside this placement has the shape the placement gives it. */
function keepsPrinted(n: number, printed: (Piece | null)[], cells: number[]): boolean {
  if (!cells.some((i) => printed[i] !== null)) return true
  const alone = new Array<boolean>(n * n).fill(false)
  for (const i of cells) alone[i] = true
  return cells.every((i) => printed[i] === null || shapeAt(n, alone, i) === printed[i])
}

/**
 * The board as a child reasons it out, or null where the three steps stall or
 * the board is broken.
 *
 * **Knowledge is the boat squares and nothing else.** After every square it
 * places, the solver works the sea out again from the boats, as the two things
 * a child can see: the dots, which are `blockedCells` of the boats known so far,
 * and every square in a line whose known boats already reach its number, which
 * is not drawn but is read off by counting that one line. It keeps no sea of
 * its own. That is the pencil-mark guarantee, built in rather than sampled:
 * every board this deals is solved with nothing held in the head beyond what
 * the dots show or a count of one line gives back.
 *
 * A round is one pass of steps one and two over the whole board. Only if that
 * pass places nothing does the round try step three. A round counts if it
 * placed a square, and the solver stops once every boat square is down or a
 * round places nothing.
 */
export function solveByLogic(
  n: number,
  fleet: number[],
  rowClues: number[],
  colClues: number[],
  printed: (Piece | null)[],
): Deduction | null {
  const size = n * n
  const around = tablesFor(n).touching
  const boats = printed.map((piece) => piece !== null)
  const known = (): BoatsState => ({ n, fleet, rowClues, colClues, printed, boats })
  const total = fleet.reduce((a, b) => a + b, 0)
  let placed = boats.filter(Boolean).length

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
  /** Boat squares known in each line, rows first and then columns, kept as they go down. */
  const has = lines.map((cells) => cells.filter((i) => boats[i]).length)
  const need = (k: number) => clues[k] - has[k]

  /** Worked out afresh from the boats after every square placed: never kept. */
  let sea: boolean[] = []
  const recompute = () => {
    sea = blockedCells(known())
    for (let k = 0; k < lines.length; k++) {
      if (has[k] >= clues[k]) for (const i of lines[k]) if (!boats[i]) sea[i] = true
    }
  }
  recompute()

  let broken = false
  let lineSquares = 0
  let shapeSquares = 0
  let fitSquares = 0
  const fitAsked: number[] = []

  const place = (i: number): boolean => {
    if (boats[i]) return false
    if (sea[i]) {
      broken = true
      return false
    }
    boats[i] = true
    placed++
    has[rowOf(n, i)]++
    has[n + colOf(n, i)]++
    recompute()
    return true
  }

  // One: a line with room for just as many boat squares as its number.
  const lineStep = (): number => {
    let count = 0
    for (let k = 0; k < lines.length && !broken; k++) {
      const open = lines[k].filter((i) => !boats[i] && !sea[i])
      const wanted = need(k)
      if (wanted < 0 || wanted > open.length) {
        broken = true
        break
      }
      if (wanted === open.length && wanted > 0) for (const i of open) if (place(i)) count++
    }
    lineSquares += count
    return count
  }

  // Two: a printed end points at the rest of its boat, and a printed middle
  // with one pair closed runs through the other.
  const shapeStep = (): number => {
    let count = 0
    for (let p = 0; p < size && !broken; p++) {
      const piece = printed[p]
      if (piece === null || piece === 'single') continue
      if (piece === 'middle') {
        const across = [step(n, p, 'left'), step(n, p, 'right')]
        const down = [step(n, p, 'up'), step(n, p, 'down')]
        const closed = (pair: number[]) => pair.some((j) => j < 0 || (!boats[j] && sea[j]))
        const holds = (pair: number[]) => pair.some((j) => j >= 0 && boats[j])
        const run = closed(across) || holds(down) ? down : closed(down) || holds(across) ? across : []
        for (const j of run) if (j >= 0 && place(j)) count++
      } else {
        const j = step(n, p, piece)
        if (j < 0) {
          broken = true
          break
        }
        if (place(j)) count++
      }
    }
    shapeSquares += count
    return count
  }

  // Three: where can the longest boat that is still an outline lie?
  const fitStep = (): number => {
    const onBoard = fleetOnBoard(known())
    const k = onBoard.indexOf(false)
    if (k < 0) return 0
    const length = fleet[k]
    if (length < 2) return 0
    const spots: number[][] = []
    for (const cells of placementTable(n, length)) {
      if (cells.some((i) => !boats[i] && sea[i])) continue
      // A whole boat: nothing outside it touches it, even at a corner.
      if (cells.some((i) => around[i].some((j) => boats[j] && !cells.includes(j)))) continue
      const adds = new Map<number, number>()
      for (const i of cells) {
        if (boats[i]) continue
        for (const line of [rowOf(n, i), n + colOf(n, i)]) adds.set(line, (adds.get(line) ?? 0) + 1)
      }
      if ([...adds].some(([line, more]) => more > need(line))) continue
      if (!keepsPrinted(n, printed, cells)) continue
      spots.push(cells)
    }
    if (spots.length === 0) {
      broken = true
      return 0
    }
    let count = 0
    for (const i of spots[0]) if (spots.every((cells) => cells.includes(i)) && place(i)) count++
    fitSquares += count
    if (count > 0) fitAsked.push(length)
    return count
  }

  let rounds = 0
  for (;;) {
    let moved = lineStep()
    if (!broken) moved += shapeStep()
    if (!broken && moved === 0) moved += fitStep()
    if (broken) return null
    if (moved === 0) break
    rounds++
    if (placed === total) break
  }

  if (placed !== total || !isSolved(known())) return null
  return { boats: boats.slice(), rounds, fitAsked, fitSquares, shapeSquares, lineSquares }
}

/* ============================================================
   Counting

   Two independent counts, and neither shares a line with the
   solver. `countSolutions` is the check on the solver's claim of
   one answer. `countLayouts` is the haystack a player who never
   reads a number has to search, and the gate `deal` holds the
   levels above the first to.
   ============================================================ */

/**
 * How many answers the board has, counted no further than `cap`: an
 * independent backtracking over boat placements, in the shape of the garden
 * cats' `solutions()`.
 *
 * Boats go down longest first, and boats of equal length in increasing
 * placement order, so no fleet is counted twice. A placement is turned away
 * when a square of it lies in an earlier boat's ring (that boat's squares and
 * their eight neighbours), when it would take a line past its number, when a
 * printed square inside it disagrees with the shape it gives it, and when a
 * printed square lies in its ring but outside it. At the bottom every number
 * has to be met and every printed square covered.
 */
export function countSolutions(
  n: number,
  fleet: number[],
  rowClues: number[],
  colClues: number[],
  printed: (Piece | null)[],
  cap = 2,
): number {
  const size = n * n
  const rowHas = new Array<number>(n).fill(0)
  const colHas = new Array<number>(n).fill(0)
  const board = new Uint8Array(size)
  /** How many boats already down claim each square as their own or their neighbour. */
  const ring = new Int8Array(size)
  const printedCells = printed.map((piece, i) => (piece !== null ? i : -1)).filter((i) => i >= 0)
  const around = tablesFor(n).touching
  const lists = fleet.map((length) => placementTable(n, length))
  const rings = new Map<number[], number[]>()
  const ringOf = (cells: number[]): number[] => {
    let out = rings.get(cells)
    if (out === undefined) {
      const claim = new Set(cells)
      for (const i of cells) for (const j of around[i]) claim.add(j)
      out = [...claim]
      rings.set(cells, out)
    }
    return out
  }
  let found = 0

  const fits = (cells: number[]): boolean => {
    for (const i of cells) if (ring[i] > 0) return false
    const rows = new Map<number, number>()
    const cols = new Map<number, number>()
    for (const i of cells) {
      rows.set(rowOf(n, i), (rows.get(rowOf(n, i)) ?? 0) + 1)
      cols.set(colOf(n, i), (cols.get(colOf(n, i)) ?? 0) + 1)
    }
    for (const [r, k] of rows) if (k > rowClues[r] - rowHas[r]) return false
    for (const [c, k] of cols) if (k > colClues[c] - colHas[c]) return false
    if (!keepsPrinted(n, printed, cells)) return false
    const inside = new Set(cells)
    return ringOf(cells).every((j) => inside.has(j) || printed[j] === null)
  }

  const put = (cells: number[], sign: 1 | -1) => {
    for (const i of cells) {
      board[i] = sign === 1 ? 1 : 0
      rowHas[rowOf(n, i)] += sign
      colHas[colOf(n, i)] += sign
    }
    for (const j of ringOf(cells)) ring[j] += sign
  }

  const walk = (k: number, from: number) => {
    if (found >= cap) return
    if (k === fleet.length) {
      for (let r = 0; r < n; r++) if (rowHas[r] !== rowClues[r]) return
      for (let c = 0; c < n; c++) if (colHas[c] !== colClues[c]) return
      if (printedCells.every((i) => board[i] === 1)) found++
      return
    }
    const list = lists[k]
    for (let at = k > 0 && fleet[k - 1] === fleet[k] ? from : 0; at < list.length; at++) {
      if (!fits(list[at])) continue
      put(list[at], 1)
      walk(k + 1, at + 1)
      put(list[at], -1)
      if (found >= cap) return
    }
  }

  walk(0, 0)
  return found
}

/**
 * How many ways the whole fleet can lie keeping every printed piece, with the
 * numbers ignored, counted no further than `cap`. It is the haystack a player
 * who never reads a number searches.
 *
 * It walks printed-first: the first printed square not yet covered has to be
 * covered by one of the boats still to lay, so every length and every
 * placement through it is tried. Once every printed square is covered, the
 * rest of the fleet goes down in canonical order, longest first and boats of
 * equal length in increasing placement order. A printed-first boat is never
 * swapped with a later one of its length, because the later ones cannot cover
 * a printed square — each one's ring is already taken — so no layout is
 * counted twice.
 *
 * Placements are filtered once a call — every printed square inside one has
 * to agree with it, and none may lie in its ring outside it — and each one's
 * ring is worked out once, with the squares claimed kept in an `Int8Array`.
 * `logic.test.ts` holds it to a plain enumeration.
 */
export function countLayouts(n: number, fleet: number[], printed: (Piece | null)[], cap = Number.POSITIVE_INFINITY): number {
  const size = n * n
  const around = tablesFor(n).touching
  const lengths = [...new Set(fleet)]
  const left = lengths.map((length) => fleet.filter((l) => l === length).length)
  const printedCells = printed.map((piece, i) => (piece !== null ? i : -1)).filter((i) => i >= 0)

  interface Placed {
    cells: number[]
    ring: number[]
  }
  const byLength: Placed[][] = lengths.map((length) => {
    const out: Placed[] = []
    for (const cells of placementTable(n, length)) {
      if (!keepsPrinted(n, printed, cells)) continue
      const claim = new Set(cells)
      for (const i of cells) for (const j of around[i]) claim.add(j)
      if ([...claim].some((j) => !cells.includes(j) && printed[j] !== null)) continue
      out.push({ cells, ring: [...claim] })
    }
    return out
  })
  /** For each printed square and each length, the placements that cover it. */
  const covering = new Map<number, Placed[][]>()
  for (const p of printedCells) covering.set(p, byLength.map((list) => list.filter(({ cells }) => cells.includes(p))))

  const taken = new Int8Array(size)
  const board = new Uint8Array(size)
  const from = lengths.map(() => 0)
  let found = 0
  const free = ({ cells }: Placed) => cells.every((i) => taken[i] === 0)
  const put = ({ cells, ring }: Placed, sign: 1 | -1) => {
    for (const i of cells) board[i] = sign === 1 ? 1 : 0
    for (const j of ring) taken[j] += sign
  }

  const walk = () => {
    if (found >= cap) return
    const open = printedCells.find((i) => board[i] === 0)
    if (open !== undefined) {
      const through = covering.get(open) as Placed[][]
      for (let li = 0; li < lengths.length; li++) {
        if (left[li] === 0) continue
        for (const placed of through[li]) {
          if (!free(placed)) continue
          left[li]--
          put(placed, 1)
          walk()
          put(placed, -1)
          left[li]++
          if (found >= cap) return
        }
      }
      return
    }
    const li = left.findIndex((count) => count > 0)
    if (li < 0) {
      found++
      return
    }
    const list = byLength[li]
    const was = from[li]
    for (let k = was; k < list.length; k++) {
      if (!free(list[k])) continue
      left[li]--
      put(list[k], 1)
      from[li] = k + 1
      walk()
      from[li] = was
      put(list[k], -1)
      left[li]++
      if (found >= cap) return
    }
  }

  walk()
  return found
}

/* ============================================================
   Making a board

   Backwards, from a finished one: lay the fleet, print a few of
   its squares in the shapes their boats give them, then read the
   numbers off the answer. Nothing here can produce a board with no
   answer, because the answer was drawn first — and every board is
   then held against `solveByLogic`, so it has exactly one.
   ============================================================ */

/**
 * A fleet laid on an empty sea, longest boat first, or null where a boat
 * found nowhere left to go. Each boat takes one of the places still free —
 * every square of it clear of the boats already down and of the ring round
 * them — chosen at random. 87 to 93% of draws lay the whole fleet.
 */
export function layFleet(rng: Rng, n: number, fleet: number[]): boolean[] | null {
  const around = tablesFor(n).touching
  const taken = new Array<boolean>(n * n).fill(false)
  const answer = new Array<boolean>(n * n).fill(false)
  for (const length of fleet) {
    const free = placementTable(n, length).filter((cells) => cells.every((i) => !taken[i]))
    if (free.length === 0) return null
    for (const i of free[randInt(rng, free.length)]) {
      answer[i] = true
      taken[i] = true
      for (const j of around[i]) taken[j] = true
    }
  }
  return answer
}

/** What the numbers down the side and along the top say. */
export function cluesOf(n: number, boats: boolean[]): { rowClues: number[]; colClues: number[] } {
  const rowClues = new Array<number>(n).fill(0)
  const colClues = new Array<number>(n).fill(0)
  for (let i = 0; i < boats.length; i++) {
    if (!boats[i]) continue
    rowClues[rowOf(n, i)]++
    colClues[colOf(n, i)]++
  }
  return { rowClues, colClues }
}

export interface Deal {
  rowClues: number[]
  colClues: number[]
  printed: (Piece | null)[]
  /** The one answer, kept for the tests. Nothing the player sees reads it. */
  answer: boolean[]
}

/** One finished fleet, with `shown` of its squares printed and the numbers read off it. */
export function draw(rng: Rng, config: BoatsConfig): Deal | null {
  const { n, fleet, shown } = config
  const answer = layFleet(rng, n, fleet)
  if (answer === null) return null
  const squares = answer.map((boat, i) => (boat ? i : -1)).filter((i) => i >= 0)
  const printed: (Piece | null)[] = answer.map(() => null)
  for (const i of shuffled(rng, squares).slice(0, shown)) printed[i] = shapeAt(n, answer, i)
  return { ...cluesOf(n, answer), printed, answer }
}

/**
 * The board as reasoning finishes it, or null when it will not do at all: the
 * three steps stall, or they finish on something other than the answer drawn —
 * checked here rather than trusted, because everything downstream rests on it.
 */
export function reasonedOut(config: BoatsConfig, board: Deal): Deduction | null {
  const { n, fleet } = config
  const reasoned = solveByLogic(n, fleet, board.rowClues, board.colClues, board.printed)
  if (reasoned === null) return null
  return reasoned.boats.every((boat, i) => boat === board.answer[i]) ? reasoned : null
}

/**
 * The printed ends that point at a square with nothing printed on it: the ends
 * that hand a child a boat square. An end that points at another printed
 * square hands over nothing, because two printed ends facing each other are a
 * whole boat of two, already down. While the band counted every printed end,
 * four boats dealt exactly that board, with no other end, on 50 seeds of 300,
 * and its first hint sent a child to the square beside a printed end — which
 * was the other printed end.
 *
 * Counting only the open ones costs little. Four boats meets its band on 157
 * raw draws in 3,000 rather than 185, and over seeds 0 to 299 `deal` looks at
 * 21.4 fleets on average rather than 17.8, and 193 at worst rather than 121,
 * with no fallback.
 */
export function openEnds(n: number, printed: (Piece | null)[]): number {
  let count = 0
  for (let i = 0; i < printed.length; i++) {
    const piece = printed[i]
    if (piece === null || piece === 'single' || piece === 'middle') continue
    const j = step(n, i, piece)
    if (j >= 0 && printed[j] === null) count++
  }
  return count
}

/**
 * Inside the level's own band. The passes the reasoning takes, the boats its
 * fit steps ask about, the 0s and the open printed ends a hint names, and
 * last, because it costs the most, the layout gate.
 *
 * That gate does two jobs. At four boats, `minLayouts: 3` makes sure the
 * numbers always matter: before it, 3 seeds in 1,000 dealt a board whose
 * printed pieces alone allowed one fleet. At six and seven boats,
 * `minLayouts: 1600` keeps out a player who climbs the strip without reading a
 * number: over 80 six-boat boards and four climbs each, that climber landed
 * 23 of 56 climbs where the pieces left fewer than 200 layouts, 3 of 68 at
 * 800 to 1,600, and none of 68 from 1,600 up. Seven boats never measured
 * under 1,940 layouts over 300 seeds, and carries the same floor so that no
 * level above the first can ever deal a small haystack.
 */
export function inBand(config: BoatsConfig, board: Deal, reasoned: Deduction): boolean {
  const { n, fleet, minRounds, maxRounds, fitAsks, minZeros, minEnds, minLayouts } = config
  if (reasoned.rounds < minRounds || reasoned.rounds > maxRounds) return false
  if (reasoned.fitAsked.join() !== fitAsks.join()) return false
  if ([...board.rowClues, ...board.colClues].filter((clue) => clue === 0).length < minZeros) return false
  if (openEnds(n, board.printed) < minEnds) return false
  return minLayouts === 0 || countLayouts(n, fleet, board.printed, minLayouts) >= minLayouts
}

/** True when this board is the board the level asked for. */
export function fits(config: BoatsConfig, board: Deal): boolean {
  const reasoned = reasonedOut(config, board)
  return reasoned !== null && inBand(config, board, reasoned)
}

/** How many fleets `deal` looks at before it settles for less. */
const ATTEMPTS = 2000

/**
 * A board for this level.
 *
 * Every fleet is drawn finished, so the loop only ever chooses between boards
 * that have an answer, and the first one inside the level's band wins. That
 * band is the only thing a bad run can cost: what comes back when no fleet
 * suits the level is still a board a child can reason out, with one answer,
 * and with the level's own par, because the fleet and the printed squares are
 * fixed a level. A board that cannot promise those is not handed out at all —
 * this says so instead of quietly shipping a fleet nobody has checked.
 *
 * Neither is anywhere near the road a player travels. Over 300 seeds a level
 * `deal` looked at a mean of 21.4, 93.7 and 54.0 fleets and at worst 193, 518
 * and 240, against 2,000, and never fell back. Six boats is the tightest: 32
 * fleets in 3,000 raw draws meet its band, so missing 2,000 times in a row is
 * about (1 − 32/3000)^2000, five in ten thousand million.
 */
export function deal(rng: Rng, config: BoatsConfig): Deal {
  const { n, fleet } = config
  let sound: Deal | null = null

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const board = draw(rng, config)
    if (board === null) continue
    const reasoned = reasonedOut(config, board)
    if (reasoned === null) continue
    if (inBand(config, board, reasoned)) return board
    sound ??= board
  }

  if (sound !== null) return sound
  throw new Error(`No ${n} by ${n} fleet of ${fleet.join(', ')} came out by reasoning in ${ATTEMPTS} tries.`)
}

/* ============================================================
   The picture on the card

   A real four-by-four answer, so a child can check it before they
   open the puzzle: a boat of three across the top row, a boat of
   two down the right-hand column, and a boat of one in the bottom
   left-hand corner, no two of them touching even at a corner.
   `glyphs.tsx` draws it from this, and `logic.test.ts` holds it to
   the rules.
   ============================================================ */

export const CARD = {
  n: 4,
  fleet: [3, 2, 1],
  boats: [0, 1, 2, 11, 15, 12],
} as const
