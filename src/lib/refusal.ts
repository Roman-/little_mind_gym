import { useSettings } from './settings'
import { cues, useCue } from './motion'
import { useEphemeral } from './ephemeral'

/**
 * A move the rules forbid, taken anyway.
 *
 * With **Allow moves that break a rule** on, a forbidden move has to look like
 * every other move: the control is live, the tap lands, the piece goes where
 * the child put it, the board says no, and the board puts it back. A child who
 * can only press the legal buttons never has to work out which buttons those
 * are.
 *
 * The puzzle's own `logic.ts` works one of these out — `refusalOf` sits beside
 * `canMove` in the same file — so a board never reads a rule a second time,
 * exactly as `failureOf` hands the river crossing its dead end.
 */
export interface Refused<S> {
  /**
   * The position the move pretends to reach. It is drawn for one cue and then
   * dropped: it never reaches `dispatch`, so nothing forbidden lands in the
   * history, on the move tape, or in front of `isSolved`. When nothing can
   * even pretend to move, this is the state itself.
   */
  pretend: S
  /** Why the board will not keep it. One short sentence of fact. */
  message: string
  /** The piece or the place the cue points at, named however the board names it. */
  where: string
}

export interface Refusal<S> {
  /** True when a forbidden move is offered. False refuses it up front, as a dead control. */
  offered: boolean
  /** The position to draw: the real one, or the refused one for the length of one cue. */
  shown: S
  /**
   * True while a refusal is on screen. A board that draws a pretend position
   * has to sit still until it is over; a board whose refusal moves nothing has
   * nothing to sit still for, and lets the next tap say no again.
   */
  busy: boolean
  /** Take a forbidden move: show it, say it, and put the board back. */
  refuse: (refused: Refused<S>) => void
  /** `cues.flash` for the place a refusal named, undefined everywhere else. */
  flash: (where: string) => string | undefined
  /** `cues.shake` for a piece that could not even pretend to move. */
  shake: (where: string) => string | undefined
  /**
   * The board's own `role="status"` line, with the refusal's one sentence in
   * front of whatever the board was already saying.
   */
  say: (rest: string) => string
}

export function useRefusal<S>(state: S): Refusal<S> {
  const { settings } = useSettings()
  const [cue, fire] = useCue<{ from: S; refused: Refused<S> }>()
  /**
   * The sentence outlives the cue on purpose. Reduced motion collapses the cue
   * to a millisecond, so this is all that is left of it for anyone who cannot
   * watch, and it is cleared during render rather than after paint, so an old
   * refusal is never read out over a move that has since been made.
   */
  const [said, setSaid] = useEphemeral(state, '')

  /**
   * A refusal only stands while the board is still on the position it was
   * refused from. The move tape can rewind under a cue that is still running,
   * and a pretend position drawn over some other state would be a lie.
   */
  const live = cue !== null && cue.from === state ? cue.refused : null
  const nothingMoved = live !== null && live.pretend === state

  return {
    offered: settings.allowForbiddenMoves,
    shown: live === null ? state : live.pretend,
    busy: live !== null,
    say: (rest) => [said, rest].filter(Boolean).join(' '),
    flash: (where) => (live?.where === where ? cues.flash : undefined),
    shake: (where) => (nothingMoved && live?.where === where ? cues.shake : undefined),
    refuse: (refused) => {
      fire({ from: state, refused })
      setSaid(refused.message)
    },
  }
}
