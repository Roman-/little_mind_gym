import { randInt } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The pipes.

   A square board of pipes, every one of them turned the wrong
   way or the right way at random. In the middle is the drop,
   where the water starts, and dotted about are flowers, each on a
   pipe with a single end. Turn the pipes, a quarter at a time and
   always clockwise, until the water from the drop reaches every
   pipe and every flower. Water only passes where two pipe ends
   meet. It is the puzzle Pavils Jurjans made as FreeNet, that
   Simon Tatham's collection calls Net, and that other versions
   call NetWalk.

   Everything here is pure and framework-free. Five things are
   worth reading twice.

   The goal is one condition. The pieces come from a tree on N
   squares, so between them they carry 2(N - 1) pipe ends, and
   wetting all N squares takes N - 1 joins, which uses up every
   end. "The water reaches every pipe" therefore already means
   that every end meets another and that there is no ring. The
   tests hold every board they deal to its 2(N - 1) ends, and
   check the claim outright on "Nine pipes": of the 10,715,136
   pictures its fifty test deals can show, one a board has every
   square wet, it is the answer, and it has no end open. A random
   sample could not have shown this: of 3,000 random positions of
   dealt boards, not one had every square wet.

   `settle` reasons a board out using only what an eight-year-old
   can see: the edge, the pieces' shapes, which squares hold
   flowers, and the squares already worked out. It never guesses,
   so a board it finishes has exactly one answer, and `deal`
   throws away every network it cannot finish. With one answer,
   par is a closed form — the clockwise taps from each square's
   start to its answer, added up — because taps on different
   squares commute and each square needs its own taps whatever
   the others do.

   `offsetsFor` scrambles to exactly that par. Rather than drawing
   a scramble and hoping, it counts every offset vector that adds
   up to par and draws one uniformly, so par is the truth for
   every seed and never an average.

   `lookAlikes` is the filter that puts the working on the board.
   A look-alike is a pipe that is turned wrong and yet shows every
   one of its ends meeting another end, so it looks finished; a
   child who trusts it reasons from a false fact. `deal` scrambles
   until there is none, which makes "a pipe whose ends all meet is
   a pipe at its answer" true on every board it ships, in every
   order of work.

   And `settleTrusting` is the child who plays the way children
   play Net: a pipe that looks joined is left alone. The level
   windows bind that child as well as the careful one, or trust
   would skip the third level's new idea on 569 deals in 1,000.
   ============================================================ */

/* --- sides and pieces ------------------------------------------ */

/** A pipe's ends are bits, one a side. */
export const UP = 1
export const RIGHT = 2
export const DOWN = 4
export const LEFT = 8
/** Clockwise from the top: the order a tap turns a pipe through, and the order a label reads its ends in. */
export const SIDES = [UP, RIGHT, DOWN, LEFT] as const
export const SIDE_WORDS: Record<number, string> = { 1: 'up', 2: 'right', 4: 'down', 8: 'left' }

/** The side facing this one across a seam: up for down, left for right. */
export const opposite = (side: number): number => ((side << 2) | (side >> 2)) & 15

/** `mask` turned `k` quarter turns clockwise. `k` may be negative, which turns it back. */
export function turn(mask: number, k: number): number {
  let m = mask
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15
  return m
}

/** How many pipe ends a piece has. */
export const endsOf = (mask: number): number =>
  (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1)

export const isStraight = (mask: number): boolean => mask === (UP | DOWN) || mask === (LEFT | RIGHT)

/**
 * How many different pictures a piece has: 2 for a straight, which looks the
 * same half a turn on, and 4 for everything else. A cross would have 1, and a
 * tap on it would change nothing, so no cross is ever dealt — every square on
 * the board is a live control.
 */
export const period = (mask: number): number => (isStraight(mask) ? 2 : 4)

/** The different pictures a piece can show, in the order taps reach them from `mask`. */
export function pictures(mask: number): number[] {
  const out: number[] = []
  for (let k = 0; k < period(mask); k++) out.push(turn(mask, k))
  return out
}

/** Clockwise taps from one picture of a piece to another. -1 if `to` is not a picture of it. */
export function tapsBetween(from: number, to: number): number {
  for (let k = 0; k < period(from); k++) if (turn(from, k) === to) return k
  return -1
}

export const rowOf = (n: number, i: number): number => Math.floor(i / n)
export const colOf = (n: number, i: number): number => i % n

/** The square beyond `side` of square `i`, or -1 off the board. */
export function beyond(n: number, i: number, side: number): number {
  const r = rowOf(n, i)
  const c = colOf(n, i)
  if (side === UP) return r > 0 ? i - n : -1
  if (side === DOWN) return r < n - 1 ? i + n : -1
  if (side === LEFT) return c > 0 ? i - 1 : -1
  return c < n - 1 ? i + 1 : -1
}

/* --- the state ------------------------------------------------- */

export interface PipesConfig {
  /** Squares along each side. */
  n: number
  /** Taps in the shortest solution. `init` deals only boards that need exactly this many. */
  par: number
  /**
   * Passes the board takes, at least and at most. Both children are held to
   * it: the careful one in `settle` and the one who trusts joined pipes in
   * `settleTrusting`. Together with the flower rule below it is the whole of
   * the difficulty dial, since par is pinned under the natural mean.
   */
  minPasses: number
  maxPasses: number
  /** Squares the edge settles on the very first pass, at least, so there is always somewhere to start. */
  minFirst: number
  /** Squares that only "two flowers never meet" can settle, at least and at most. */
  minFlowerRule: number
  maxFlowerRule: number
}

export interface PipesState {
  /** Squares along each side. */
  n: number
  /** The square the water starts from: the drop. */
  source: number
  /** Row-major. The pipe ends of each square as dealt: 1 up, 2 right, 4 down, 8 left. Never changes during a game. */
  pieces: number[]
  /** Row-major. Quarter turns clockwise each square has made since the deal, 0..3. */
  turns: number[]
}

/** One tap: that square's pipe turns a quarter of the way round, clockwise. */
export type PipesAction = { type: 'turn'; index: number }

/** The pipe ends square `i` shows now. */
export const sidesAt = (s: PipesState, i: number): number => turn(s.pieces[i], s.turns[i])

/** Every square's pipe ends as they show now, row-major. */
export const picture = (s: PipesState): number[] => s.pieces.map((_, i) => sidesAt(s, i))

/** A flower is any square with one pipe end that is not the drop. */
export const isFlower = (s: PipesState, i: number): boolean =>
  i !== s.source && endsOf(s.pieces[i]) === 1

/* --- the engine ------------------------------------------------ */

export function init(level: PuzzleLevel<PipesConfig>, rng: Rng): PipesState {
  const { n } = level.config
  const { source, start } = deal(rng, level.config)
  return { n, source, pieces: start, turns: new Array<number>(n * n).fill(0) }
}

/**
 * Two branches hand the state straight back: an action that is not a turn,
 * and an index that is not a square (-1, n * n, 1.5, NaN, Infinity). There is
 * no third. Every tap on a real square changes the picture, because no cross
 * is ever dealt and every other piece looks different a quarter turn on — so
 * nothing on this board is a dead control, and nothing is refused either: no
 * single turn breaks a rule, since a pipe pointing off the board is a normal
 * stage on the way to the answer.
 */
export function reduce(state: PipesState, action: PipesAction): PipesState {
  if (action?.type !== 'turn') return state
  const { index } = action
  if (!Number.isInteger(index) || index < 0 || index >= state.pieces.length) return state
  const turns = state.turns.slice()
  turns[index] = (turns[index] + 1) % 4
  return { ...state, turns }
}

/** The squares joined to the drop through pipe ends that meet. */
export function wetSquares(s: PipesState): boolean[] {
  const pic = picture(s)
  const out = new Array<boolean>(pic.length).fill(false)
  out[s.source] = true
  const stack = [s.source]
  while (stack.length) {
    const i = stack.pop() as number
    for (const side of SIDES) {
      if (!(pic[i] & side)) continue
      const j = beyond(s.n, i, side)
      if (j < 0 || out[j] || !(pic[j] & opposite(side))) continue
      out[j] = true
      stack.push(j)
    }
  }
  return out
}

/** Pipe ends that meet nothing: at the edge of the board, or at a side with no pipe. */
export function openEnds(s: PipesState): number {
  const pic = picture(s)
  let k = 0
  for (let i = 0; i < pic.length; i++)
    for (const side of SIDES) {
      if (!(pic[i] & side)) continue
      const j = beyond(s.n, i, side)
      if (j < 0 || !(pic[j] & opposite(side))) k++
    }
  return k
}

/**
 * The water reaches every square. That alone is the goal: the dealt pieces
 * come from a tree, so they carry 2(N - 1) pipe ends, and wetting N squares
 * takes N - 1 joins, which uses every end. So "every end meets another" and
 * "no rings" both follow from it, and `openEnds() === 0` below is belt and
 * braces — kept so that a hand-built board that does not come from a tree
 * cannot pass.
 */
export function isSolved(s: PipesState): boolean {
  if (s.pieces.length === 0) return false
  return openEnds(s) === 0 && wetSquares(s).every(Boolean)
}

export function describeMove(prev: PipesState, _next: PipesState, action: PipesAction): string {
  return `Turned row ${rowOf(prev.n, action.index) + 1}, column ${colOf(prev.n, action.index) + 1}`
}

/* --- reasoning a board out ------------------------------------- */

export interface Settled {
  /** The one answer, row-major, or null if the steps below do not finish the board. */
  answer: number[] | null
  /** Passes taken, each one resting on everything the passes before it worked out. */
  passes: number
  /** Squares settled on the first pass, by the edge alone. */
  first: number
  /** Squares settled by the edge and the neighbours, over every pass. */
  byEdge: number
  /** Squares only "two flowers never meet" could settle. */
  byFlowerRule: number
  /** Squares in the order they were settled. */
  order: number[]
}

/**
 * The pictures of square `i` that the known squares still allow. `known[j]` is
 * a square's pipe ends where the child is sure of it, and -1 where they are
 * not. Rule 1 is the edge and the neighbours: a pipe end never points off the
 * board, and a side facing a known square gets an end exactly when that square
 * points back. Rule 2 adds the flower rule: a flower's pipe never points at
 * another flower, because the two joined would be a network of their own and
 * the water could never reach them. It follows from the goal on any board of
 * more than two squares.
 */
function picturesLeft(
  n: number,
  piece: number,
  i: number,
  known: readonly number[],
  flower: readonly boolean[],
  rule: 1 | 2,
): number[] {
  return pictures(piece).filter((p) => {
    for (const side of SIDES) {
      const j = beyond(n, i, side)
      const has = (p & side) !== 0
      if (j < 0) {
        if (has) return false
      } else if (known[j] >= 0) {
        if (has !== ((known[j] & opposite(side)) !== 0)) return false
      } else if (rule === 2 && has && flower[i] && flower[j]) return false
    }
    return true
  })
}

/**
 * The careful child. Whole squares, one pass at a time, using only what never
 * changes with a turn: the edge, the pieces' shapes, which squares hold
 * flowers, and the squares already worked out. Nothing partial is ever
 * carried. A pass collects every square with one picture left under rule 1,
 * measured at the start of the pass; only when that finds nothing does it try
 * rule 2 instead. A square with one picture left is settled.
 *
 * It never guesses, so a board it finishes has exactly one answer: finishing
 * is the uniqueness proof, and the tests hold it to a counter that knows
 * nothing about it.
 *
 * There is deliberately no ring rule. Under whole-square settlement every
 * picture still left for a square has the same sides toward the known squares,
 * because rule 1 fixes them, so every one of them makes the same ring or none
 * does — a ring rule could never choose between them.
 */
export function settle(n: number, pieces: number[], source: number): Settled {
  const N = n * n
  const done = new Array<number>(N).fill(-1)
  const flower = pieces.map((p, i) => i !== source && endsOf(p) === 1)
  let passes = 0
  let first = 0
  let byEdge = 0
  let byFlowerRule = 0
  const order: number[] = []
  for (;;) {
    let moved = false
    for (const rule of [1, 2] as const) {
      const found: [number, number][] = []
      for (let i = 0; i < N; i++) {
        if (done[i] >= 0) continue
        const left = picturesLeft(n, pieces[i], i, done, flower, rule)
        if (left.length === 0) return { answer: null, passes, first, byEdge, byFlowerRule, order }
        if (left.length === 1) found.push([i, left[0]])
      }
      if (found.length === 0) continue
      for (const [i, p] of found) {
        done[i] = p
        order.push(i)
      }
      if (rule === 1) byEdge += found.length
      else byFlowerRule += found.length
      if (passes === 0 && rule === 1) first = found.length
      passes++
      moved = true
      break
    }
    if (!moved) break
  }
  return { answer: done.every((p) => p >= 0) ? done : null, passes, first, byEdge, byFlowerRule, order }
}

/**
 * The child who trusts the board, and the solver the level windows bind as
 * well as `settle`. Each pass, what is known is every square worked out so
 * far plus every square whose pipe ends all meet other ends on the board as it
 * stands, where a square not yet worked out stands as dealt.
 *
 * On a board with no look-alike (see `lookAlikes`) every square it trusts is
 * at its answer, so it never reasons from a false fact; the tests hold its
 * answer to the counter's. It is how children actually play Net, and it is
 * why the windows are measured on it: trust cut the third level's chain from
 * a median of 9 passes to about 5 on the unwindowed deal, and skipped the
 * flower rule on 569 of 1,000 of those deals. A dial that only bound the
 * careful child would have promised a new idea that most children never met.
 */
export function settleTrusting(n: number, start: number[], source: number): Settled {
  const N = n * n
  const pic = start.slice()
  const worked = new Array<boolean>(N).fill(false)
  const flower = start.map((p, i) => i !== source && endsOf(p) === 1)
  const meets = (i: number) =>
    SIDES.every((side) => {
      if (!(pic[i] & side)) return true
      const j = beyond(n, i, side)
      return j >= 0 && (pic[j] & opposite(side)) !== 0
    })
  let passes = 0
  let first = 0
  let byEdge = 0
  let byFlowerRule = 0
  const order: number[] = []
  for (;;) {
    const known = pic.map((p, i) => (worked[i] || meets(i) ? p : -1))
    let moved = false
    for (const rule of [1, 2] as const) {
      const found: [number, number][] = []
      for (let i = 0; i < N; i++) {
        if (known[i] >= 0) continue
        const left = picturesLeft(n, start[i], i, known, flower, rule)
        if (left.length === 0) return { answer: null, passes, first, byEdge, byFlowerRule, order }
        if (left.length === 1) found.push([i, left[0]])
      }
      if (found.length === 0) continue
      for (const [i, p] of found) {
        pic[i] = p
        worked[i] = true
        order.push(i)
      }
      if (rule === 1) byEdge += found.length
      else byFlowerRule += found.length
      if (passes === 0 && rule === 1) first = found.length
      passes++
      moved = true
      break
    }
    if (!moved) break
  }
  const known = pic.map((p, i) => (worked[i] || meets(i) ? p : -1))
  return { answer: known.every((p) => p >= 0) ? known : null, passes, first, byEdge, byFlowerRule, order }
}

/* --- making a board -------------------------------------------- */

/** The drop: the middle square, or one of the middle four on an even board. Odd boards use no rng. */
export function sourceFor(rng: Rng, n: number): number {
  const mid = Math.floor(n / 2)
  if (n % 2 === 1) return mid * n + mid
  const r = mid - 1 + randInt(rng, 2)
  const c = mid - 1 + randInt(rng, 2)
  return r * n + c
}

/**
 * A network grown from the drop, one pipe at a time: pick any join from a
 * square already reached to one that is not, never giving a square a fourth
 * end. It is the Prim-style growth Tatham grows Net with, chosen over Wilson's
 * uniform tree for three measured reasons: more branching and more flowers
 * (9.0 against 7.3 on a 5x5), the flower rule needed on 14% of raw 5x5
 * networks against 3%, and a median of 6 passes against 5. Null if every way
 * out is blocked by squares with three ends already, which was never seen.
 */
export function growNetwork(rng: Rng, n: number, source: number): number[] | null {
  const N = n * n
  const ends = new Array<number>(N).fill(0)
  const reached = new Array<boolean>(N).fill(false)
  reached[source] = true
  let count = 1
  let frontier: [number, number][] = []
  const offer = (i: number) => {
    for (const side of SIDES) {
      const j = beyond(n, i, side)
      if (j >= 0 && !reached[j]) frontier.push([i, side])
    }
  }
  offer(source)
  while (count < N) {
    frontier = frontier.filter(([i, side]) => !reached[beyond(n, i, side)] && endsOf(ends[i]) < 3)
    if (frontier.length === 0) return null
    const [i, side] = frontier[randInt(rng, frontier.length)]
    const j = beyond(n, i, side)
    ends[i] |= side
    ends[j] |= opposite(side)
    reached[j] = true
    count++
    offer(j)
  }
  return ends
}

/**
 * Anticlockwise offsets, one a square, drawn uniformly from every vector that
 * adds up to `par`, where a straight takes 0..1 and anything else 0..3. It is
 * the natural scramble conditioned on its sum. Null when no such vector exists.
 *
 * `ways[i][s]` counts the offset vectors for squares i..N-1 that add up to s,
 * and each square's offset is drawn in proportion to the ways that remain, so
 * the draw can never paint itself into a corner. It cannot return null for a
 * network the deal makes, either: a corner square has neighbours on two
 * perpendicular sides only, so it is never a straight, which leaves at most
 * N - 4 straights and a capacity of at least N + 8 — 17, 24 and 33 against
 * pars of 12, 20 and 30.
 */
export function offsetsFor(rng: Rng, periods: number[], par: number): number[] | null {
  const N = periods.length
  if (par < 0) return null
  const ways: number[][] = Array.from({ length: N + 1 }, () => new Array<number>(par + 1).fill(0))
  ways[N][0] = 1
  for (let i = N - 1; i >= 0; i--)
    for (let s = 0; s <= par; s++) {
      let w = 0
      for (let d = 0; d < periods[i] && d <= s; d++) w += ways[i + 1][s - d]
      ways[i][s] = w
    }
  if (ways[0][par] === 0) return null
  const out: number[] = []
  let left = par
  for (let i = 0; i < N; i++) {
    let x = rng() * ways[i][left]
    let d = 0
    for (; d < periods[i] - 1 && d < left; d++) {
      x -= ways[i + 1][left - d]
      if (x < 0) break
    }
    // Guard the last few ulps of floating point: never take an offset that
    // leaves no way to finish.
    while (d > 0 && ways[i + 1][left - d] === 0) d--
    out.push(d)
    left -= d
  }
  return left === 0 ? out : null
}

/** True when a reasoned-out board sits inside the level's windows. */
export function fits(config: PipesConfig, s: Settled): boolean {
  return (
    s.answer !== null &&
    s.passes >= config.minPasses &&
    s.passes <= config.maxPasses &&
    s.first >= config.minFirst &&
    s.byFlowerRule >= config.minFlowerRule &&
    s.byFlowerRule <= config.maxFlowerRule
  )
}

/* --- look-alikes ----------------------------------------------- */

/**
 * The squares turned wrong as dealt that could ever look finished: every one
 * of their dealt pipe ends could meet another end. A square is safe when one
 * of its dealt ends points off the board, or at a neighbour whose pipe points
 * back neither as dealt nor at its answer. Then it shows an open end at every
 * position where each square is as dealt or at its answer, whoever turned
 * what and in whatever order.
 *
 * `deal` scrambles until this is empty, so on every board it ships a pipe
 * whose ends all meet other ends is a pipe at its answer, for as long as the
 * child only turns pipes to where they belong. Measured against the cheaper
 * filter that only checks the solver's own pass boundaries: that one still
 * left a look-alike in one level-3 walk in five, because a child does not stop
 * where the solver does. This one leaves none in 15,000 walks, careful or
 * trusting.
 */
export function lookAlikes(n: number, start: number[], answer: number[]): number[] {
  const out: number[] = []
  for (let u = 0; u < start.length; u++) {
    if (start[u] === answer[u]) continue
    const safe = SIDES.some((side) => {
      if (!(start[u] & side)) return false
      const w = beyond(n, u, side)
      const back = opposite(side)
      return w < 0 || (!(start[w] & back) && !(answer[w] & back))
    })
    if (!safe) out.push(u)
  }
  return out
}

/** Networks tried before the fallbacks. */
export const ATTEMPTS = 400
/** Scrambles tried on a network that fits the level, looking for one that `scrambleFits`. */
export const SCRAMBLES = 40
/** Scrambles tried on a fallback network. */
export const FALLBACK_SCRAMBLES = 400

/**
 * A network per level that fits it, for the deal that never comes. The tests
 * hold each one to its own level: it fits the window, it has one answer, its
 * capacity covers par, it has no cross, and some of its scrambles fit.
 */
export const FALLBACK: Record<number, { source: number; answer: number[] }> = {
  // 3 passes, 2 settled on the first
  3: { source: 4, answer: [6, 12, 4, 1, 7, 13, 2, 9, 1] },
  // 5 passes, 5 settled on the first
  4: { source: 5, answer: [2, 14, 14, 12, 4, 5, 5, 5, 7, 13, 5, 1, 1, 1, 3, 8] },
  // 11 passes, 2 squares only the flower rule settles
  5: {
    source: 12,
    answer: [4, 4, 4, 4, 4, 3, 13, 7, 11, 13, 2, 11, 13, 2, 9, 6, 14, 11, 10, 12, 1, 3, 10, 8, 1],
  },
}

export interface Dealt {
  source: number
  answer: number[]
  start: number[]
  /** Networks drawn. */
  attempts: number
  /** Scrambles drawn, over every network. */
  scrambles: number
  /**
   * 0: a network in the level's window, with a scramble that has no look-alike
   *    and keeps the trusting child in the window too.
   * 1: the first network in the window, none of whose 40 scrambles did.
   * 2: the first network `settle` finished outside the window.
   * 3: `FALLBACK[n]`.
   */
  fallback: 0 | 1 | 2 | 3
}

/** The answer turned back by offsets that add up to exactly `par`. */
function scrambleOf(rng: Rng, answer: number[], par: number): number[] {
  const off = offsetsFor(rng, answer.map(period), par) as number[]
  return answer.map((p, i) => turn(p, -off[i]))
}

/** A scramble the level can ship: no look-alike, and the child who trusts the board is still in the window. */
export function scrambleFits(config: PipesConfig, source: number, answer: number[], start: number[]): boolean {
  return lookAlikes(config.n, start, answer).length === 0 && fits(config, settleTrusting(config.n, start, source))
}

/**
 * A board for the level, in exactly this rng order: the drop, then network by
 * network, each followed by its scrambles. Measured over 1,000 seeds a level,
 * a deal draws a median of 1, 1 and 12 networks and 2, 7 and 40 scrambles, in
 * 0.08, 0.28 and 3.02ms; the slowest of 20,000 shell-range seeds took 58.6ms.
 *
 * The fallbacks were never reached in 60,000 measured deals. Each still ships
 * a board with one answer and par exactly, and — unless 400 scrambles in a row
 * all have one — no look-alike. They can miss only the level's quality
 * windows, never validity.
 */
export function deal(rng: Rng, config: PipesConfig): Dealt {
  const { n, par } = config
  const source = sourceFor(rng, n)
  let inWindow: number[] | null = null
  let reasoned: number[] | null = null
  let scrambles = 0
  for (let attempts = 1; attempts <= ATTEMPTS; attempts++) {
    const answer = growNetwork(rng, n, source)
    if (answer === null) continue
    const s = settle(n, answer, source)
    if (s.answer === null) continue
    if (!fits(config, s)) {
      reasoned ??= answer
      continue
    }
    inWindow ??= answer
    for (let k = 0; k < SCRAMBLES; k++) {
      const start = scrambleOf(rng, answer, par)
      scrambles++
      if (scrambleFits(config, source, answer, start)) {
        return { source, answer, start, attempts, scrambles, fallback: 0 }
      }
    }
  }
  const [answer, src, fallback] = inWindow
    ? ([inWindow, source, 1] as const)
    : reasoned
      ? ([reasoned, source, 2] as const)
      : ([FALLBACK[n].answer, FALLBACK[n].source, 3] as const)
  let clean: number[] | null = null
  let first: number[] | null = null
  for (let k = 0; k < FALLBACK_SCRAMBLES; k++) {
    const start = scrambleOf(rng, answer, par)
    scrambles++
    first ??= start
    if (scrambleFits(config, src, answer, start)) {
      return { source: src, answer, start, attempts: ATTEMPTS, scrambles, fallback }
    }
    if (clean === null && lookAlikes(n, start, answer).length === 0) clean = start
  }
  return { source: src, answer, start: clean ?? (first as number[]), attempts: ATTEMPTS, scrambles, fallback }
}

/* --- the words ------------------------------------------------- */

/** A pipe's ends in words, read clockwise from up: "up, right and down". */
export function sidesWords(mask: number): string {
  const words = SIDES.filter((s) => mask & s).map((s) => SIDE_WORDS[s])
  if (words.length === 1) return words[0]
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/**
 * What a square shows, read clockwise from up. It names the square's picture
 * and says nothing about water, because the board draws none until the end —
 * a screen reader hears what a looker sees.
 */
export function squareLabel(s: PipesState, i: number): string {
  const where = `Row ${rowOf(s.n, i) + 1}, column ${colOf(s.n, i) + 1}`
  const going = sidesWords(sidesAt(s, i))
  if (i === s.source) return `${where}, the drop, its pipe going ${going}`
  if (isFlower(s, i)) return `${where}, a flower, its pipe going ${going}`
  return `${where}, a pipe going ${going}`
}

/** What the board says on the solve. */
export const SOLVED_LINE = 'The water reaches every pipe and every flower.'

/**
 * What the board says when every end meets and the pipes are split. It is the
 * longer of the two, and `Board.tsx` keeps room for it from the first render,
 * so that it can come and go under a child's finger without moving the board.
 */
export const SPLIT_LINE = 'Every pipe end meets another pipe end. The water still cannot reach every pipe.'

/**
 * The board's own sentence. It is silent while the child works: a count of
 * anything the picture does not already show would be a gradient to climb. It
 * speaks in the one position where the picture says "finished" and the shell
 * says nothing — every end meets, and the pipes are still split — and that
 * sentence carries no fact the board and the missing stamp do not already
 * carry. It can only happen on the third level (on 988 of 1,000 of its deals
 * there is such a picture, and on none of 2,000 deals of the first two),
 * where it names the very mistake the flower rule is about.
 */
export function statusLine(s: PipesState): string {
  if (isSolved(s)) return SOLVED_LINE
  if (openEnds(s) === 0) return SPLIT_LINE
  return ''
}
