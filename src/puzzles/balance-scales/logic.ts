import { randInt } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/** Which way the beam went. `even` means the two pans matched. */
export type Tip = 'left' | 'right' | 'even'

export interface BalanceConfig {
  /** How many balls are on the bench. Exactly one of them is heavier. */
  balls: number
  /** How many times the balance may be used before it is spent. */
  weighings: number
}

/** One use of the balance, and what it said. Ball indices are 0-based. */
export interface Weighing {
  left: number[]
  right: number[]
  tip: Tip
}

export interface BalanceState {
  balls: number
  /**
   * Hidden information. It lives in the state so that rewinding works, but the
   * board must never render it.
   */
  heavy: number
  allowed: number
  /** Every weighing made so far, in order, with the answer the balance gave. */
  done: Weighing[]
  /** The ball the player named, once they have named one. */
  accused: number | null
}

export type BalanceAction =
  | { type: 'weigh'; left: number[]; right: number[] }
  | { type: 'accuse'; index: number }

export function init(level: PuzzleLevel<BalanceConfig>, rng: Rng): BalanceState {
  const { balls, weighings } = level.config
  return { balls, heavy: randInt(rng, balls), allowed: weighings, done: [], accused: null }
}

/** What the balance says if `heavy` is the heavy ball. The only oracle there is. */
export function tipFor(left: readonly number[], right: readonly number[], heavy: number): Tip {
  if (left.includes(heavy)) return 'left'
  if (right.includes(heavy)) return 'right'
  return 'even'
}

export function weighingsLeft(state: BalanceState): number {
  return state.allowed - state.done.length
}

/**
 * A weighing is legal when both pans hold the same non-zero number of balls,
 * no ball is on a pan twice or on both pans at once, and the balance has a use
 * left. Anything else must leave the state alone.
 */
export function canWeigh(
  state: BalanceState,
  left: readonly number[],
  right: readonly number[],
): boolean {
  if (state.accused !== null) return false
  if (weighingsLeft(state) <= 0) return false
  if (left.length === 0 || left.length !== right.length) return false
  const seen = new Set<number>()
  for (const i of [...left, ...right]) {
    if (!Number.isInteger(i) || i < 0 || i >= state.balls) return false
    if (seen.has(i)) return false
    seen.add(i)
  }
  return true
}

/**
 * A press on Weigh the balance will not take, and one sentence saying why.
 * Null when the pans hold a real weighing.
 *
 * Nothing pretends to happen. The beam only ever tips for an answer it has
 * worked out, so a pretend tip would say which side the heavy ball is on; the
 * balance takes the press, refuses, and gives nothing away.
 *
 * It answers for the pans alone. The board never offers the press once the
 * balance is spent or a ball has been named.
 */
export function refusalOf(
  state: BalanceState,
  left: readonly number[],
  right: readonly number[],
): { pretend: BalanceState; message: string } | null {
  if (canWeigh(state, left, right)) return null
  const message =
    left.length === 0 && right.length === 0
      ? 'There is nothing on the balance to weigh.'
      : 'The balance needs the same number of balls on each pan.'
  return { pretend: state, message }
}

export function canAccuse(state: BalanceState, index: number): boolean {
  if (state.accused !== null) return false
  return Number.isInteger(index) && index >= 0 && index < state.balls
}

const asc = (a: number, b: number) => a - b

export function reduce(state: BalanceState, action: BalanceAction): BalanceState {
  if (action.type === 'weigh') {
    if (!canWeigh(state, action.left, action.right)) return state
    const weighing: Weighing = {
      left: action.left.slice().sort(asc),
      right: action.right.slice().sort(asc),
      tip: tipFor(action.left, action.right, state.heavy),
    }
    return { ...state, done: [...state.done, weighing] }
  }
  if (action.type === 'accuse') {
    if (!canAccuse(state, action.index)) return state
    return { ...state, accused: action.index }
  }
  return state
}

/**
 * Naming the heavy ball only counts once the record has narrowed it to one.
 * Without that clause a child could name a ball at random, step back out of the
 * dead end and try again until they hit it — which is guessing, and none of
 * these puzzles ask for that.
 */
export function isSolved(state: BalanceState): boolean {
  return (
    state.accused !== null && state.accused === state.heavy && candidates(state).length === 1
  )
}

/**
 * Every ball still consistent with every answer given so far — the only thing
 * a player can honestly reason from. Deliberately derived from the answers and
 * not from `heavy`, so it says exactly what the player is entitled to know.
 */
export function candidates(state: BalanceState): number[] {
  const out: number[] = []
  for (let i = 0; i < state.balls; i++) {
    if (state.done.every((w) => tipFor(w.left, w.right, i) === w.tip)) out.push(i)
  }
  return out
}

export function failure(state: BalanceState): string | null {
  if (state.accused !== null) {
    // Checked before correctness on purpose: a name given without evidence must
    // not leak whether it happened to be right.
    if (candidates(state).length > 1) return 'More than one ball could still be the heavy one.'
    return state.accused === state.heavy ? null : 'That ball is not the heavy one.'
  }
  if (weighingsLeft(state) <= 0 && candidates(state).length > 1) {
    return 'You have used every weighing. More than one ball could still be the heavy one.'
  }
  return null
}

/** Ball numbers the way a player reads them, 1-based: "1", "1 and 2", "1, 2 and 3". */
export function listBalls(indices: readonly number[]): string {
  const names = indices.map((i) => i + 1)
  if (names.length === 0) return 'nothing'
  if (names.length === 1) return `${names[0]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** What the balance said, in words. */
export function answerPhrase(tip: Tip): string {
  return tip === 'even' ? 'the pans stayed level' : `the ${tip} pan went down`
}

/** The same thing on its own, for the line under the balance. */
export function answerSentence(tip: Tip): string {
  const said = answerPhrase(tip)
  return `${said[0].toUpperCase()}${said.slice(1)}.`
}

/** One line of the record: "Weighing 2: 1 and 2 against 3 and 4 — the left pan went down." */
export function readWeighing(w: Weighing, n: number): string {
  return `Weighing ${n}: ${listBalls(w.left)} against ${listBalls(w.right)} — ${answerPhrase(w.tip)}.`
}

export function describeMove(
  _prev: BalanceState,
  next: BalanceState,
  action: BalanceAction,
): string {
  if (action.type === 'accuse') return `Named ball ${action.index + 1} as the heavy one`
  const w = next.done[next.done.length - 1]
  return `Weighed ${listBalls(w.left)} against ${listBalls(w.right)} — ${answerPhrase(w.tip)}`
}
