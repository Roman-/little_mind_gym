import type { PuzzleLevel } from '../../lib/types'

/**
 * A stone in the row holds one of three things:
 *   1  a frog facing right (green — it only ever moves right)
 *  -1  a frog facing left  (blue  — it only ever moves left)
 *   0  nothing: the one free stone
 *
 * The number is also the direction that frog travels, which is the whole
 * reason the rules stay this short.
 */
export type Seat = 1 | 0 | -1

export interface FrogConfig {
  /** Frogs on each side. The row is 2 * perSide + 1 stones long. */
  perSide: number
}

export interface FrogState {
  /** One entry per stone, left to right. */
  seats: Seat[]
}

/**
 * Hop the frog standing on stone `from`. Where it lands is forced — a frog
 * steps into the free stone if it is next door, otherwise it jumps the frog
 * in its way — so one tap is exactly one move.
 */
export type FrogAction = { type: 'hop'; from: number }

/** Shown by the shell when the row jams. */
export const STUCK = 'No frog can move. The line is stuck.'

export function init(level: PuzzleLevel<FrogConfig>): FrogState {
  const n = level.config.perSide
  const seats: Seat[] = []
  for (let i = 0; i < n; i++) seats.push(1)
  seats.push(0)
  for (let i = 0; i < n; i++) seats.push(-1)
  return { seats }
}

/**
 * The stone the frog on `from` would land on, or -1 if it cannot move.
 * Forwards only; either one stone, or a jump over one frog of the *other*
 * colour; and the landing stone must be the free one.
 *
 * Jumping your own colour is not a move. It is never part of a solution
 * (checked by brute force in the tests: the reachable positions and the par
 * of every level are identical with or without it), it only ever hands an
 * eight-year-old a dead end on the very first tap, and — because it would
 * swap two frogs of one colour past each other — it is the one move the
 * board could not honestly draw. Frogs of a colour keep their order for
 * ever, so "the second green frog from the left" is a stable identity and a
 * hop can be animated as one frog travelling.
 */
export function hopTarget(state: FrogState, from: number): number {
  const { seats } = state
  if (!Number.isInteger(from) || from < 0 || from >= seats.length) return -1
  const dir = seats[from]
  if (dir === 0) return -1

  const step = from + dir
  if (step < 0 || step >= seats.length) return -1
  if (seats[step] === 0) return step
  if (seats[step] === dir) return -1

  const leap = from + 2 * dir
  if (leap < 0 || leap >= seats.length) return -1
  if (seats[leap] === 0) return leap

  return -1
}

/** True when this hop clears a frog rather than stepping into the gap. */
export function isJump(state: FrogState, from: number): boolean {
  const to = hopTarget(state, from)
  return to >= 0 && Math.abs(to - from) === 2
}

/** Every frog that can move right now, listed left to right by stone. */
export function legalMoves(state: FrogState): number[] {
  const out: number[] = []
  for (let i = 0; i < state.seats.length; i++) if (hopTarget(state, i) >= 0) out.push(i)
  return out
}

export function reduce(state: FrogState, action: FrogAction): FrogState {
  if (action.type !== 'hop') return state
  const to = hopTarget(state, action.from)
  if (to < 0) return state
  const seats = state.seats.slice()
  seats[to] = seats[action.from]
  seats[action.from] = 0
  return { seats }
}

/** The two groups have swapped ends: blues left, greens right, gap in the middle. */
export function isSolved(state: FrogState): boolean {
  const { seats } = state
  const middle = (seats.length - 1) / 2
  for (let i = 0; i < seats.length; i++) {
    const want: Seat = i < middle ? -1 : i > middle ? 1 : 0
    if (seats[i] !== want) return false
  }
  return true
}

/**
 * Frogs never move backwards, so a wrong order can jam the row for good.
 * That dead end is the puzzle; the shell offers the step back out of it.
 */
export function failure(state: FrogState): string | null {
  if (isSolved(state)) return null
  return legalMoves(state).length === 0 ? STUCK : null
}

/** The colour a child would call this frog. */
export function colourOf(seat: 1 | -1): 'green' | 'blue' {
  return seat === 1 ? 'green' : 'blue'
}

export function describeMove(prev: FrogState, _next: FrogState, action: FrogAction): string {
  const dir = prev.seats[action.from]
  const to = hopTarget(prev, action.from)
  if (dir === 0 || to < 0) return 'Nobody moved'
  const frog = colourOf(dir)
  if (Math.abs(to - action.from) === 1) return `Stepped a ${frog} frog forward`
  const cleared = prev.seats[action.from + dir]
  return `Jumped a ${frog} frog over a ${colourOf(cleared === 1 ? 1 : -1)} one`
}
