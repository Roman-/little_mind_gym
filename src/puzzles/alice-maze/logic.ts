import type { PuzzleLevel, Rng } from '../../lib/types'
import { randInt, shuffled } from '../../lib/rng'

/**
 * A maze where the step changes as you walk it — Robert Abbott's Alice maze,
 * with a kangaroo on it.
 *
 * The kangaroo stands on a square and carries a number: how many squares it
 * covers in one hop. A hop goes in a straight line, always exactly that many
 * squares, and only in a direction the square underneath it allows — the
 * arrows on a square say the ways the kangaroo may set off from it. Some
 * squares carry a plus or a minus: land on one and the number goes up or down
 * by one from then on. Run the number down to nothing and the kangaroo is
 * stuck.
 *
 * Six things are worth reading twice.
 *
 * **The position is the square and the number together.** The same square is a
 * different place at a different hop: three arrows and a hop of two reach three
 * squares, and the same three arrows with a hop of three reach three others. So
 * the graph the puzzle is really played on is (square, hop), and `keyOf` says
 * exactly that. It is small — a live position needs a hop between 1 and n - 1,
 * because nothing on an n-wide board is n squares away, so a six-wide board has
 * at most 36 * 5 = 180 live positions — which is why every deal can be
 * certified as it is dealt.
 *
 * **A tap names the square to land on, not a direction.** `canHop` is the whole
 * rule book: hand it a square and it says whether the kangaroo may finish this
 * hop there. Counting the hop out along four lines is the thinking, so the
 * board never marks the squares that would take it.
 *
 * **A hop that leaves the kangaroo nothing is still a hop.** Landing on a minus
 * with a hop of one takes the number to nothing; landing on a plus with the
 * number already as long as the board takes it past every square there is.
 * Both are legal moves and both end the walk, which is `failure`'s job — the
 * same dead end that frog-leap has when no frog can move. A move the rules stopped
 * would be a rule a child cannot see on the board.
 *
 * **And a walk can end while the hops go on.** A kangaroo with arrows to follow
 * and a number to spend can still be somewhere the ring can never be reached
 * from again, and the board shows nothing to say so. That is a dead end too, so
 * `failure` searches for it rather than only counting the hops on offer, and
 * `Grade.deadEnds` counts the two kinds together — which is what lets the first
 * level promise that nothing on its board can strand the kangaroo.
 *
 * **Three taps break a rule rather than doing nothing**, so `refusalOf` sits
 * beside `canHop`: a square on neither line, a square the arrows will not let
 * the kangaroo set off towards, and a square the right way off but the wrong
 * number of squares away. Only one tap changes nothing — the square the
 * kangaroo is already standing on — and that one is a dead control.
 *
 * **The deal certifies itself with these very rules.** `gradeOf` searches with
 * `reduce`, so the generator and the game cannot drift apart: a maze is kept
 * only when the shortest route to the ring is exactly the level's `par` and
 * there is exactly one route that long. See `dealMaze`.
 */

/** Up, right, down, left — clockwise from the top. */
export type Dir = 0 | 1 | 2 | 3

/** In the order they are numbered, so `DIRS[d]` is always direction `d`. */
export const DIRS: Dir[] = [0, 1, 2, 3]

/** One word a direction, for the labels and the move tape. */
export const DIR_WORDS = ['up', 'right', 'down', 'left'] as const

const DR: readonly number[] = [-1, 0, 1, 0]
const DC: readonly number[] = [0, 1, 0, -1]

export const rowOf = (n: number, cell: number): number => Math.floor(cell / n)
export const colOf = (n: number, cell: number): number => cell % n

/** Where a square is, in the words the labels and the status line both use. */
export const spotOf = (n: number, cell: number): string =>
  `row ${rowOf(n, cell) + 1}, column ${colOf(n, cell) + 1}`

/**
 * The maze itself. It never changes while a level is played, so every position
 * of one level shares this one object — which is also the token the board hangs
 * its keyboard cursor on.
 */
export interface Maze {
  /** Squares to a side. The board is always square. */
  n: number
  /**
   * One bitmask a square: bit `d` set where the kangaroo may set off in
   * direction `d`. The ring carries none — it is where the walk ends.
   */
  arrows: number[]
  /** One entry a square: -1, 0 or +1, what landing on it does to the hop. */
  marks: number[]
  /** The square the kangaroo has to finish a hop on. */
  home: number
  /** The square it starts from, and the number it starts with. */
  start: number
  hop: number
}

export interface AliceState {
  maze: Maze
  /** The square the kangaroo stands on. */
  at: number
  /** How many squares its next hop covers. */
  hop: number
  /** Every square it has stood on, in order. The first is where it started. */
  trail: number[]
}

/** One hop, and one move a player would count. Which way it goes is settled by `to`. */
export type AliceAction = { type: 'hop'; to: number }

/** Shown by the shell when the number has run out. */
export const STUCK_NO_HOP = 'The hop has run down to nothing. The kangaroo is stuck.'
/** Shown by the shell when there is a number left but nowhere to spend it. */
export const STUCK_NOWHERE = 'There is nowhere the kangaroo can hop from here. It is stuck.'
/** Shown by the shell when the hops go on but no run of them reaches the ring. */
export const STUCK_NO_HOME = 'The kangaroo can still hop. It can no longer reach the ring.'

/** True when the kangaroo may set off from `cell` going `dir`. */
export const allows = (maze: Maze, cell: number, dir: Dir): boolean =>
  (maze.arrows[cell] & (1 << dir)) !== 0

/**
 * The square exactly `hop` squares from `from` in that direction, or -1 where
 * the line runs off the board. A hop of nothing reaches nothing.
 *
 * It takes the board's width rather than the board, because the generator walks
 * a maze into being and has to ask this question before there is a maze to ask
 * it about. One rule about where a hop lands, and only one.
 */
export function stepFrom(n: number, from: number, dir: Dir, hop: number): number {
  if (!Number.isInteger(hop) || hop < 1) return -1
  const r = rowOf(n, from) + DR[dir] * hop
  const c = colOf(n, from) + DC[dir] * hop
  if (r < 0 || r >= n || c < 0 || c >= n) return -1
  return r * n + c
}

/** The same question, asked of a maze. */
export const landingOf = (maze: Maze, from: number, dir: Dir, hop: number): number =>
  stepFrom(maze.n, from, dir, hop)

/**
 * The direction `cell` lies in from where the kangaroo stands, or -1 when it
 * shares neither the row nor the column. It says nothing about whether the hop
 * may go there; that is `canHop`'s job.
 */
export function lineTo(state: AliceState, cell: number): Dir | -1 {
  const { n } = state.maze
  if (!Number.isInteger(cell) || cell < 0 || cell >= n * n) return -1
  const dr = rowOf(n, cell) - rowOf(n, state.at)
  const dc = colOf(n, cell) - colOf(n, state.at)
  if (dr === 0 && dc === 0) return -1
  if (dr !== 0 && dc !== 0) return -1
  if (dc === 0) return dr < 0 ? 0 : 2
  return dc > 0 ? 1 : 3
}

/** How many squares away `cell` is along a straight line, or -1 when it is not on one. */
export function stepsTo(state: AliceState, cell: number): number {
  const { n } = state.maze
  if (lineTo(state, cell) === -1) return -1
  return (
    Math.abs(rowOf(n, cell) - rowOf(n, state.at)) + Math.abs(colOf(n, cell) - colOf(n, state.at))
  )
}

/** True when the kangaroo may finish this hop on `cell`. */
export function canHop(state: AliceState, cell: number): boolean {
  if (state.hop < 1) return false
  const dir = lineTo(state, cell)
  if (dir === -1) return false
  if (!allows(state.maze, state.at, dir)) return false
  return stepsTo(state, cell) === state.hop
}

/** Every square this hop can reach, in the order the four ways are numbered. */
export function landingsOf(state: AliceState): number[] {
  const out: number[] = []
  for (const dir of DIRS) {
    if (!allows(state.maze, state.at, dir)) continue
    const to = landingOf(state.maze, state.at, dir, state.hop)
    if (to >= 0) out.push(to)
  }
  return out
}

/**
 * Two branches hand back the state that came in: an action this puzzle does not
 * have, and a square the hop cannot finish on. The second is a rule broken
 * rather than nothing happening — see `refusalOf` — except on the one square
 * the kangaroo is already standing on, which is nothing happening.
 */
export function reduce(state: AliceState, action: AliceAction): AliceState {
  if (action?.type !== 'hop') return state
  const { to } = action
  if (!canHop(state, to)) return state
  return {
    ...state,
    at: to,
    hop: state.hop + state.maze.marks[to],
    trail: [...state.trail, to],
  }
}

/** The kangaroo has finished a hop on the ring. Passing over it is not landing on it. */
export function isSolved(state: AliceState): boolean {
  return state.at === state.maze.home
}

/**
 * Every position the kangaroo can reach from here, and which of them a route to
 * the ring still runs through.
 *
 * Two floods over the same graph. The first goes forwards, taking the hops
 * `landingsOf` offers and `reduce` takes, and writes down where each one came
 * from. The second runs backwards along those very hops from every position
 * that can step onto the ring, so `good` ends up holding exactly the positions
 * a route home still passes through — and `seen` minus `good` is every position
 * the kangaroo cannot get home from.
 *
 * It is the one place either question is answered, so `failure` and `gradeOf`
 * cannot come to disagree about what a dead end is: one asks about the position
 * a child is standing on and the other counts them over a whole maze, and both
 * ask here. It stays cheap because the graph does: a live position is a square
 * and a number between 1 and n - 1, so a six-wide board has at most 180 of
 * them, and the stuck ones it can reach on top.
 */
function surveyOf(start: AliceState): { seen: Map<string, AliceState>; good: Set<string> } {
  const seen = new Map([[keyOf(start), start]])
  /** Child key to the keys of every position a hop reaches it from. */
  const from = new Map<string, string[]>()
  /** The positions on the ring themselves, which is where the flood back begins. */
  const onto: string[] = []
  const stack = [start]
  while (stack.length > 0) {
    const here = stack.pop() as AliceState
    const key = keyOf(here)
    if (isSolved(here)) onto.push(key)
    for (const to of landingsOf(here)) {
      const child = reduce(here, { type: 'hop', to })
      const k = keyOf(child)
      const back = from.get(k)
      if (back === undefined) from.set(k, [key])
      else back.push(key)
      if (seen.has(k)) continue
      seen.set(k, child)
      stack.push(child)
    }
  }

  const good = new Set(onto)
  const walking = [...onto]
  while (walking.length > 0) {
    const k = walking.pop() as string
    for (const before of from.get(k) ?? []) {
      if (good.has(before)) continue
      good.add(before)
      walking.push(before)
    }
  }
  return { seen, good }
}

/** True while some run of hops from here still finishes on the ring. */
const reachesRing = (state: AliceState): boolean => surveyOf(state).good.has(keyOf(state))

/**
 * The number can run down to nothing, and it can grow past every square on the
 * board; a square's arrows can also point only off the edge. All three leave
 * the kangaroo with nowhere to go at all.
 *
 * A fourth dead end has hops left and is just as final: a position the ring can
 * no longer be reached from, however the kangaroo hops on. Nothing on the board
 * says so — the arrows are still there and the number is still on the tile —
 * so a board that only answered the first three left a child hopping around a
 * region they had already lost, told nothing. It is a whole search rather than
 * a look at one square, and it is worth its cost twice over: it is what makes
 * "step back" arrive when the wrong turn was taken rather than several hops
 * later, and it is what a level that promises it cannot strand the kangaroo is
 * measured against. See `Grade.deadEnds`.
 */
export function failure(state: AliceState): string | null {
  if (isSolved(state)) return null
  if (landingsOf(state).length === 0) return state.hop < 1 ? STUCK_NO_HOP : STUCK_NOWHERE
  return reachesRing(state) ? null : STUCK_NO_HOME
}

/**
 * A tap the rules will not take, and one sentence saying what stopped it. Null
 * where the hop is legal, and null on the square the kangaroo is standing on —
 * that tap changes nothing, so it is a dead control rather than a refusal.
 *
 * The kangaroo really lands where the tap put it, and the board takes it back:
 * a tap names a square to stand on, so there is an honest position to draw, and
 * seeing the hop overshoot is how a child learns to count it. The one tap it
 * cannot honestly pretend is a square on neither line — no straight hop reaches
 * it at all — so nothing moves for that one and the square shakes instead.
 *
 * The three sentences are checked in the order a child needs them. A closed
 * direction closes the whole line, so it is answered before the distance: a
 * child who is told the number is wrong would go on counting a line the arrows
 * had already shut.
 */
export function refusalOf(
  state: AliceState,
  cell: number,
): { pretend: AliceState; message: string; where: string } | null {
  const { n } = state.maze
  if (!Number.isInteger(cell) || cell < 0 || cell >= n * n) return null
  if (cell === state.at) return null
  if (canHop(state, cell)) return null

  const where = String(cell)
  const dir = lineTo(state, cell)
  if (dir === -1) {
    return {
      pretend: state,
      message: 'The kangaroo only hops straight up, down, left or right.',
      where,
    }
  }

  const pretend: AliceState = { ...state, at: cell, trail: [...state.trail, cell] }
  if (!allows(state.maze, state.at, dir)) {
    return { pretend, message: 'The kangaroo cannot set off that way from this square.', where }
  }
  const steps = stepsTo(state, cell)
  return {
    pretend,
    message: `That square is ${steps} ${steps === 1 ? 'square' : 'squares'} away, and the kangaroo hops ${state.hop}.`,
    where,
  }
}

/** What the move tape and a screen reader hear about the hop just made. */
export function describeMove(prev: AliceState, _next: AliceState, action: AliceAction): string {
  if (action?.type !== 'hop') return 'Nothing moved'
  const { to } = action
  if (!canHop(prev, to)) return 'Nothing moved'
  const dir = lineTo(prev, to) as Dir
  const mark = prev.maze.marks[to]
  const hop = prev.hop + mark
  const change = mark === 0 ? '' : mark > 0 ? `, and the hop grew to ${hop}` : `, and the hop shrank to ${hop}`
  return `Hopped ${DIR_WORDS[dir]} to ${spotOf(prev.maze.n, to)}${change}`
}

/**
 * Every hop worth trying: one for each square on the board, whether or not the
 * rules take it. The search offers all of them and lets `reduce` filter, so a
 * bug shared between a move list and the rule cannot make the search agree with
 * itself.
 */
export const hopsOf = (state: AliceState): AliceAction[] =>
  Array.from({ length: state.maze.n * state.maze.n }, (_, to) => ({ type: 'hop', to }))

/**
 * Two positions with the kangaroo on the same square carrying the same number
 * are the same position. The trail is a record of how it got there and changes
 * nothing about what it can do next, so it is not part of the key.
 */
export const keyOf = (state: AliceState): string => `${state.at}|${state.hop}`

/**
 * The position the card draws, as squares along one row: the kangaroo sets off
 * from `from` with a hop of `hop`, lands on `over`, where a plus takes the hop
 * to `hop + 1`, and is in the air on its way to `at`. The ring is `hop + 1`
 * squares beyond that, so the picture is a position with one hop still to make.
 *
 * It lives here rather than in `glyphs.tsx` because it is a position, and a
 * position is the rules' business: `logic.test.ts` plays it out on a real maze,
 * so the card cannot come to mean something the rules do not allow.
 */
export const CARD = { squares: 6, from: 0, over: 1, at: 3, ring: 5, hop: 1 } as const

/** The opening position of a maze. */
export const stateOf = (maze: Maze): AliceState => ({
  maze,
  at: maze.start,
  hop: maze.hop,
  trail: [maze.start],
})

/* ==================================================================
   Dealing a maze

   Every deal is certified against the rules above before it is
   handed to anybody, so a level's `par` is true for every seed.
   ================================================================== */

/** What a level asks of its mazes. */
export interface AliceConfig {
  /** Squares to a side. */
  n: number
  /** Hops in the shortest route. A deal is kept only when this is exact. */
  par: number
  /** The number the kangaroo starts with. */
  hop: number
  /** The most arrows any one square may carry. */
  arrows: number
  /** The most squares that lengthen and shorten the hop. */
  plus: number
  minus: number
  /** The character every deal of this level has to have. See `Grade`. */
  needs: {
    deadEnds: { least: number; most: number }
    forks: { least: number; most: number }
    /** Squares the kangaroo can reach at all. */
    squares: number
    /** Landings on a square that changes the number. */
    changes: number
    /** Different numbers the route passes through, the starting one included. */
    numbers: number
  }
}

/** Everything a deal is judged on, all of it searched rather than promised. */
export interface Grade {
  /** Hops in the shortest route to the ring, or -1 where there is none. */
  hops: number
  /** How many different shortest routes there are. One is what a level asks for. */
  routes: number
  /**
   * Reachable positions a child has to step back from: every position `failure`
   * names, whether the kangaroo has no hop left at all or can go on hopping and
   * can no longer get home. A level that promises nothing on its board can
   * strand the kangaroo asks for none of either.
   */
  deadEnds: number
  /** Squares it can stand on at all. */
  squares: number
  /** Steps of the shortest route where more than one hop is legal. */
  forks: number
  /** Landings on that route that change the number. */
  changes: number
  /** Different numbers that route passes through. */
  numbers: number
  /**
   * Reachable positions in all, the stuck ones counted too. A live position
   * needs a number between 1 and n - 1, so a six-wide board has at most
   * 36 * 5 = 180 of those, and the stuck ones it can reach on top.
   */
  positions: number
}

/**
 * Random walks tried before a deal gives up. There is no board to fall back on:
 * a maze that has not been certified is a maze whose `par` is a guess and whose
 * one answer might be two, so this throws rather than shipping one.
 *
 * The cap is far above what a deal needs, and `logic.test.ts` is the recipe for
 * saying so: it deals every level on 140 seeds — the 40 the per-deal promises
 * are held against, and 100 more in a sweep of its own — and none of the 420
 * runs out of draws. Counted and timed on the machine this was written on, the
 * hungriest of the 420 took 3137 draws and 51ms, on the four-wide board at seed
 * 1466209, and the average was 4.8ms. The four-wide board is the hungriest
 * because it is the one that has to come out with no dead end anywhere on it;
 * over 3000 deals of it the median was 332 draws and the ninety-ninth
 * percentile 2069, and the very worst of the 3000 was 5117 — a quarter of this
 * cap, on a tail that reaches it on no seed anyone will ever see.
 */
export const MAX_DRAWS = 20000

/** How many hops a search will follow before it decides there is no route. */
const MAX_DEPTH = 200

function popcount(bits: number): number {
  let n = 0
  for (let b = bits; b !== 0; b >>= 1) n += b & 1
  return n
}

/**
 * One candidate maze, or null where the walk painted itself into a corner.
 *
 * It is built forwards along its own answer: the kangaroo is put on a random
 * square and walked `par` hops, and every hop writes down what it needed — an
 * arrow on the square it set off from, and a plus, a minus or nothing on the
 * square it landed on. The square it reaches last becomes the ring. Then every
 * square that was not written on gets arrows and marks of its own, which is
 * what turns one route into a maze.
 *
 * The walk never stands on the same (square, number) twice, so the route it
 * writes down really is `par` hops long rather than a shorter route with a loop
 * in it. Whether anything shorter exists is `gradeOf`'s question.
 */
function walkOne(cfg: AliceConfig, rng: Rng): Maze | null {
  const { n, par } = cfg
  const cells = n * n
  const longest = n - 1
  const arrows = new Array<number>(cells).fill(0)
  const marks = new Array<number | null>(cells).fill(null)

  const start = randInt(rng, cells)
  marks[start] = 0
  let cell = start
  let hop = cfg.hop
  let plus = cfg.plus
  let minus = cfg.minus
  const stood = new Set([`${cell}|${hop}`])
  const walked = new Set([start])

  for (let step = 0; step < par; step++) {
    const last = step === par - 1
    let moved = false
    for (const dir of shuffled(rng, DIRS)) {
      const taken = (arrows[cell] & (1 << dir)) !== 0
      if (!taken && popcount(arrows[cell]) >= cfg.arrows) continue
      const to = stepFrom(n, cell, dir, hop)
      if (to < 0 || to === start) continue

      if (last) {
        // The ring is a square the walk has not used, so it can carry no arrows
        // and no mark: it is where the walk ends rather than a place it passed.
        if (walked.has(to) || marks[to] !== null) continue
        marks[to] = 0
        arrows[cell] |= 1 << dir
        cell = to
        moved = true
        break
      }

      // A square the walk has already landed on keeps the mark it was given.
      const written = marks[to]
      const choices: number[] = []
      if (written !== null) {
        if (hop + written >= 1 && hop + written <= longest) choices.push(written)
      } else {
        choices.push(0)
        if (plus > 0 && hop + 1 <= longest) choices.push(1)
        if (minus > 0 && hop - 1 >= 1) choices.push(-1)
      }
      if (choices.length === 0) continue

      const mark = choices[randInt(rng, choices.length)]
      const next = hop + mark
      if (stood.has(`${to}|${next}`)) continue

      if (written === null) {
        marks[to] = mark
        if (mark === 1) plus--
        if (mark === -1) minus--
      }
      arrows[cell] |= 1 << dir
      cell = to
      hop = next
      stood.add(`${to}|${next}`)
      walked.add(to)
      moved = true
      break
    }
    if (!moved) return null
  }

  // The route itself has to meet a plus and a minus, so the two hints that name
  // them are true of the answer and not only of some corner of the board.
  if (plus === cfg.plus || minus === cfg.minus) return null

  const home = cell
  for (let i = 0; i < cells; i++) {
    if (marks[i] === null) {
      const roll = rng()
      marks[i] = roll < 0.18 && plus > 0 ? 1 : roll < 0.36 && minus > 0 ? -1 : 0
      if (marks[i] === 1) plus--
      if (marks[i] === -1) minus--
    }
    if (i === home) continue
    const want = 1 + randInt(rng, cfg.arrows)
    for (const dir of shuffled(rng, DIRS)) {
      if (popcount(arrows[i]) >= want) break
      // Only ways a hop could really set off. A square in the top row wearing
      // an "up" arrow is a signpost pointing off the board: no number the
      // kangaroo could be carrying lands anywhere along it, so the arrow is a
      // mark a child can never follow — decoration in the clothes of
      // information, and worst of all on the first board, which is dealt so
      // that an eight-year-old cannot get it wrong. Every square has at least
      // two ways that do land, so this never leaves one bare, and the route's
      // own arrows all land by construction.
      if (stepFrom(n, i, dir, 1) < 0) continue
      arrows[i] |= 1 << dir
    }
  }
  arrows[home] = 0
  marks[home] = 0

  return { n, arrows, marks: marks as number[], home, start, hop: cfg.hop }
}

/** Can the kangaroo reach the ring in exactly this many more hops? */
function reachesIn(state: AliceState, hops: number): boolean {
  let layer = new Map([[keyOf(state), state]])
  for (let step = 0; step < hops; step++) {
    const next = new Map<string, AliceState>()
    for (const here of layer.values()) {
      for (const to of landingsOf(here)) {
        const child = reduce(here, { type: 'hop', to })
        if (isSolved(child)) {
          if (step === hops - 1) return true
          continue
        }
        next.set(keyOf(child), child)
      }
    }
    layer = next
    if (layer.size === 0) return false
  }
  return false
}

/**
 * Everything a maze is judged on, searched over the very rules the game plays
 * by: `landingsOf` offers the hops and `reduce` takes them, so a maze that
 * certifies here cannot behave differently under a finger.
 *
 * The shortest route and how many there are come out of one layered search: a
 * layer holds every position at the same number of hops from the start, and
 * each one carries how many shortest routes reach it. The first layer that can
 * step onto the ring settles both numbers at once.
 */
export function gradeOf(maze: Maze): Grade {
  const start = stateOf(maze)
  const depth = new Map([[keyOf(start), 0]])
  const routesTo = new Map([[keyOf(start), 1]])
  let layer = [start]
  let hops = -1
  let routes = 0

  for (let step = 0; step < MAX_DEPTH && layer.length > 0; step++) {
    const arriving = new Map<string, AliceState>()
    const counts = new Map<string, number>()
    let onto = 0
    for (const here of layer) {
      const ways = routesTo.get(keyOf(here)) as number
      for (const to of landingsOf(here)) {
        const child = reduce(here, { type: 'hop', to })
        if (isSolved(child)) {
          onto += ways
          continue
        }
        const k = keyOf(child)
        if (depth.has(k)) continue
        arriving.set(k, child)
        counts.set(k, (counts.get(k) ?? 0) + ways)
      }
    }
    if (onto > 0) {
      hops = step + 1
      routes = onto
      break
    }
    for (const [k, ways] of counts) {
      depth.set(k, step + 1)
      routesTo.set(k, ways)
    }
    layer = [...arriving.values()]
  }

  // Where the kangaroo can get to, and where it can still get home from. Both
  // come out of `surveyOf`, so a position this counts as a dead end is exactly
  // a position `failure` puts a sentence under.
  const { seen, good } = surveyOf(start)
  const squares = new Set<number>()
  let deadEnds = 0
  for (const [key, here] of seen) {
    squares.add(here.at)
    if (!isSolved(here) && !good.has(key)) deadEnds++
  }

  let forks = 0
  let changes = 0
  const numbers = new Set([start.hop])
  if (routes === 1 && hops > 0) {
    // One route, so exactly one of the hops on offer at each step is on it: the
    // one that lands a step closer and can still reach the ring in what is
    // left. The last step is the one onto the ring, and it is a step where the
    // kangaroo may have had a choice like any other.
    let here = start
    for (let step = 0; step < hops; step++) {
      const children = landingsOf(here).map((to) => reduce(here, { type: 'hop', to }))
      if (children.length > 1) forks++
      if (step === hops - 1) break
      const next = children.find(
        (child) =>
          !isSolved(child) &&
          depth.get(keyOf(child)) === step + 1 &&
          reachesIn(child, hops - step - 1),
      )
      if (next === undefined) break
      if (next.hop !== here.hop) changes++
      numbers.add(next.hop)
      here = next
    }
  }

  return {
    hops,
    routes,
    deadEnds,
    squares: squares.size,
    forks,
    changes,
    numbers: numbers.size,
    positions: seen.size,
  }
}

/** True when a graded maze is one this level will hand to a child. */
export function accepts(cfg: AliceConfig, grade: Grade): boolean {
  const { needs } = cfg
  return (
    grade.hops === cfg.par &&
    grade.routes === 1 &&
    grade.deadEnds >= needs.deadEnds.least &&
    grade.deadEnds <= needs.deadEnds.most &&
    grade.forks >= needs.forks.least &&
    grade.forks <= needs.forks.most &&
    grade.squares >= needs.squares &&
    grade.changes >= needs.changes &&
    grade.numbers >= needs.numbers
  )
}

/**
 * A maze that really is `par` hops from the ring, with exactly one route that
 * long, and with the character its level asks for.
 *
 * There is no last-resort board. A maze that has not been through `accepts` is
 * a maze whose `par` is a guess and whose one answer might be two, and handing
 * one out would give away the only thing this generator exists to promise — so
 * the loop redraws, and when it runs out of draws it throws.
 */
export function dealMaze(cfg: AliceConfig, rng: Rng): Maze {
  for (let draw = 0; draw < MAX_DRAWS; draw++) {
    const maze = walkOne(cfg, rng)
    if (maze === null) continue
    if (accepts(cfg, gradeOf(maze))) return maze
  }
  throw new Error(`no ${cfg.n} by ${cfg.n} maze came out at ${cfg.par} hops in ${MAX_DRAWS} draws`)
}

export function init(level: PuzzleLevel<AliceConfig>, rng: Rng): AliceState {
  return stateOf(dealMaze(level.config, rng))
}
