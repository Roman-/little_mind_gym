import { randInt, shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The fence posts.

   A square board of squares with a post at every corner. Every
   square takes one fence, laid corner to corner across it: '\'
   from its top left to its bottom right, or '/' from its bottom
   left to its top right. Some posts carry a number, and that
   number is how many fences touch the post. The fences may never
   join up into a closed ring. It is the puzzle Nikoli publishes as
   Gokigen Naname and Simon Tatham's collection calls Slant.

   Everything here is pure and framework-free. Four things are
   worth reading twice.

   `solveByLogic` fills a board using only the two steps an
   eight-year-old can actually make — a post read off its number,
   and a fence turned away because it would close a ring — and
   `deal` throws away every board it cannot finish. A solver that
   only ever writes a fence the rules force also proves the board
   has exactly one answer, so uniqueness and "no guessing" are one
   check here rather than two. `countSolutions` is the independent
   check on that claim, and shares nothing with the solver but the
   rules.

   `deal` works backwards from a finished board: lay a whole field
   of fences with no ring in it, number every post from it, rub
   out `blanks` fences and then every number the level's solver
   can do without. The answer was drawn first, so nothing later
   can hand a child a board with no answer. And when four hundred
   draws all miss the level's window — measured over 2,000 seeds a
   level, that has never happened — `deal` hands over the level's
   own spare board, which the tests hold to exactly the same
   `fits` as a drawn one.

   Par is the count of empty squares, and it is exact for every
   seed. `isSolved` wants every square filled and one move fills
   at most one, so nothing shorter can finish; writing the one
   answer into each empty square once is par moves and does.
   Some fences are printed for exactly that reason: a full six by
   six would be 36 moves, and the collection caps a last level at
   24.

   And what this puzzle deliberately does not have: a dead end.
   Every square that is not printed takes any of the three values
   from any position, so the answer is always one write a square
   away. There is no `failure` and no `canStillWin`, and a fence
   that breaks a rule goes down and is shown, not refused — see
   the note on the clay ring in Board.tsx.
   ============================================================ */

/** An empty square. Also what `reduce` writes to rub a square out. */
export const EMPTY = 0
/** A fence from the square's top left corner to its bottom right corner: '\'. */
export const BACK = 1
/** A fence from the square's bottom left corner to its top right corner: '/'. */
export const FORWARD = 2
/** A post with no number on it. */
export const BLANK = -1

/** Both fences, in the order the keys under the board stand in. */
export const FENCES = [BACK, FORWARD] as const
export const otherFence = (value: number): number => (value === BACK ? FORWARD : BACK)

/** What a fence is called in a sentence: the two posts it touches, by corner. */
export function fenceName(value: number): string {
  if (value === BACK) return 'a fence from top left to bottom right'
  if (value === FORWARD) return 'a fence from bottom left to top right'
  return 'empty'
}

/**
 * What a post's number asks for, in words: "no fences", "1 fence", "3 fences".
 * The one phrase for it, so the sentence under the board and a square's label
 * name the same post the same way.
 */
export function wantsPhrase(wanted: number): string {
  if (wanted === 0) return 'no fences'
  return wanted === 1 ? '1 fence' : `${wanted} fences`
}

export interface FenceConfig {
  /** Squares a side. The board has (n + 1) * (n + 1) posts. */
  n: number
  /** Squares left empty for the child. One move fills one, so this is `par`. */
  blanks: number
  /**
   * The biggest ring, in fences, the level's solver may use to rule a fence
   * out. 0 is counting alone; 4 is a ring round one post; 8 goes round up to
   * three posts.
   */
  ring: number
  /** The level below's `ring`. A board that cap already finishes is dealt again. -1: none. */
  below: number
  /** Passes over the rules, at least and at most. */
  minRounds: number
  maxRounds: number
}

export interface FenceState {
  n: number
  /** (n+1)*(n+1) posts, row-major. BLANK, or 0..4: how many fences touch it. Never changes. */
  clues: number[]
  /** n*n squares, row-major. BACK or FORWARD where a fence is printed, else EMPTY. Never changes. */
  givens: number[]
  /** n*n squares. What the player has put down. Always EMPTY under a printed fence. */
  entries: number[]
}

/** One fence going down, or coming out again when `value` is EMPTY. */
export type FenceAction = { type: 'set'; index: number; value: number }

/* --- reading the grid ---------------------------------------- */

export const rowOf = (n: number, index: number): number => Math.floor(index / n)
export const colOf = (n: number, index: number): number => index % n
export const postAt = (n: number, r: number, c: number): number => r * (n + 1) + c

/** The two posts a fence in this square touches. */
export function endsOf(n: number, square: number, value: number): [number, number] {
  const r = rowOf(n, square)
  const c = colOf(n, square)
  return value === BACK
    ? [postAt(n, r, c), postAt(n, r + 1, c + 1)]
    : [postAt(n, r, c + 1), postAt(n, r + 1, c)]
}

/** Corner names, in the order `cornersOf` lists them. */
export const CORNERS = ['top left', 'top right', 'bottom left', 'bottom right'] as const

/** A square's four posts: top left, top right, bottom left, bottom right. */
export function cornersOf(n: number, square: number): number[] {
  const r = rowOf(n, square)
  const c = colOf(n, square)
  return [postAt(n, r, c), postAt(n, r, c + 1), postAt(n, r + 1, c), postAt(n, r + 1, c + 1)]
}

/** The squares round a post, each with the fence in it that would touch the post. */
export function aroundPost(n: number, post: number): { square: number; touch: number }[] {
  const r = Math.floor(post / (n + 1))
  const c = post % (n + 1)
  const out: { square: number; touch: number }[] = []
  if (r > 0 && c > 0) out.push({ square: (r - 1) * n + (c - 1), touch: BACK })
  if (r > 0 && c < n) out.push({ square: (r - 1) * n + c, touch: FORWARD })
  if (r < n && c > 0) out.push({ square: r * n + (c - 1), touch: FORWARD })
  if (r < n && c < n) out.push({ square: r * n + c, touch: BACK })
  return out
}

/** On the rim of the board: a corner post (one square) or an edge post (two). */
export function onRim(n: number, post: number): boolean {
  const r = Math.floor(post / (n + 1))
  const c = post % (n + 1)
  return r === 0 || r === n || c === 0 || c === n
}

/** Fences touching a post, and squares round it still empty. */
export function tally(n: number, grid: readonly number[], post: number): { on: number; open: number } {
  let on = 0
  let open = 0
  for (const { square, touch } of aroundPost(n, post)) {
    if (grid[square] === EMPTY) open++
    else if (grid[square] === touch) on++
  }
  return { on, open }
}

/* --- which posts the fences join up -------------------------- */

/**
 * Union-find over the posts, with rollback so the counter can take a fence
 * back out. No path compression, so a rollback is exact.
 */
export class Joins {
  private parent: number[]
  private size: number[]
  private history: [number, number][] = []
  constructor(count: number) {
    this.parent = Array.from({ length: count }, (_, i) => i)
    this.size = new Array<number>(count).fill(1)
  }
  find(x: number): number {
    while (this.parent[x] !== x) x = this.parent[x]
    return x
  }
  /** Joins two posts. False, and nothing joined, when they were already one piece: a ring. */
  join(a: number, b: number): boolean {
    let ra = this.find(a)
    let rb = this.find(b)
    if (ra === rb) return false
    if (this.size[ra] < this.size[rb]) [ra, rb] = [rb, ra]
    this.parent[rb] = ra
    this.size[ra] += this.size[rb]
    this.history.push([ra, rb])
    return true
  }
  mark(): number {
    return this.history.length
  }
  rollback(to: number): void {
    while (this.history.length > to) {
      const [ra, rb] = this.history.pop() as [number, number]
      this.parent[rb] = rb
      this.size[ra] -= this.size[rb]
    }
  }
}

/** Every fence on the grid joined up, or null when the grid already holds a ring. */
export function joinsOf(n: number, grid: readonly number[]): Joins | null {
  const joins = new Joins((n + 1) * (n + 1))
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === EMPTY) continue
    const [a, b] = endsOf(n, i, grid[i])
    if (!joins.join(a, b)) return null
  }
  return joins
}

/**
 * The squares whose fences lead from one post to another, in order, or null
 * when no line of fences joins them. Breadth-first, so it is the shortest line.
 */
export function lineBetween(n: number, grid: readonly number[], from: number, to: number): number[] | null {
  const links = new Map<number, [number, number][]>()
  const link = (a: number, b: number, square: number) => {
    const list = links.get(a)
    if (list) list.push([b, square])
    else links.set(a, [[b, square]])
  }
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === EMPTY) continue
    const [a, b] = endsOf(n, i, grid[i])
    link(a, b, i)
    link(b, a, i)
  }
  const via = new Map<number, [number, number] | null>([[from, null]])
  const queue = [from]
  for (let k = 0; k < queue.length; k++) {
    const post = queue[k]
    if (post === to) {
      const squares: number[] = []
      let at = to
      for (let step = via.get(at); step; step = via.get(at)) {
        squares.push(step[1])
        at = step[0]
      }
      return squares.reverse()
    }
    for (const [next, square] of links.get(post) ?? []) {
      if (via.has(next)) continue
      via.set(next, [post, square])
      queue.push(next)
    }
  }
  return null
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<FenceConfig>, rng: Rng): FenceState {
  const { n } = level.config
  const { clues, givens } = deal(rng, level.config)
  return { n, clues, givens, entries: new Array<number>(n * n).fill(EMPTY) }
}

export function reduce(state: FenceState, action: FenceAction): FenceState {
  if (action?.type !== 'set') return state
  const { index, value } = action
  if (!Number.isInteger(index) || index < 0 || index >= state.givens.length) return state
  if (value !== EMPTY && value !== BACK && value !== FORWARD) return state
  // A printed fence is not yours to change, and putting down the fence that
  // is already there is not a move.
  if (state.givens[index] !== EMPTY) return state
  if (state.entries[index] === value) return state
  const entries = state.entries.slice()
  entries[index] = value
  return { ...state, entries }
}

/** What is on the board: the printed fences and the player's, in one array. */
export function valuesOf(state: FenceState): number[] {
  return state.givens.map((g, i) => (g !== EMPTY ? g : state.entries[i]))
}

export function isSolved(state: FenceState): boolean {
  const values = valuesOf(state)
  if (values.some((v) => v === EMPTY)) return false
  if (joinsOf(state.n, values) === null) return false
  for (let p = 0; p < state.clues.length; p++) {
    if (state.clues[p] !== BLANK && tally(state.n, values, p).on !== state.clues[p]) return false
  }
  return true
}

/** Squares whose fence lies on a closed ring. */
export function ringSquares(n: number, values: readonly number[]): Set<number> {
  const out = new Set<number>()
  for (let i = 0; i < values.length; i++) {
    if (values[i] === EMPTY) continue
    const without = values.slice()
    without[i] = EMPTY
    const [a, b] = endsOf(n, i, values[i])
    if (lineBetween(n, without, a, b) !== null) out.add(i)
  }
  return out
}

/** Posts with more fences touching them than their number. */
export function overfullPosts(state: FenceState): boolean[] {
  const values = valuesOf(state)
  return state.clues.map((want, p) => want !== BLANK && tally(state.n, values, p).on > want)
}

/**
 * What is breaking a rule. A square is flagged when its fence is on a closed
 * ring or touches a post that has too many fences; a post is flagged when it
 * has too many. Printed fences are never flagged — they are right by
 * construction, and it is a fence beside them that is wrong. A post with too
 * FEW fences is never flagged, even with every square round it filled: see the
 * note on the clay ring in Board.tsx for what that would hand a prober.
 *
 * `ring` is where a broken ring rule is, the way `posts` is where a broken
 * number is: every square of a closed ring, printed ones included. A printed
 * fence on a ring is still not the wrong one, so it is not in `squares`; but a
 * ring is only a ring with all of it showing, and most rings a child closes
 * hold a printed fence: 90%, 84% and 81% of them, measured over 400 boards a
 * level (`makeRng(1000 + k * 37)`) with a child who puts the answer's fence
 * down nine times in ten. Without it, what is left standing once the cue has
 * run is a few red squares that do not join up.
 */
export function conflicts(state: FenceState): { squares: boolean[]; posts: boolean[]; ring: boolean[] } {
  const { n } = state
  const values = valuesOf(state)
  const posts = overfullPosts(state)
  const onRing = ringSquares(n, values)
  const squares = values.map((v, i) => {
    if (state.givens[i] !== EMPTY || v === EMPTY) return false
    if (onRing.has(i)) return true
    return endsOf(n, i, v).some((p) => posts[p])
  })
  return { squares, posts, ring: values.map((_, i) => onRing.has(i)) }
}

/** Numbered posts still short of their number. Counted, never flagged. */
export function shortPosts(state: FenceState): number {
  const values = valuesOf(state)
  let short = 0
  for (let p = 0; p < state.clues.length; p++) {
    if (state.clues[p] !== BLANK && tally(state.n, values, p).on < state.clues[p]) short++
  }
  return short
}

export type ClashKind = 'ring' | 'over'

export interface Clash {
  kind: ClashKind
  /** Every square to light: the whole ring, or every square round the post. */
  squares: number[]
  /**
   * What shakes: every fence on the ring, or every fence touching the post —
   * printed ones included, as the small square shakes its givens. The fence
   * just put down is not singled out: the answer has no ring and fills every
   * post exactly, and a printed fence is the answer's own, so a lit ring or an
   * over-full post always holds at least one wrong fence of the player's, but
   * it need not be the newest one.
   */
  blamed: number[]
  /** The post that has too many, or -1 for a ring. */
  post: number
  /** What the post asks for, and what it would then have. Both 0 for a ring. */
  wanted: number
  got: number
}

/**
 * The rule that putting `value` into `index` breaks, or null when the square
 * takes it. A ring is asked first: it is the rule this puzzle is new for, and
 * one fence can break both at once, and two lit groups say nothing about
 * either. Then the post at the fence's first end, then its second.
 */
export function clashOf(state: FenceState, index: number, value: number): Clash | null {
  if (value === EMPTY || state.givens[index] !== EMPTY) return null
  const { n } = state
  const values = valuesOf(state)
  values[index] = EMPTY
  const [a, b] = endsOf(n, index, value)
  const line = lineBetween(n, values, a, b)
  if (line !== null) {
    const ring = [...line, index].sort((x, y) => x - y)
    return { kind: 'ring', squares: ring, blamed: ring.slice(), post: -1, wanted: 0, got: 0 }
  }
  values[index] = value
  for (const post of [a, b]) {
    const want = state.clues[post]
    if (want === BLANK) continue
    const { on } = tally(n, values, post)
    if (on <= want) continue
    const round = aroundPost(n, post)
    return {
      kind: 'over',
      squares: round.map((r) => r.square).sort((x, y) => x - y),
      blamed: round.filter((r) => values[r.square] === r.touch).map((r) => r.square),
      post,
      wanted: want,
      got: on,
    }
  }
  return null
}

/** The broken rule in one sentence. The lit group says where; this says what. */
export function describeClash(clash: Clash): string {
  if (clash.kind === 'ring') return 'These fences make a closed ring.'
  return `This post wants ${wantsPhrase(clash.wanted)} and now has ${clash.got}.`
}

/** Squares still to fill. Each one costs exactly one move, so this is par. */
export function blankCount(state: FenceState): number {
  return valuesOf(state).filter((v) => v === EMPTY).length
}

export function filledCount(state: FenceState): number {
  return valuesOf(state).filter((v) => v !== EMPTY).length
}

export function describeMove(prev: FenceState, _next: FenceState, action: FenceAction): string {
  const where = `row ${rowOf(prev.n, action.index) + 1}, column ${colOf(prev.n, action.index) + 1}`
  if (action.value === EMPTY) return `Took the fence out of ${where}`
  const name = fenceName(action.value)
  return `Put ${name} in ${where}`
}

/** Every action that would change something. Used by the tests. */
export function legalMoves(state: FenceState): FenceAction[] {
  const out: FenceAction[] = []
  for (let index = 0; index < state.givens.length; index++) {
    if (state.givens[index] !== EMPTY) continue
    for (const value of [EMPTY, BACK, FORWARD]) {
      if (value !== state.entries[index]) out.push({ type: 'set', index, value })
    }
  }
  return out
}

/* ============================================================
   Reasoning a board out

   Two steps, and the second only once the first has run dry.

   One, a post settled by its number, both ways round. A post
   that already has all its fences wants no more, so every other
   square round it takes the fence that misses it. A post that
   needs every empty square it has left gets a fence from each.

   Two, a ring: a square where one fence would join two posts
   that the fences already join takes the other fence.

   Passes are synchronous: everything a pass settles is read off
   the board as it stood when the pass began, so `rounds` is the
   depth of the chain of "and therefore", and a board's count does
   not depend on the order its posts are numbered in.
   ============================================================ */

export interface Reading {
  grid: number[]
  rounds: number
  /**
   * Squares a full post turned away, and squares a hungry post pulled in. A
   * square that both settle in the same pass counts under both, so neither
   * number depends on the order the posts are read in.
   */
  full: number
  need: number
  /** Squares settled because the other fence would close a ring. */
  ring: number
  /** How many fences each of those rings would have had. */
  ringSizes: number[]
}

export function solveByLogic(
  n: number,
  clues: readonly number[],
  givens: readonly number[],
  maxRing: number,
): Reading | null {
  const grid = givens.slice()
  const joins = joinsOf(n, grid)
  if (joins === null) return null
  const numbered: number[] = []
  for (let p = 0; p < clues.length; p++) if (clues[p] !== BLANK) numbered.push(p)
  let rounds = 0
  let full = 0
  let need = 0
  let ring = 0
  const ringSizes: number[] = []

  for (;;) {
    /** square -> the fence it takes, and which steps settled it this pass. */
    const settled = new Map<number, { value: number; full: boolean; need: boolean; ring: boolean }>()
    for (const p of numbered) {
      const want = clues[p]
      const { on, open } = tally(n, grid, p)
      if (on > want || on + open < want) return null
      if (open === 0 || (on !== want && on + open !== want)) continue
      const towards = on !== want
      for (const { square, touch } of aroundPost(n, p)) {
        if (grid[square] !== EMPTY) continue
        const value = towards ? touch : otherFence(touch)
        const had = settled.get(square) ?? { value, full: false, need: false, ring: false }
        if (had.value !== value) return null
        if (towards) had.need = true
        else had.full = true
        settled.set(square, had)
      }
    }
    if (settled.size === 0 && maxRing >= 4) {
      for (let square = 0; square < grid.length; square++) {
        if (grid[square] !== EMPTY) continue
        const [a1, b1] = endsOf(n, square, BACK)
        const [a2, b2] = endsOf(n, square, FORWARD)
        const backRing = joins.find(a1) === joins.find(b1)
        const fwdRing = joins.find(a2) === joins.find(b2)
        if (backRing && fwdRing) return null
        if (!backRing && !fwdRing) continue
        const [a, b] = backRing ? [a1, b1] : [a2, b2]
        const size = (lineBetween(n, grid, a, b) as number[]).length + 1
        if (size > maxRing) continue
        ringSizes.push(size)
        settled.set(square, { value: backRing ? FORWARD : BACK, full: false, need: false, ring: true })
      }
    }
    if (settled.size === 0) break
    for (const [square, how] of settled) {
      const [a, b] = endsOf(n, square, how.value)
      if (!joins.join(a, b)) return null
      grid[square] = how.value
      if (how.full) full++
      if (how.need) need++
      if (how.ring) ring++
    }
    rounds++
  }
  if (grid.some((v) => v === EMPTY)) return null
  return { grid, rounds, full, need, ring, ringSizes }
}

/**
 * Every way to finish this board, counted no further than `cap`. Plain
 * backtracking in reading order with the union-find rolled back — nothing in
 * common with `solveByLogic` but the rules, which is what makes it the check
 * on that solver's claim that a board it finishes has one answer.
 */
export function countSolutions(n: number, clues: readonly number[], givens: readonly number[], cap = 2): number {
  const grid = givens.slice()
  const joins = joinsOf(n, grid)
  if (joins === null) return 0
  const fits = (p: number) => {
    if (clues[p] === BLANK) return true
    const { on, open } = tally(n, grid, p)
    return on <= clues[p] && on + open >= clues[p]
  }
  for (let p = 0; p < clues.length; p++) if (!fits(p)) return 0
  let found = 0
  const walk = (square: number): void => {
    if (found >= cap) return
    if (square === grid.length) {
      found++
      return
    }
    if (grid[square] !== EMPTY) return walk(square + 1)
    for (const value of FENCES) {
      const [a, b] = endsOf(n, square, value)
      const mark = joins.mark()
      if (!joins.join(a, b)) continue
      grid[square] = value
      if (cornersOf(n, square).every(fits)) walk(square + 1)
      grid[square] = EMPTY
      joins.rollback(mark)
      if (found >= cap) return
    }
  }
  walk(0)
  return found
}

/* ============================================================
   Making a board

   Backwards, from a finished one. Lay a whole field of fences
   with no ring in it, number every post from it, rub out `blanks`
   fences at random, and then rub numbers out for as long as the
   level's own solver still reasons the board through. The answer
   was drawn first, so nothing later can hand a child a board with
   no answer; and the solver only ever writes a forced fence, so a
   board it finishes has exactly one.
   ============================================================ */

/**
 * A whole field of fences with no ring in it. Laid row by row, left to right,
 * a square's bottom right post has no fence at it yet — the three other
 * squares round that post all come later — so '\' can never close a ring, and
 * it goes in whenever the coin's '/' would. That makes the walk total: no
 * restart, no dead square. It leans the field towards '\', so one of the eight
 * turns and flips of the square is applied afterwards, and half of those swap
 * the two fences. Measured: 0.500 of all fences are '\' over 60,000 fields.
 */
export function layFences(rng: Rng, n: number): number[] {
  const grid = new Array<number>(n * n).fill(EMPTY)
  const joins = new Joins((n + 1) * (n + 1))
  for (let square = 0; square < n * n; square++) {
    if (rng() < 0.5) {
      const [a, b] = endsOf(n, square, FORWARD)
      if (joins.join(a, b)) {
        grid[square] = FORWARD
        continue
      }
    }
    const [a, b] = endsOf(n, square, BACK)
    joins.join(a, b)
    grid[square] = BACK
  }
  return turn(n, grid, randInt(rng, 8))
}

/** One of the eight turns and flips of the square. A flip or a quarter turn swaps '\' and '/'. */
export function turn(n: number, grid: readonly number[], k: number): number[] {
  const out = new Array<number>(n * n).fill(EMPTY)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      let v = grid[r * n + c]
      let rr = r
      let cc = c
      if (k >= 4) {
        cc = n - 1 - cc
        if (v !== EMPTY) v = otherFence(v)
      }
      for (let t = 0; t < k % 4; t++) {
        ;[rr, cc] = [cc, n - 1 - rr]
        if (v !== EMPTY) v = otherFence(v)
      }
      out[rr * n + cc] = v
    }
  }
  return out
}

/** Every post numbered from the answer. */
export function numberPosts(n: number, answer: readonly number[]): number[] {
  return Array.from({ length: (n + 1) * (n + 1) }, (_, p) => tally(n, answer, p).on)
}

/** Rub out `blanks` fences at random, then every number the level's solver can do without. */
export function carve(
  rng: Rng,
  n: number,
  answer: readonly number[],
  blanks: number,
  maxRing: number,
): { clues: number[]; givens: number[] } | null {
  const givens = answer.slice()
  for (const square of shuffled(rng, Array.from({ length: n * n }, (_, i) => i)).slice(0, blanks)) {
    givens[square] = EMPTY
  }
  const clues = numberPosts(n, answer)
  if (solveByLogic(n, clues, givens, maxRing) === null) return null
  for (const p of shuffled(rng, Array.from({ length: clues.length }, (_, i) => i))) {
    const had = clues[p]
    clues[p] = BLANK
    if (solveByLogic(n, clues, givens, maxRing) === null) clues[p] = had
  }
  return { clues, givens }
}

/** The posts that settle a square before a single fence goes down. */
export function openingPosts(n: number, clues: readonly number[], givens: readonly number[]): number[] {
  const out: number[] = []
  for (let p = 0; p < clues.length; p++) {
    if (clues[p] === BLANK) continue
    const { on, open } = tally(n, givens, p)
    if (open > 0 && (on === clues[p] || on + open === clues[p])) out.push(p)
  }
  return out
}

/**
 * True when every empty square can be reached from every other one by going
 * along rows and columns, from empty square to empty square. That is exactly
 * how the arrow keys walk the board: straight along a row or a column, over
 * the printed squares, and never onto one — the small square's walk. Two empty
 * squares in one row or one column are always joined that way, whatever is
 * printed between them, so the rows and the columns are joined through the
 * empty squares they share, the way `Joins` joins posts through fences.
 *
 * An empty square that is the only one in its row and the only one in its
 * column is joined to nothing, and no arrow key ever lands on it: a child
 * playing by keyboard could never put its fence down. Measured on 2,000
 * boards a level dealt without this check (`makeRng(1000 + k * 37)`), 7
 * four-by-four boards had such a square, 1 five-by-five board and no
 * six-by-six board, and every time it was one square on its own. Letting an
 * arrow step to the nearest empty square in its direction whenever nothing
 * lies straight ahead would still have left 4 of those 8 cut off: nothing is
 * ever straight ahead of a square on its own, and "nothing straight ahead" is
 * mostly the edge of the board, facing out.
 */
export function blanksJoined(n: number, givens: readonly number[]): boolean {
  // Rows are 0 .. n-1 and columns n .. 2n-1.
  const lines = new Joins(2 * n)
  const blanks: number[] = []
  for (let i = 0; i < givens.length; i++) {
    if (givens[i] !== EMPTY) continue
    lines.join(rowOf(n, i), n + colOf(n, i))
    blanks.push(i)
  }
  return blanks.every((i) => lines.find(rowOf(n, i)) === lines.find(rowOf(n, blanks[0])))
}

/** True when this board is the board the level asked for. */
export function fits(config: FenceConfig, clues: readonly number[], givens: readonly number[]): boolean {
  const { n, blanks, ring, below, minRounds, maxRounds } = config
  if (givens.filter((v) => v === EMPTY).length !== blanks) return false
  // Every square a child has to fill can be reached from the keyboard.
  if (!blanksJoined(n, givens)) return false
  const read = solveByLogic(n, clues, givens, ring)
  if (read === null) return false
  if (read.rounds < minRounds || read.rounds > maxRounds) return false
  // Every level's hints name both ways a post settles a square.
  if (read.full === 0 || read.need === 0) return false
  // The first hint of the first level sends a child to the rim.
  if (!openingPosts(n, clues, givens).some((p) => onRim(n, p))) return false
  // Too easy for this level: the level below's solver finishes it already.
  if (below >= 0 && solveByLogic(n, clues, givens, below) !== null) return false
  return true
}

/** How many boards `deal` looks at before it hands over the level's own spare. */
export const ATTEMPTS = 400

/**
 * A board for this level: the first one drawn that `fits`. The spare is a
 * board that `fits` too, written down once and held to it by the tests, so
 * even the last resort is a board of the right size, with the right par, one
 * answer and the level's own difficulty. Measured over 2,000 seeds a level:
 * a board fits on the 1.5th, 1.8th and 4th draw on average, 26 at worst, and
 * the spare has never been reached.
 */
export function deal(rng: Rng, config: FenceConfig): { clues: number[]; givens: number[] } {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const answer = layFences(rng, config.n)
    const board = carve(rng, config.n, answer, config.blanks, config.ring)
    if (board !== null && fits(config, board.clues, board.givens)) return board
  }
  return spare(config)
}

/* --- the spares ---------------------------------------------- */

/**
 * A board written out by hand: posts as a string of (n+1)^2 characters, '.'
 * for no number; squares as n^2 characters, '\' or '/' for a printed fence and
 * '.' for an empty square. Spaces between rows are ignored.
 */
export function parseBoard(n: number, posts: string, squares: string): { clues: number[]; givens: number[] } {
  const p = posts.replace(/\s/g, '')
  const s = squares.replace(/\s/g, '')
  if (p.length !== (n + 1) ** 2 || s.length !== n * n) throw new Error('board is the wrong size')
  return {
    clues: [...p].map((ch) => (ch === '.' ? BLANK : Number(ch))),
    givens: [...s].map((ch) => (ch === '\\' ? BACK : ch === '/' ? FORWARD : EMPTY)),
  }
}

export const SPARES: Record<number, { posts: string; squares: string }> = {
  4: { posts: '..... ..1.. 2...1 ..41. .1..1', squares: String.raw`//\\ ./.. ../. ....` },
  5: { posts: '1.1... ..22.. .2...0 ..23.. 0.1.3. ...11.', squares: String.raw`...\/ ..\\. ..\\. \..\. ../..` },
  6: { posts: '....... 2..3..0 .4..... ....22. 0.3.... ..2.2.0 .1011..', squares: String.raw`./.\// ./../. .\.\/. ...\.. ...\.. ./....` },
}

export function spare(config: FenceConfig): { clues: number[]; givens: number[] } {
  const board = SPARES[config.n]
  if (!board) throw new Error(`no spare board ${config.n} squares a side`)
  return parseBoard(config.n, board.posts, board.squares)
}
