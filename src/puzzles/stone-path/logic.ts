import { shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'

/**
 * Stones lying on a board, and one walk that has to pick up every one of them.
 *
 * You stand on a square. From there you go in a straight line — up, down, left
 * or right — to the first stone along that line, and you pick that stone up as
 * you land on it. Empty squares do not stop you, and neither do the squares
 * you have already cleared. The one rule to hold in a head is that you may not
 * turn round: from where you stand you can go straight on, or turn left, or
 * turn right, but never back the way you came.
 *
 * Four things are worth reading twice.
 *
 * **A move is a direction, not a stone.** `stepTarget` is the whole rule book:
 * hand it a direction and it hands back the square you land on, or -1 where
 * the rules will not take you. The board turns a tap on a stone into the
 * direction that stone lies in, so `reduce`, the move tape, the arrow keys and
 * the test all read one walk rather than four that could drift apart.
 *
 * **Every move takes exactly one stone**, so `par` is the stone count less
 * one — the stone you start on is picked up as the level opens. There is no
 * shorter way and no longer one, which is why `par` here is a fact about the
 * board rather than a number to be searched for. `logic.test.ts` proves it
 * both ways round anyway.
 *
 * **A wrong turn jams the board**, and `failure` says so. Stones are used up
 * as they are taken, so a route that eats the wrong stone can leave the rest
 * of them out of reach for good. That dead end is the puzzle; the shell offers
 * the step back out of it. The three boards this puzzle ships were searched
 * for offline and graded on how far a wrong turn runs before it jams — see
 * `index.ts`.
 *
 * **Three taps break a rule rather than doing nothing**, so `refusalOf` sits
 * beside `stepTarget` and hands the board the sentence for each: a stone
 * behind you, a stone with another one in the way, and a stone that shares
 * neither your row nor your column. None of them is the contract's "changes
 * nothing" — each is a rule this puzzle states in its own How to play.
 */

/** Up, right, down, left — clockwise from the top. */
export type Dir = 0 | 1 | 2 | 3

/** In the order they are numbered, so `DIRS[d]` is always direction `d`. */
export const DIRS: Dir[] = [0, 1, 2, 3]

/** One word a direction, for the labels and the move tape. */
export const DIR_WORDS = ['up', 'right', 'down', 'left'] as const

const DR: readonly number[] = [-1, 0, 1, 0]
const DC: readonly number[] = [0, 1, 0, -1]

/** The way you came in, which is the one way you may not go. */
export const back = (dir: Dir): Dir => ((dir + 2) % 4) as Dir

export interface StoneConfig {
  /**
   * The board, one line a row and one character a square: `o` for a stone,
   * `S` for the stone you start on, `.` for a square with nothing on it. The
   * start is a stone like any other — it is simply the first one picked up.
   */
  picture: string[]
}

export interface StoneState {
  /** Squares to a side. The board is always square. */
  n: number
  /** One entry a square, row-major: true where a stone still lies. */
  stones: boolean[]
  /** The square you stand on. Its stone was picked up as you landed on it. */
  at: number
  /** The way you were going when you arrived, or -1 on the square you started from. */
  heading: Dir | -1
  /** Every square you have stood on, in order. The first is where you started. */
  trail: number[]
}

/** One walk, and one move a player would count. Which stone that reaches is forced. */
export type StoneAction = { type: 'walk'; dir: Dir }

/** Shown by the shell when the walk runs out of stones it can reach. */
export const STUCK = 'You cannot reach any stone from here. The path is stuck.'

export const rowOf = (n: number, cell: number): number => Math.floor(cell / n)
export const colOf = (n: number, cell: number): number => cell % n

/** Where a square is, in the words the labels and the status line both use. */
export const spotOf = (n: number, cell: number): string =>
  `row ${rowOf(n, cell) + 1}, column ${colOf(n, cell) + 1}`

/** How many stones are still lying on the board. */
export const stonesLeft = (state: StoneState): number =>
  state.stones.reduce((count, there) => (there ? count + 1 : count), 0)

/**
 * The first stone from `cell` in that direction, or -1 where the line runs off
 * the board without meeting one. Empty squares are stepped straight over, and
 * a square whose stone has been taken is an empty square.
 */
export function nextStone(state: StoneState, cell: number, dir: Dir): number {
  let r = rowOf(state.n, cell) + DR[dir]
  let c = colOf(state.n, cell) + DC[dir]
  while (r >= 0 && r < state.n && c >= 0 && c < state.n) {
    const square = r * state.n + c
    if (state.stones[square]) return square
    r += DR[dir]
    c += DC[dir]
  }
  return -1
}

/**
 * The square a walk that way lands on, or -1 where the rules will not take it:
 * a direction that is not one of the four, the way you came in, or a line with
 * no stone left along it.
 */
export function stepTarget(state: StoneState, dir: Dir): number {
  if (dir !== 0 && dir !== 1 && dir !== 2 && dir !== 3) return -1
  if (state.heading !== -1 && dir === back(state.heading)) return -1
  return nextStone(state, state.at, dir)
}

/** True when that direction is a move. */
export const canWalk = (state: StoneState, dir: Dir): boolean => stepTarget(state, dir) >= 0

/**
 * The direction `cell` lies in from where you stand, or -1 when it shares
 * neither your row nor your column. It says nothing about whether you may go
 * there; that is `stepTarget`'s job.
 */
export function lineTo(state: StoneState, cell: number): Dir | -1 {
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.n * state.n) return -1
  const dr = rowOf(state.n, cell) - rowOf(state.n, state.at)
  const dc = colOf(state.n, cell) - colOf(state.n, state.at)
  if (dr === 0 && dc === 0) return -1
  if (dr !== 0 && dc !== 0) return -1
  if (dc === 0) return dr < 0 ? 0 : 2
  return dc > 0 ? 1 : 3
}

export function init(level: PuzzleLevel<StoneConfig>): StoneState {
  return parseBoard(level.config.picture)
}

/**
 * Two branches hand back the state that came in: an action this puzzle does
 * not have, and a direction the rules will not walk. Both are rules broken
 * rather than nothing happening, which is why the board answers a tap on one
 * of them with `refusalOf` instead of a dead control.
 */
export function reduce(state: StoneState, action: StoneAction): StoneState {
  if (action?.type !== 'walk') return state
  const to = stepTarget(state, action.dir)
  if (to < 0) return state
  const stones = state.stones.slice()
  stones[to] = false
  return { ...state, stones, at: to, heading: action.dir, trail: [...state.trail, to] }
}

/** Every stone picked up. The board is empty and the walk is over. */
export function isSolved(state: StoneState): boolean {
  return !state.stones.some(Boolean)
}

/**
 * Stones are used up as they are taken, so a walk can strand itself with
 * stones still on the board. A board with every stone taken is solved rather
 * than stuck, which is why this asks `isSolved` first.
 */
export function failure(state: StoneState): string | null {
  if (isSolved(state)) return null
  return DIRS.some((dir) => canWalk(state, dir)) ? null : STUCK
}

/**
 * True while every stone still on the board can still be picked up from here.
 *
 * Stones are used up as they are taken, so the walk never comes round to a
 * square it has left in the same state twice and the shared search sees a
 * handful of positions — sixteen at the widest of the three boards. It is
 * where Step back goes once the walk is stuck: a walk can strand a stone
 * several steps before it runs out of stones to step to, and one step back
 * from `STUCK` is often a walk that strands the same stone again. See
 * `canStillWin` in src/lib/types.ts.
 *
 * Nothing on the board may ask this. A stone marked "this one still works" is
 * the walk laid out in advance.
 */
export function canStillWin(state: StoneState): boolean {
  return (
    shortestSolution<StoneState, StoneAction>({
      start: state,
      moves: walksOf,
      apply: reduce,
      key: keyOf,
      solved: isSolved,
    }) !== null
  )
}

/**
 * A tap on a stone the rules will not walk to, and one sentence saying what
 * stopped it. Null where the stone is a legal move, and null where there is no
 * stone on that square at all — an empty square is not a control.
 *
 * Nothing pretends to move here. The tap names a stone rather than a place to
 * stand, so there is no position for the board to draw and take back: the
 * stone takes the tap, refuses it where it lies, and the sentence says the
 * rest, exactly as a frog strains where it stands.
 *
 * The three sentences are checked in the order a child needs them. Going back
 * the way you came is the rule that has to be held in a head, so it is
 * answered first even where the stone behind you has another one in front
 * of it.
 */
export function refusalOf(
  state: StoneState,
  cell: number,
): { pretend: StoneState; message: string; where: string } | null {
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.n * state.n) return null
  if (!state.stones[cell]) return null
  const dir = lineTo(state, cell)
  const say = (message: string) => ({ pretend: state, message, where: String(cell) })
  if (dir === -1) return say('You can only go straight up, down, left or right.')
  if (state.heading !== -1 && dir === back(state.heading)) {
    return say('You cannot go back the way you came.')
  }
  if (nextStone(state, state.at, dir) !== cell) return say('There is another stone in the way.')
  return null
}

/** What the move tape and a screen reader hear about the walk just made. */
export function describeMove(prev: StoneState, _next: StoneState, action: StoneAction): string {
  if (action?.type !== 'walk') return 'Nothing moved'
  const to = stepTarget(prev, action.dir)
  if (to < 0) return 'Nothing moved'
  return `Went ${DIR_WORDS[action.dir]} to the stone on ${spotOf(prev.n, to)}`
}

/**
 * Every walk worth trying, whether or not the rules take it. The test's search
 * walks all four and lets `reduce` filter, so a bug shared between a move list
 * and the rule cannot make the search agree with itself.
 */
export const walksOf = (_state: StoneState): StoneAction[] =>
  DIRS.map((dir) => ({ type: 'walk', dir }))

/**
 * Two positions with the same stones left, the same square underfoot and the
 * same way in are the same position. How the walk got there is drawn on the
 * board but changes nothing about what can be done next, so the trail is not
 * part of the key.
 */
export const keyOf = (state: StoneState): string =>
  `${state.stones.map((there) => (there ? '1' : '0')).join('')}|${state.at}|${state.heading}`

/* ------------------------------------------------------------------
   Reading a board off its picture

   Pure, and it throws on anything it cannot read rather than
   quietly building half a board: a picture that is not square, a
   character that is neither stone nor square, no starting stone, or
   two of them. `init` calls it on every level and `logic.test.ts`
   parses all three shipped pictures, so the only boards that reach
   a player are ones that have already been read.
   ------------------------------------------------------------------ */

export function parseBoard(picture: string[]): StoneState {
  const n = picture.length
  if (n < 3) throw new Error('a board is at least three squares to a side')
  const stones = new Array<boolean>(n * n).fill(false)
  let start = -1

  for (let r = 0; r < n; r++) {
    const line = picture[r]
    if (line.length !== n) throw new Error('a board is as tall as it is wide')
    for (let c = 0; c < n; c++) {
      const ch = line.charAt(c)
      const cell = r * n + c
      if (ch === '.') continue
      if (ch === 'o') {
        stones[cell] = true
        continue
      }
      if (ch !== 'S') throw new Error(`${ch} is not a stone or an empty square`)
      if (start >= 0) throw new Error('a board has exactly one stone to start on')
      start = cell
    }
  }

  if (start < 0) throw new Error('a board has exactly one stone to start on')
  // The stone you start on is picked up as the level opens, so the walk begins
  // standing on a cleared square with no way in behind it.
  const at = start
  if (stones.filter(Boolean).length < 2) throw new Error('a board holds at least three stones')
  return { n, stones, at, heading: -1, trail: [at] }
}
