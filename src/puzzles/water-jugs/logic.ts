import type { PuzzleLevel } from '../../lib/types'

export interface JugSpec {
  /** Litres it holds when filled to the brim. */
  capacity: number
  /** Litres in it before anyone touches it. */
  start: number
}

/**
 * What counts as measured out.
 * `any`  — one jug, no matter which, holds exactly this much.
 * `each` — jug i holds exactly `litres[i]`; `null` means "don't care".
 */
export type JugGoal =
  | { kind: 'any'; litres: number }
  | { kind: 'each'; litres: (number | null)[] }

export interface JugsConfig {
  jugs: JugSpec[]
  /** A tap to fill from. Without it `fill` is illegal. */
  tap: boolean
  /** A drain to empty into. Without it `empty` is illegal. */
  drain: boolean
  goal: JugGoal
  /** The goal in one line, printed above the jugs. */
  goalLine: string
}

export interface JugsState {
  cfg: JugsConfig
  /** Litres in each jug right now, indexed like cfg.jugs. */
  litres: number[]
}

export type JugsAction =
  | { type: 'fill'; jug: number }
  | { type: 'empty'; jug: number }
  | { type: 'pour'; from: number; to: number }

const inRange = (state: JugsState, i: number) =>
  Number.isInteger(i) && i >= 0 && i < state.cfg.jugs.length

export function init(level: PuzzleLevel<JugsConfig>): JugsState {
  const cfg = level.config
  return { cfg, litres: cfg.jugs.map((j) => j.start) }
}

/** No tap and no drain: the water on the table is all the water there is. */
export function isSealed(state: JugsState): boolean {
  return !state.cfg.tap && !state.cfg.drain
}

/** True when filling would actually put water in. A sealed level has no tap. */
export function canFill(state: JugsState, jug: number): boolean {
  if (!state.cfg.tap || !inRange(state, jug)) return false
  return state.litres[jug] < state.cfg.jugs[jug].capacity
}

/** True when emptying would actually take water out. A sealed level has no drain. */
export function canEmpty(state: JugsState, jug: number): boolean {
  if (!state.cfg.drain || !inRange(state, jug)) return false
  return state.litres[jug] > 0
}

/** How much would move: whatever empties the first jug or fills the second, whichever is less. */
export function pourAmount(state: JugsState, from: number, to: number): number {
  if (from === to || !inRange(state, from) || !inRange(state, to)) return 0
  const room = state.cfg.jugs[to].capacity - state.litres[to]
  return Math.min(state.litres[from], room)
}

export function canPour(state: JugsState, from: number, to: number): boolean {
  return pourAmount(state, from, to) > 0
}

/** True when this jug has water and somewhere to put it — worth picking up. */
export function canPourFrom(state: JugsState, from: number): boolean {
  return state.cfg.jugs.some((_, to) => canPour(state, from, to))
}

export function reduce(state: JugsState, action: JugsAction): JugsState {
  switch (action.type) {
    case 'fill': {
      if (!canFill(state, action.jug)) return state
      const litres = state.litres.slice()
      litres[action.jug] = state.cfg.jugs[action.jug].capacity
      return { ...state, litres }
    }
    case 'empty': {
      if (!canEmpty(state, action.jug)) return state
      const litres = state.litres.slice()
      litres[action.jug] = 0
      return { ...state, litres }
    }
    case 'pour': {
      const moved = pourAmount(state, action.from, action.to)
      if (moved <= 0) return state
      const litres = state.litres.slice()
      litres[action.from] -= moved
      litres[action.to] += moved
      return { ...state, litres }
    }
    default:
      return state
  }
}

export function isSolved(state: JugsState): boolean {
  const goal = state.cfg.goal
  if (goal.kind === 'any') return state.litres.some((l) => l === goal.litres)
  return goal.litres.every((want, i) => want === null || state.litres[i] === want)
}

export function describeMove(prev: JugsState, _next: JugsState, action: JugsAction): string {
  const cap = (i: number) => prev.cfg.jugs[i].capacity
  switch (action.type) {
    case 'fill':
      return `Filled the ${cap(action.jug)}-litre jug`
    case 'empty':
      return `Emptied the ${cap(action.jug)}-litre jug`
    case 'pour':
      return `Poured the ${cap(action.from)}-litre jug into the ${cap(action.to)}-litre jug`
    default:
      return ''
  }
}

/** Every action that changes something. The tests search over exactly this. */
export function legalMoves(state: JugsState): JugsAction[] {
  const out: JugsAction[] = []
  for (let i = 0; i < state.cfg.jugs.length; i++) {
    if (canFill(state, i)) out.push({ type: 'fill', jug: i })
    if (canEmpty(state, i)) out.push({ type: 'empty', jug: i })
    for (let j = 0; j < state.cfg.jugs.length; j++) {
      if (i !== j && canPour(state, i, j)) out.push({ type: 'pour', from: i, to: j })
    }
  }
  return out
}
