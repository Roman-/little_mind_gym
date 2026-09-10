import { shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The patchwork quilt.

   A grid cut into patches. A patch of two squares holds 1 and 2,
   a patch of five holds 1 to 5, and no two squares that touch —
   even at a corner — may hold the same number. It is the puzzle
   sold as Suguru, Tectonic and Number Blocks.

   Everything here is pure and framework-free. Four things are
   worth reading twice.

   `peersOf` is the whole rule set in one list: a square's peers
   are its patch-mates and the eight squares round it, and every
   check below is "no peer holds this number". The mini sudoku
   makes the same list out of rows, columns and boxes.

   `solveByLogic` fills a board using only the two steps an
   eight-year-old can make — "this square has one number left"
   and "this number has one square left in its patch" — and
   counts the *passes* it takes. That count is the difficulty
   dial, and it is measured on the board rather than guessed at:
   a square here carries up to five candidates rather than one
   bit, so a board that needs six or seven passes has stopped
   being a board you can hold in your head and become one you
   need pencil marks for. The levels cap it at three, four and
   five (see index.ts).

   `makeQuilt` cuts the quilt and fills it in the same step. Cut
   first and fill after, and almost every quilt is a dead loss:
   four squares in a 2x2 block all touch each other, so they need
   four different numbers between them, and a quilt of small
   patches has nowhere to get a fourth. Three hundred random cuts
   were tried at each size, with patches of two to five squares:
   16 of the 300 five-wide quilts could be filled at all, 3 of the
   six-wide, and none of the seven-wide. Cutting and filling
   together, every quilt works, because a patch is only ever cut
   where its numbers will go.

   `deal` then rubs squares out one at a time for as long as
   `solveByLogic` can still finish the board, and prints a few
   back so that every deal of a level costs the same number of
   taps. That is the whole of `par`: one tap a blank square. It
   throws a quilt away and cuts another where the board that came
   out of it takes the wrong number of passes, or is not the shape
   that the level's hints send a child to: no patch small enough to
   start from, or none with a single square left to fill.
   ============================================================ */

/** The biggest patch, and so the biggest number on the keypad. */
export const BIGGEST_PATCH = 5
/** No patch is smaller than this: a single square would hand its 1 over. */
export const SMALLEST_PATCH = 2

export interface QuiltConfig {
  /** Rows and columns. */
  n: number
  /**
   * Squares printed on the board. Fixed for the level, so `par` cannot wobble
   * from one deal to the next.
   */
  clues: number
  /**
   * Passes of the two steps in `solveByLogic`, at least and at most. Counted
   * on the dealt board, never guessed: it is the one difficulty dial here
   * apart from the size of the grid.
   */
  minRounds: number
  maxRounds: number
  /**
   * The biggest the smallest patch a child can write in may be, checked on the
   * dealt board and not on the quilt it was cut from.
   *
   * Two things ride on it. A quilt cut entirely into patches of five never
   * asks the question this puzzle is about — every number on the pad fits
   * every square, so nothing is ever too big for its patch and the board never
   * has to say so. And a level whose first hint says "start with the smallest
   * patch" has to be dealt one, with a square in it still empty. Cutting is
   * cheap and `deal` throws quilts away for a living, so this is checked
   * rather than aimed at: see `smallestOpenPatch`.
   */
  smallest: number
  /**
   * Patches dealt with exactly one square left to fill, at least. Checked on
   * the dealt board, exactly as `smallest` is: see `nearlyFullPatches`.
   *
   * A level whose first hint sends a child to one of these has to be dealt
   * one. The cut usually leaves some without being asked, but not always: with
   * this dial at 0 on all three levels, two hundred deals a level —
   * `init(level, makeRng(9000 + k * 13))` for k under 200 — came out with no
   * such patch 7 times at five wide, 6 at six wide and 47 at seven wide. So
   * the level whose hint names one asks for one, and the two levels that say
   * nothing about it leave this at 0 rather than pay for a shape that no hint
   * of theirs names.
   */
  nearlyFull: number
}

export interface QuiltState {
  n: number
  /** Row-major. Which patch each square belongs to. Never changes. */
  patches: number[]
  /** Row-major. Non-zero where the puzzle was printed. Never changes. */
  givens: number[]
  /** Row-major. What the player has written; 0 = blank. Always 0 under a given. */
  entries: number[]
}

/** One pencil stroke. `value` 0 rubs the square out. */
export type QuiltAction = { type: 'set'; index: number; value: number }

/* --- reading the grid ----------------------------------------- */

export const rowOf = (n: number, index: number): number => Math.floor(index / n)
export const colOf = (n: number, index: number): number => index % n

/** The squares that share an edge with this one. A patch grows along these. */
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

/** The eight squares round this one, corners included. None may repeat it. */
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

/** A square and the eight round it: the space it keeps its number to itself in. */
export function space(n: number, index: number): number[] {
  return [index, ...touching(n, index)]
}

/**
 * The two lists every rule here is asked from, worked out once for a quilt and
 * kept against the array itself. A quilt is dealt once and then never changes,
 * so this is a cache with the same life as the board it describes — and an
 * array is only ever asked about with the `n` it was cut for, which is why the
 * size is not part of the key.
 */
const cellCache = new WeakMap<number[], number[][]>()
const peerCache = new WeakMap<number[], number[][]>()
const nameCache = new WeakMap<number[], string[]>()

/** The squares of each patch, indexed by patch number. */
export function patchCells(patches: number[]): number[][] {
  const hit = cellCache.get(patches)
  if (hit) return hit
  const out: number[][] = []
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i]
    while (out.length <= p) out.push([])
    out[p].push(i)
  }
  cellCache.set(patches, out)
  return out
}

/** How many squares each patch has — which is the biggest number it holds. */
export function patchSizes(patches: number[]): number[] {
  return patchCells(patches).map((cells) => cells.length)
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * A letter for each patch, reading order: the patch holding the top left
 * square is A, the next patch to start is B, and so on.
 *
 * A looker sees the seams, and the seams are the whole board. A listener has
 * no seams, so without a name for a patch two squares on either side of one
 * read out identically — and how big a number a square may hold is exactly
 * what the seam beside it says. `Board.tsx` puts the letter in every square's
 * label; the seam is what it looks like.
 *
 * The most patches a board here can hold is 24. The widest quilt here is seven
 * squares across, so 49 squares, and no patch is smaller than two: 25 patches
 * would want 50 squares, and 24 is 23 patches of two with the one square over
 * joined onto one of them, which makes that patch a three. The alphabet is
 * never run out of, and a bigger quilt than this app deals would repeat a
 * letter rather than say "undefined".
 */
export function patchNames(patches: number[]): string[] {
  const hit = nameCache.get(patches)
  if (hit) return hit
  const cells = patchCells(patches)
  const reading = cells.map((_, patch) => patch).sort((a, b) => cells[a][0] - cells[b][0])
  const names: string[] = []
  reading.forEach((patch, k) => {
    names[patch] = LETTERS[k % LETTERS.length]
  })
  nameCache.set(patches, names)
  return names
}

/** Every square that may not repeat this one: its patch-mates and its neighbours. */
export function peersOf(n: number, patches: number[]): number[][] {
  const hit = peerCache.get(patches)
  if (hit) return hit
  const cells = patchCells(patches)
  const peers = patches.map((p, i) => {
    const set = new Set(cells[p])
    for (const t of touching(n, i)) set.add(t)
    set.delete(i)
    return [...set]
  })
  peerCache.set(patches, peers)
  return peers
}

/** The biggest number this square's patch holds. */
export function biggestAt(state: QuiltState, index: number): number {
  return patchSizes(state.patches)[state.patches[index]]
}

/* --- the engine ----------------------------------------------- */

export function init(level: PuzzleLevel<QuiltConfig>, rng: Rng): QuiltState {
  const { n } = level.config
  const { patches, givens } = deal(rng, level.config)
  return { n, patches, givens, entries: new Array<number>(n * n).fill(0) }
}

/**
 * A number too big for its patch is refused rather than written — see
 * `refusalOf`. It never reaches here, so the move tape and the history only
 * ever hold numbers a patch could really take.
 */
export function reduce(state: QuiltState, action: QuiltAction): QuiltState {
  if (action?.type !== 'set') return state
  const { index, value } = action
  if (!Number.isInteger(index) || index < 0 || index >= state.givens.length) return state
  if (!Number.isInteger(value) || value < 0 || value > biggestAt(state, index)) return state
  // A printed number is not yours to change, and writing what is already there
  // is not a move.
  if (state.givens[index] !== 0) return state
  if (state.entries[index] === value) return state
  const entries = state.entries.slice()
  entries[index] = value
  return { ...state, entries }
}

/** What each square holds: the printed number, or the one written into it. */
export function valuesOf(state: QuiltState): number[] {
  return state.givens.map((g, i) => (g !== 0 ? g : state.entries[i]))
}

export function isSolved(state: QuiltState): boolean {
  const values = valuesOf(state)
  if (values.some((v) => v === 0)) return false
  for (const cells of patchCells(state.patches)) {
    if (new Set(cells.map((i) => values[i])).size !== cells.length) return false
  }
  const peers = peersOf(state.n, state.patches)
  return values.every((v, i) => !peers[i].some((p) => values[p] === v))
}

/**
 * Which of the player's own answers repeat a peer. A printed number is never
 * flagged — it is always right, and it is the answer beside it that is wrong.
 */
export function conflicts(state: QuiltState): boolean[] {
  const peers = peersOf(state.n, state.patches)
  const values = valuesOf(state)
  return values.map(
    (v, i) => state.givens[i] === 0 && v !== 0 && peers[i].some((p) => values[p] === v),
  )
}

/** Which rule a number breaks. */
export type ClashKind = 'oversize' | 'patch' | 'touching'

/** One number written into one square, and the rule it breaks. */
export interface Clash {
  kind: ClashKind
  /** Every square in the group at fault, so a board can light the whole of it. */
  cells: number[]
  /** The squares to point at: the one just written, and the one it repeats. */
  blamed: number[]
  /** The number written. */
  value: number
  /** How many squares the patch has. The sentence about an oversize number says it. */
  patchSize: number
}

/**
 * The rule that writing `value` into `index` breaks, or null if the square
 * takes it.
 *
 * One number can break two rules at once and only the first is reported: two
 * groups lit together say nothing about either. The order is the order a child
 * checks in. Is the number even in this patch's range? Then is it already
 * somewhere in the patch? Then is it touching one of its own?
 */
export function clashOf(state: QuiltState, index: number, value: number): Clash | null {
  if (value === 0 || state.givens[index] !== 0) return null
  const { n, patches } = state
  const cells = patchCells(patches)[patches[index]]
  const patchSize = cells.length
  if (value > patchSize) {
    return { kind: 'oversize', cells, blamed: [index], value, patchSize }
  }
  const values = valuesOf(state)
  values[index] = value
  const twice = cells.filter((i) => values[i] === value)
  if (twice.length > 1) return { kind: 'patch', cells, blamed: twice, value, patchSize }
  const near = touching(n, index).filter((i) => values[i] === value)
  if (near.length > 0) {
    return { kind: 'touching', cells: space(n, index), blamed: [index, ...near], value, patchSize }
  }
  return null
}

/** How many squares a patch has, in words: "two", not "2". */
export function countWord(patchSize: number): string {
  return ['no', 'one', 'two', 'three', 'four', 'five'][patchSize] ?? String(patchSize)
}

/** The numbers a patch of this many squares holds: "1, 2 and 3". */
export function rangeOf(patchSize: number): string {
  const numbers = Array.from({ length: patchSize }, (_, i) => String(i + 1))
  if (numbers.length === 1) return numbers[0]
  return `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
}

/**
 * What a patch that size holds, in one sentence. It is the answer to a number
 * too big for a patch, and it is also what a dead key says for itself when the
 * player has asked for forbidden moves to be refused up front.
 */
export function describeRange(patchSize: number): string {
  return `A patch of ${countWord(patchSize)} squares holds only ${rangeOf(patchSize)}.`
}

/** The broken rule in one sentence. The lit group says where; this says what. */
export function describeClash(clash: Clash): string {
  if (clash.kind === 'oversize') return describeRange(clash.patchSize)
  if (clash.kind === 'patch') return `This patch already has a ${clash.value}.`
  return `A square touching this one already has a ${clash.value}.`
}

/**
 * A number the patch is too small for, written anyway: it goes into the square
 * the child put it in, and one sentence says why it cannot stay. Null when the
 * number fits — a number that repeats a peer is a wrong answer rather than a
 * forbidden one, so it is written, drawn in clay, and rubbed out by the child.
 */
export function refusalOf(
  state: QuiltState,
  index: number,
  value: number,
): { pretend: QuiltState; message: string } | null {
  if (!Number.isInteger(index) || index < 0 || index >= state.givens.length) return null
  if (!Number.isInteger(value) || value < 1 || value > BIGGEST_PATCH) return null
  if (state.givens[index] !== 0) return null
  const clash = clashOf(state, index, value)
  if (clash === null || clash.kind !== 'oversize') return null
  const entries = state.entries.slice()
  entries[index] = value
  return { pretend: { ...state, entries }, message: describeClash(clash) }
}

/* ============================================================
   par

   A level's par is the number of empty squares it deals, and
   both halves of that claim are proved in logic.test.ts.

   The floor. `isSolved` needs every square on the board filled,
   and `reduce` above changes exactly one square — it writes one
   number into one empty square, or takes one off. So a board
   with `blankCount` empty squares cannot be finished in fewer
   than `blankCount` moves. The test checks that by construction:
   it walks real positions and watches that no move takes more
   than one square off the count, rather than asserting a number
   and hoping.

   The ceiling. Every board dealt has exactly one answer, and
   writing that answer into each empty square is `blankCount`
   moves, every one of them legal — the square is empty and the
   number fits its patch — and the board is solved at the end of
   them.

   And the search agrees, as far as it can reach. The five-wide
   board is small enough to walk outright: eight empty squares
   with no repeat allowed among them come to a few hundred
   positions — 600, 464 and 560 on the three seeds the test uses —
   well inside the 200,000 `shortestSolution` allows, and it comes
   back with a path exactly par long. Six and seven wide are far
   past that cap, so the test searches their last eight squares
   instead — the same rules and the same `reduce`, at a size a
   search can reach the end of.
   ============================================================ */

/** Squares still to fill. Each one costs exactly one tap, so this is par. */
export function blankCount(state: QuiltState): number {
  return state.givens.reduce((sum, g, i) => sum + (g === 0 && state.entries[i] === 0 ? 1 : 0), 0)
}

export function filledCount(state: QuiltState): number {
  return valuesOf(state).reduce((sum, v) => sum + (v === 0 ? 0 : 1), 0)
}

export function describeMove(prev: QuiltState, _next: QuiltState, action: QuiltAction): string {
  const where = `row ${rowOf(prev.n, action.index) + 1}, column ${colOf(prev.n, action.index) + 1}`
  return action.value === 0 ? `Rubbed out ${where}` : `Put ${action.value} in ${where}`
}

/** Every action that would change something. Used by the tests to check `par`. */
export function legalMoves(state: QuiltState): QuiltAction[] {
  const sizes = patchSizes(state.patches)
  const out: QuiltAction[] = []
  for (let index = 0; index < state.givens.length; index++) {
    if (state.givens[index] !== 0) continue
    for (let value = 0; value <= sizes[state.patches[index]]; value++) {
      if (value !== state.entries[index]) out.push({ type: 'set', index, value })
    }
  }
  return out
}

/* ============================================================
   Reasoning a board out

   Two steps, and they are the two a child really makes.

   One: a square where every number but one is already in the
   patch or beside the square. That one goes in.

   Two: a number with one square left in its patch. It goes
   there.

   Everything forced in a pass is written at the end of that
   pass, so `rounds` counts waves of scanning rather than the
   order the squares happen to be visited in. Two forced numbers
   that fall foul of each other are a board that contradicts
   itself, and the end of a pass is where that is caught: such a
   board comes back null rather than as a full grid that breaks a
   rule.

   So a board this finishes has exactly one answer. Every number
   written was the only one that square or that patch could take,
   so any answer to the board has to agree with all of them, and
   the grid handed back is full and breaks no rule — which makes
   it an answer, and the only one. Uniqueness and "no guessing"
   are one check here rather than two, and `countSolutions` is
   held against it in the tests.
   ============================================================ */

export interface Reasoned {
  /** The finished grid. */
  grid: number[]
  /** Passes over the two steps. This is the level's difficulty. */
  rounds: number
}

export function solveByLogic(n: number, patches: number[], givens: number[]): Reasoned | null {
  const peers = peersOf(n, patches)
  const cells = patchCells(patches)
  const g = givens.slice()
  const fits = (i: number, v: number) => peers[i].every((p) => g[p] !== v)
  let rounds = 0

  // A board that already breaks its own rules has no answer to find, and the
  // two steps below would never notice: they only ever ask what a square could
  // still take, never whether the numbers already on it can stand together. A
  // printed number too big for its patch, or one standing beside its own twin,
  // is that board.
  for (let i = 0; i < g.length; i++) {
    if (g[i] === 0) continue
    if (g[i] > cells[patches[i]].length) return null
    if (peers[i].some((p) => g[p] === g[i])) return null
  }

  for (;;) {
    const writes = new Map<number, number>()

    for (let i = 0; i < g.length; i++) {
      if (g[i] !== 0) continue
      let only = 0
      let seen = 0
      for (let v = 1; v <= cells[patches[i]].length; v++) if (fits(i, v)) { only = v; seen++ }
      if (seen === 0) return null
      if (seen === 1) writes.set(i, only)
    }

    for (const patch of cells) {
      for (let v = 1; v <= patch.length; v++) {
        if (patch.some((i) => g[i] === v)) continue
        const spots = patch.filter((i) => g[i] === 0 && fits(i, v))
        if (spots.length === 0) return null
        if (spots.length === 1) {
          const at = spots[0]
          // Two forced numbers in one square is a board that contradicts
          // itself, which a dug board never is — but a solver that wrote both
          // would report a finished grid that breaks the rules.
          if (writes.has(at) && writes.get(at) !== v) return null
          writes.set(at, v)
        }
      }
    }

    if (writes.size === 0) break
    for (const [i, v] of writes) g[i] = v
    // Every write in a pass is forced, so two of them that fall foul of each
    // other are a board that contradicts itself: the square whose only number
    // left is a 3 and the square beside it whose only number left is also a 3
    // cannot both be right, and no filling of this board is. Saying so here
    // rather than only for the two-numbers-in-one-square case above is what
    // makes the claim in the header true of the function rather than of the
    // boards `deal` happens to ask about: a grid this returns is full, breaks
    // no rule, and is the only such grid.
    for (const [i, v] of writes) if (peers[i].some((p) => g[p] === v)) return null
    rounds++
  }

  return g.every((v) => v !== 0) ? { grid: g, rounds } : null
}

/**
 * How many ways this board can be filled in, counted no further than `cap`.
 * Backtracking, always on the square with the fewest numbers left.
 */
export function countSolutions(n: number, patches: number[], givens: number[], cap = 2): number {
  const peers = peersOf(n, patches)
  const sizes = patchSizes(patches)
  const g = givens.slice()
  let count = 0
  const fits = (i: number, v: number) => peers[i].every((p) => g[p] !== v)

  const step = (): void => {
    let target = -1
    let best: number[] | null = null
    for (let i = 0; i < g.length; i++) {
      if (g[i] !== 0) continue
      const cands: number[] = []
      for (let v = 1; v <= sizes[patches[i]]; v++) if (fits(i, v)) cands.push(v)
      if (cands.length === 0) return
      if (best === null || cands.length < best.length) {
        target = i
        best = cands
      }
      if (cands.length === 1) break
    }
    if (best === null) {
      count++
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
  return count
}

/* ============================================================
   Cutting a quilt

   The patches and the answer are made together. A patch is cut
   out of the squares that are still free, and the numbers 1..k
   are laid into it in the same step; if they will not go, that
   cut is put back and another is tried.

   Two things are checked before any cut is kept, and they are
   what keeps the search from wandering: no free square may be
   left on its own, since the smallest patch is two; and no free
   square may have all five numbers standing round it already,
   since nothing could ever be written there.
   ============================================================ */

/** Every connected set of free squares that contains `index`, sized min..max. */
export function shapesAt(
  n: number,
  free: boolean[],
  index: number,
  minSize: number,
  maxSize: number,
): number[][] {
  const out: number[][] = []
  const cells = [index]
  const inside = new Set([index])

  /**
   * Each square added is barred from the branches beside it, so a set of
   * squares is built exactly once however many orders would reach it.
   */
  const grow = (candidates: number[], from: number) => {
    if (cells.length >= minSize) out.push(cells.slice())
    if (cells.length === maxSize) return
    const barred = new Set<number>()
    for (let k = from; k < candidates.length; k++) {
      const c = candidates[k]
      if (inside.has(c) || barred.has(c)) continue
      cells.push(c)
      inside.add(c)
      const extra = candidates.slice()
      for (const nb of orthogonal(n, c)) {
        if (free[nb] && !inside.has(nb) && !extra.includes(nb) && !barred.has(nb)) extra.push(nb)
      }
      grow(extra, k + 1)
      cells.pop()
      inside.delete(c)
      barred.add(c)
    }
  }

  grow(orthogonal(n, index).filter((c) => free[c]), 0)
  return out
}

/** True when some island of free squares is too small to be a patch. */
function stranded(n: number, free: boolean[], minSize: number): boolean {
  const seen = new Array<boolean>(free.length).fill(false)
  for (let i = 0; i < free.length; i++) {
    if (!free[i] || seen[i]) continue
    let size = 0
    const stack = [i]
    seen[i] = true
    while (stack.length > 0) {
      const c = stack.pop() as number
      size++
      for (const nb of orthogonal(n, c)) {
        if (free[nb] && !seen[nb]) {
          seen[nb] = true
          stack.push(nb)
        }
      }
    }
    if (size < minSize) return true
  }
  return false
}

/** True when a free square already has all five numbers standing round it. */
function boxedIn(n: number, free: boolean[], values: number[]): boolean {
  for (let i = 0; i < free.length; i++) {
    if (!free[i]) continue
    const near = touching(n, i)
    let open = false
    for (let v = 1; v <= BIGGEST_PATCH && !open; v++) open = !near.some((t) => values[t] === v)
    if (!open) return true
  }
  return false
}

/**
 * How often a patch of each size is tried first: a bigger weight sorts that
 * size to the front of the shapes offered at a square. Big patches are the
 * shape of the printed puzzle, so they lead.
 *
 * It is a preference and not much more. The cut backtracks, so the shape it
 * settles on is mostly the shape that fits rather than the shape that was
 * offered first: turning these weights right round — 5 last instead of first —
 * moved the share of five-wide quilts holding a patch of two squares from 47%
 * to 65% of 200 cuts, and left 13% of them cut entirely into fives. That is
 * why the levels get the shape they need out of `deal`, which throws a quilt
 * away and cuts another, rather than out of a number here.
 */
const SIZE_WEIGHTS: Record<number, number> = { 2: 0.35, 3: 0.7, 4: 1, 5: 1.3 }

/** How many patches one cut may lay down before the attempt is abandoned. */
const CUT_BUDGET = 200

/** A quilt and the answer it was cut around. */
export interface Quilt {
  patches: number[]
  values: number[]
}

export function makeQuilt(rng: Rng, n: number, budget = CUT_BUDGET): Quilt | null {
  const size = n * n
  const patches = new Array<number>(size).fill(-1)
  const values = new Array<number>(size).fill(0)
  const free = new Array<boolean>(size).fill(true)
  let next = 0
  let cuts = 0

  /** Lay 1..k into the k squares of one patch, hardest square first. */
  const lay = (cells: number[], k: number): boolean => {
    if (k === cells.length) return true
    let hardest = -1
    let fewest: number[] | null = null
    for (let x = k; x < cells.length; x++) {
      const cell = cells[x]
      const cands: number[] = []
      for (let v = 1; v <= cells.length; v++) {
        if (cells.some((c) => values[c] === v)) continue
        if (touching(n, cell).some((t) => values[t] === v)) continue
        cands.push(v)
      }
      if (cands.length === 0) return false
      if (fewest === null || cands.length < fewest.length) {
        hardest = x
        fewest = cands
      }
    }
    ;[cells[k], cells[hardest]] = [cells[hardest], cells[k]]
    for (const v of shuffled(rng, fewest as number[])) {
      values[cells[k]] = v
      if (lay(cells, k + 1)) return true
      values[cells[k]] = 0
    }
    ;[cells[k], cells[hardest]] = [cells[hardest], cells[k]]
    return false
  }

  /**
   * Cut the patch that holds the first free square, then the next, and so on.
   * Starting from the first free square every time is what makes each quilt
   * reachable exactly once, so the search never goes round in circles.
   */
  const cut = (): boolean => {
    if (cuts++ > budget) return false
    const first = free.indexOf(true)
    if (first === -1) return true
    const options = shapesAt(n, free, first, SMALLEST_PATCH, BIGGEST_PATCH)
      .map((cells) => ({ cells, key: rng() / (SIZE_WEIGHTS[cells.length] ?? 1) }))
      .sort((a, b) => a.key - b.key)

    for (const { cells } of options) {
      for (const c of cells) free[c] = false
      if (!stranded(n, free, SMALLEST_PATCH)) {
        for (const c of cells) patches[c] = next
        if (lay(cells, 0) && !boxedIn(n, free, values)) {
          next++
          if (cut()) return true
          next--
        }
        for (const c of cells) {
          patches[c] = -1
          values[c] = 0
        }
      }
      for (const c of cells) free[c] = true
    }
    return false
  }

  return cut() ? { patches, values } : null
}

/* ============================================================
   Rubbing squares out

   From the finished quilt: take squares away for as long as the
   board can still be reasoned out, then print a few back until
   exactly `clues` are left. Printing a number back can only make
   a board easier, never unsolvable, so the board handed over is
   always one the two steps above can finish — and every deal of
   a level costs the same number of taps.
   ============================================================ */

/** What a board has to survive as squares are taken off it. */
type Standard = 'reasoned' | 'unique'

function survives(n: number, patches: number[], givens: number[], standard: Standard): boolean {
  if (standard === 'unique') return countSolutions(n, patches, givens, 2) === 1
  return solveByLogic(n, patches, givens) !== null
}

/**
 * Rub squares out until nothing more can go, then print squares back until
 * exactly `clues` are left. Null when the board cannot be thinned that far.
 */
export function digTo(
  rng: Rng,
  n: number,
  quilt: Quilt,
  clues: number,
  standard: Standard,
): number[] | null {
  const givens = quilt.values.slice()
  let left = givens.length
  for (const i of shuffled(rng, givens.map((_, k) => k))) {
    const printed = givens[i]
    givens[i] = 0
    if (survives(n, quilt.patches, givens, standard)) left--
    else givens[i] = printed
  }
  if (left > clues) return null

  const blanks = shuffled(
    rng,
    givens.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0),
  )
  /**
   * One square of the smallest patch that is still open stays open. A patch of
   * two squares is the one a child can read straight off the quilt and the
   * first hint of the first level is about it, so printing a number back into
   * the last empty square it has would take that away for nothing. There is
   * always a square to spare: a level prints fewer squares than the board
   * holds, so something stays blank whatever is printed back.
   */
  const sizes = patchSizes(quilt.patches)
  const open = blanks.reduce((best, i) =>
    sizes[quilt.patches[i]] < sizes[quilt.patches[best]] ? i : best,
  )
  const order = blanks.filter((i) => i !== open)
  for (let k = 0; k < clues - left; k++) givens[order[k]] = quilt.values[order[k]]
  return givens
}

/** How many quilts `deal` looks at before it settles for the closest thing it saw. */
const ATTEMPTS = 400

/**
 * A quilt, however many cuts it takes.
 *
 * A cut gives up after `CUT_BUDGET` patches so that a bad start is thrown away
 * rather than backtracked out of, which is most of the speed here. The last
 * cut is asked for without that budget, which makes it an exhaustive search:
 * a grid of this size always has a quilt, so it cannot come back empty.
 */
export function cutQuilt(rng: Rng, n: number): Quilt {
  for (let tries = 0; tries < 20; tries++) {
    const quilt = makeQuilt(rng, n)
    if (quilt !== null) return quilt
  }
  const last = makeQuilt(rng, n, Number.POSITIVE_INFINITY)
  // The line above searched the whole tree, so an empty answer here would mean
  // that this grid has no quilt at all. Say so rather than casting the null
  // away: a null cast to a `Quilt` surfaces two functions later as a board
  // whose squares belong to no patch, and nothing on the way there says why.
  if (last === null) throw new Error(`No quilt fits a ${n} by ${n} grid.`)
  return last
}

/**
 * Take squares off a finished quilt at random, down to `clues` of them, and
 * take the first blanking that leaves the board with one answer. Null when
 * eight blankings have all left more than one.
 *
 * Random squares off a finished quilt is the cheapest thing to ask for,
 * whatever the level wants, which is why `deal` keeps it as its floor. On its
 * own it promises very little — the answer the quilt was cut around still
 * fits, so the board is solvable and still costs exactly `par` taps, but
 * another answer may fit as well — so it is asked eight times over and the
 * count of answers is what chooses between them.
 *
 * The one thing it never does is hand back a blanking whose answers it has not
 * counted. A board with two answers reads as a board with one until a child
 * fills it in a way that the hints did not expect, and nothing after this
 * point counts them again. A fallback nobody can hear give something up is worth
 * less than no fallback at all, so the eighth failure comes back empty and
 * `deal` carries on cutting quilts.
 */
function blankTo(rng: Rng, n: number, quilt: Quilt, clues: number): number[] | null {
  for (let tries = 0; tries < 8; tries++) {
    const givens = quilt.values.slice()
    const order = shuffled(
      rng,
      givens.map((_, i) => i),
    )
    for (const i of order.slice(0, givens.length - clues)) givens[i] = 0
    if (countSolutions(n, quilt.patches, givens, 2) === 1) return givens
  }
  return null
}

/**
 * How many squares the smallest patch that still has a square to fill has, or
 * `Infinity` when every patch on the board is printed full.
 *
 * "Start with the smallest patch" is a hint about this patch rather than about
 * the quilt's smallest: a patch whose squares are all printed is no help to
 * anybody. `deal` holds every board it hands over to `config.smallest` on this
 * number, and the tests hold each level's hints to the same one.
 */
export function smallestOpenPatch(patches: number[], givens: number[]): number {
  let smallest = Number.POSITIVE_INFINITY
  for (const cells of patchCells(patches)) {
    if (cells.length < smallest && cells.some((i) => givens[i] === 0)) smallest = cells.length
  }
  return smallest
}

/**
 * How many patches have exactly one square left to fill.
 *
 * "A patch with one square left to fill" is what level two's first hint sends
 * a child to, and it is the one move on this board that needs no candidates
 * written anywhere: the patch holds 1 up to its size, all but one of them are
 * printed in it, and the number that is missing goes in the square that is
 * left. `deal` holds every board that it hands over to `config.nearlyFull` on
 * this count, and the tests hold each level's hints to the same one.
 */
export function nearlyFullPatches(patches: number[], givens: number[]): number {
  let count = 0
  for (const cells of patchCells(patches)) {
    if (cells.filter((i) => givens[i] === 0).length === 1) count++
  }
  return count
}

/** The board a level is played on: the quilt, and what is printed on it. */
export interface Board {
  patches: number[]
  givens: number[]
}

/**
 * A board for this level.
 *
 * Every quilt is cut with an answer already in it and thinned only as far as
 * the two steps in `solveByLogic` can still follow, so the loop is choosing
 * between boards that are already the right *kind* of board: one answer, and
 * no square on it that has to be guessed at. What it is looking for on top of
 * that is a board of the right shape — the patches that the level's hints name, and
 * a round count inside the level's window.
 *
 * The four returns below are ordered by what each one gives up, and no seed
 * anybody has run has reached any of them: two hundred seeds a level, and the
 * thirty the tests deal, all come back from the loop itself — four quilts to a
 * deal at the first level and two or three at the others — and the tests hold
 * every one of those boards to one answer, to no guessing, to the level's
 * round window and to its shape.
 *
 * The throw at the end is the fifth thing that could happen, and it is a
 * board that this function could not build rather than a board that is worse
 * than the one it promised. Every rung above it hands over a real board and says in
 * its own comment what that board gives up; a rung that handed over a board
 * with two answers would say nothing, because nothing after this point counts
 * them again.
 */
export function deal(rng: Rng, config: QuiltConfig): Board {
  const { n, clues, minRounds, maxRounds, smallest, nearlyFull } = config
  /** Reasoned out and the right shape, but it takes the wrong number of passes. */
  let offWindow: Board | null = null
  /** Reasoned out, but not the shape this level's hints are about. */
  let anyShape: Board | null = null
  /** One answer, but reaching it needs a guess. */
  let guessed: Board | null = null
  /** One answer, and nothing else: squares off a finished quilt at random. */
  let plain: Board | null = null

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const quilt = cutQuilt(rng, n)
    const givens = digTo(rng, n, quilt, clues, 'reasoned')

    if (givens === null) {
      // Reasoning alone would not thin this quilt that far. Uniqueness thins
      // further, and a board that has to be guessed at is still a board — it
      // is just the last board this function will settle for. Both of these
      // cost real time, so neither is worked out again once one is in hand.
      if (guessed === null) {
        const loose = digTo(rng, n, quilt, clues, 'unique')
        if (loose !== null) guessed = { patches: quilt.patches, givens: loose }
        else {
          const blanked = blankTo(rng, n, quilt, clues)
          if (blanked !== null) plain ??= { patches: quilt.patches, givens: blanked }
        }
      }
      continue
    }

    const done = solveByLogic(n, quilt.patches, givens)
    if (done === null) continue
    const board = { patches: quilt.patches, givens }
    anyShape ??= board
    if (smallestOpenPatch(quilt.patches, givens) > smallest) continue
    if (nearlyFullPatches(quilt.patches, givens) < nearlyFull) continue
    if (done.rounds < minRounds || done.rounds > maxRounds) {
      offWindow ??= board
      continue
    }
    return board
  }

  const board = offWindow ?? anyShape ?? guessed ?? plain
  if (board === null) throw new Error(`No ${n} by ${n} board came out of ${ATTEMPTS} quilts.`)
  return board
}
