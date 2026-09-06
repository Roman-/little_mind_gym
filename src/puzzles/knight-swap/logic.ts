import type { PuzzleLevel } from '../../lib/types'

/* ============================================================
   The four horses — Guarini's problem, 1512.

   Nine squares in a three by three block. Two brown horses and
   two grey ones stand on the corners, and every one of them has
   to reach a mat of its own colour on the far side. A horse only
   ever jumps in an L: two squares one way, then one across.

   The whole puzzle is one fact the board does not say out loud.
   No jump in an L reaches the middle square, so the horses play
   on the eight squares round the rim — and those eight, joined
   by the jumps, are a single loop:

       0 - 5 - 6 - 1 - 8 - 3 - 2 - 7 - back to 0

   Every rim square has exactly two neighbours on that loop, so a
   horse walking round it is walking round a ring of eight beads
   that nothing can pass on. Straighten the board out into that
   ring and the answer is obvious; leave it as a square and it is
   not. That gap is the puzzle.

   Nothing here is random. `par` is a fixed number on a level, so
   a randomised deal would need a par per seed — `init` never
   touches the rng, and the three boards are the same for ever,
   exactly as river-crossing, tower-of-hanoi and frog-leap are.
   ============================================================ */

/** A horse belongs to one of two teams. Nothing else tells two horses apart. */
export type Team = 'brown' | 'grey'

export interface HorsesConfig {
  /** Row-major over the three by three board, nine entries. `null` is empty. */
  start: readonly (Team | null)[]
  /** Row-major, nine entries. The board is solved when `squares` matches it. */
  goal: readonly (Team | null)[]
}

export interface HorsesState {
  /**
   * Row-major over the three by three board. `null` is an empty square. Index
   * 4 is the middle, and no jump in an L reaches it, so it is null in every
   * position this engine can ever build.
   */
  squares: (Team | null)[]
  /**
   * Row-major. Where the horses have to end up: the mat drawn on each square,
   * or null where there is no mat. The same array all game, so the board can
   * use it as the token that survives a move and resets on a new level.
   */
  goal: (Team | null)[]
}

/** One counted move: the horse standing on `from` jumps to `to`. */
export type HorsesAction = { type: 'jump'; from: number; to: number }

/** The square nothing can reach. Its own jump list is empty, and no other holds it. */
export const MIDDLE = 4

/** How many squares there are. Three by three, and the middle is one of them. */
export const SQUARES = 9

/**
 * Where a horse standing on each square may land. Index 4 is empty on purpose,
 * and 4 appears in no other entry: the middle is joined to nothing at all.
 */
export const JUMPS: readonly (readonly number[])[] = [
  [5, 7],
  [6, 8],
  [3, 7],
  [2, 8],
  [],
  [0, 6],
  [1, 5],
  [0, 2],
  [1, 3],
]

/**
 * The eight rim squares in the order the jumps join them, which is the shape
 * the puzzle is really played on. Nothing in the engine reads this — it is the
 * second, independent model the test checks `par` against, and it is written
 * here beside the jump table it has to agree with.
 */
export const RING = [0, 5, 6, 1, 8, 3, 2, 7] as const

/**
 * One vocabulary for the labels, the move tape and the status line. Always
 * spoken as `the ${SQUARE_NAMES[i]}`, so index 4 reads "the middle".
 */
export const SQUARE_NAMES = [
  'top left',
  'top middle',
  'top right',
  'middle left',
  'middle',
  'middle right',
  'bottom left',
  'bottom middle',
  'bottom right',
] as const

/** How a team is named in a sentence. The board says the word as well as the colour. */
export function teamWord(team: Team): string {
  return team
}

const onBoard = (i: number) => Number.isInteger(i) && i >= 0 && i < SQUARES

/**
 * A board written the way it looks, three letters a row: `b` for a brown
 * horse, `g` for a grey one, `.` for an empty square. Spaces are ignored, so a
 * level can be laid out over three lines and read like the board it makes.
 */
export function readBoard(picture: string): (Team | null)[] {
  return [...picture]
    .filter((ch) => ch !== ' ')
    .map((ch) => (ch === 'b' ? 'brown' : ch === 'g' ? 'grey' : null))
}

export function init(level: PuzzleLevel<HorsesConfig>): HorsesState {
  return { squares: level.config.start.slice(), goal: level.config.goal.slice() }
}

/** The horse on `from` standing on `to`, whatever the rule says about it. */
function jumped(state: HorsesState, from: number, to: number): HorsesState {
  const squares = state.squares.slice()
  squares[to] = squares[from]
  squares[from] = null
  return { ...state, squares }
}

export function canJump(state: HorsesState, from: number, to: number): boolean {
  if (!onBoard(from) || !onBoard(to)) return false
  if (state.squares[from] === null) return false
  if (state.squares[to] !== null) return false
  return JUMPS[from].includes(to)
}

/**
 * One jump. The identical object comes back whenever nothing happens, which is
 * the only signal the shell has that no move was made:
 *
 * 1. the action is not a jump at all;
 * 2. `from` or `to` is not a square — -1, 9, 1.5, NaN, Infinity;
 * 3. there is no horse on `from` to pick up;
 * 4. a horse is already standing on `to`;
 * 5. `to` is not an L away from `from` — which also catches `from === to`,
 *    since no square is its own knight neighbour, and every tap on the middle,
 *    since 4 is in nobody's jump list.
 */
export function reduce(state: HorsesState, action: HorsesAction): HorsesState {
  if (action?.type !== 'jump') return state
  if (!canJump(state, action.from, action.to)) return state
  return jumped(state, action.from, action.to)
}

export function isSolved(state: HorsesState): boolean {
  // A board with no mats on it would otherwise call an empty square solved.
  if (!state.goal.some((team) => team !== null)) return false
  return state.squares.every((team, i) => team === state.goal[i])
}

/** True when this square is a mat and the horse standing on it belongs to that mat. */
export function isHome(state: HorsesState, i: number): boolean {
  return state.goal[i] !== null && state.squares[i] === state.goal[i]
}

/** How many horses are standing on a mat of their own colour. */
export function horsesHome(state: HorsesState): number {
  return state.squares.reduce<number>((n, _, i) => n + (isHome(state, i) ? 1 : 0), 0)
}

/** How many horses are on the board at all. */
export function horseCount(state: HorsesState): number {
  return state.squares.reduce<number>((n, team) => n + (team === null ? 0 : 1), 0)
}

/**
 * A move the rule will not keep, drawn anyway.
 *
 * Three sentences, in the order a tap can break them. The first cannot pretend
 * to move — two horses will not stand on one square — so `pretend` is the
 * position itself and the board shakes the square instead. The other two draw
 * the horse where the child put it, say why it cannot stay, and take it back.
 *
 * Null where nothing was broken: a legal jump, a tap on the horse's own
 * square, and a square with no horse on it are all nothing happening rather
 * than a rule refused.
 */
export function refusalOf(
  state: HorsesState,
  from: number,
  to: number,
): { pretend: HorsesState; message: string } | null {
  if (!onBoard(from) || !onBoard(to)) return null
  if (state.squares[from] === null) return null
  if (from === to) return null
  if (canJump(state, from, to)) return null
  if (state.squares[to] !== null) {
    return { pretend: state, message: 'There is already a horse on that square.' }
  }
  if (to === MIDDLE) {
    return { pretend: jumped(state, from, to), message: 'No horse can reach the middle square.' }
  }
  return { pretend: jumped(state, from, to), message: 'A horse only jumps in an L.' }
}

export function describeMove(prev: HorsesState, _next: HorsesState, action: HorsesAction): string {
  const team = prev.squares[action.from]
  if (team === null || !canJump(prev, action.from, action.to)) return 'Nothing moved'
  return `Jumped the ${teamWord(team)} horse to the ${SQUARE_NAMES[action.to]}`
}

/** Every legal jump from a position. Used by the tests. */
export function legalMoves(state: HorsesState): HorsesAction[] {
  const out: HorsesAction[] = []
  for (let from = 0; from < SQUARES; from++) {
    for (const to of JUMPS[from]) {
      if (canJump(state, from, to)) out.push({ type: 'jump', from, to })
    }
  }
  return out
}

/**
 * Two states with the same key are the same position. The mats never move, so
 * only the horses are keyed; every search here runs inside one level.
 */
export function stateKey(state: HorsesState): string {
  return state.squares.map((team) => (team === null ? '.' : team[0])).join('')
}
