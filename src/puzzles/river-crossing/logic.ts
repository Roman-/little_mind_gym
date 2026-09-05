import type { PuzzleLevel } from '../../lib/types'
import type { PictoName } from '../../components/pictogram-art'

/**
 * The two banks. They are drawn one above the other — `near` at the bottom of
 * the board, where everything starts, `far` at the top, where everything has
 * to end up — so the boat crosses up and down and the shores get the full
 * width of the board to stand their passengers on.
 */
export type Bank = 'near' | 'far'

export interface RiverItem {
  id: string
  /** Shown under the piece. */
  label: string
  /** The picture on the piece. One of the names in components/Pictogram. */
  glyph: PictoName
  /** Can work the oars. A crossing needs at least one aboard. */
  rower?: boolean
  /** A name rather than a noun: "Pip", not "the goat". */
  proper?: boolean
  /** Keeps the peace: no pair rule fires on a bank where a guardian stands. */
  guardian?: boolean
  role?: 'predator' | 'prey'
}

export interface RiverConfig {
  /** How many pieces fit in the boat, oarsman included. */
  capacity: number
  items: RiverItem[]
  /** Two pieces that cannot be left alone together. */
  pairs?: { a: string; b: string; message: string }[]
  /** Predators may never outnumber prey on either side. */
  outnumber?: { message: string }
  /** The bank everything starts on, at the bottom of the board. */
  nearLabel: string
  /** The bank everything has to reach, at the top of the board. */
  farLabel: string
  /** The one rule of this level, in a single line. */
  rule: string
}

export interface RiverState {
  cfg: RiverConfig
  /** Where each piece stands, indexed like cfg.items. */
  at: Bank[]
  boat: Bank
}

/** One crossing, carrying the selected pieces. Selection itself lives in the board. */
export type RiverAction = { type: 'cross'; passengers: number[] }

const other = (b: Bank): Bank => (b === 'near' ? 'far' : 'near')

/** How a piece is referred to in a sentence: "the goat", but "Pip". */
export function nameFor(item: RiverItem): string {
  return item.proper ? item.label : `the ${item.label.toLowerCase()}`
}

export function init(level: PuzzleLevel<RiverConfig>): RiverState {
  const cfg = level.config
  return { cfg, at: cfg.items.map(() => 'near' as Bank), boat: 'near' }
}

/** Everyone standing on `bank`, plus nobody else — the boat is empty between moves. */
function population(state: RiverState, bank: Bank): number[] {
  const out: number[] = []
  for (let i = 0; i < state.at.length; i++) if (state.at[i] === bank) out.push(i)
  return out
}

export function canCross(state: RiverState, passengers: number[]): boolean {
  const { cfg } = state
  if (passengers.length === 0 || passengers.length > cfg.capacity) return false
  const seen = new Set(passengers)
  if (seen.size !== passengers.length) return false
  for (const i of passengers) {
    if (i < 0 || i >= cfg.items.length) return false
    if (state.at[i] !== state.boat) return false
  }
  return passengers.some((i) => cfg.items[i].rower)
}

export function reduce(state: RiverState, action: RiverAction): RiverState {
  if (action.type !== 'cross') return state
  if (!canCross(state, action.passengers)) return state
  const dest = other(state.boat)
  const at = state.at.slice()
  for (const i of action.passengers) at[i] = dest
  return { ...state, at, boat: dest }
}

export function isSolved(state: RiverState): boolean {
  return state.at.every((b) => b === 'far')
}

export function failure(state: RiverState): string | null {
  const { cfg } = state
  for (const bank of ['near', 'far'] as Bank[]) {
    const here = population(state, bank)
    const ids = new Set(here.map((i) => cfg.items[i].id))
    const guarded = here.some((i) => cfg.items[i].guardian)
    if (!guarded && cfg.pairs) {
      for (const p of cfg.pairs) if (ids.has(p.a) && ids.has(p.b)) return p.message
    }
    if (cfg.outnumber) {
      const predators = here.filter((i) => cfg.items[i].role === 'predator').length
      const prey = here.filter((i) => cfg.items[i].role === 'prey').length
      if (prey > 0 && predators > prey) return cfg.outnumber.message
    }
  }
  return null
}

export function describeMove(prev: RiverState, _next: RiverState, action: RiverAction): string {
  const dir = prev.boat === 'near' ? 'across' : 'back'
  const names = action.passengers
    .filter((i) => !prev.cfg.items[i].guardian)
    .map((i) => nameFor(prev.cfg.items[i]))
  if (names.length === 0) return `Rowed ${dir} alone`
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `Took ${list} ${dir}`
}

/** Every legal crossing from a state. Used by the tests to check `par`. */
export function legalMoves(state: RiverState): number[][] {
  const here = population(state, state.boat)
  const out: number[][] = []
  const build = (start: number, chosen: number[]) => {
    if (chosen.length > 0 && canCross(state, chosen)) out.push(chosen.slice())
    if (chosen.length === state.cfg.capacity) return
    for (let i = start; i < here.length; i++) {
      chosen.push(here[i])
      build(i + 1, chosen)
      chosen.pop()
    }
  }
  build(0, [])
  return out
}
