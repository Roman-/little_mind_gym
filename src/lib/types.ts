import type { ComponentType } from 'react'

/** Deterministic random number generator: returns a float in [0, 1). */
export type Rng = () => number

export interface BoardProps<S, A> {
  /** Current puzzle state. The board is a pure function of this. */
  state: S
  /** Send an action. No-op actions (see `reduce`) are ignored by the shell. */
  dispatch: (action: A) => void
  /** True when the level is solved or in a dead end. Ignore all input while true. */
  locked: boolean
}

export interface PuzzleLevel<C = unknown> {
  /** Stable across releases — progress is stored against it. Never renumber. */
  id: string
  /** Short human label, e.g. "Three discs". Sentence case. */
  label: string
  difficulty: 1 | 2 | 3
  config: C
  /** Fewest possible moves. Shown as "par" when solved. Verify it in a test. */
  par?: number
  /** Revealed one at a time. Nudges, never full solutions. */
  hints: string[]
}

export interface PuzzleEngine<S, A> {
  /** Build the starting state. Must be pure given (level, rng). */
  init(level: PuzzleLevel<any>, rng: Rng): S
  /**
   * Apply an action. MUST be pure and MUST return the *same object reference*
   * when the action is illegal or changes nothing — that is how the shell
   * knows not to record a move.
   */
  reduce(state: S, action: A): S
  isSolved(state: S): boolean
  /**
   * Non-null when the player has walked into a dead end they must step back
   * from (e.g. "The goat ate the cabbage."). One short sentence, plus one
   * short sentence of what to do. Optional.
   *
   * The shell shows the sentence and nothing else. A board that has to point
   * at whatever broke the rule asks its own logic.ts for that — see
   * `failureOf` in the river crossing — rather than widening this.
   */
  failure?(state: S): string | null
  /**
   * False when the level can no longer be won from this position, whether or
   * not `failure` has said so yet.
   *
   * It is where Step back goes. A dead end can arrive long after the move that
   * lost the level — a budget runs out, a line jams, a dog closes in — and
   * stepping back one move from one of those lands the player somewhere just
   * as lost, which is a button that loses the level again. The shell walks
   * back through the positions the player has already been in and stops at the
   * last one this returns true for.
   *
   * Optional, and left out by a puzzle that cannot strand a player: one whose
   * moves all undo, or one whose `failure` already fires the moment the win
   * goes out of reach. Without it the shell steps back one move.
   *
   * It is asked only once a dead end is up, and only about positions that are
   * already in the past. A board must never ask it about the position in front
   * of a child who is still playing — that is an oracle answering "was that
   * the right move?", which is the thing every dead end here is written to
   * avoid.
   */
  canStillWin?(state: S): boolean
  /** Past-tense summary of the move that produced `next`. Used by the move tape and screen readers. */
  describe?(prev: S, next: S, action: A): string
  Board: ComponentType<BoardProps<S, A>>
}

export interface PuzzleMeta<S = any, A = any> {
  /** kebab-case, matches the directory name and the /puzzle/:id route. */
  id: string
  title: string
  /** One line for the index row. Concrete, no hype. */
  tagline: string
  Icon: ComponentType<{ className?: string }>
  /** "How to play", 2–4 short imperative lines. */
  instructions: string[]
  levels: PuzzleLevel<any>[]
  /** True if init() uses the rng, so "New arrangement" is worth offering. */
  reseedable?: boolean
  engine: PuzzleEngine<S, A>
}
