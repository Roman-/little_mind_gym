import type { PuzzleLevel } from '../../lib/types'

export interface HanoiConfig {
  /** How many discs start on the left peg. Sizes run 1 (smallest) … discs (biggest). */
  discs: number
}

export interface HanoiState {
  /** Total discs in play. Sizes 1 … discs, each one used exactly once. */
  discs: number
  /**
   * The three pegs. Each holds disc sizes bottom-first, so the top of a stack
   * is the last element, and a well-formed peg is strictly decreasing.
   */
  pegs: number[][]
}

/** One disc, from the top of `from` to the top of `to`. That is one counted move. */
export type HanoiAction = { type: 'move'; from: number; to: number }

export const PEG_COUNT = 3
export const GOAL_PEG = 2
export const PEG_LETTERS = ['A', 'B', 'C'] as const
/** One vocabulary everywhere: the board, the move tape and the hints all say "peg B". */
export const PEG_NAMES = ['peg A', 'peg B', 'peg C'] as const

/** Size words, chosen per stack height so the names stay honest. */
const SIZE_WORDS: Record<number, readonly string[]> = {
  1: ['only'],
  2: ['small', 'big'],
  3: ['small', 'middle', 'big'],
  4: ['smallest', 'small', 'big', 'biggest'],
  5: ['smallest', 'small', 'middle', 'big', 'biggest'],
}

/** A noun phrase for one disc, article included: "the small disc", or "disc 7". */
export function describeDisc(size: number, total: number): string {
  const word = SIZE_WORDS[total]?.[size - 1]
  return word ? `the ${word} disc` : `disc ${size}`
}

export function init(level: PuzzleLevel<HanoiConfig>): HanoiState {
  const discs = Math.max(1, Math.floor(level.config.discs))
  const first: number[] = []
  for (let size = discs; size >= 1; size--) first.push(size)
  return { discs, pegs: [first, [], []] }
}

/** The size sitting on top of a peg, or null if the peg is bare. */
export function topOf(state: HanoiState, peg: number): number | null {
  const stack = state.pegs[peg]
  if (!stack || stack.length === 0) return null
  return stack[stack.length - 1]
}

const inRange = (peg: number) => Number.isInteger(peg) && peg >= 0 && peg < PEG_COUNT

export function canMove(state: HanoiState, from: number, to: number): boolean {
  if (!inRange(from) || !inRange(to)) return false
  if (from === to) return false
  const moving = topOf(state, from)
  if (moving === null) return false
  const landing = topOf(state, to)
  return landing === null || moving < landing
}

export function reduce(state: HanoiState, action: HanoiAction): HanoiState {
  if (action?.type !== 'move') return state
  if (!canMove(state, action.from, action.to)) return state
  return moved(state, action.from, action.to)
}

/** The top disc of `from` on top of `to`, whatever the rule says about it. */
function moved(state: HanoiState, from: number, to: number): HanoiState {
  const source = state.pegs[from]
  const disc = source[source.length - 1]
  const pegs = state.pegs.slice()
  pegs[from] = source.slice(0, -1)
  pegs[to] = [...pegs[to], disc]
  return { ...state, pegs }
}

/**
 * A move the rule will not keep, drawn anyway: the disc lands where the child
 * dropped it, and one sentence says why it cannot stay there. Null when the
 * move is legal, and null when there is no disc to move at all — an empty peg
 * is nothing happening rather than a rule broken.
 */
export function refusalOf(
  state: HanoiState,
  from: number,
  to: number,
): { pretend: HanoiState; message: string } | null {
  if (canMove(state, from, to)) return null
  if (from === to || !inRange(from) || !inRange(to)) return null
  const moving = topOf(state, from)
  if (moving === null) return null
  const disc = describeDisc(moving, state.discs)
  return {
    pretend: moved(state, from, to),
    message: `${disc[0].toUpperCase()}${disc.slice(1)} is too big for ${PEG_NAMES[to]}.`,
  }
}

export function isSolved(state: HanoiState): boolean {
  return state.discs > 0 && state.pegs[GOAL_PEG].length === state.discs
}

export function describeMove(prev: HanoiState, _next: HanoiState, action: HanoiAction): string {
  const size = topOf(prev, action.from)
  if (size === null || !canMove(prev, action.from, action.to)) return 'Nothing moved'
  return `Moved ${describeDisc(size, prev.discs)} to ${PEG_NAMES[action.to]}`
}

/** Every legal move from a state. Used by the search in the tests. */
export function legalMoves(state: HanoiState): HanoiAction[] {
  const out: HanoiAction[] = []
  for (let from = 0; from < PEG_COUNT; from++) {
    for (let to = 0; to < PEG_COUNT; to++) {
      if (canMove(state, from, to)) out.push({ type: 'move', from, to })
    }
  }
  return out
}

/** Two states with the same key are the same position. */
export function stateKey(state: HanoiState): string {
  return state.pegs.map((stack) => stack.join('.')).join('|')
}

/** Every size present once, every peg strictly decreasing from the base up. */
export function isWellFormed(state: HanoiState): boolean {
  if (state.pegs.length !== PEG_COUNT) return false
  const seen = new Set<number>()
  for (const stack of state.pegs) {
    for (let i = 0; i < stack.length; i++) {
      const size = stack[i]
      if (!Number.isInteger(size) || size < 1 || size > state.discs) return false
      if (seen.has(size)) return false
      seen.add(size)
      if (i > 0 && stack[i - 1] <= size) return false
    }
  }
  return seen.size === state.discs
}
