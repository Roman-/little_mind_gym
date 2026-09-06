import { shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The candles.

   A square board with walls scattered over it. Stand candles on
   the open squares so that every open square is lit, and no
   candle stands in another candle's light. A candle shines along
   its own row and its own column until a wall stops it. Some
   walls carry a number, and that number is how many candles
   touch the wall — above, below, left and right. It is the
   puzzle Nikoli sells as Akari and Simon Tatham's collection
   calls Light Up.

   Everything here is pure and framework-free. Four things are
   worth reading twice.

   `solveByLogic` fills a board using only the two steps an
   eight-year-old can actually make, and `deal` throws away every
   board it cannot finish. A solver that only ever stands a
   candle where the rules leave one square also proves the board
   has exactly one answer, so uniqueness and "no guessing" are
   one check here rather than two.

   `countSolutions` is the independent check on that claim, and
   it has to branch *canonically* — see the comment on it. The
   obvious counter reports arrangements twice and calls a
   perfectly good board ambiguous.

   `deal` works backwards from a finished board: scatter the
   walls, find one legal illumination, number every wall from it,
   and then rub numbers out for as long as the board still
   reasons through. Nothing after the numbering can produce a
   board with no answer, because the answer was drawn first.

   And what this board deliberately does not have: the paper
   game's pencil dot on a square that cannot hold a candle. It
   does not need one. Every square a candle reaches is washed in
   the candle's own colour, and a lit square is precisely a
   square no candle may stand on — so the annotation is drawn for
   free. What is left to carry in a head is a *dark* square ruled
   out by a wall's count, and the levels are sized on the solver
   so that stays under three at a time.
   ============================================================ */

/** A square a candle may stand on. */
export const OPEN = -1
/** A wall with nothing written on it. */
export const PLAIN = -2

export interface LightUpConfig {
  /** Rows and columns both come in this many. */
  n: number
  /** How many squares are walled off before the answer is drawn. */
  walls: number
  /** Candles in the one answer. This is the level's `par`, pinned per seed. */
  candles: number
  /** Walls that must still carry a number once the rubbing out is done. */
  minNumbers: number
  /**
   * Passes over the two steps in `solveByLogic`, at least and at most. It is
   * the only difficulty knob apart from the size, and it is measured on the
   * solver rather than guessed.
   */
  minRounds: number
  maxRounds: number
}

export interface LightUpState {
  /** Rows and columns both come in this many. */
  n: number
  /**
   * Row-major, one entry a square, and it never changes: `OPEN` where a candle
   * may stand, `PLAIN` for a wall with nothing written on it, and 0..4 for a
   * wall that says how many candles touch it.
   */
  walls: number[]
  /** Row-major. True where a candle is standing. */
  candles: boolean[]
}

/** One tap: a candle goes down on an open square, or comes off its own. */
export type LightUpAction = { type: 'toggle'; index: number }

/* --- reading the grid ---------------------------------------- */

export const rowOf = (n: number, index: number): number => Math.floor(index / n)
export const colOf = (n: number, index: number): number => index % n

/** True where a candle may stand. Everything else is wall. */
export const isOpen = (value: number): boolean => value === OPEN

/** The squares that share an edge with this one. A wall counts along these. */
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

const STEPS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const

/**
 * The squares a candle standing on `i` lights, `i` itself included: out along
 * the row and down the column until a wall stops the light. Visibility is the
 * same both ways round, because the wall that stops the beam stops it in
 * either direction — which is why "no candle stands in another candle's light"
 * can be checked one candle at a time.
 */
export function beam(n: number, walls: number[], i: number): number[] {
  const out = [i]
  const r = rowOf(n, i)
  const c = colOf(n, i)
  for (const [dr, dc] of STEPS) {
    let rr = r + dr
    let cc = c + dc
    while (rr >= 0 && rr < n && cc >= 0 && cc < n) {
      const j = rr * n + cc
      if (!isOpen(walls[j])) break
      out.push(j)
      rr += dr
      cc += dc
    }
  }
  return out
}

/** Every square's beam, worked out once. A wall lights nothing. */
export function beams(n: number, walls: number[]): number[][] {
  return walls.map((value, i) => (isOpen(value) ? beam(n, walls, i) : []))
}

/** Every square with a candle standing on it, ascending. */
export function candleCells(state: LightUpState): number[] {
  const out: number[] = []
  for (let i = 0; i < state.candles.length; i++) if (state.candles[i]) out.push(i)
  return out
}

/** How many candles reach each square. A candle's own square counts itself. */
export function litCounts(state: LightUpState): number[] {
  const out = new Array<number>(state.walls.length).fill(0)
  for (const i of candleCells(state)) {
    for (const j of beam(state.n, state.walls, i)) out[j]++
  }
  return out
}

/** Candles standing against this wall. */
export function candlesAround(state: LightUpState, wall: number): number {
  return orthogonal(state.n, wall).filter((j) => state.candles[j]).length
}

/** Open squares nothing lights yet. The number the board reads out first. */
export function darkSquares(state: LightUpState): number {
  const lit = litCounts(state)
  let dark = 0
  for (let i = 0; i < state.walls.length; i++) {
    if (isOpen(state.walls[i]) && lit[i] === 0) dark++
  }
  return dark
}

/**
 * Numbered walls that have fewer candles than they ask for. Nothing is wrong
 * with a board like that — it is simply not finished — so it is a count and
 * never a cue.
 */
export function hungryWalls(state: LightUpState): number {
  let short = 0
  for (let i = 0; i < state.walls.length; i++) {
    if (state.walls[i] >= 0 && candlesAround(state, i) < state.walls[i]) short++
  }
  return short
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<LightUpConfig>, rng: Rng): LightUpState {
  const { n } = level.config
  return { n, walls: deal(rng, level.config), candles: new Array<boolean>(n * n).fill(false) }
}

/**
 * Four branches hand the state straight back, and the fourth is the one this
 * board has that a board of plain squares does not: a wall is never drawn as a
 * button, so a tap on one "cannot happen" — except that the move tape replays
 * actions and the tests dispatch one on purpose. Without the guard the shell
 * would record a move that put a candle nobody can see on a square nobody can
 * press.
 *
 * There is no fifth branch for "this candle breaks a rule". A candle standing
 * in another candle's light is a position a child is allowed to hold and then
 * take back, so the move lands, the shell records it, and the board says no
 * over the top of it.
 */
export function reduce(state: LightUpState, action: LightUpAction): LightUpState {
  if (action.type !== 'toggle') return state
  const { index } = action
  if (!Number.isInteger(index)) return state
  if (index < 0 || index >= state.candles.length) return state
  if (!isOpen(state.walls[index])) return state
  const candles = state.candles.slice()
  candles[index] = !candles[index]
  return { ...state, candles }
}

/**
 * Three rules, three lines. A square nothing reaches is not lit. A candle
 * lights itself, so a candle on a square two candles reach is standing in
 * somebody else's light. And a numbered wall wants exactly its number.
 *
 * Nothing here reads the generator, so a board rewound through the move tape
 * is judged exactly as a board played forward is.
 */
export function isSolved(state: LightUpState): boolean {
  const lit = litCounts(state)
  for (let i = 0; i < state.walls.length; i++) {
    if (!isOpen(state.walls[i])) {
      if (state.walls[i] >= 0 && candlesAround(state, i) !== state.walls[i]) return false
      continue
    }
    if (lit[i] === 0) return false
    if (state.candles[i] && lit[i] !== 1) return false
  }
  return true
}

/**
 * Every candle breaking a rule: one standing in another candle's light, and
 * one against a wall that already has more candles than it asked for. These
 * wear a clay ring that stands after the highlight has gone.
 */
export function conflicts(state: LightUpState): boolean[] {
  const lit = litCounts(state)
  const wrong = state.candles.map((candle, i) => candle && lit[i] !== 1)
  for (let i = 0; i < state.walls.length; i++) {
    if (state.walls[i] < 0) continue
    const around = orthogonal(state.n, i).filter((j) => state.candles[j])
    if (around.length > state.walls[i]) for (const j of around) wrong[j] = true
  }
  return wrong
}

/** Which rule a candle has broken. */
export type ClashKind = 'seen' | 'count'

/** One placement, and the group of squares that will not have it. */
export interface Clash {
  kind: ClashKind
  /** Every square in the group, so the board can light the whole of it. */
  cells: number[]
  /** The candles at fault: the one just put down, and the ones it fell foul of. */
  blamed: number[]
  /** The wall the count is about, or -1 for a `seen` clash. */
  wall: number
  /** What that wall asks for, and what it would then have. Both 0 for `seen`. */
  wanted: number
  got: number
}

/** The squares between two candles in one line, both ends included. */
function between(n: number, a: number, b: number): number[] {
  const step = rowOf(n, a) === rowOf(n, b) ? 1 : n
  const [lo, hi] = a < b ? [a, b] : [b, a]
  const out: number[] = []
  for (let i = lo; i <= hi; i += step) out.push(i)
  return out
}

/**
 * The rule that standing a candle on `index` breaks, or null when the square
 * takes it.
 *
 * One candle can break both rules at once and only the first is reported —
 * two lit groups say nothing about either of them. `seen` comes first because
 * the light is already washed across the square under the child's finger when
 * they tap it, so that is the rule they watch themselves break.
 */
export function clashOf(state: LightUpState, index: number): Clash | null {
  const { n, walls } = state
  if (!isOpen(walls[index]) || state.candles[index]) return null

  const seen = beam(n, walls, index).filter((j) => j !== index && state.candles[j])
  if (seen.length > 0) {
    const cells = [...new Set(seen.flatMap((other) => between(n, index, other)))].sort(
      (a, b) => a - b,
    )
    return { kind: 'seen', cells, blamed: [index, ...seen], wall: -1, wanted: 0, got: 0 }
  }

  for (const wall of orthogonal(n, index)) {
    if (walls[wall] < 0) continue
    const around = orthogonal(n, wall).filter((j) => state.candles[j])
    if (around.length < walls[wall]) continue
    return {
      kind: 'count',
      cells: [wall, ...orthogonal(n, wall).filter((j) => isOpen(walls[j]))].sort((a, b) => a - b),
      blamed: [index, ...around],
      wall,
      wanted: walls[wall],
      got: around.length + 1,
    }
  }

  return null
}

/** The broken rule in one sentence. The lit group says where; this says what. */
export function describeClash(clash: Clash): string {
  if (clash.kind === 'seen') return 'This candle is standing in another candle’s light.'
  if (clash.wanted === 0) return 'This wall wants no candles at all.'
  const candles = clash.wanted === 1 ? 'candle' : 'candles'
  return `This wall wants ${clash.wanted} ${candles} and now has ${clash.got}.`
}

export function describeMove(
  prev: LightUpState,
  _next: LightUpState,
  action: LightUpAction,
): string {
  const where = `row ${rowOf(prev.n, action.index) + 1}, column ${colOf(prev.n, action.index) + 1}`
  return prev.candles[action.index]
    ? `Took the candle off ${where}`
    : `Stood a candle in ${where}`
}

/** Every action that would change something. Used by the tests to check `par`. */
export function legalMoves(state: LightUpState): LightUpAction[] {
  const out: LightUpAction[] = []
  for (let index = 0; index < state.walls.length; index++) {
    if (isOpen(state.walls[index])) out.push({ type: 'toggle', index })
  }
  return out
}

/* ============================================================
   Reasoning a board out

   Two steps, and they are the two a child says out loud.

   One: a wall settled by its number. Both ways round — a wall
   that already has its candles wants no more, so every other
   square beside it is out; and a wall with exactly as many
   squares left as it still needs has to use all of them.

   Two, and only once step one has run dry: a square still in
   the dark with one square left that could light it.

   Nothing here guesses. A board this finishes has exactly one
   answer, so uniqueness and "no guessing" are one check rather
   than two, and `countSolutions` below is held against it in
   the tests to keep that claim honest.
   ============================================================ */

/** What a board reasoned through gives back. */
export interface Deduction {
  /** Every square the one answer stands a candle on, ascending. */
  candles: number[]
  /** Passes over the two steps it took. This is the level's difficulty. */
  rounds: number
  /** Candles settled by a wall's number, and by a square left in the dark. */
  byWall: number
  byDark: number
}

export function solveByLogic(n: number, walls: number[]): Deduction | null {
  const size = n * n
  const B = beams(n, walls)
  /** -1 not known yet, 0 no candle here, 1 a candle. A wall holds nothing. */
  const mark: number[] = walls.map((value) => (isOpen(value) ? -1 : 0))
  const litBy = new Array<number>(size).fill(0)
  const numbered: number[] = []
  for (let i = 0; i < size; i++) if (walls[i] >= 0) numbered.push(i)
  const around = numbered.map((i) => orthogonal(n, i).filter((j) => isOpen(walls[j])))
  let broken = false
  let rounds = 0
  let byWall = 0
  let byDark = 0

  /** Stand a candle here: it lights its beam, and nothing in that beam holds one. */
  const light = (i: number) => {
    if (mark[i] === 1) return
    if (mark[i] === 0) {
      broken = true
      return
    }
    mark[i] = 1
    for (const j of B[i]) {
      litBy[j]++
      if (j === i) continue
      if (mark[j] === 1) {
        broken = true
        return
      }
      mark[j] = 0
    }
  }

  for (;;) {
    let moved = false

    for (let k = 0; k < numbered.length && !broken; k++) {
      const want = walls[numbered[k]]
      let on = 0
      const unknown: number[] = []
      for (const j of around[k]) {
        if (mark[j] === 1) on++
        else if (mark[j] === -1) unknown.push(j)
      }
      // More candles than the wall asked for, or too few squares left to reach
      // it: this board does not work out, and no amount of thinking will fix it.
      if (on > want || on + unknown.length < want) return null
      if (unknown.length === 0) continue
      if (on === want) {
        for (const j of unknown) mark[j] = 0
        moved = true
      } else if (on + unknown.length === want) {
        for (const j of unknown) {
          light(j)
          byWall++
        }
        moved = true
      }
    }
    if (broken) return null

    // Step two, and only once step one has run out, so `rounds` counts what a
    // child would really have had to do.
    if (!moved) {
      for (let i = 0; i < size && !broken; i++) {
        if (!isOpen(walls[i]) || litBy[i] > 0) continue
        const could = B[i].filter((j) => mark[j] !== 0)
        if (could.length === 0) return null
        if (could.length === 1) {
          light(could[0])
          byDark++
          moved = true
        }
      }
      if (broken) return null
    }

    if (!moved) break
    rounds++
  }

  const candles: number[] = []
  for (let i = 0; i < size; i++) {
    if (!isOpen(walls[i])) continue
    // A square nobody could settle, or one left in the dark: reasoning alone
    // did not finish this board, so it is not a board to hand a child.
    if (mark[i] === -1 || litBy[i] === 0) return null
    if (mark[i] === 1) candles.push(i)
  }
  return { candles, rounds, byWall, byDark }
}

/**
 * How many ways the candles can stand, counted no further than `cap`.
 *
 * Branching is **canonical**, and that is the whole of the difficulty. It
 * takes the first square still in the dark and asks which of the squares that
 * could light it holds the lowest-numbered candle in that group: after a
 * branch has been taken, that square holds no candle for the rest of the loop.
 * Without the rule, one arrangement is counted once for each candle reaching
 * that square — and a square lit from its row and its column at the same time
 * is perfectly legal, so the plain counter calls one board in five ambiguous
 * when it has exactly one answer.
 */
export function countSolutions(n: number, walls: number[], cap = 2): number {
  const size = n * n
  const B = beams(n, walls)
  const open: number[] = []
  for (let i = 0; i < size; i++) if (isOpen(walls[i])) open.push(i)
  const litBy = new Array<number>(size).fill(0)
  const candle = new Array<boolean>(size).fill(false)
  /** Ruled out by a branch already taken, for the rest of that branch's loop. */
  const barred = new Array<boolean>(size).fill(false)
  const numbered: number[] = []
  for (let i = 0; i < size; i++) if (walls[i] >= 0) numbered.push(i)
  const around = numbered.map((i) => orthogonal(n, i).filter((j) => isOpen(walls[j])))
  let found = 0

  /** Every numbered wall still reachable, or — at the end — exactly met. */
  const wallsOk = (final: boolean): boolean => {
    for (let k = 0; k < numbered.length; k++) {
      const want = walls[numbered[k]]
      let on = 0
      let spare = 0
      for (const j of around[k]) {
        if (candle[j]) on++
        else if (!barred[j] && litBy[j] === 0) spare++
      }
      if (on > want) return false
      if (final ? on !== want : on + spare < want) return false
    }
    return true
  }

  const walk = (): void => {
    if (found >= cap) return
    if (!wallsOk(false)) return
    let target = -1
    for (const i of open) {
      if (litBy[i] === 0) {
        target = i
        break
      }
    }
    if (target === -1) {
      if (wallsOk(true)) found++
      return
    }
    const could = B[target].filter((j) => litBy[j] === 0 && !barred[j]).sort((a, b) => a - b)
    const taken: number[] = []
    for (const j of could) {
      candle[j] = true
      for (const x of B[j]) litBy[x]++
      walk()
      candle[j] = false
      for (const x of B[j]) litBy[x]--
      barred[j] = true
      taken.push(j)
      if (found >= cap) break
    }
    for (const j of taken) barred[j] = false
  }

  walk()
  return found
}

/* ============================================================
   Making a board

   Backwards, from a finished one. Scatter the walls, find one
   legal illumination, write every wall's count from it, and then
   rub out as many of those numbers as the board will bear. A
   solution exists by construction from the third step onwards,
   so nothing later can hand a child a board with no answer.
   ============================================================ */

/** `count` squares chosen at random are walled off. Nothing is checked here. */
export function scatterWalls(rng: Rng, n: number, count: number): number[] {
  const walls = new Array<number>(n * n).fill(OPEN)
  const order = shuffled(
    rng,
    Array.from({ length: n * n }, (_, i) => i),
  )
  for (const i of order.slice(0, count)) walls[i] = PLAIN
  return walls
}

/**
 * One legal illumination of this scatter, or null when it has none.
 *
 * Take the square still in the dark that has the fewest ways to be lit, try
 * each square in its beam that is itself still dark, in a shuffled order, and
 * recurse. Only ever standing a candle on a dark square is what makes "no
 * candle stands in another candle's light" true by construction rather than
 * by a check afterwards.
 */
export function randomIllumination(
  rng: Rng,
  n: number,
  walls: number[],
  limit = 200_000,
): number[] | null {
  const size = n * n
  const B = beams(n, walls)
  const litBy = new Array<number>(size).fill(0)
  const candle = new Array<boolean>(size).fill(false)
  const open: number[] = []
  for (let i = 0; i < size; i++) if (isOpen(walls[i])) open.push(i)
  let nodes = 0

  const walk = (): boolean => {
    if (++nodes > limit) return false
    let best: number[] | null = null
    for (const i of open) {
      if (litBy[i] > 0) continue
      const could = B[i].filter((j) => litBy[j] === 0)
      if (could.length === 0) return false
      if (best === null || could.length < best.length) best = could
      if (could.length === 1) break
    }
    if (best === null) return true
    for (const j of shuffled(rng, best)) {
      if (litBy[j] !== 0) continue
      candle[j] = true
      for (const x of B[j]) litBy[x]++
      if (walk()) return true
      candle[j] = false
      for (const x of B[j]) litBy[x]--
    }
    return false
  }

  if (!walk()) return null
  const out: number[] = []
  for (let i = 0; i < size; i++) if (candle[i]) out.push(i)
  return out
}

/** Every wall takes the number of candles standing against it in this answer. */
export function numberWalls(n: number, walls: number[], answer: number[]): number[] {
  const standing = new Set(answer)
  return walls.map((value, i) =>
    isOpen(value) ? OPEN : orthogonal(n, i).filter((j) => standing.has(j)).length,
  )
}

/**
 * Rub numbers out, one at a time, for as long as the board still reasons all
 * the way through. What comes out is the smallest clue set the order of the
 * walk happened to allow — not the smallest there is, which is why the level
 * asks for a floor rather than a number.
 */
export function stripNumbers(rng: Rng, n: number, numbered: number[]): number[] | null {
  const walls = numbered.slice()
  if (solveByLogic(n, walls) === null) return null
  const spots = shuffled(
    rng,
    walls.map((value, i) => (value >= 0 ? i : -1)).filter((i) => i >= 0),
  )
  for (const i of spots) {
    const had = walls[i]
    walls[i] = PLAIN
    if (solveByLogic(n, walls) === null) walls[i] = had
  }
  return walls
}

/** True when this board is the board the level asked for. */
export function fits(config: LightUpConfig, walls: number[]): boolean {
  const { n, candles, minNumbers, minRounds, maxRounds } = config
  // A board stripped down to two numbers is all coverage and no counting, and
  // the count clue is the thing this puzzle came here to bring.
  if (walls.filter((value) => value >= 0).length < minNumbers) return false
  const reasoned = solveByLogic(n, walls)
  if (reasoned === null) return false
  // `par` is printed to a child as a fact, so the candle count is pinned per
  // seed rather than left to come out where it may.
  if (reasoned.candles.length !== candles) return false
  return reasoned.rounds >= minRounds && reasoned.rounds <= maxRounds
}

/** How many boards `deal` looks at before it settles for one. */
const ATTEMPTS = 400

/**
 * A board for this level.
 *
 * Measured over 200 seeds a level: 7.8%, 7.3% and 5.8% of attempts suit the
 * level outright, `deal` costs about a millisecond, and neither fallback has
 * ever been reached. They are there for a run of luck the tests have never
 * seen — the first board that reasoned out even though it missed the level's
 * shape, and then the fully-numbered board, which is solvable by construction
 * though not necessarily by reasoning alone.
 */
export function deal(rng: Rng, config: LightUpConfig): number[] {
  const { n, walls: wallCount } = config
  let reasoned: number[] | null = null
  let anyBoard: number[] | null = null

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const blank = scatterWalls(rng, n, wallCount)
    const answer = randomIllumination(rng, n, blank)
    if (answer === null) continue
    const full = numberWalls(n, blank, answer)
    anyBoard ??= full
    const board = stripNumbers(rng, n, full)
    if (board === null) continue
    if (fits(config, board)) return board
    reasoned ??= board
  }

  return reasoned ?? (anyBoard as number[])
}
