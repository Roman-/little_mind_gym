import { randInt, shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The floor mats.

   A square floor with marks printed on some of its squares.
   Cover the whole floor with rectangular mats so that every mat
   holds exactly one mark: a plus on a square mat, a flat line on
   a mat wider than it is tall, a standing line on a mat taller
   than it is wide. It is the puzzle Nikoli prints as Tatamibari,
   less its fourth rule — that four mats never meet at one corner
   — which the house version leaves out. The note above `fits`
   says why, and what that costs.

   Everything here is pure and framework-free, and it is the
   chocolate bar's skeleton with the number swapped for a shape.
   Three things are worth reading twice.

   `reduce` enforces only that mats do not overlap. A mat with no
   mark, two marks or the wrong shape lands, exactly as a piece of
   the wrong size lands on the chocolate bar, and for the same
   reasons: see the long note above `reduce` in
   `src/puzzles/shikaku/logic.ts` before adding a check here.

   `solveByLogic` reasons a floor out from the mats already laid
   and nothing else, one fact at a time, and at most two facts
   together. Every step it takes is sound, so a floor it finishes
   has exactly one answer, and the working a child needs lives on
   the floor rather than in a head.

   `deal` cuts exactly `mats` mats and then only ever moves a mark
   inside its own mat, so par is pinned by construction: the shell
   prints par to a child as a fact, and a mat count that came out
   where it may would be a lie on some seeds.
   ============================================================ */

/** What is printed on a square. 0 is bare floor. */
export const NONE = 0
export const PLUS = 1
export const FLAT = 2
export const STANDING = 3
export type Mark = typeof NONE | typeof PLUS | typeof FLAT | typeof STANDING

export interface MatsConfig {
  /** Rows and columns: 4, 5 or 6. */
  n: number
  /** Marks on the floor, so mats in the answer, so par. */
  mats: number
  /** No mat in the answer is bigger than this. A shape of the cut, never a rule a child is told. */
  maxArea: number
  /**
   * At most this many one-square mats in the answer. 0 on every level, because
   * the board cannot lay one: a second tap on the marked corner lets go.
   */
  maxSingles: number
  /** Mats that need a fact before they can be laid, at least and at most. */
  minStuck: number
  maxStuck: number
  /** Mats that need two facts together, at most. No mat on any level ever needs three. */
  maxPairs: number
  /**
   * Whether the always fact — "every mat this mark can still have covers that
   * square" — may be used, and whether it must be needed somewhere on the floor.
   */
  always: 'never' | 'allowed' | 'needed'
  /** Some mark has only one mat from the start, so the first step is a mat laid rather than a fact. */
  opensOnAMat: boolean
  /**
   * Floors this level can always fall back on, one string a row: '.' bare, '+'
   * a plus, '-' a flat line, '|' a standing line. The tests hold every one of
   * them to `fits` and to exactly one answer.
   */
  bank: string[][]
}

/** One mat. Top row, left column, bottom row, right column — all inclusive. */
export interface Mat {
  r0: number
  c0: number
  r1: number
  c1: number
}

export interface MatsState {
  n: number
  /** Row-major. Never changes: the same array for the whole game. */
  marks: Mark[]
  /** The mats laid so far, in the order they were laid. They never overlap. */
  mats: Mat[]
}

/**
 * `lay` carries the two opposite corners a child tapped, as cell indices; the
 * mat is their bounding box. `lift` carries any square of a mat already down,
 * and lifts the whole of it.
 */
export type MatsAction = { type: 'lay'; a: number; b: number } | { type: 'lift'; cell: number }

/* --- reading the floor --------------------------------------- */

export const rowOf = (n: number, cell: number): number => Math.floor(cell / n)
export const colOf = (n: number, cell: number): number => cell % n
/** Squares across. */
export const wideOf = (m: Mat): number => m.c1 - m.c0 + 1
/** Squares down. */
export const tallOf = (m: Mat): number => m.r1 - m.r0 + 1
export const areaOf = (m: Mat): number => wideOf(m) * tallOf(m)
/** A mat's name, everywhere one is needed: its top-left square. */
export const keyOf = (n: number, m: Mat): string => String(m.r0 * n + m.c0)

/** The mark a mat of this shape takes: a square takes a plus, and so on. */
export function shapeOf(m: Mat): Mark {
  const wide = wideOf(m)
  const tall = tallOf(m)
  if (wide === tall) return PLUS
  return wide > tall ? FLAT : STANDING
}

export function cellsOf(n: number, m: Mat): number[] {
  const out: number[] = []
  for (let r = m.r0; r <= m.r1; r++) for (let c = m.c0; c <= m.c1; c++) out.push(r * n + c)
  return out
}

/** The rectangle two corners bound, or null when either is not a square of this floor. */
export function rectBetween(n: number, a: number, b: number): Mat | null {
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < n * n
  if (!ok(a) || !ok(b)) return null
  const ra = rowOf(n, a)
  const rb = rowOf(n, b)
  const ca = colOf(n, a)
  const cb = colOf(n, b)
  return { r0: Math.min(ra, rb), c0: Math.min(ca, cb), r1: Math.max(ra, rb), c1: Math.max(ca, cb) }
}

/** Row-major: which mat lies on each square, -1 where the floor is still bare. */
export function ownerOf(state: MatsState): number[] {
  const owner = new Array<number>(state.n * state.n).fill(-1)
  state.mats.forEach((m, at) => {
    for (const cell of cellsOf(state.n, m)) owner[cell] = at
  })
  return owner
}

/** Which mat lies on this square, or -1 for bare floor and for a square that is not on it. */
export function matAt(state: MatsState, cell: number): number {
  return ownerOf(state)[cell] ?? -1
}

/**
 * Two floors with the same key are the same position.
 *
 * A square is named by the *top-left square of the mat on it*, never by that
 * mat's place in the list: the same mats laid in two different orders are one
 * position, and the breadth-first search in the tests would otherwise walk
 * every ordering of every answer.
 */
export function stateKey(state: MatsState): string {
  const owner = new Array<string>(state.n * state.n).fill('-')
  for (const m of state.mats) {
    const name = keyOf(state.n, m)
    for (const cell of cellsOf(state.n, m)) owner[cell] = name
  }
  return owner.join(',')
}

/** The marks inside a mat, in reading order. */
export function marksIn(state: MatsState, m: Mat): Mark[] {
  return cellsOf(state.n, m)
    .filter((cell) => state.marks[cell] !== NONE)
    .map((cell) => state.marks[cell])
}

/** Marks whose square no mat covers yet. The count the board reads out. */
export function uncovered(state: MatsState): number {
  const owner = ownerOf(state)
  return state.marks.reduce<number>((sum, v, i) => sum + (v !== NONE && owner[i] === -1 ? 1 : 0), 0)
}

/**
 * Squares that no mat covers yet.
 *
 * On the chocolate bar the numbers add up to the whole bar, so "every number
 * has a good piece" means "finished". A shape does not fix a size, so here it
 * does not: every mark can be under a good mat with squares still bare, and a
 * board that fell silent there would leave a child looking at a floor that
 * says nothing and is not done. This is the count the board says it with.
 */
export function bare(state: MatsState): number {
  return ownerOf(state).filter((o) => o === -1).length
}

/**
 * How a mark is said out loud, everywhere one is: labels, sentences and the
 * move tape. Never the characters `+ - |` — a screen reader says "minus" and
 * "vertical bar" — and never "a cross", which reads as the ✗ that means wrong
 * everywhere else in the app.
 */
export function markWord(m: Mark): string {
  if (m === PLUS) return 'a plus'
  if (m === FLAT) return 'a flat line'
  if (m === STANDING) return 'a standing line'
  return 'no mark'
}

const squares = (k: number): string => `${k} square${k === 1 ? '' : 's'}`

/** "2 squares wide and 1 square tall": the rules' own words, with the count in front. */
export const sizeWords = (m: Mat): string =>
  `${squares(wideOf(m))} wide and ${squares(tallOf(m))} tall`

/* --- what is wrong with a mat -------------------------------- */

export type FaultKind = 'empty' | 'crowded' | 'shape'

/** A mat that breaks one of the three rules, and everything the board needs to say so. */
export interface Fault {
  kind: FaultKind
  /** Every square of the mat, so the board can light the whole of it. */
  cells: number[]
  /** The marks at fault: every one of them on a crowded mat, the one on a mis-shaped mat. */
  blamed: number[]
  /** Squares across and squares down: how wide and how tall the mat is. */
  wide: number
  tall: number
  /** The one mark on it, or NONE. */
  mark: Mark
}

/**
 * The rule this mat breaks, or null when it is a good mat.
 *
 * The three of them are the three things a child was told, in the order they
 * can be checked by eye: is there a mark on it, is there only one, and is the
 * mat the shape the mark asks for. Every one is worked out from the mat's own
 * squares and nothing else on the floor, so the clay ring it draws knows
 * nothing a child cannot see before tapping.
 */
export function faultOf(state: MatsState, m: Mat): Fault | null {
  const cells = cellsOf(state.n, m)
  const marked = cells.filter((cell) => state.marks[cell] !== NONE)
  const size = { wide: wideOf(m), tall: tallOf(m) }
  if (marked.length === 0) return { kind: 'empty', cells, blamed: [], mark: NONE, ...size }
  if (marked.length > 1) return { kind: 'crowded', cells, blamed: marked, mark: NONE, ...size }
  const mark = state.marks[marked[0]]
  if (mark !== shapeOf(m)) return { kind: 'shape', cells, blamed: marked, mark, ...size }
  return null
}

/** Which of the mats on the floor break a rule. Drawn in clay, never hidden. */
export function faults(state: MatsState): (Fault | null)[] {
  return state.mats.map((m) => faultOf(state, m))
}

/** A mat's shape, in the rules' words. */
export function shapeWords(wide: number, tall: number): string {
  if (wide === tall) return 'This mat is a square.'
  return wide > tall ? 'This mat is wider than it is tall.' : 'This mat is taller than it is wide.'
}

/** What a mark asks of its mat, in the rules' words. */
export function needWords(mark: Mark): string {
  if (mark === PLUS) return 'A plus needs a square mat.'
  if (mark === FLAT) return 'A flat line needs a mat that is wider than it is tall.'
  return 'A standing line needs a mat that is taller than it is wide.'
}

/**
 * The broken rule in words. The lit mat says where; this says what. A shape
 * that is wrong gets two sentences — what the mat is, then what the mark on it
 * needs — and nothing shakes, because the lit mat is the measurement.
 */
export function describeFault(fault: Fault): string {
  if (fault.kind === 'empty') return 'This mat has no mark on it.'
  if (fault.kind === 'crowded') return 'This mat has more than one mark on it.'
  return `${shapeWords(fault.wide, fault.tall)} ${needWords(fault.mark)}`
}

/**
 * The newest mat on the floor that breaks a rule, worked out from the state
 * alone: mats are kept in laying order, so the last faulted one is the one the
 * child laid most recently.
 *
 * The board's sentence is this and nothing else. A sentence the board kept for
 * itself when the mat landed would go on naming a mat after it was lifted —
 * lay two broken mats, lift the second, and it would still describe the second
 * — and a rewind through the move tape would land under a sentence from some
 * other position. The chocolate bar keeps one like that, and has that bug.
 */
export function newestFault(state: MatsState): Fault | null {
  for (let at = state.mats.length - 1; at >= 0; at--) {
    const fault = faultOf(state, state.mats[at])
    if (fault !== null) return fault
  }
  return null
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<MatsConfig>, rng: Rng): MatsState {
  return { n: level.config.n, marks: deal(rng, level.config), mats: [] }
}

/**
 * One mat laid, or one lifted.
 *
 * **The only rule this enforces is that mats may not overlap.** A mat with no
 * mark on it, a mat with two marks on it, and a mat whose shape disagrees with
 * its mark all *land*: they come back as a new object, the shell records the
 * move, the board draws them where the child put them, rings them in clay and
 * names the rule, and one tap lifts them. It is the chocolate bar's bargain
 * unchanged, and the long note above its `reduce` is the argument for it: a
 * shape check here would turn every dead square into a square the answer
 * cannot reach once forbidden moves are turned off, and would answer a
 * fat-fingered second tap as a verdict on the child's reasoning.
 */
export function reduce(state: MatsState, action: MatsAction): MatsState {
  // An action that is not one of ours.
  if (action.type !== 'lay' && action.type !== 'lift') return state

  if (action.type === 'lift') {
    const at = matAt(state, action.cell)
    // Nothing there to lift — including a cell index that is not on the floor.
    if (at === -1) return state
    return { ...state, mats: state.mats.filter((_, i) => i !== at) }
  }

  const rect = rectBetween(state.n, action.a, action.b)
  // A corner that is not a square of this floor: not a whole number, negative,
  // or past the end.
  if (rect === null) return state
  // Both corners on one square: a change of mind, as on the chocolate bar. No
  // answer ever holds a one-square mat, so nothing is lost.
  if (action.a === action.b) return state
  const owner = ownerOf(state)
  // It runs over a mat already down. The one rule `reduce` enforces.
  if (cellsOf(state.n, rect).some((cell) => owner[cell] !== -1)) return state

  return { ...state, mats: [...state.mats, rect] }
}

export function isSolved(state: MatsState): boolean {
  // Every square of the floor is under a mat …
  if (ownerOf(state).some((o) => o === -1)) return false
  // … and no mat breaks a rule: one mark each, and the shape it asks for. Mats
  // never overlap, so those two together force the mat count to equal the
  // number of marks, which is the level's par.
  return state.mats.every((m) => faultOf(state, m) === null)
}

/**
 * The one move this puzzle refuses: a rectangle that runs over a mat already
 * down. Nothing can pretend to move — a mat cannot be laid through another one
 * — so `pretend` is the state itself, and `useRefusal` flashes and shakes the
 * mat in the way.
 */
export function refusalOf(
  state: MatsState,
  a: number,
  b: number,
): { pretend: MatsState; message: string; where: string } | null {
  const rect = rectBetween(state.n, a, b)
  if (rect === null || a === b) return null
  const owner = ownerOf(state)
  const hit = cellsOf(state.n, rect)
    .map((cell) => owner[cell])
    .find((o) => o !== -1)
  if (hit === undefined) return null
  return {
    pretend: state,
    message: 'A mat is already lying there.',
    where: keyOf(state.n, state.mats[hit]),
  }
}

/** Where a mat lies, in words: its top-left square. */
const seatOf = (m: Mat): string => `row ${m.r0 + 1}, column ${m.c0 + 1}`

/** Only ever called after `reduce` took the action, so the mat is really there. */
export function describeMove(prev: MatsState, next: MatsState, action: MatsAction): string {
  if (action.type === 'lift') {
    const m = prev.mats[matAt(prev, action.cell)]
    return `Lifted the mat ${sizeWords(m)} at ${seatOf(m)}`
  }
  const m = next.mats[next.mats.length - 1]
  return `Laid a mat ${sizeWords(m)} at ${seatOf(m)}`
}

/* ============================================================
   Reasoning a floor out, from the board alone

   A child's working here is the mats on the floor and nothing
   else, so the solver keeps nothing else either. Before every
   mat it lays, it works each mark's mats out afresh from the
   mats already down: every rectangle of the mark's shape that
   holds no other mark and runs over no laid mat.

   Lay (L): a mark with one mat left takes it.

   When no mark has one mat left, the child needs a fact, read
   off the floor as it now stands.

   Reach (R): a bare square that only one mark can still reach
     belongs to that mark, so its mats that miss it are out.
   Always (A): a square that every mat one mark can still have
     covers is that mark's, so every other mark's mats over it
     are out.

   One fact that leaves some mark one mat is a step a child can
   say out loud, and the mat it opens is laid at once (R or A).
   Where no one fact does, two facts that do together — the
   second read from the floor with the first in mind — are a pair
   (P), which is the step the levels ration. Anything that needs
   three is a floor the solver gives up on.

   Whatever a step worked out, only the mat it opened is kept:
   the next step starts again from the floor. A first draft of
   this solver remembered every mat it had struck, and on the
   biggest floor its one "combined" step applied a median of six
   facts at once and up to thirteen — working that lived in a
   head, not on the board. This one cannot do that.

   Every step is sound — a laid mat is forced, and a struck mat
   is impossible in every answer — so a floor this finishes has
   exactly one answer and is reachable without a guess.
   `countSolutions` below is held against that claim in the
   tests.
   ============================================================ */

/**
 * Every mat this mark could have: every rectangle of its shape that covers it
 * and no other mark. One-square mats for a plus are included, because the
 * words allow them — "a plus is a square" — even though the board cannot lay
 * one and no dealt answer holds one. Counting them keeps "exactly one answer"
 * true under the rules exactly as the child reads them.
 *
 * A prefix sum of the marks answers "how many marks are inside" in four reads,
 * which is what keeps the carve, which calls this a great deal, cheap.
 */
export function candidatesFor(n: number, marks: Mark[], p: number): Mat[] {
  const W = n + 1
  const sum = new Int32Array(W * W)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      sum[(r + 1) * W + c + 1] =
        (marks[r * n + c] !== NONE ? 1 : 0) +
        sum[r * W + c + 1] +
        sum[(r + 1) * W + c] -
        sum[r * W + c]
    }
  }
  const kind = marks[p]
  const pr = rowOf(n, p)
  const pc = colOf(n, p)
  const out: Mat[] = []
  for (let r0 = 0; r0 <= pr; r0++) {
    for (let r1 = pr; r1 < n; r1++) {
      for (let c0 = 0; c0 <= pc; c0++) {
        for (let c1 = pc; c1 < n; c1++) {
          const m = { r0, c0, r1, c1 }
          if (shapeOf(m) !== kind) continue
          const inside =
            sum[(r1 + 1) * W + c1 + 1] -
            sum[r0 * W + c1 + 1] -
            sum[(r1 + 1) * W + c0] +
            sum[r0 * W + c0]
          if (inside === 1) out.push(m)
        }
      }
    }
  }
  return out
}

/** What a floor asked to be reasoned through gives back. */
export interface Reasoning {
  /** One mat a mark, marks in reading order. */
  mats: Mat[]
  /**
   * One letter a mat, in the order they were laid: 'L' certain from the board,
   * 'R' or 'A' after one fact, 'P' after two.
   */
  steps: string
  /** Mats that needed a fact first: every letter but 'L'. The level's main dial. */
  stuck: number
  /** Mats that needed two facts together: the 'P's. */
  pairs: number
}

interface Shape {
  mat: Mat
  cells: number[]
  /** `has[cell]` is 1 when the mat covers that square: one read instead of a search. */
  has: Uint8Array
}

interface Fact {
  kind: 'R' | 'A'
  /** Which mark, by its place among the marks in reading order. */
  mark: number
  cell: number
}

export function solveByLogic(
  n: number,
  marks: Mark[],
  opts: { always: boolean } = { always: true },
): Reasoning | null {
  const size = n * n
  const spots: number[] = []
  for (let i = 0; i < size; i++) if (marks[i] !== NONE) spots.push(i)
  const k = spots.length
  const every: Shape[][] = spots.map((p) =>
    candidatesFor(n, marks, p).map((mat) => {
      const cells = cellsOf(n, mat)
      const has = new Uint8Array(size)
      for (const c of cells) has[c] = 1
      return { mat, cells, has }
    }),
  )
  const owner = new Array<number>(size).fill(-1)
  const laid = new Array<Mat | null>(k).fill(null)
  let steps = ''

  /**
   * The facts on the floor, given what each mark could still have: reach facts
   * in reading order, then always facts. Null when some bare square is out of
   * every mark's reach, which means there is no answer from here at all.
   */
  const factsOf = (open: Shape[][]): Fact[] | null => {
    const facts: Fact[] = []
    for (let cell = 0; cell < size; cell++) {
      if (owner[cell] !== -1) continue
      let who = -1
      let many = false
      for (let j = 0; j < k; j++) {
        if (laid[j] !== null || !open[j].some((sh) => sh.has[cell])) continue
        if (who === -1) who = j
        else {
          many = true
          break
        }
      }
      if (who === -1) return null
      if (!many && open[who].some((sh) => !sh.has[cell])) facts.push({ kind: 'R', mark: who, cell })
    }
    if (opts.always) {
      for (let j = 0; j < k; j++) {
        if (laid[j] !== null || open[j].length === 0) continue
        for (const cell of open[j][0].cells) {
          if (!open[j].every((sh) => sh.has[cell])) continue
          const contested = open.some(
            (s, m) => m !== j && laid[m] === null && s.some((sh) => sh.has[cell]),
          )
          if (contested) facts.push({ kind: 'A', mark: j, cell })
        }
      }
    }
    return facts
  }

  /** What each mark could still have once this fact is taken in. */
  const applied = (f: Fact, from: Shape[][]): Shape[][] =>
    from.map((s, m) => {
      if (laid[m] !== null) return s
      if (f.kind === 'R') return m === f.mark ? s.filter((sh) => sh.has[f.cell]) : s
      return m === f.mark ? s : s.filter((sh) => !sh.has[f.cell])
    })

  /** The first mark that is down to one mat, or -1. */
  const single = (from: Shape[][]) => from.findIndex((s, m) => laid[m] === null && s.length === 1)

  const lay = (j: number, sh: Shape, letter: string) => {
    for (const cell of sh.cells) owner[cell] = j
    laid[j] = sh.mat
    steps += letter
  }

  while (laid.some((m) => m === null)) {
    // From the board alone: every mat a mark could have that runs over no laid mat.
    const open = every.map((s, j) =>
      laid[j] !== null ? [] : s.filter((sh) => sh.cells.every((c) => owner[c] === -1)),
    )
    if (open.some((s, j) => laid[j] === null && s.length === 0)) return null
    const j0 = single(open)
    if (j0 !== -1) {
      lay(j0, open[j0][0], 'L')
      continue
    }

    const facts = factsOf(open)
    if (facts === null || facts.length === 0) return null

    // One fact, in reading order, reach before always.
    let done = false
    for (const f of facts) {
      const after = applied(f, open)
      const j = single(after)
      if (j !== -1) {
        lay(j, after[j][0], f.kind)
        done = true
        break
      }
    }
    if (done) continue

    // Two facts: the first from the floor, the second from the floor with the
    // first taken in. Only ever where no single fact opens a mat.
    for (const f of facts) {
      const first = applied(f, open)
      if (first.some((s, m) => laid[m] === null && s.length === 0)) continue
      const more = factsOf(first)
      if (more === null) continue
      for (const g of more) {
        const after = applied(g, first)
        const j = single(after)
        if (j !== -1) {
          lay(j, after[j][0], 'P')
          done = true
          break
        }
      }
      if (done) break
    }
    if (!done) return null
  }
  // Every mark has its mat. A floor with bare squares left over has no answer at all.
  if (owner.some((o) => o === -1)) return null
  return {
    mats: laid as Mat[],
    steps,
    stuck: steps.replace(/L/g, '').length,
    pairs: (steps.match(/P/g) ?? []).length,
  }
}

/**
 * How many ways the whole floor can be covered, counted no further than `cap`.
 *
 * The plainest counter there is — take the first square nothing covers yet and
 * try every mark's every mat that covers it — so that the clever solver above
 * agreeing with it means the clever one is not lying.
 *
 * Both of them take their mats from `candidatesFor`, and so does `answers`, so
 * a slip in its prefix sums would have all three agree on the wrong count. The
 * tests hold it to the plainest list there is instead: every rectangle over
 * the mark that `faultOf` says breaks no rule.
 */
export function countSolutions(n: number, marks: Mark[], cap = 2): number {
  const size = n * n
  const spots: number[] = []
  for (let i = 0; i < size; i++) if (marks[i] !== NONE) spots.push(i)
  const shapes = spots.map((p) => candidatesFor(n, marks, p).map((m) => cellsOf(n, m)))
  const used = new Array<boolean>(spots.length).fill(false)
  const owner = new Array<number>(size).fill(-1)
  let found = 0

  const walk = (): void => {
    if (found >= cap) return
    const open = owner.indexOf(-1)
    if (open === -1) {
      found++
      return
    }
    for (let j = 0; j < spots.length; j++) {
      if (used[j]) continue
      for (const cells of shapes[j]) {
        if (!cells.includes(open) || cells.some((c) => owner[c] !== -1)) continue
        used[j] = true
        for (const c of cells) owner[c] = j
        walk()
        for (const c of cells) owner[c] = -1
        used[j] = false
        if (found >= cap) return
      }
    }
  }

  walk()
  return found
}

/**
 * Up to `cap` answers, each one mat a mark, marks in reading order.
 *
 * Quicker than `countSolutions`, and it hands the answers back rather than a
 * count, which is what the carve needs: it fills the square with the fewest
 * mats left over it first, and gives up on a branch as soon as some mark has
 * no mat left. The tests hold it to `countSolutions`.
 */
export function answers(n: number, marks: Mark[], cap: number): Mat[][] {
  const size = n * n
  const spots: number[] = []
  for (let i = 0; i < size; i++) if (marks[i] !== NONE) spots.push(i)
  const k = spots.length
  interface Option {
    j: number
    mat: Mat
    cells: number[]
  }
  const cover: Option[][] = Array.from({ length: size }, () => [])
  const byMark: Option[][] = spots.map(() => [])
  spots.forEach((p, j) => {
    for (const mat of candidatesFor(n, marks, p)) {
      const option = { j, mat, cells: cellsOf(n, mat) }
      byMark[j].push(option)
      for (const c of option.cells) cover[c].push(option)
    }
  })
  const owned = new Array<boolean>(size).fill(false)
  const taken = new Array<boolean>(k).fill(false)
  const chosen = new Array<Mat | null>(k).fill(null)
  const found: Mat[][] = []
  let left = size
  const free = (o: Option) => !taken[o.j] && o.cells.every((c) => !owned[c])

  const walk = (): void => {
    if (found.length >= cap) return
    if (left === 0) {
      found.push(chosen.slice() as Mat[])
      return
    }
    for (let j = 0; j < k; j++) if (!taken[j] && !byMark[j].some(free)) return
    let best = -1
    let fewest = Infinity
    for (let c = 0; c < size; c++) {
      if (owned[c]) continue
      let options = 0
      for (const o of cover[c]) if (free(o)) options++
      if (options < fewest) {
        fewest = options
        best = c
        if (options <= 1) break
      }
    }
    if (fewest === 0) return
    for (const o of cover[best]) {
      if (!free(o)) continue
      taken[o.j] = true
      chosen[o.j] = o.mat
      for (const c of o.cells) owned[c] = true
      left -= o.cells.length
      walk()
      taken[o.j] = false
      chosen[o.j] = null
      for (const c of o.cells) owned[c] = false
      left += o.cells.length
      if (found.length >= cap) return
    }
  }

  walk()
  return found
}

/* ============================================================
   Making a floor

   Backwards, from a finished one: cut the whole floor into
   exactly `mats` rectangles, print each one's mark somewhere
   inside it, then move marks about inside their own mats until
   nothing else covers the floor. Nothing here can make a floor
   with no answer, because the answer was drawn first; and
   because the cut is *given* the number of mats and a mark never
   leaves its mat, par is a fact about the floor rather than a
   hope about it.
   ============================================================ */

/** How far the cut will search one floor before it gives up and another is drawn. */
const BUDGET = 600

/**
 * Cut the whole floor into `pieces` rectangles, none bigger than `maxArea` and
 * at most `maxSingles` of them a single square, or give up.
 *
 * The chocolate bar's row-major cut: the first bare square is always the
 * top-left corner of the next mat, so no arrangement is unreachable and none
 * is counted twice, and it backtracks until it hits the count exactly. What is
 * left has to be enough squares for the mats still to cut, and few enough for
 * them to hold. A count-targeted guillotine cut was tried against it and did no
 * better: 47 of 400 draws came out with one answer at five across either way.
 */
export function cutFloor(
  rng: Rng,
  n: number,
  pieces: number,
  maxArea: number,
  maxSingles: number,
): Mat[] | null {
  const size = n * n
  const owner = new Array<number>(size).fill(-1)
  const cut: Mat[] = []
  let left = size
  let nodes = 0
  let singles = 0

  const walk = (): boolean => {
    if (++nodes > BUDGET) return false
    if (left === 0) return cut.length === pieces
    const todo = pieces - cut.length
    if (todo === 0) return false
    const first = owner.indexOf(-1)
    const r0 = rowOf(n, first)
    const c0 = colOf(n, first)
    const options: Mat[] = []
    for (let r1 = r0; r1 < n; r1++) {
      for (let c1 = c0; c1 < n; c1++) {
        const area = (r1 - r0 + 1) * (c1 - c0 + 1)
        if (area > maxArea) break
        let open = true
        for (let r = r0; r <= r1 && open; r++) {
          for (let c = c0; c <= c1; c++) {
            if (owner[r * n + c] !== -1) {
              open = false
              break
            }
          }
        }
        if (!open) break
        if (area === 1 && singles >= maxSingles) continue
        const rest = left - area
        if (rest < todo - 1 || rest > (todo - 1) * maxArea) continue
        options.push({ r0, c0, r1, c1 })
      }
    }
    for (const m of shuffled(rng, options)) {
      const cells = cellsOf(n, m)
      cut.push(m)
      for (const c of cells) owner[c] = cut.length - 1
      left -= cells.length
      if (cells.length === 1) singles++
      if (walk()) return true
      if (cells.length === 1) singles--
      cut.pop()
      for (const c of cells) owner[c] = -1
      left += cells.length
    }
    return false
  }

  return walk() ? cut : null
}

/**
 * The cut turned or flipped by one of the square's eight symmetries. Cutting in
 * reading order leaves more standing mats than flat ones — a mat hanging down
 * from the row above stops the next one growing sideways — and a quarter turn
 * swaps the two, so this evens them out for nothing.
 */
export function orient(rng: Rng, n: number, cut: Mat[]): Mat[] {
  const t = randInt(rng, 8)
  const map = (r: number, c: number): [number, number] => {
    let rr = r
    let cc = c
    if (t & 1) [rr, cc] = [cc, rr]
    if (t & 2) rr = n - 1 - rr
    if (t & 4) cc = n - 1 - cc
    return [rr, cc]
  }
  return cut.map((m) => {
    const [a0, b0] = map(m.r0, m.c0)
    const [a1, b1] = map(m.r1, m.c1)
    return {
      r0: Math.min(a0, a1),
      c0: Math.min(b0, b1),
      r1: Math.max(a0, a1),
      c1: Math.max(b0, b1),
    }
  })
}

const sameMat = (a: Mat, b: Mat): boolean =>
  a.r0 === b.r0 && a.c0 === b.c0 && a.r1 === b.r1 && a.c1 === b.c1

/**
 * One mark inside every mat of the cut, moved about until the cut is the only
 * way to cover the floor — or null, and the caller draws another.
 *
 * It is the garden cats' carve, turned on where the marks stand. Each mat's
 * mark starts on a random square of it. While a second answer exists, one mark
 * whose mat differs between the two answers moves to a square of its *true*
 * mat that the second answer's mat for it does not cover, which breaks that
 * second answer. The true answer always still fits, and a mark never leaves its
 * mat, so the mark count and the three shapes stay exactly as the cut made
 * them. The number of passes, `cuts`, is 30: against 8, 12 and 20 the cost of a
 * floor that keeps did not move outside the noise.
 */
export function carveMarks(rng: Rng, n: number, cut: Mat[], cuts: number): Mark[] | null {
  const marks = new Array<Mark>(n * n).fill(NONE)
  const home = new Array<number>(n * n).fill(-1)
  cut.forEach((m, at) => {
    const cells = cellsOf(n, m)
    for (const c of cells) home[c] = at
    marks[cells[randInt(rng, cells.length)]] = shapeOf(m)
  })
  for (let pass = 0; pass < cuts; pass++) {
    // The cut is always among the answers — every mark is still inside its own
    // mat, and every mat is still the shape of its mark — so there is never
    // none, and of two different answers at least one is not the cut.
    const found = answers(n, marks, 2)
    if (found.length === 1) return marks
    const spots: number[] = []
    for (let i = 0; i < n * n; i++) if (marks[i] !== NONE) spots.push(i)
    const truth = spots.map((p) => cut[home[p]])
    const other = found.find((answer) => answer.some((m, j) => !sameMat(m, truth[j])))
    // Never taken, for the reason above: 1,200 deals over all three levels,
    // counted, took it no times. `find` is typed to allow undefined, so the
    // guard is here for the type checker, not for a floor.
    if (other === undefined) return null
    const loose = shuffled(
      rng,
      spots.map((_, j) => j).filter((j) => !sameMat(other[j], truth[j])),
    )
    const j = loose.find((jj) => areaOf(truth[jj]) > 1)
    if (j === undefined) return null
    const p = spots[j]
    const rest = cellsOf(n, truth[j]).filter((c) => c !== p)
    const wrong = new Set(cellsOf(n, other[j]))
    const aimed = rest.filter((c) => !wrong.has(c))
    const pool = aimed.length > 0 ? aimed : rest
    const to = pool[randInt(rng, pool.length)]
    marks[to] = marks[p]
    marks[p] = NONE
  }
  return null
}

/**
 * The reasoning, when this floor is the floor the level asked for; null
 * otherwise.
 *
 * `window = false` is the fallback's question: everything but the count of
 * facts (`minStuck`/`maxStuck`) still holds — the three kinds, the sizes, the
 * pair cap, the always setting and the opening mat — so every hint stays true
 * of a floor the fallback deals.
 *
 * Nothing here consults the rule that four mats never meet at one corner. The
 * house version drops it, so `countSolutions` and `solveByLogic` do not know it
 * either, and a floor with one answer here has one answer under the rules the
 * child was told. Dealt answers do have four mats at one corner — 243, 316 and
 * 421 of 600 floors, level by level — which is why the credits line says the
 * rule is left out. Keeping it would cost a fifth line of instructions and a
 * fourth kind of mistake lit on a grid point that no button owns, and on the
 * first draft's floors it rescued only 1.6% to 11% of the draws that came out
 * with two answers; the carve does that work at a far higher yield.
 */
export function fits(config: MatsConfig, marks: Mark[], window = true): Reasoning | null {
  const { n } = config
  // A floor of another size. Everything below reads the first n² squares as a
  // floor of this size, so without this a four-wide floor padded out to
  // twenty-five squares passed as a four-wide one.
  if (marks.length !== n * n) return null
  const printed = marks.filter((m) => m !== NONE)
  if (printed.length !== config.mats || new Set(printed).size !== 3) return null
  const reasoned = solveByLogic(n, marks, { always: config.always !== 'never' })
  if (reasoned === null) return null
  if (reasoned.mats.some((m) => areaOf(m) > config.maxArea)) return null
  if (reasoned.mats.filter((m) => areaOf(m) === 1).length > config.maxSingles) return null
  if (window && (reasoned.stuck < config.minStuck || reasoned.stuck > config.maxStuck)) return null
  if (reasoned.pairs > config.maxPairs) return null
  if (config.opensOnAMat && reasoned.steps[0] !== 'L') return null
  if (config.always === 'needed') {
    // Needed: with reach facts alone, the floor cannot be reasoned out inside
    // the level's pairs.
    const plain = solveByLogic(n, marks, { always: false })
    if (plain !== null && plain.pairs <= config.maxPairs) return null
  }
  return reasoned
}

/** How many floors `deal` cuts before it settles for a fallback. */
export const ATTEMPTS = 400
/** How many times the carve may move a mark on one floor before it gives that floor up. */
export const CUTS = 30

const PRINTED: Record<string, Mark> = { '.': NONE, '+': PLUS, '-': FLAT, '|': STANDING }

/** A floor written one string a row, the way `bank` holds it. */
export const parseFloor = (rows: string[]): Mark[] =>
  rows
    .join('')
    .split('')
    .map((ch) => PRINTED[ch])

/** Which of `deal`'s three paths a floor came out of, and after how many cuts. For the tests. */
export interface DealStats {
  attempts: number
  fell: 'fit' | 'reasoned' | 'bank'
}

/**
 * A floor for this level.
 *
 * Three paths, and every one of them is sound. The first floor that `fits` —
 * reached on every one of 3,600 deals over two seed ranges and all three
 * levels, after a median of 9, 11 and 14 cuts (8, 11 and 15 on the second
 * range) and a worst of 75, 100 and 141 out of the 400. Failing that, the first floor that fits everything but the
 * count of facts, which still has one answer, par marks and every hint true of
 * it: it is not garden-cats' "any board", which would be unsound here. Failing
 * that, a floor from the level's bank, which the tests hold to `fits`.
 *
 * The chance of the 400 running out is below one in 10¹³ on the first level
 * and about one in twenty million on the last, where one floor keeps in every
 * 20 to 24 cut.
 */
export function deal(rng: Rng, config: MatsConfig, stats?: DealStats): Mark[] {
  const { n, mats, maxArea, maxSingles } = config
  let reasoned: Mark[] | null = null
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (stats) stats.attempts = attempt + 1
    const drawn = cutFloor(rng, n, mats, maxArea, maxSingles)
    if (drawn === null) continue
    const cut = orient(rng, n, drawn)
    // All three marks on every floor, so every rule a child is told is on it.
    if (new Set(cut.map(shapeOf)).size !== 3) continue
    const marks = carveMarks(rng, n, cut, CUTS)
    if (marks === null) continue
    if (fits(config, marks) !== null) {
      if (stats) stats.fell = 'fit'
      return marks
    }
    if (reasoned === null && fits(config, marks, false) !== null) reasoned = marks
  }
  if (reasoned !== null) {
    if (stats) stats.fell = 'reasoned'
    return reasoned
  }
  if (stats) stats.fell = 'bank'
  return parseFloor(config.bank[randInt(rng, config.bank.length)])
}
